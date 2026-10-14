/** Show-clock progression (docs/TECH-SPEC.md §9). Pure functions, no I/O. */
import { SHOW_CLOCK } from '../../shared/constants';
import type { SegmentType } from '../../shared/types';

/** After the first pass the clock loops from this index (skips the station ID). */
export const LOOP_FROM = 1;

export const THEME_MAX = 120;

export interface ClockEntry {
  /** Monotonic position in the programme (0 = first segment after tuning in) */
  seq: number;
  /** Index into the clock this entry came from */
  index: number;
  type: SegmentType;
  /** Listener-requested story theme (kahani only) */
  theme?: string;
  /** Extra segment slotted in by a call; the clock resumes after it as if it never ran */
  inserted?: boolean;
}

export function nextIndex(index: number, clock: readonly SegmentType[] = SHOW_CLOCK): number {
  const next = index + 1;
  if (next < clock.length) return next;
  return Math.min(LOOP_FROM, clock.length - 1);
}

export function firstEntry(clock: readonly SegmentType[] = SHOW_CLOCK): ClockEntry {
  return { seq: 0, index: 0, type: clock[0] };
}

export function nextEntry(entry: ClockEntry, clock: readonly SegmentType[] = SHOW_CLOCK): ClockEntry {
  const index = nextIndex(entry.index, clock);
  return { seq: entry.seq + 1, index, type: clock[index] };
}

export function cleanTheme(theme: string | null | undefined): string | undefined {
  const clean = (theme ?? '').replace(/\s+/g, ' ').trim().slice(0, THEME_MAX).trim();
  return clean || undefined;
}

/**
 * The entry to play after `current` once a caller asks for a story: the next kahani on the
 * clock gets the theme, otherwise a themed kahani is slotted in before the clock continues.
 */
export function withStoryRequest(
  current: ClockEntry,
  theme: string | null | undefined,
  clock: readonly SegmentType[] = SHOW_CLOCK,
): ClockEntry {
  const following = nextEntry(current, clock);
  const clean = cleanTheme(theme);
  if (following.type === 'kahani') return clean ? { ...following, theme: clean } : following;
  const inserted: ClockEntry = { seq: current.seq + 1, index: current.index, type: 'kahani', inserted: true };
  return clean ? { ...inserted, theme: clean } : inserted;
}

/** Cache key: distinguishes a themed or inserted entry from the plain clock entry it replaced. */
export function entryKey(entry: ClockEntry): string {
  return `${entry.seq}:${entry.index}:${entry.type}:${entry.inserted ? 'x' : ''}:${entry.theme ?? ''}`;
}

/** The first `count` segment types the clock plays from a fresh tune-in. */
export function programme(count: number, clock: readonly SegmentType[] = SHOW_CLOCK): SegmentType[] {
  const out: SegmentType[] = [];
  let entry = firstEntry(clock);
  for (let i = 0; i < count; i++) {
    out.push(entry.type);
    entry = nextEntry(entry, clock);
  }
  return out;
}
