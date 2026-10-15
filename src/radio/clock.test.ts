import { describe, expect, it } from 'vitest';
import { CLOCK_LOOP_FROM, SHOW_CLOCK_V2 } from '../../shared/constants';
import type { ClockSlot } from '../../shared/types';
import {
  cleanTheme,
  entryKey,
  findAhead,
  firstEntry,
  insertedEntry,
  LOOP_FROM,
  nextEntry,
  nextIndex,
  partOf,
  position,
  programme,
  programmeEntries,
  slotOf,
  type ClockEntry,
} from './clock';

function walk(from: ClockEntry, steps: number): ClockEntry[] {
  const out = [from];
  for (let i = 0; i < steps; i++) out.push(nextEntry(out[out.length - 1]));
  return out;
}

const label = (e: ClockEntry) => `${e.type}${e.mode ? `/${e.mode}` : ''}${e.part ? `#${e.part}` : ''}`;

describe('show clock v2', () => {
  it('starts at the station ID, on the first pass', () => {
    expect(firstEntry()).toEqual({ seq: 0, index: 0, loop: 0, type: 'station_id' });
  });

  it('plays the whole clock once, with each slot’s mode and part', () => {
    const first = programmeEntries(SHOW_CLOCK_V2.length);
    expect(first.map(slotOf)).toEqual(SHOW_CLOCK_V2);
    expect(first.map(label)).toEqual([
      'station_id',
      'rj_link/opener',
      'news/full',
      'ad_break',
      'rj_link/kahani_in',
      'kahani#1',
      'rj_link/kahani_out',
      'news/update',
      'ad_break',
      'rj_link/kahani_in',
      'kahani#2',
      'rj_link/kahani_out',
      'ad_break',
      'rj_link/kahani_in',
      'kahani#3',
      'rj_link/kahani_out',
    ]);
    expect(first.every((e) => e.loop === 0)).toBe(true);
  });

  it('loops from CLOCK_LOOP_FROM: the station ID and the opener air once, each loop is one serial', () => {
    expect(LOOP_FROM).toBe(CLOCK_LOOP_FROM);
    const loop = SHOW_CLOCK_V2.slice(LOOP_FROM);
    const entries = programmeEntries(SHOW_CLOCK_V2.length + loop.length * 2);
    expect(entries.slice(SHOW_CLOCK_V2.length).map(slotOf)).toEqual([...loop, ...loop]);
    expect(entries.filter((e) => e.type === 'station_id')).toHaveLength(1);
    expect(entries.filter((e) => e.mode === 'opener')).toHaveLength(1);
    expect(entries[SHOW_CLOCK_V2.length]).toMatchObject({ index: LOOP_FROM, loop: 1, type: 'news', mode: 'full' });
    expect(entries.filter((e) => e.loop === 2 && e.type === 'kahani').map((e) => e.part)).toEqual([1, 2, 3]);
  });

  it('keeps the clock invariants: a link before every part, no ads or links back to back', () => {
    const types = programme(SHOW_CLOCK_V2.length * 3);
    for (let i = 1; i < types.length; i++) {
      if (types[i] === 'kahani') expect(types[i - 1]).toBe('rj_link');
      expect(types[i] === 'ad_break' && types[i - 1] === 'ad_break').toBe(false);
      expect(types[i] === 'rj_link' && types[i - 1] === 'rj_link').toBe(false);
    }
  });

  it('wraps the index to LOOP_FROM', () => {
    expect(nextIndex(0)).toBe(1);
    expect(nextIndex(SHOW_CLOCK_V2.length - 1)).toBe(LOOP_FROM);
  });

  it('handles a one-entry clock', () => {
    const clock: ClockSlot[] = [{ type: 'news', mode: 'full' }];
    expect(nextIndex(0, clock)).toBe(0);
    expect(programme(3, clock)).toEqual(['news', 'news', 'news']);
  });

  it('numbers entries monotonically and gives every slot a distinct key', () => {
    const entries = walk(firstEntry(), 40);
    expect(entries.map((e) => e.seq)).toEqual(Array.from({ length: 41 }, (_, i) => i));
    expect(new Set(entries.map(entryKey)).size).toBe(entries.length);
    const order = entries.map(position);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('knows which serial part each slot belongs to', () => {
    const parts = programmeEntries(SHOW_CLOCK_V2.length).map((e) => partOf(e) ?? '-');
    expect(parts).toEqual(['-', '-', '-', '-', 1, 1, 1, '-', '-', 2, 2, 2, '-', 3, 3, 3]);
  });

  it('finds a slot ahead and how far it is', () => {
    const found = findAhead(firstEntry(), (e) => e.type === 'kahani' && e.part === 1, 20);
    expect(found).toMatchObject({ steps: 5, entry: { index: 5, loop: 0 } });
    expect(findAhead(firstEntry(), (e) => e.type === 'kahani', 3)).toBeUndefined();
  });

  it('slots a segment in after an entry without moving the clock’s keys', () => {
    const news = walk(firstEntry(), 2)[2];
    const link = insertedEntry(news, 'rj_link', 'payload');
    expect(link).toMatchObject({ seq: news.seq + 1, loop: 0, inserted: true, mode: 'payload' });
    const after = nextEntry(link);
    expect(after).toMatchObject({ type: 'ad_break', seq: news.seq + 2 });
    expect(entryKey(after)).toBe(entryKey(nextEntry(news)));
    expect(entryKey(link)).not.toBe(entryKey(news));
    expect(position(news)).toBeLessThan(position(link));
    expect(position(link)).toBeLessThan(position(after));
    expect(partOf(link)).toBeUndefined();
  });
});

describe('story themes', () => {
  it('cleans themes', () => {
    expect(cleanTheme('  a   haunted\n house ')).toBe('a haunted house');
    expect(cleanTheme('   ')).toBeUndefined();
    expect(cleanTheme(null)).toBeUndefined();
    expect(cleanTheme('x'.repeat(200))).toHaveLength(120);
  });
});
