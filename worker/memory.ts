/**
 * Show memory: what each station has already aired, shared by every listener and kept across sessions,
 * so stories and ads don't repeat. Stored in Workers KV (the PHONE namespace, under `show:` keys) as one
 * small rolling list per station and kind. Best effort throughout: if KV is slow or down, the show goes on
 * without it.
 */
import type { StationId } from '../shared/types';

export interface StoryRecord {
  at: string;
  title: string;
  summary?: string;
  setting: string;
  hook: string;
  twist: string;
  opening: string;
}

export interface AdRecord {
  at: string;
  title: string;
  summary?: string;
  category: string;
  format: string;
}

export interface ShowMemory {
  recentStories(station: StationId): Promise<StoryRecord[]>;
  recentAds(station: StationId): Promise<AdRecord[]>;
  rememberStory(station: StationId, record: StoryRecord): void;
  rememberAd(station: StationId, record: AdRecord): void;
}

/** The KV calls the memory needs (a KVNamespace satisfies it). */
export interface MemoryStore {
  get(key: string, type: 'json'): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export const STORY_MEMORY = 40;
export const AD_MEMORY = 30;
/** A memory read never holds up a segment for longer than this. */
const READ_TIMEOUT_MS = 400;
/** Per-isolate cache, so a busy station reads KV about once a minute. */
const CACHE_MS = 60_000;
/** Lists expire after 30 days without a new segment. */
const TTL_S = 30 * 24 * 60 * 60;

const key = (station: StationId, kind: 'stories' | 'ads') => `show:${station}:${kind}`;

/** Lower-cased, punctuation-free form of a title, for spotting repeats. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '');
}

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), READ_TIMEOUT_MS))]);
}

export function kvShowMemory(store: MemoryStore | undefined, waitUntil?: (p: Promise<unknown>) => void): ShowMemory | undefined {
  if (!store) return undefined;
  const cache = new Map<string, { at: number; items: unknown[] }>();

  async function read<T>(k: string): Promise<T[]> {
    const hit = cache.get(k) ?? sharedCache.get(k);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.items as T[];
    const value = await withTimeout(store!.get(k, 'json').catch(() => null), null);
    const items = Array.isArray(value) ? (value as T[]) : [];
    const entry = { at: Date.now(), items };
    cache.set(k, entry);
    sharedCache.set(k, entry);
    return items;
  }

  function append<T>(k: string, item: T, max: number): void {
    const run = (async () => {
      // Read fresh (not the cache) so two isolates writing close together lose as little as possible
      const value = await store!.get(k, 'json').catch(() => null);
      const items = [...(Array.isArray(value) ? (value as T[]) : []), item].slice(-max);
      const entry = { at: Date.now(), items };
      cache.set(k, entry);
      sharedCache.set(k, entry);
      await store!.put(k, JSON.stringify(items), { expirationTtl: TTL_S });
    })().catch((err) => console.error(`[memory] ${k} write failed: ${String(err)}`));
    if (waitUntil) waitUntil(run);
  }

  return {
    recentStories: (station) => read<StoryRecord>(key(station, 'stories')),
    recentAds: (station) => read<AdRecord>(key(station, 'ads')),
    rememberStory: (station, record) => append(key(station, 'stories'), record, STORY_MEMORY),
    rememberAd: (station, record) => append(key(station, 'ads'), record, AD_MEMORY),
  };
}

/** Survives across requests in one isolate. */
const sharedCache = new Map<string, { at: number; items: unknown[] }>();

/** Test hook: forget everything cached in this isolate. */
export function clearMemoryCache(): void {
  sharedCache.clear();
}
