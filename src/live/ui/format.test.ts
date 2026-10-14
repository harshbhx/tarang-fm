import { describe, expect, it } from 'vitest';
import type { LiveLine, LiveListener } from '../../../shared/live';
import { getStation } from '../../../shared/stations';
import { initial, joinNames, liveBoard, newestFirst, upcomingSegments, voiceLabel, welcomedNames } from './format';

function line(id: string, segmentId: string, extra: Partial<LiveLine> = {}): LiveLine {
  return {
    id,
    segmentId,
    type: 'rj_link',
    title: `title ${segmentId}`,
    line: { role: 'rj', speaker: 'sunny_hi_reels', text: 'नमस्ते', pace: 1, temperature: 0.6, pauseAfterMs: 0 },
    startAt: 0,
    durationMs: 1000,
    ...extra,
  };
}

const listener = (id: string, name: string, joinedAt: number): LiveListener => ({ id, name, joinedAt });

describe('live UI format', () => {
  it('labels known and unknown voices', () => {
    const hi = getStation('hi');
    expect(voiceLabel(hi, 'sunny_hi_reels')).toBe('Sunny · reels');
    expect(voiceLabel(hi, 'ratan_hi_latenight_warm')).toBe('Ratan · latenight warm');
    expect(voiceLabel(hi, 'zara_hi_story_soft')).toBe('Zara · story soft');
  });

  it('lists distinct upcoming segments after the one on air', () => {
    const upcoming = [line('a2', 'a'), line('b1', 'b'), line('b2', 'b'), line('w1', 'w', { welcome: ['x'] }), line('c1', 'c')];
    const next = upcomingSegments(upcoming, 'a');
    expect(next.map((s) => s.id)).toEqual(['b', 'w']);
    expect(next[1].welcome).toBe(true);
    expect(upcomingSegments(upcoming, 'a', 5).map((s) => s.id)).toEqual(['b', 'w', 'c']);
  });

  it('sorts listeners newest first, keeping server order on ties', () => {
    const list = [listener('1', 'A', 10), listener('2', 'B', 30), listener('3', 'C', 30), listener('4', 'D', 20)];
    expect(newestFirst(list).map((l) => l.id)).toEqual(['2', '3', '4', '1']);
  });

  it('names the listeners a welcome line greets', () => {
    const list = [listener('p', 'Priya', 1), listener('m', 'Meera', 2)];
    expect(welcomedNames(line('w', 'w', { welcome: ['m', 'gone', 'p'] }), list)).toEqual(['Meera', 'Priya']);
    expect(welcomedNames(line('x', 'x'), list)).toEqual([]);
  });

  it('joins names for a sentence', () => {
    expect(joinNames(['Priya'])).toBe('Priya');
    expect(joinNames(['Priya', 'Meera'])).toBe('Priya and Meera');
    expect(joinNames(['Priya', 'Meera', 'Arjun'], 3)).toBe('Priya, Meera and Arjun');
    expect(joinNames(['Priya', 'Meera', 'Arjun', 'Kabir'], 2)).toBe('Priya, Meera and 2 more');
  });

  it('takes the first grapheme for avatars', () => {
    expect(initial('priya')).toBe('P');
    expect(initial('  ')).toBe('?');
    expect(initial('मीरा')).toBe('मी');
  });

  it('shows a board label for every status', () => {
    expect(liveBoard('connecting')).toBe('TUNING');
    expect(liveBoard('on_air')).toBe('ON AIR');
    expect(liveBoard('on_air', line('w', 'w', { welcome: ['x'] }))).toBe('WELCOME');
    expect(liveBoard('on_air', line('n', 'n', { type: 'news' }))).toBe('NEWS');
  });
});
