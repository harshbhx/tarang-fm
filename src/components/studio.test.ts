import { describe, expect, it } from 'vitest';
import { airTag, timeAgo } from './StudioLine';

describe('studio call air status', () => {
  it('follows a call from the queue to air while the radio plays', () => {
    expect(airTag(undefined, 'live')).toEqual({ label: 'In the queue', tone: 'waiting' });
    expect(airTag('up_next', 'live')).toEqual({ label: 'Up next', tone: 'next' });
    expect(airTag('on_air', 'live')).toEqual({ label: 'On air now', tone: 'live' });
    expect(airTag('aired', 'live')).toEqual({ label: 'Read on air', tone: 'done' });
  });

  it('never claims a call is on air while the radio is paused', () => {
    expect(airTag('on_air', 'paused')).toEqual({ label: 'Paused mid-read', tone: 'held' });
    expect(airTag('up_next', 'paused').tone).toBe('held');
    expect(airTag(undefined, 'paused').label).toBe('Resume to hear it');
    expect(airTag('aired', 'paused').tone).toBe('done');
  });

  it('asks a listener who is not tuned in to tune in', () => {
    expect(airTag(undefined, 'off')).toEqual({ label: 'Tune in to hear it', tone: 'idle' });
  });

  it('formats call times', () => {
    const now = Date.parse('2026-10-14T12:00:00Z');
    expect(timeAgo('2026-10-14T11:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-10-14T11:45:00Z', now)).toBe('15 min ago');
    expect(timeAgo('2026-10-14T09:00:00Z', now)).toBe('3 h ago');
  });
});
