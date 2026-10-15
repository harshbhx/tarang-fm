/** Shared helpers for the fact sources: IST dates, polite fetches with a timeout, and per-isolate caches. */
import type { StationId } from '../../shared/types';
import type { FactLang } from './types';

export const USER_AGENT = 'TarangFM/1.0 (+https://tarang-fm.dualmindlab.tech; https://github.com/harshbhx/tarang-fm)';
export const FETCH_TIMEOUT_MS = 2500;
const IST_OFFSET_MS = 5.5 * 3_600_000;
export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;
export const MINUTE_MS = 60_000;

const FACT_LANGS: ReadonlySet<string> = new Set(['hi', 'mr', 'ta', 'bn', 'gu']);

export function factLang(station: StationId): FactLang | undefined {
  return FACT_LANGS.has(station) ? (station as FactLang) : undefined;
}

/** IST wall-clock parts for an instant. India has no DST, so a fixed offset is exact. */
export function istParts(now: number): { date: string; time: string; weekday: number; hour: number; minute: number } {
  const d = new Date(now + IST_OFFSET_MS);
  const iso = d.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16), weekday: d.getUTCDay(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

/** Epoch ms for an IST wall-clock time, e.g. istInstant('2026-10-22', '12:30'). */
export function istInstant(date: string, time = '00:00'): number {
  return Date.parse(`${date}T${time}:00Z`) - IST_OFFSET_MS;
}

/** Epoch ms of the next IST midnight after `now`. */
export function endOfIstDay(now: number): number {
  return istInstant(istParts(now).date) + DAY_MS;
}

export const dayNum = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY_MS);

/** Adds days to a 'YYYY-MM-DD' date. */
export function addDays(ymd: string, days: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** GET with the station User-Agent and a hard timeout. Throws on network errors and non-2xx. */
export async function fetchWithTimeout(url: string, accept: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: accept },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${res.status} ${new URL(url).hostname}`);
  return res;
}

/**
 * A small per-isolate cache. Fresh entries are served for `ttlMs`; after a failed refresh, an entry is still served
 * until `staleMs` so a flaky source gives yesterday's-hour data rather than nothing. (Cross-isolate caching would
 * need a KV namespace; per isolate is enough at current traffic.)
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, { at: number; value: T }>();
  constructor(
    private readonly ttlMs: number,
    private readonly staleMs: number,
    private readonly maxEntries = 500,
  ) {}

  fresh(key: string, now: number): T | undefined {
    const hit = this.entries.get(key);
    return hit && now - hit.at < this.ttlMs ? hit.value : undefined;
  }

  stale(key: string, now: number): T | undefined {
    const hit = this.entries.get(key);
    return hit && now - hit.at < this.staleMs ? hit.value : undefined;
  }

  set(key: string, value: T, now: number): void {
    if (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value as string);
    this.entries.set(key, { at: now, value });
  }

  clear(): void {
    this.entries.clear();
  }
}

/** Grid key for coordinate caches: 0.1° is about 11 km. */
export const gridKey = (lat: number, lon: number) => `${lat.toFixed(1)},${lon.toFixed(1)}`;

/**
 * Loads through a cache: fresh hit, else fetch, else a stale hit, else undefined. Never throws.
 * Keyed by the caller; `load` should throw on any failure so nothing bad is cached.
 */
export async function cached<T>(cache: TtlCache<T>, key: string, now: number, load: () => Promise<T>, label: string): Promise<T | undefined> {
  const hit = cache.fresh(key, now);
  if (hit !== undefined) return hit;
  try {
    const value = await load();
    cache.set(key, value, now);
    return value;
  } catch (err) {
    console.error(`[facts] ${label} failed: ${String(err)}`);
    return cache.stale(key, now);
  }
}
