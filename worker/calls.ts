/**
 * The studio line's call table: one shared record of every call, so a call is read on air once, ever,
 * whoever is listening and however often they rejoin. Lives in the StudioLine Durable Object's SQLite
 * storage (worker/studio.ts); kept free of Workers imports so it can be tested on any SQLite.
 *
 * A call's life: saved (call-end webhook) → claimed by one listener's RJ link while it is being written (a
 * lease, so two listeners' RJs never read the same call) → aired (when that RJ link starts playing). A claim
 * the script didn't use is released at once; one that never airs (the listener left) expires, and either
 * way the call goes back in the queue.
 */
import type { PhoneCall, PhoneRequestType } from '../shared/types';

/** The SQLite surface the table needs; Durable Object `ctx.storage.sql` provides it. */
export interface Sql {
  exec<T extends Record<string, SqlValue>>(query: string, ...bindings: SqlValue[]): { toArray(): T[] };
}
export type SqlValue = string | number | null | ArrayBuffer;

/** How long an RJ link may hold a call between being written and going on air. */
export const CLAIM_LEASE_MS = 10 * 60 * 1000;
/** Calls older than this drop off the website. */
export const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** How many calls the website shows. */
export const RECENT_LIMIT = 6;
/** Calls are deleted after a week. */
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

type Row = {
  id: string;
  at: string;
  name: string | null;
  city: string | null;
  masked_number: string;
  type: string;
  message: string;
  theme: string | null;
  aired_at: string | null;
};

const iso = (value: string | undefined, now: number) => {
  const t = value ? Date.parse(value) : Number.NaN;
  return new Date(Number.isFinite(t) ? t : now).toISOString();
};

export class CallTable {
  constructor(private readonly sql: Sql) {
    sql.exec(`CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY,
      at TEXT NOT NULL,
      name TEXT,
      city TEXT,
      masked_number TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      theme TEXT,
      claimed_by TEXT,
      claimed_until INTEGER,
      aired_at TEXT,
      aired_station TEXT
    )`);
    sql.exec('CREATE INDEX IF NOT EXISTS calls_at ON calls (at)');
    sql.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
  }

  /** Saves a call; a webhook retry updates the text but never un-airs or un-claims it. */
  save(call: PhoneCall, now = Date.now()): void {
    this.sql.exec(
      `INSERT INTO calls (id, at, name, city, masked_number, type, message, theme)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         at = excluded.at, name = excluded.name, city = excluded.city, masked_number = excluded.masked_number,
         type = excluded.type, message = excluded.message, theme = excluded.theme`,
      call.id,
      iso(call.at, now),
      call.name ?? null,
      call.city ?? null,
      call.maskedNumber,
      call.type,
      call.message,
      call.theme ?? null,
    );
    this.sql.exec('DELETE FROM calls WHERE at < ?', new Date(now - KEEP_MS).toISOString());
  }

  /** The latest calls for the website, newest first, each with when it went on air (if it has). */
  recent(now = Date.now(), limit = RECENT_LIMIT): PhoneCall[] {
    const rows = this.sql
      .exec<Row>(
        `SELECT id, at, name, city, masked_number, type, message, theme, aired_at
         FROM calls WHERE at >= ? ORDER BY at DESC LIMIT ?`,
        new Date(now - RECENT_WINDOW_MS).toISOString(),
        limit,
      )
      .toArray();
    return rows.map((r) => {
      const call: PhoneCall = { id: r.id, at: r.at, maskedNumber: r.masked_number, type: r.type as PhoneRequestType, message: r.message };
      if (r.name) call.name = r.name;
      if (r.city) call.city = r.city;
      if (r.theme) call.theme = r.theme;
      if (r.aired_at) call.airedAt = r.aired_at;
      return call;
    });
  }

  /**
   * Gives these calls to one listener's RJ link: only calls that haven't aired and aren't held by someone
   * else's live claim (`holder` may renew its own). Returns the ids granted.
   */
  claim(ids: string[], holder: string, now = Date.now(), leaseMs = CLAIM_LEASE_MS): string[] {
    if (!ids.length) return [];
    const marks = ids.map(() => '?').join(', ');
    this.sql.exec(
      `UPDATE calls SET claimed_by = ?, claimed_until = ?
       WHERE id IN (${marks}) AND aired_at IS NULL
         AND (claimed_until IS NULL OR claimed_until < ? OR claimed_by = ?)`,
      holder,
      now + leaseMs,
      ...ids,
      now,
      holder,
    );
    return this.sql
      .exec<{ id: string }>(
        `SELECT id FROM calls WHERE claimed_by = ? AND claimed_until = ? AND aired_at IS NULL AND id IN (${marks})`,
        holder,
        now + leaseMs,
        ...ids,
      )
      .toArray()
      .map((r) => r.id);
  }

  /** Hands back calls a holder claimed but won't read (the script left them out), so the next RJ link can. */
  release(ids: string[], holder: string): void {
    if (!ids.length) return;
    const marks = ids.map(() => '?').join(', ');
    this.sql.exec(
      `UPDATE calls SET claimed_by = NULL, claimed_until = NULL
       WHERE id IN (${marks}) AND claimed_by = ? AND aired_at IS NULL`,
      ...ids,
      holder,
    );
  }

  /**
   * Marks calls as read on air. Only the holder of a call's claim can, so nobody can silence the queue; a
   * lease that ran out still counts unless another listener has claimed the call since.
   */
  markAired(ids: string[], holder: string, station: string, now = Date.now()): string[] {
    if (!ids.length) return [];
    const marks = ids.map(() => '?').join(', ');
    const at = new Date(now).toISOString();
    this.sql.exec(
      `UPDATE calls SET aired_at = ?, aired_station = ?
       WHERE id IN (${marks}) AND aired_at IS NULL AND claimed_by = ?`,
      at,
      station,
      ...ids,
      holder,
    );
    return this.sql
      .exec<{ id: string }>(`SELECT id FROM calls WHERE aired_at = ? AND claimed_by = ? AND id IN (${marks})`, at, holder, ...ids)
      .toArray()
      .map((r) => r.id);
  }

  /**
   * One-time: calls made before `cutoff` (when this table went live) count as read. The old per-radio queue
   * already read them, but kept that in each browser, so the table can't know; this stops them airing again.
   */
  retireOnce(cutoff: string, now = Date.now()): number {
    const done = this.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'retired'").toArray();
    if (done.length) return 0;
    const before = this.sql
      .exec<{ n: number }>('SELECT COUNT(*) AS n FROM calls WHERE aired_at IS NULL AND at < ?', cutoff)
      .toArray()[0].n;
    this.sql.exec("UPDATE calls SET aired_at = at, aired_station = 'legacy' WHERE aired_at IS NULL AND at < ?", cutoff);
    this.sql.exec("INSERT INTO meta (key, value) VALUES ('retired', ?)", new Date(now).toISOString());
    return before;
  }

  /** One-time import of the calls the old KV list held, so moving to this table loses nothing. */
  importOnce(calls: PhoneCall[], now = Date.now()): number {
    const done = this.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'imported'").toArray();
    if (done.length) return 0;
    for (const call of calls) if (call && typeof call.id === 'string' && call.message) this.save(call, now);
    this.sql.exec("INSERT INTO meta (key, value) VALUES ('imported', ?)", new Date(now).toISOString());
    return calls.length;
  }
}
