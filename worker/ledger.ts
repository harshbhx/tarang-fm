/**
 * The daily spend budget and kill switch (pure logic; the Durable Object in spend.ts stores it). Every paid action asks `charge()` first; once a day's global or
 * per-IP allowance is used up, it is refused and the site shows a friendly "back tomorrow" instead of spending more.
 * One Durable Object (SQLite) holds the counters, so concurrent requests from any data centre are counted exactly.
 */
export const SPEND_KINDS = ['tts_chars', 'segment', 'call', 'live_join', 'context'] as const;
export type SpendKind = (typeof SPEND_KINDS)[number];

export type SpendLimits = Record<SpendKind, { global: number; perIp: number }>;

/** Defaults sized for a portfolio site: about 11 hours of speech a day in total, about an hour per visitor. */
export const DEFAULT_LIMITS: SpendLimits = {
  tts_chars: { global: 600_000, perIp: 60_000 },
  segment: { global: 3_000, perIp: 300 },
  call: { global: 400, perIp: 25 },
  live_join: { global: 3_000, perIp: 60 },
  context: { global: 30_000, perIp: 1_500 },
};

const ENV_NAMES: Record<SpendKind, string> = {
  tts_chars: 'TTS_CHARS',
  segment: 'SEGMENTS',
  call: 'CALLS',
  live_join: 'LIVE_JOINS',
  context: 'CONTEXT',
};

export interface SpendEnv {
  [key: string]: unknown;
}

/** Limits from env vars BUDGET_<KIND>_DAY (global) and BUDGET_<KIND>_IP_DAY (per IP); unset or invalid keeps the default. */
export function limitsFrom(env: SpendEnv): SpendLimits {
  const out = {} as SpendLimits;
  for (const kind of SPEND_KINDS) {
    const read = (name: string, fallback: number): number => {
      const raw = env[name];
      const n = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : NaN;
      return Number.isFinite(n) && n >= 0 ? n : fallback;
    };
    out[kind] = {
      global: read(`BUDGET_${ENV_NAMES[kind]}_DAY`, DEFAULT_LIMITS[kind].global),
      perIp: read(`BUDGET_${ENV_NAMES[kind]}_IP_DAY`, DEFAULT_LIMITS[kind].perIp),
    };
  }
  return out;
}

export type ChargeResult = { ok: true } | { ok: false; scope: 'global' | 'ip' | 'paused' };

/** Where the counters live; the Durable Object backs it with SQLite, tests with a Map. */
export interface Counters {
  get(key: string): number;
  add(key: string, n: number): number;
  /** Forget every counter whose day is not `day`. */
  sweep(day: string): void;
  getFlag(name: string): boolean;
  setFlag(name: string, on: boolean): void;
}

export function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export class SpendLedger {
  constructor(
    private readonly counters: Counters,
    private readonly limits: SpendLimits,
  ) {}

  /** Counts `units` of `kind` for `ip` if both the site-wide and the per-IP allowance for today have room. */
  charge(kind: SpendKind, units: number, ip: string, now = Date.now()): ChargeResult {
    if (this.counters.getFlag('paused')) return { ok: false, scope: 'paused' };
    const day = dayKey(now);
    const limit = this.limits[kind];
    const globalKey = `${day}|g|${kind}`;
    const ipKey = `${day}|i|${kind}|${ip}`;
    const n = Math.max(1, Math.ceil(units));
    if (this.counters.get(globalKey) + n > limit.global) return { ok: false, scope: 'global' };
    if (this.counters.get(ipKey) + n > limit.perIp) return { ok: false, scope: 'ip' };
    this.counters.add(globalKey, n);
    this.counters.add(ipKey, n);
    return { ok: true };
  }

  status(now = Date.now()): { day: string; paused: boolean; used: Record<SpendKind, number>; limits: SpendLimits } {
    const day = dayKey(now);
    const used = {} as Record<SpendKind, number>;
    for (const kind of SPEND_KINDS) used[kind] = this.counters.get(`${day}|g|${kind}`);
    return { day, paused: this.counters.getFlag('paused'), used, limits: this.limits };
  }

  setPaused(paused: boolean): void {
    this.counters.setFlag('paused', paused);
  }

  sweep(now = Date.now()): void {
    this.counters.sweep(dayKey(now));
  }
}
