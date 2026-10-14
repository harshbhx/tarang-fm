/**
 * StudioLine: one Durable Object holds the studio line's call table (SQLite), so every listener and every
 * rejoin sees the same calls and the same "read on air" state, immediately. One instance serves the whole
 * station network; calls are a handful a minute at most.
 */
import { DurableObject } from 'cloudflare:workers';
import type { PhoneCall } from '../shared/types';
import { CallTable } from './calls';

/** The old KV list the table imports once (worker/phone.ts kept calls there before). */
const LEGACY_KEY = 'phone:recent';
/** When the shared table went live; calls before it were already read by the old per-radio queue. */
const TABLE_LIVE_AT = '2026-10-14T21:44:00.000Z';

export class StudioLine extends DurableObject<Env> {
  private readonly table: CallTable;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.table = new CallTable(ctx.storage.sql);
    void ctx.blockConcurrencyWhile(async () => {
      const legacy = await env.PHONE?.get<PhoneCall[]>(LEGACY_KEY, 'json').catch(() => null);
      this.table.importOnce(Array.isArray(legacy) ? legacy : []);
      this.table.retireOnce(TABLE_LIVE_AT);
    });
  }

  save(call: PhoneCall): void {
    this.table.save(call);
  }

  recent(): PhoneCall[] {
    return this.table.recent();
  }

  claim(ids: string[], holder: string): string[] {
    return this.table.claim(ids, holder);
  }

  release(ids: string[], holder: string): void {
    this.table.release(ids, holder);
  }

  markAired(ids: string[], holder: string, station: string): string[] {
    return this.table.markAired(ids, holder, station);
  }
}

/** The single StudioLine instance. */
export function studioLine(env: Env): DurableObjectStub<StudioLine> {
  return env.STUDIO.get(env.STUDIO.idFromName('studio-line'));
}
