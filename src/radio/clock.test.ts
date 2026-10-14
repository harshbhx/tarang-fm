import { describe, expect, it } from 'vitest';
import { SHOW_CLOCK } from '../../shared/constants';
import type { SegmentType } from '../../shared/types';
import {
  cleanTheme,
  entryKey,
  firstEntry,
  LOOP_FROM,
  nextEntry,
  nextIndex,
  programme,
  withStoryRequest,
  type ClockEntry,
} from './clock';

function walk(from: ClockEntry, steps: number): ClockEntry[] {
  const out = [from];
  for (let i = 0; i < steps; i++) out.push(nextEntry(out[out.length - 1]));
  return out;
}

describe('show clock', () => {
  it('starts at the station ID', () => {
    expect(firstEntry()).toEqual({ seq: 0, index: 0, type: 'station_id' });
  });

  it('plays the whole clock on the first pass', () => {
    expect(programme(SHOW_CLOCK.length)).toEqual(SHOW_CLOCK);
  });

  it('loops from index 1 after the first pass, never replaying the station ID', () => {
    const loop = SHOW_CLOCK.slice(LOOP_FROM);
    const types = programme(SHOW_CLOCK.length + loop.length * 3);
    expect(types.slice(SHOW_CLOCK.length)).toEqual([...loop, ...loop, ...loop]);
    expect(types.filter((t) => t === 'station_id')).toHaveLength(1);
  });

  it('matches the documented order', () => {
    expect(programme(12)).toEqual([
      'station_id',
      'rj_link',
      'news',
      'ad_break',
      'kahani',
      'rj_link',
      'ad_break',
      'kahani',
      'rj_link',
      'news',
      'ad_break',
      'kahani',
    ]);
  });

  it('wraps the index to LOOP_FROM', () => {
    expect(nextIndex(0)).toBe(1);
    expect(nextIndex(SHOW_CLOCK.length - 2)).toBe(SHOW_CLOCK.length - 1);
    expect(nextIndex(SHOW_CLOCK.length - 1)).toBe(LOOP_FROM);
  });

  it('handles a one-entry clock', () => {
    const clock: SegmentType[] = ['news'];
    expect(nextIndex(0, clock)).toBe(0);
    expect(programme(3, clock)).toEqual(['news', 'news', 'news']);
  });

  it('numbers entries monotonically', () => {
    const seqs = walk(firstEntry(), 20).map((e) => e.seq);
    expect(seqs).toEqual(Array.from({ length: 21 }, (_, i) => i));
  });

  it('gives every entry a distinct key', () => {
    const keys = walk(firstEntry(), 30).map(entryKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('story requests', () => {
  it('themes the next kahani when one is already up next', () => {
    const adBreak = walk(firstEntry(), 3)[3];
    expect(adBreak.type).toBe('ad_break');
    const next = withStoryRequest(adBreak, 'भूतिया हवेली');
    expect(next).toEqual({ ...nextEntry(adBreak), theme: 'भूतिया हवेली' });
    expect(next.inserted).toBeUndefined();
  });

  it('slots a kahani in when the next entry is something else, then resumes the clock', () => {
    const rj = walk(firstEntry(), 1)[1];
    expect(rj.type).toBe('rj_link');
    const story = withStoryRequest(rj, 'a lost puppy');
    expect(story).toMatchObject({ type: 'kahani', theme: 'a lost puppy', inserted: true, seq: rj.seq + 1 });
    // The clock continues with what would have followed rj_link
    const after = nextEntry(story);
    expect(after.type).toBe('news');
    expect(after.index).toBe(nextEntry(rj).index);
    expect(after.seq).toBe(story.seq + 1);
  });

  it('works from the last clock entry', () => {
    const last = walk(firstEntry(), SHOW_CLOCK.length - 1)[SHOW_CLOCK.length - 1];
    expect(last.type).toBe('kahani');
    const story = withStoryRequest(last, 'cricket');
    expect(story).toMatchObject({ type: 'kahani', inserted: true });
    expect(nextEntry(story)).toMatchObject({ index: LOOP_FROM, type: 'rj_link' });
  });

  it('keys a themed or inserted entry differently from the plain one it replaces', () => {
    const adBreak = walk(firstEntry(), 3)[3];
    expect(entryKey(withStoryRequest(adBreak, 'x'))).not.toBe(entryKey(nextEntry(adBreak)));
    const rj = walk(firstEntry(), 1)[1];
    expect(entryKey(withStoryRequest(rj, 'x'))).not.toBe(entryKey(nextEntry(rj)));
  });

  it('accepts a missing theme', () => {
    const rj = walk(firstEntry(), 1)[1];
    const story = withStoryRequest(rj, null);
    expect(story.type).toBe('kahani');
    expect(story.theme).toBeUndefined();
  });

  it('cleans themes', () => {
    expect(cleanTheme('  a   haunted\n house ')).toBe('a haunted house');
    expect(cleanTheme('   ')).toBeUndefined();
    expect(cleanTheme('x'.repeat(200))).toHaveLength(120);
  });
});
