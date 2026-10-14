/** Listener context from the browser clock, plus the persisted listener name. */
import { LISTENER_NAME_MAX } from '../../shared/constants';
import type { Daypart, ListenerContext } from '../../shared/types';

const NAME_KEY = 'tarang.listenerName';
const CITY_MAX = 80;
const REGION_MAX = 60;

export function daypartFor(hour: number): Daypart {
  if (hour >= 5 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 16) return 'afternoon';
  if (hour >= 17 && hour <= 20) return 'evening';
  return 'night';
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatLocalTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Browser-local 'YYYY-MM-DD' */
export function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Trimmed, single-spaced, length-capped name; undefined when blank. */
export function cleanListenerName(name: string | null | undefined): string | undefined {
  const clean = (name ?? '').replace(/\s+/g, ' ').trim().slice(0, LISTENER_NAME_MAX).trim();
  return clean || undefined;
}

export function listenerContext(
  listener: { name?: string; city?: string; region?: string },
  now: Date = new Date(),
): ListenerContext {
  const ctx: ListenerContext = {
    localTime: formatLocalTime(now),
    daypart: daypartFor(now.getHours()),
    localDate: formatLocalDate(now),
    weekday: now.getDay(),
  };
  const name = cleanListenerName(listener.name);
  const city = listener.city?.trim().slice(0, CITY_MAX).trim();
  const region = listener.region?.trim().slice(0, REGION_MAX).trim();
  if (name) ctx.name = name;
  if (city) ctx.city = city;
  if (region) ctx.region = region;
  return ctx;
}

export function loadListenerName(): string | undefined {
  try {
    return cleanListenerName(globalThis.localStorage?.getItem(NAME_KEY));
  } catch {
    return undefined;
  }
}

export function saveListenerName(name: string | undefined): void {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    const clean = cleanListenerName(name);
    if (clean) storage.setItem(NAME_KEY, clean);
    else storage.removeItem(NAME_KEY);
  } catch {
    /* storage blocked or full: the name just won't persist */
  }
}

const HOLDER_KEY = 'tarang.phoneHolder';
const HOLDER_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * This tab's id on the studio line: the calls its RJ links read are claimed in this name. Kept for the
 * tab's lifetime (reloads included), so a rejoin can still air a call its last link had already written.
 */
export function loadPhoneHolder(): string {
  try {
    const saved = globalThis.sessionStorage?.getItem(HOLDER_KEY);
    if (saved && HOLDER_PATTERN.test(saved)) return saved;
  } catch {
    /* storage blocked: a fresh id per page load */
  }
  const id =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  try {
    globalThis.sessionStorage?.setItem(HOLDER_KEY, id);
  } catch {
    /* fine: the id just won't survive a reload */
  }
  return id;
}
