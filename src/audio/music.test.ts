import { describe, expect, it } from 'vitest';
import { STATIONS } from '../../shared/stations';
import { rootForAccent } from './music';

describe('rootForAccent', () => {
  it('is deterministic and stays in the drone range', () => {
    for (const a of ['', 'saffron', '#ff7a1a', '#abc', 'not a colour']) {
      const r = rootForAccent(a);
      expect(r).toBe(rootForAccent(a));
      expect(r).toBeGreaterThan(60);
      expect(r).toBeLessThan(90);
    }
  });

  it('gives each station its own key', () => {
    const roots = new Set(STATIONS.map((s) => rootForAccent(s.accent)));
    expect(roots.size).toBe(STATIONS.length);
  });
});
