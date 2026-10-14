/** Shared-show timeline math for a live station: placing, inserting and shifting lines, IST clock, producer plan. Pure, no I/O. */
import { SHOW_CLOCK } from '../../shared/constants';
import { LIVE_PCM_BYTES_PER_MS, type LiveLine } from '../../shared/live';
import type { SegmentRequest } from '../../shared/schemas';
import type { Daypart, SegmentType } from '../../shared/types';

/** A new line never starts sooner than this after it is placed, so every listener has time to fetch it. */
export const MIN_LEAD_MS = 1500;
/** A welcome goes in at the first line boundary at least this far ahead of now. */
export const WELCOME_LEAD_MS = 700;
/** Silence after a welcome line before the show carries on. */
export const WELCOME_GAP_MS = 400;
/** After the first pass the clock loops from this index (skips the station ID). */
export const CLOCK_LOOP_FROM = 1;

const CATCHPHRASE_ODDS = 0.3;
const BIT_ODDS = 0.35;
const IST_OFFSET_MS = 330 * 60_000;

export type Placed = Omit<LiveLine, 'startAt'>;
export type ProducerPlan = NonNullable<SegmentRequest['producer']>;

/** Audio length of a PCM clip (24 kHz, 16-bit mono). */
export function pcmDurationMs(bytes: number): number {
  return Math.round(bytes / LIVE_PCM_BYTES_PER_MS);
}

/** Rough spoken length of a line before it is voiced (base letters at ~10.5/s, scaled by pace), plus its pause. */
export function estimateMs(line: Pick<LiveLine['line'], 'text' | 'pace' | 'pauseAfterMs'>): number {
  const letters = line.text.replace(/[\p{M}\s]/gu, '').length;
  return Math.round((letters / 10.5 / Math.max(0.5, line.pace)) * 1000) + line.pauseAfterMs;
}

export function lineEnd(line: LiveLine): number {
  return line.startAt + line.durationMs;
}

/** When the line after `line` may start: its end plus its pause. */
function boundaryAfter(line: LiveLine): number {
  return lineEnd(line) + line.line.pauseAfterMs;
}

/** Start time for a line appended now: back to back with the last line, never sooner than now + lead. */
export function nextStartAt(lines: readonly LiveLine[], now: number, leadMs = MIN_LEAD_MS): number {
  const last = lines[lines.length - 1];
  const earliest = now + leadMs;
  return last ? Math.max(boundaryAfter(last), earliest) : earliest;
}

/** Appends a line at the end of the timeline. */
export function appendLine(lines: readonly LiveLine[], line: Placed, now: number, leadMs = MIN_LEAD_MS): LiveLine[] {
  return [...lines, { ...line, startAt: nextStartAt(lines, now, leadMs) }];
}

/** Written and voiced audio still ahead of the on-air clock (the last line's end plus its pause). */
export function bufferedAheadMs(lines: readonly LiveLine[], now: number): number {
  const last = lines[lines.length - 1];
  return last ? Math.max(0, boundaryAfter(last) - now) : 0;
}

/** Lines not yet finished, in air order. */
export function upcomingLines(lines: readonly LiveLine[], now: number): LiveLine[] {
  return lines.filter((line) => lineEnd(line) > now);
}

/** Lines that have finished by `now`. */
export function endedLines(lines: readonly LiveLine[], now: number): LiveLine[] {
  return lines.filter((line) => lineEnd(line) <= now);
}

/** The line on air at `now`, if any. */
export function onAirAt(lines: readonly LiveLine[], now: number): LiveLine | undefined {
  return lines.find((line) => line.startAt <= now && lineEnd(line) > now);
}

/**
 * Cuts a line in right after the line on air: before the first line that starts at or after `notBefore`
 * (lines starting sooner are never moved), beginning the moment the previous line ends (never sooner than
 * `notBefore`). Every later line is pushed back to follow the new line and its pause. With nothing left to
 * move, the line is appended the same way.
 */
export function insertLine(
  lines: readonly LiveLine[],
  line: Placed,
  notBefore: number,
): { lines: LiveLine[]; index: number; startAt: number } {
  const index = lines.findIndex((l) => l.startAt >= notBefore);
  const previous = lines[(index < 0 ? lines.length : index) - 1];
  const startAt = Math.max(previous ? lineEnd(previous) : notBefore, notBefore);
  if (index < 0) return { lines: [...lines, { ...line, startAt }], index: lines.length, startAt };
  const shift = Math.max(0, startAt + line.durationMs + line.line.pauseAfterMs - lines[index].startAt);
  return {
    lines: [...lines.slice(0, index), { ...line, startAt }, ...shiftLines(lines.slice(index), shift)],
    index,
    startAt,
  };
}

export function shiftLines(lines: readonly LiveLine[], deltaMs: number): LiveLine[] {
  return lines.map((line) => ({ ...line, startAt: line.startAt + deltaMs }));
}

/** Earliest a welcome may start: a short lead from now, and the min gap after the last welcome. */
export function welcomeNotBefore(now: number, lastWelcomeAt: number | undefined, minGapMs: number, leadMs = WELCOME_LEAD_MS): number {
  return Math.max(now + leadMs, lastWelcomeAt === undefined ? 0 : lastWelcomeAt + minGapMs);
}

// ---- Show clock and producer -------------------------------------------------------------------

export function nextClockIndex(index: number, clock: readonly SegmentType[] = SHOW_CLOCK): number {
  const next = index + 1;
  return next < clock.length ? next : Math.min(CLOCK_LOOP_FROM, clock.length - 1);
}

/** Producer settings for the show's `linkNo`-th RJ link since waking; a catchphrase never runs twice in a row. */
export function producerPlan(linkNo: number, lastCatchphrase: boolean, random: () => number = Math.random): ProducerPlan {
  return {
    firstLink: linkNo === 0,
    greetListener: false,
    useCatchphrase: !lastCatchphrase && random() < CATCHPHRASE_ODDS,
    bit: random() < BIT_ODDS ? 'any' : 'none',
  };
}

/** The most common value (first seen wins a tie); undefined when there are none. */
export function mostCommon(values: readonly (string | undefined)[]): string | undefined {
  const counts = new Map<string, number>();
  let best: string | undefined;
  let bestCount = 0;
  for (const value of values) {
    const v = value?.trim();
    if (!v) continue;
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (n > bestCount) {
      best = v;
      bestCount = n;
    }
  }
  return best;
}

// ---- India Standard Time -----------------------------------------------------------------------

export interface IstClock {
  /** 'HH:mm' */
  localTime: string;
  daypart: Daypart;
  /** 'YYYY-MM-DD' */
  localDate: string;
  /** 0 = Sunday */
  weekday: number;
  hour: number;
}

export function daypartFor(hour: number): Daypart {
  if (hour >= 5 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 16) return 'afternoon';
  if (hour >= 17 && hour <= 20) return 'evening';
  return 'night';
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Wall-clock time in India for a server epoch ms. */
export function istClock(now: number): IstClock {
  const d = new Date(now + IST_OFFSET_MS);
  const hour = d.getUTCHours();
  return {
    localTime: `${pad(hour)}:${pad(d.getUTCMinutes())}`,
    daypart: daypartFor(hour),
    localDate: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    weekday: d.getUTCDay(),
    hour,
  };
}

// ---- Concurrency ---------------------------------------------------------------------------------

/** Runs at most `max` tasks at once; `first` jumps the queue (welcomes go ahead of programme lines). */
export class Gate {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly max: number) {}

  async run<T>(task: () => Promise<T>, first = false): Promise<T> {
    if (this.active < this.max) this.active += 1;
    else await new Promise<void>((resolve) => (first ? this.waiting.unshift(resolve) : this.waiting.push(resolve)));
    try {
      return await task();
    } finally {
      // Hand the slot straight to the next task, so a newcomer can't slip in between
      const next = this.waiting.shift();
      if (next) next();
      else this.active -= 1;
    }
  }

  get inFlight(): number {
    return this.active;
  }
}
