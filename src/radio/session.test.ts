import { describe, expect, it } from 'vitest';
import type { Line } from '../../shared/types';
import { addAiredNews, AIRED_NEWS_MAX, cleanLinkState, cleanSerial, recapSourceFrom } from './session';

const line = (text: string): Line => ({ role: 'narrator', speaker: 'x_hi_y', text, pace: 1, temperature: 0.5, pauseAfterMs: 0 });

describe('show session echoes', () => {
  it('builds the recap from what aired, heard summary first', () => {
    const serial = { id: 's', part: 1 as const, outline: { aired_cliffhanger_en: 'The bell has a threat on it.' }, cast: {} };
    const lines = ['a', 'b', 'c', 'd'].map(line);
    expect(recapSourceFrom({ heardSummary: 'heard', summary: 'own', serial, lines })).toEqual({
      heard: 'heard',
      cliffhanger: 'The bell has a threat on it.',
      lastLines: ['b', 'c', 'd'].map((text) => ({ role: 'narrator', text })),
    });
    expect(recapSourceFrom({ summary: 'own', lines: [] })).toEqual({ heard: 'own', cliffhanger: '', lastLines: [] });
  });

  it('accumulates aired news once each, keeping the latest 40', () => {
    let aired: string[] = [];
    for (let i = 0; i < 30; i++) aired = addAiredNews(aired, [`a${i}`, `b${i}`]);
    expect(aired).toHaveLength(AIRED_NEWS_MAX);
    expect(aired[aired.length - 1]).toBe('b29');
    expect(addAiredNews(['x', 'y'], ['x'])).toEqual(['y', 'x']);
    expect(addAiredNews(['x'], undefined)).toEqual(['x']);
  });

  it('fits server state to the request limits before echoing it', () => {
    const state = cleanLinkState({
      lastTypes: Array.from({ length: 12 }, (_, i) => `t${i}`),
      usedFactIds: ['f1'],
      bitEpisodes: { ok: 2, bad: 500 },
      openQuestion: 'q'.repeat(300),
    });
    expect(state?.lastTypes).toHaveLength(8);
    expect(state?.bitEpisodes).toEqual({ ok: 2 });
    expect(state?.openQuestion).toHaveLength(240);
    expect(cleanSerial({ id: '', part: 1, outline: {}, cast: {} })).toBeUndefined();
    expect(cleanSerial({ id: 's', part: 2, outline: { k: 'v'.repeat(700) }, cast: { narrator: 'ab' } })).toEqual({
      id: 's',
      part: 2,
      outline: { k: 'v'.repeat(600) },
      cast: {},
    });
  });
});
