import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { PhoneCall } from '../shared/types';
import { CallTable, CLAIM_LEASE_MS, RECENT_WINDOW_MS, type Sql, type SqlValue } from './calls';

/** Node's SQLite behind the same exec() shape as a Durable Object's ctx.storage.sql. */
function sqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  return {
    exec<T extends Record<string, SqlValue>>(query: string, ...bindings: SqlValue[]) {
      const statement = db.prepare(query);
      const params = bindings as (string | number | null)[];
      const rows = /^\s*(SELECT|WITH)/i.test(query) ? (statement.all(...params) as T[]) : (statement.run(...params), [] as T[]);
      return { toArray: () => rows };
    },
  };
}

const T0 = Date.parse('2026-10-14T19:30:00.000Z');
const ME = 'listener-me-1';
const YOU = 'listener-you-2';

const call = (id: string, minutesAgo = 0, patch: Partial<PhoneCall> = {}): PhoneCall => ({
  id,
  at: new Date(T0 - minutesAgo * 60_000).toISOString(),
  name: 'Priya',
  city: 'Vadodara',
  maskedNumber: '+91 ••••• 4148',
  type: 'dedication',
  message: 'मम्मी को जन्मदिन की बधाई!',
  ...patch,
});

describe('studio call table', () => {
  it('lists recent calls newest first, without the full number', () => {
    const t = new CallTable(sqlite());
    t.save(call('a', 30), T0);
    t.save(call('b', 5, { name: undefined, city: undefined }), T0);
    t.save(call('old', 60 * 25), T0);
    const recent = t.recent(T0);
    expect(recent.map((c) => c.id)).toEqual(['b', 'a']);
    expect(recent[0]).toEqual({ id: 'b', at: call('b', 5).at, maskedNumber: '+91 ••••• 4148', type: 'dedication', message: 'मम्मी को जन्मदिन की बधाई!' });
    expect(t.recent(T0 + RECENT_WINDOW_MS)).toEqual([]);
  });

  it('gives a call to one listener at a time', () => {
    const t = new CallTable(sqlite());
    t.save(call('a'), T0);
    t.save(call('b'), T0);
    expect(t.claim(['a', 'b'], ME, T0)).toEqual(expect.arrayContaining(['a', 'b']));
    // Another listener's RJ link, a moment later, gets nothing
    expect(t.claim(['a', 'b'], YOU, T0 + 1000)).toEqual([]);
    // The same listener's rewritten link may take them again
    expect(t.claim(['a'], ME, T0 + 2000)).toEqual(['a']);
  });

  it('reads a call on air once, ever: rejoining or another listener never brings it back', () => {
    const t = new CallTable(sqlite());
    t.save(call('a'), T0);
    t.claim(['a'], ME, T0);
    expect(t.markAired(['a'], ME, 'hi', T0 + 60_000)).toEqual(['a']);
    expect(t.recent(T0 + 60_000)[0].airedAt).toBe(new Date(T0 + 60_000).toISOString());
    // Long after the lease, nobody (the same listener rejoining included) can claim or air it again
    for (const who of [ME, YOU]) {
      expect(t.claim(['a'], who, T0 + CLAIM_LEASE_MS * 5)).toEqual([]);
      expect(t.markAired(['a'], who, 'ta', T0 + CLAIM_LEASE_MS * 5)).toEqual([]);
    }
    expect(t.recent(T0 + CLAIM_LEASE_MS * 5)[0].airedAt).toBe(new Date(T0 + 60_000).toISOString());
  });

  it('puts a call back in the queue when its RJ link never airs', () => {
    const t = new CallTable(sqlite());
    t.save(call('a'), T0);
    expect(t.claim(['a'], ME, T0)).toEqual(['a']);
    expect(t.claim(['a'], YOU, T0 + CLAIM_LEASE_MS - 1)).toEqual([]);
    expect(t.claim(['a'], YOU, T0 + CLAIM_LEASE_MS + 1)).toEqual(['a']);
    // The first listener's late link can no longer mark it: the other RJ has it now
    expect(t.markAired(['a'], ME, 'hi', T0 + CLAIM_LEASE_MS + 2)).toEqual([]);
    expect(t.markAired(['a'], YOU, 'hi', T0 + CLAIM_LEASE_MS + 2)).toEqual(['a']);
  });

  it('releases a call the script left out at once', () => {
    const t = new CallTable(sqlite());
    t.save(call('a'), T0);
    t.claim(['a'], ME, T0);
    t.release(['a'], YOU);
    expect(t.claim(['a'], YOU, T0 + 1000)).toEqual([]);
    t.release(['a'], ME);
    expect(t.claim(['a'], YOU, T0 + 1000)).toEqual(['a']);
  });

  it('only the claim holder marks a call, so nobody can silence the queue', () => {
    const t = new CallTable(sqlite());
    t.save(call('a'), T0);
    expect(t.markAired(['a'], ME, 'hi', T0)).toEqual([]);
    t.claim(['a'], ME, T0);
    expect(t.markAired(['a'], YOU, 'hi', T0)).toEqual([]);
    expect(t.recent(T0)[0].airedAt).toBeUndefined();
  });

  it('keeps a call aired when the webhook retries with the same id', () => {
    const t = new CallTable(sqlite());
    t.save(call('a'), T0);
    t.claim(['a'], ME, T0);
    t.markAired(['a'], ME, 'hi', T0);
    t.save(call('a', 0, { message: 'Updated text' }), T0 + 5000);
    const [row] = t.recent(T0 + 5000);
    expect(row.message).toBe('Updated text');
    expect(row.airedAt).toBeTruthy();
  });

  it('imports the old list once, so the switch loses no calls', () => {
    const sql = sqlite();
    const t = new CallTable(sql);
    expect(t.importOnce([call('a'), call('b')], T0)).toBe(2);
    expect(t.importOnce([call('c')], T0)).toBe(0);
    expect(new CallTable(sql).recent(T0).map((c) => c.id).sort()).toEqual(['a', 'b']);
  });
});
