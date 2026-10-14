/** Listener context from the browser clock, plus the persisted listener name. */
import { LISTENER_NAME_MAX } from '../../shared/constants';
import type { Daypart, ListenerContext } from '../../shared/types';

const NAME_KEY = 'tarang.listenerName';
const CITY_MAX = 80;

export function daypartFor(hour: number): Daypart {
  if (hour >= 5 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 16) return 'afternoon';
  if (hour >= 17 && hour <= 20) return 'evening';
  return 'night';
}

export function formatLocalTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Trimmed, single-spaced, length-capped name; undefined when blank. */
export function cleanListenerName(name: string | null | undefined): string | undefined {
  const clean = (name ?? '').replace(/\s+/g, ' ').trim().slice(0, LISTENER_NAME_MAX).trim();
  return clean || undefined;
}

export function listenerContext(
  listener: { name?: string; city?: string },
  now: Date = new Date(),
): ListenerContext {
  const ctx: ListenerContext = { localTime: formatLocalTime(now), daypart: daypartFor(now.getHours()) };
  const name = cleanListenerName(listener.name);
  const city = listener.city?.trim().slice(0, CITY_MAX).trim();
  if (name) ctx.name = name;
  if (city) ctx.city = city;
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
