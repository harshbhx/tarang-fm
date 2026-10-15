/** Show-clock progression (docs/TECH-SPEC.md §9, clock v2). Pure functions, no I/O. */
import { CLOCK_LOOP_FROM, SHOW_CLOCK_V2 } from '../../shared/constants';
import type { ClockMode, ClockSlot, SegmentType } from '../../shared/types';

/** After the first pass the clock loops from this index (skips the station ID and the opener). */
export const LOOP_FROM = CLOCK_LOOP_FROM;

export const THEME_MAX = 120;

export interface ClockEntry {
  /** Monotonic position in the programme (0 = first segment after tuning in) */
  seq: number;
  /** Index into the clock this entry came from */
  index: number;
  /** Pass through the clock: 0 is the first (station ID and opener), then one per loop (one serial each) */
  loop: number;
  type: SegmentType;
  /** What the slot is for (rj_link: opener/payload/kahani_in/kahani_out; news: full/update) */
  mode?: ClockMode;
  /** kahani only: serial part */
  part?: 1 | 2 | 3;
  /** Extra segment slotted in by a call; the clock resumes after it as if it never ran */
  inserted?: boolean;
}

export function nextIndex(index: number, clock: readonly ClockSlot[] = SHOW_CLOCK_V2): number {
  const next = index + 1;
  if (next < clock.length) return next;
  return Math.min(LOOP_FROM, clock.length - 1);
}

function entryAt(seq: number, index: number, loop: number, clock: readonly ClockSlot[]): ClockEntry {
  const slot = clock[index];
  const entry: ClockEntry = { seq, index, loop, type: slot.type };
  if (slot.mode) entry.mode = slot.mode;
  if (slot.part) entry.part = slot.part;
  return entry;
}

export function firstEntry(clock: readonly ClockSlot[] = SHOW_CLOCK_V2): ClockEntry {
  return entryAt(0, 0, 0, clock);
}

export function nextEntry(entry: ClockEntry, clock: readonly ClockSlot[] = SHOW_CLOCK_V2): ClockEntry {
  const index = nextIndex(entry.index, clock);
  return entryAt(entry.seq + 1, index, index <= entry.index ? entry.loop + 1 : entry.loop, clock);
}

/** An extra segment played right after `current` (a studio call's RJ link); the clock then carries on. */
export function insertedEntry(current: ClockEntry, type: SegmentType, mode?: ClockMode): ClockEntry {
  const entry: ClockEntry = { seq: current.seq + 1, index: current.index, loop: current.loop, type, inserted: true };
  if (mode) entry.mode = mode;
  return entry;
}

/** The clock slot an entry plays (what the programme strip shows). */
export function slotOf(entry: ClockEntry): ClockSlot {
  const slot: ClockSlot = { type: entry.type };
  if (entry.mode) slot.mode = entry.mode;
  if (entry.part) slot.part = entry.part;
  return slot;
}

/**
 * Order on air, independent of `seq` (which an inserted segment shifts): a later loop, a later slot, and an
 * inserted segment right after the slot it follows.
 */
export function position(entry: ClockEntry): number {
  return (entry.loop * 1000 + entry.index) * 2 + (entry.inserted ? 1 : 0);
}

/** A Kahani part of the serial (not a story slotted in some other way). */
export function isSerialPart(entry: ClockEntry): entry is ClockEntry & { part: 1 | 2 | 3 } {
  return entry.type === 'kahani' && !!entry.part && !entry.inserted;
}

/** The serial part a slot belongs to: a Kahani part, or the part an RJ link hands into or out of. */
export function partOf(entry: ClockEntry, clock: readonly ClockSlot[] = SHOW_CLOCK_V2): 1 | 2 | 3 | undefined {
  if (entry.inserted) return undefined;
  if (entry.type === 'kahani') return entry.part;
  if (entry.mode === 'kahani_in') return clock[entry.index + 1]?.part;
  if (entry.mode === 'kahani_out') return clock[entry.index - 1]?.part;
  return undefined;
}

/** The first clock entry from `from` (itself included) that matches, within `maxSteps`, and how far ahead it is. */
export function findAhead(
  from: ClockEntry,
  match: (entry: ClockEntry) => boolean,
  maxSteps: number,
  clock: readonly ClockSlot[] = SHOW_CLOCK_V2,
): { entry: ClockEntry; steps: number } | undefined {
  let entry = from;
  for (let steps = 0; steps <= maxSteps; steps++) {
    if (match(entry)) return { entry, steps };
    entry = nextEntry(entry, clock);
  }
  return undefined;
}

export function cleanTheme(theme: string | null | undefined): string | undefined {
  const clean = (theme ?? '').replace(/\s+/g, ' ').trim().slice(0, THEME_MAX).trim();
  return clean || undefined;
}

/**
 * Cache key: a slot of a given loop (stable when a segment is inserted before it), or an inserted segment
 * after one.
 */
export function entryKey(entry: ClockEntry): string {
  return `${entry.loop}:${entry.index}:${entry.type}${entry.inserted ? ':x' : ''}`;
}

/** The first `count` entries the clock plays from a fresh tune-in. */
export function programmeEntries(count: number, clock: readonly ClockSlot[] = SHOW_CLOCK_V2): ClockEntry[] {
  const out: ClockEntry[] = [];
  let entry = firstEntry(clock);
  for (let i = 0; i < count; i++) {
    out.push(entry);
    entry = nextEntry(entry, clock);
  }
  return out;
}

/** The first `count` segment types the clock plays from a fresh tune-in. */
export function programme(count: number, clock: readonly ClockSlot[] = SHOW_CLOCK_V2): SegmentType[] {
  return programmeEntries(count, clock).map((e) => e.type);
}
