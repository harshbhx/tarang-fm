import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, limitsFrom, SpendLedger, type Counters } from './ledger';

function memory(): Counters {
  const n = new Map<string, number>();
  const flags = new Set<string>();
  return {
    get: (k) => n.get(k) ?? 0,
    add: (k, by) => n.set(k, (n.get(k) ?? 0) + by).get(k)!,
    sweep: (day) => {
      for (const k of [...n.keys()]) if (!k.startsWith(day)) n.delete(k);
    },
    getFlag: (f) => flags.has(f),
    setFlag: (f, on) => void (on ? flags.add(f) : flags.delete(f)),
  };
}

const DAY1 = Date.parse('2026-10-30T10:00:00Z');
const DAY2 = Date.parse('2026-10-31T00:00:01Z');
const limits = { ...DEFAULT_LIMITS, tts_chars: { global: 100, perIp: 60 } };

describe('SpendLedger', () => {
  it('counts until the per-IP allowance is gone, then refuses that IP only', () => {
    const l = new SpendLedger(memory(), limits);
    expect(l.charge('tts_chars', 50, 'a', DAY1)).toEqual({ ok: true });
    expect(l.charge('tts_chars', 20, 'a', DAY1)).toEqual({ ok: false, scope: 'ip' });
    expect(l.charge('tts_chars', 40, 'b', DAY1)).toEqual({ ok: true });
  });
  it('refuses everyone once the global allowance is gone, and a refusal costs nothing', () => {
    const l = new SpendLedger(memory(), limits);
    expect(l.charge('tts_chars', 60, 'a', DAY1).ok).toBe(true);
    expect(l.charge('tts_chars', 40, 'b', DAY1).ok).toBe(true);
    expect(l.charge('tts_chars', 1, 'c', DAY1)).toEqual({ ok: false, scope: 'global' });
    expect(l.status(DAY1).used.tts_chars).toBe(100);
  });
  it('resets at the next UTC day', () => {
    const l = new SpendLedger(memory(), limits);
    l.charge('tts_chars', 60, 'a', DAY1);
    l.charge('tts_chars', 40, 'b', DAY1);
    expect(l.charge('tts_chars', 1, 'c', DAY1).ok).toBe(false);
    expect(l.charge('tts_chars', 1, 'c', DAY2)).toEqual({ ok: true });
  });
  it('keeps kinds apart and always charges at least one unit', () => {
    const l = new SpendLedger(memory(), { ...limits, call: { global: 2, perIp: 2 } });
    expect(l.charge('call', 0, 'a', DAY1).ok).toBe(true);
    expect(l.charge('call', 0, 'a', DAY1).ok).toBe(true);
    expect(l.charge('call', 0, 'a', DAY1).ok).toBe(false);
    expect(l.charge('segment', 1, 'a', DAY1).ok).toBe(true);
  });
  it('the kill switch stops every kind at once and can be lifted', () => {
    const l = new SpendLedger(memory(), limits);
    l.setPaused(true);
    expect(l.charge('segment', 1, 'a', DAY1)).toEqual({ ok: false, scope: 'paused' });
    expect(l.status(DAY1).paused).toBe(true);
    l.setPaused(false);
    expect(l.charge('segment', 1, 'a', DAY1).ok).toBe(true);
  });
  it('sweeps old days', () => {
    const c = memory();
    const l = new SpendLedger(c, limits);
    l.charge('segment', 1, 'a', DAY1);
    l.sweep(DAY2);
    expect(c.get('2026-10-30|g|segment')).toBe(0);
  });
});

describe('limitsFrom', () => {
  it('uses defaults, and valid overrides from env vars', () => {
    expect(limitsFrom({})).toEqual(DEFAULT_LIMITS);
    const l = limitsFrom({ BUDGET_TTS_CHARS_DAY: '1000', BUDGET_CALLS_IP_DAY: '3', BUDGET_SEGMENTS_DAY: 'lots', BUDGET_LIVE_JOINS_DAY: '-5' });
    expect(l.tts_chars.global).toBe(1000);
    expect(l.call.perIp).toBe(3);
    expect(l.segment.global).toBe(DEFAULT_LIMITS.segment.global);
    expect(l.live_join.global).toBe(DEFAULT_LIMITS.live_join.global);
  });
  it('zero turns a kind off', () => {
    const l = new SpendLedger(memory(), limitsFrom({ BUDGET_CALLS_DAY: '0' }));
    expect(l.charge('call', 1, 'a', DAY1)).toEqual({ ok: false, scope: 'global' });
  });
});
