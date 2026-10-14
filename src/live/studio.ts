/**
 * Studio switch for "Listen together" (shared/live.ts): the owner's admin key, the public /now
 * snapshot and the keyed /control call that starts or stops a station.
 */
import type { LiveControlRequest, LiveControlResponse, LiveSnapshot } from '../../shared/live';
import type { StationId } from '../../shared/types';

const ADMIN_KEY = 'tarang.liveAdminKey';
const ADMIN_PARAM = 'admin';

/** Fallback when storage is blocked (private windows), so the key lasts the visit. */
let memoryKey: string | null = null;

export function loadAdminKey(): string | null {
  try {
    const saved = globalThis.localStorage?.getItem(ADMIN_KEY);
    if (saved) return saved;
  } catch {
    /* storage blocked */
  }
  return memoryKey;
}

export function saveAdminKey(key: string): void {
  memoryKey = key;
  try {
    globalThis.localStorage?.setItem(ADMIN_KEY, key);
  } catch {
    /* storage blocked: the key lasts this visit */
  }
}

export function forgetAdminKey(): void {
  memoryKey = null;
  try {
    globalThis.localStorage?.removeItem(ADMIN_KEY);
  } catch {
    /* storage blocked */
  }
}

/**
 * The owner's key: `?admin=<key>` on the page is saved and removed from the address bar at once
 * (so it never sits in history or gets shared); otherwise the saved key, if any.
 */
export function takeAdminKey(): string | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get(ADMIN_PARAM)?.trim();
  if (url.searchParams.has(ADMIN_PARAM)) {
    url.searchParams.delete(ADMIN_PARAM);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }
  if (fromUrl) saveAdminKey(fromUrl);
  return loadAdminKey();
}

export function liveNowUrl(station: StationId): string {
  return `/api/live/${station}/now`;
}

export function liveControlUrl(station: StationId): string {
  return `/api/live/${station}/control`;
}

/** The station's public snapshot; null when it can't be read. */
export async function fetchLiveNow(station: StationId, signal?: AbortSignal): Promise<LiveSnapshot | null> {
  try {
    const res = await fetch(liveNowUrl(station), { signal, cache: 'no-store' });
    if (!res.ok) return null;
    const snapshot = (await res.json()) as LiveSnapshot | null;
    return snapshot && typeof snapshot === 'object' && typeof snapshot.state === 'string' ? snapshot : null;
  } catch {
    return null;
  }
}

/** A failed studio switch, with the HTTP status when the server answered (401 = wrong key). */
export class StudioError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'StudioError';
  }
}

export const WRONG_KEY = 'Wrong admin key';
const STUDIO_UNREACHABLE = 'Could not reach the studio. Try again.';

/** Starts or stops a station with the owner's key. */
export async function liveControl(station: StationId, action: LiveControlRequest['action'], key: string): Promise<LiveControlResponse> {
  const body: LiveControlRequest = { action };
  let res: Response;
  try {
    res = await fetch(liveControlUrl(station), {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new StudioError(STUDIO_UNREACHABLE);
  }
  if (res.status === 401) throw new StudioError(WRONG_KEY, 401);
  if (!res.ok) throw new StudioError(`The studio said no (${res.status}). Try again.`, res.status);
  try {
    return (await res.json()) as LiveControlResponse;
  } catch {
    throw new StudioError(STUDIO_UNREACHABLE, res.status);
  }
}
