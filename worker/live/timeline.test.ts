import { describe, expect, it } from 'vitest';
import { SHOW_CLOCK } from '../../shared/constants';
import {
  LIVE_AUTO_OFF_MS,
  LIVE_ENDED_NOTE,
  LIVE_IDLE_SLEEP_MS,
  LIVE_OFF_AIR_NOTE,
  LIVE_RESTART_GAP_MS,
  type LiveLine,
} from '../../shared/live';
import type { Line } from '../../shared/types';
import {
  appendLine,
  awakeAlarm,
  bufferedAheadMs,
  endedLines,
  Gate,
  insertLine,
  istClock,
  joinWakes,
  MIN_LEAD_MS,
  mostCommon,
  nextClockIndex,
  nextStartAt,
  onAirAt,
  pcmDurationMs,
  producerPlan,
  restartAllowed,
  upcomingLines,
  welcomeNotBefore,
  type Placed,
} from './timeline';

const speech = (pauseAfterMs = 300): Line => ({ role: 'rj', speaker: 'shubh_hi_conversational', text: 'नमस्ते।', pace: 1, temperature: 0.6, pauseAfterMs });

const placed = (id: string, durationMs: number, pauseAfterMs = 300): Placed => ({
  id,
  segmentId: 'seg',
  type: 'rj_link',
  title: 'Link',
  line: speech(pauseAfterMs),
  durationMs,
});

const at = (id: string, startAt: number, durationMs: number, pauseAfterMs = 300): LiveLine => ({ ...placed(id, durationMs, pauseAfterMs), startAt });

describe('placing lines', () => {
  it('starts the first line a short lead after now', () => {
    expect(nextStartAt([], 10_000)).toBe(10_000 + MIN_LEAD_MS);
    expect(appendLine([], placed('a', 2000), 10_000)[0].startAt).toBe(11_500);
  });

  it('places lines back to back with the pause in between', () => {
    let lines = appendLine([], placed('a', 2000, 300), 0);
    lines = appendLine(lines, placed('b', 1000), 0);
    expect(lines.map((l) => l.startAt)).toEqual([1500, 1500 + 2000 + 300]);
  });

  it('never schedules a line in the past after the buffer ran dry', () => {
    const lines = appendLine([at('a', 0, 1000)], placed('b', 1000), 60_000);
    expect(lines[1].startAt).toBe(60_000 + MIN_LEAD_MS);
  });

  it('measures the buffer ahead of now', () => {
    const lines = [at('a', 1000, 2000, 500), at('b', 3500, 4000, 500)];
    expect(bufferedAheadMs(lines, 0)).toBe(8000);
    expect(bufferedAheadMs(lines, 5000)).toBe(3000);
    expect(bufferedAheadMs(lines, 20_000)).toBe(0);
    expect(bufferedAheadMs([], 0)).toBe(0);
  });

  it('splits ended and upcoming lines and finds the one on air', () => {
    const lines = [at('a', 0, 1000), at('b', 1300, 1000), at('c', 2600, 1000)];
    expect(endedLines(lines, 1500).map((l) => l.id)).toEqual(['a']);
    expect(upcomingLines(lines, 1500).map((l) => l.id)).toEqual(['b', 'c']);
    expect(onAirAt(lines, 1500)?.id).toBe('b');
    expect(onAirAt(lines, 1100)).toBeUndefined();
  });

  it('turns PCM bytes into milliseconds (24 kHz, 16-bit mono)', () => {
    expect(pcmDurationMs(48_000)).toBe(1000);
    expect(pcmDurationMs(24)).toBe(1);
  });
});

describe('inserting a welcome', () => {
  const show = [at('a', 0, 4000, 300), at('b', 4300, 3000, 300), at('c', 7600, 2000, 300)];

  it('cuts in the moment the line on air ends and shifts every later line', () => {
    const { lines, index, startAt } = insertLine(show, placed('w', 2500, 400), 1000 + 700);
    expect(index).toBe(1);
    expect(startAt).toBe(4000);
    expect(lines.map((l) => l.id)).toEqual(['a', 'w', 'b', 'c']);
    // b now follows w's end plus w's pause; c keeps its gap after b
    expect(lines.map((l) => l.startAt)).toEqual([0, 4000, 6900, 10_200]);
    expect(lines.slice(0, 1)).toEqual(show.slice(0, 1));
  });

  it('never moves a line that starts sooner than notBefore', () => {
    const { lines, index, startAt } = insertLine(show, placed('w', 1000), 4100 + 700);
    expect(index).toBe(2);
    expect(startAt).toBe(7300);
    expect(lines[1]).toEqual(show[1]);
    expect(lines[3].startAt).toBe(7300 + 1000 + 300);
  });

  it('waits for notBefore when the line before already ended', () => {
    expect(insertLine(show, placed('w', 1000), 4100).startAt).toBe(4100);
  });

  it('is appended right after the last line when nothing can move', () => {
    const { lines, index, startAt } = insertLine(show, placed('w', 1000), 9000);
    expect(index).toBe(3);
    expect(startAt).toBe(7600 + 2000);
    expect(lines[3].id).toBe('w');
  });

  it('starts at notBefore on an empty or dry timeline', () => {
    expect(insertLine([], placed('w', 1000), 5000).startAt).toBe(5000);
    expect(insertLine(show, placed('w', 1000), 60_000).startAt).toBe(60_000);
  });

  it('keeps the min gap after the last welcome', () => {
    expect(welcomeNotBefore(10_000, undefined, 12_000)).toBe(10_700);
    expect(welcomeNotBefore(10_000, 5000, 12_000)).toBe(17_000);
    expect(welcomeNotBefore(30_000, 5000, 12_000)).toBe(30_700);
  });
});

describe('show clock and producer', () => {
  it('runs the clock once, then loops from after the station ID', () => {
    let index = 0;
    const order = [SHOW_CLOCK[index]];
    for (let i = 0; i < SHOW_CLOCK.length + 1; i++) {
      index = nextClockIndex(index);
      order.push(SHOW_CLOCK[index]);
    }
    expect(order[0]).toBe('station_id');
    expect(order.slice(1, SHOW_CLOCK.length)).toEqual(SHOW_CLOCK.slice(1));
    expect(order[SHOW_CLOCK.length]).toBe(SHOW_CLOCK[1]);
    expect(order).not.toContain(undefined);
    expect(order.filter((t) => t === 'station_id')).toHaveLength(1);
  });

  it('marks the first link, never greets one listener, and never repeats a catchphrase', () => {
    const always = () => 0;
    expect(producerPlan(0, false, always)).toEqual({ firstLink: true, greetListener: false, useCatchphrase: true, bit: 'any' });
    expect(producerPlan(1, true, always).useCatchphrase).toBe(false);
    expect(producerPlan(2, false, () => 0.9)).toEqual({ firstLink: false, greetListener: false, useCatchphrase: false, bit: 'none' });
  });

  it('picks the most common listener city', () => {
    expect(mostCommon(['Pune', 'Mumbai', ' Pune ', undefined, ''])).toBe('Pune');
    expect(mostCommon(['Delhi', 'Agra'])).toBe('Delhi');
    expect(mostCommon([undefined])).toBeUndefined();
  });
});

describe('istClock', () => {
  it('uses India time whatever the server zone', () => {
    // 2026-10-15 13:45 UTC is 19:15 IST, a Thursday
    const ist = istClock(Date.UTC(2026, 9, 15, 13, 45));
    expect(ist).toEqual({ localTime: '19:15', daypart: 'evening', localDate: '2026-10-15', weekday: 4, hour: 19 });
  });

  it('rolls the date over at IST midnight', () => {
    const ist = istClock(Date.UTC(2026, 9, 15, 18, 31));
    expect(ist.localDate).toBe('2026-10-16');
    expect(ist.localTime).toBe('00:01');
    expect(ist.daypart).toBe('night');
  });
});

describe('Gate', () => {
  it('runs at most max tasks and lets a priority task jump the queue', async () => {
    const gate = new Gate(2);
    const order: string[] = [];
    let peak = 0;
    const releases: (() => void)[] = [];
    const task = (name: string) => () =>
      new Promise<string>((resolve) => {
        order.push(name);
        peak = Math.max(peak, gate.inFlight);
        releases.push(() => resolve(name));
      });
    const runs = [gate.run(task('a')), gate.run(task('b')), gate.run(task('c')), gate.run(task('w'), true)];
    await Promise.resolve();
    expect(order).toEqual(['a', 'b']);
    releases.shift()!();
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(['a', 'b', 'w']);
    while (releases.length) {
      releases.shift()!();
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(await Promise.all(runs)).toEqual(['a', 'b', 'c', 'w']);
    expect(order).toEqual(['a', 'b', 'w', 'c']);
    expect(peak).toBe(2);
    expect(gate.inFlight).toBe(0);
  });
});

describe('auto-start rules', () => {
  const now = 1_760_000_000_000;

  it('a join wakes a sleeping station unless the studio stopped it', () => {
    expect(joinWakes({ state: 'sleeping' }, now)).toBe(true);
    expect(joinWakes({ state: 'sleeping', note: LIVE_OFF_AIR_NOTE }, now)).toBe(true);
    expect(joinWakes({ state: 'sleeping', blocked: true }, now)).toBe(false);
    expect(joinWakes({ state: 'on_air' }, now)).toBe(false);
  });

  it('a join or reconnect never restarts an ended show its listeners are still on', () => {
    expect(joinWakes({ state: 'sleeping', note: LIVE_ENDED_NOTE }, now)).toBe(false);
    expect(joinWakes({ state: 'sleeping', note: LIVE_ENDED_NOTE, emptySince: now - LIVE_IDLE_SLEEP_MS + 1 }, now)).toBe(false);
    // Empty for the idle window: the next join starts a fresh show
    expect(joinWakes({ state: 'sleeping', note: LIVE_ENDED_NOTE, emptySince: now - LIVE_IDLE_SLEEP_MS }, now)).toBe(true);
    expect(joinWakes({ state: 'sleeping', note: LIVE_ENDED_NOTE, emptySince: 0, blocked: true }, now)).toBe(false);
  });

  it('Tune in again starts at most one fresh show per restart gap, never while stopped or awake', () => {
    expect(restartAllowed({ state: 'sleeping', note: LIVE_ENDED_NOTE }, now)).toBe(true);
    expect(restartAllowed({ state: 'sleeping', startedAt: now - LIVE_AUTO_OFF_MS }, now)).toBe(true);
    expect(restartAllowed({ state: 'sleeping', startedAt: now - LIVE_RESTART_GAP_MS + 1 }, now)).toBe(false);
    expect(restartAllowed({ state: 'sleeping', startedAt: now - LIVE_RESTART_GAP_MS }, now)).toBe(true);
    expect(restartAllowed({ state: 'sleeping', blocked: true }, now)).toBe(false);
    expect(restartAllowed({ state: 'warming_up' }, now)).toBe(false);
  });

  it('ends the show at its limit, switches off a minute after the last listener, else keeps producing', () => {
    const until = now + LIVE_AUTO_OFF_MS;
    expect(awakeAlarm({ state: 'on_air', enabledUntil: until }, 3, now)).toBe('run');
    expect(awakeAlarm({ state: 'on_air', enabledUntil: until }, 3, until)).toBe('ended');
    // Nobody left to tell: just switch off
    expect(awakeAlarm({ state: 'on_air', enabledUntil: until, emptySince: now }, 0, until)).toBe('idle');
    expect(awakeAlarm({ state: 'on_air', enabledUntil: until, emptySince: now }, 0, now + LIVE_IDLE_SLEEP_MS - 1)).toBe('run');
    expect(awakeAlarm({ state: 'on_air', enabledUntil: until, emptySince: now }, 0, now + LIVE_IDLE_SLEEP_MS)).toBe('idle');
    // A show without an end time never runs on
    expect(awakeAlarm({ state: 'on_air' }, 1, now)).toBe('ended');
  });

  it('switches off after one minute alone and caps a show at six minutes', () => {
    expect(LIVE_IDLE_SLEEP_MS).toBe(60_000);
    expect(LIVE_AUTO_OFF_MS).toBe(6 * 60_000);
    expect(LIVE_RESTART_GAP_MS).toBe(30_000);
  });
});
