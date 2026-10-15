import { describe, expect, it } from 'vitest';
import { AD_PARODIES, AD_PROBLEMS, festivalOn, isFestiveProblem, monthOf, pickAd, rainInSeason, seasonLine } from './ads';

/** Deterministic random numbers for repeatable tests. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OCTOBER = '2026-10-15';
const GARBA = ['garba_feet', 'garba_cousin'];

describe('the parody pool', () => {
  it('has at least 12 recognisable formats, each with its beats and a punchline slot', () => {
    expect(AD_PARODIES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(AD_PARODIES.map((c) => c.id)).size).toBe(AD_PARODIES.length);
    for (const id of ['mf_disclaimer', 'real_estate', 'coaching_topper', 'dadi_nuskha', 'insurance_papa', 'mega_sale', 'lab_coat_expert', 'inverter_panic', 'matrimonial', 'teleshopping', 'railway_announce', 'cooker_whistle']) {
      expect(AD_PARODIES.map((c) => c.id)).toContain(id);
    }
    for (const card of AD_PARODIES) {
      expect(card.beats.length, card.id).toBeGreaterThanOrEqual(3);
      expect(card.punchline, card.id).toBeTruthy();
      expect(card.lines[0]).toBeLessThanOrEqual(card.lines[1]);
      expect(card.lines[1]).toBeLessThanOrEqual(5);
    }
  });

  it('keeps the cards free of copyable spoken text (signatures and beats are English)', () => {
    for (const card of AD_PARODIES) {
      expect(`${card.signature} ${card.beats.join(' ')}`, card.id).not.toMatch(/[ऀ-෿]/u);
      for (const beat of card.beats) expect(beat).toMatch(/^ad_(announcer|customer) · (normal|warm|excited|fast|hushed|shout|dramatic|sad) · /);
    }
  });

  it('pairs every problem with formats that exist, and every format with a problem', () => {
    const ids = new Set(AD_PARODIES.map((c) => c.id));
    expect(new Set(AD_PROBLEMS.map((p) => p.id)).size).toBe(AD_PROBLEMS.length);
    for (const p of AD_PROBLEMS) {
      expect(p.cards.length, p.id).toBeGreaterThan(0);
      for (const c of p.cards) expect(ids.has(c), `${p.id} → ${c}`).toBe(true);
    }
    for (const card of AD_PARODIES) expect(AD_PROBLEMS.some((p) => p.cards.includes(card.id)), card.id).toBe(true);
  });
});

describe('ads in season', () => {
  it('never sells rain gear, coolers or winter tonics in a Hindi October', () => {
    const random = seeded(1);
    for (let i = 0; i < 300; i++) {
      const { card, problem, month } = pickAd('hi', { localDate: OCTOBER, random });
      expect(month).toBe(10);
      expect(['rain_gear', 'cooler_summer', 'winter_tonic']).not.toContain(card.id);
      expect(!problem.months || problem.months.includes(10), problem.id).toBe(true);
      expect(problem.cards).toContain(card.id);
    }
    expect(rainInSeason('hi', 10)).toBe(false);
    expect(rainInSeason('hi', 8)).toBe(true);
  });

  it('knows Chennai is rainy in October', () => {
    expect(rainInSeason('ta', 10)).toBe(true);
    expect(seasonLine('ta', 10)).toMatch(/monsoon/i);
    expect(seasonLine('hi', 10)).not.toMatch(/rain|monsoon/i);
    const random = seeded(2);
    const problems = new Set(Array.from({ length: 400 }, () => pickAd('ta', { localDate: OCTOBER, random }).problem.id));
    expect(problems.has('chennai_rain_auto')).toBe(true);
    const hindi = new Set(Array.from({ length: 400 }, () => pickAd('hi', { localDate: OCTOBER, random }).problem.id));
    expect(hindi.has('chennai_rain_auto')).toBe(false);
  });

  it('sells summer and winter things in their own months', () => {
    const random = seeded(3);
    const may = new Set(Array.from({ length: 300 }, () => pickAd('hi', { localDate: '2026-05-10', random }).card.id));
    expect(may.has('cooler_summer')).toBe(true);
    expect(may.has('winter_tonic')).toBe(false);
    const jan = new Set(Array.from({ length: 300 }, () => pickAd('hi', { localDate: '2026-01-10', random }).card.id));
    expect(jan.has('winter_tonic')).toBe(true);
    expect(jan.has('rain_gear')).toBe(false);
  });

  it('reads the month from the listener date, else from the clock', () => {
    expect(monthOf('2026-10-15')).toBe(10);
    expect(monthOf(undefined, new Date('2026-03-02T00:00:00Z'))).toBe(3);
    expect(monthOf('garbage', new Date('2026-07-02T00:00:00Z'))).toBe(7);
  });
});

describe('festive ads', () => {
  it('knows the 2026 windows', () => {
    expect(festivalOn('2026-10-15')).toBe('navratri');
    expect(festivalOn('2026-10-25')).toBe('diwali');
    expect(festivalOn('2026-12-15')).toBeUndefined();
    expect(festivalOn(undefined)).toBeUndefined();
  });

  it('may be festive in the window, and never right after a festive ad', () => {
    const random = seeded(4);
    const fresh = Array.from({ length: 200 }, () => pickAd('gu', { localDate: OCTOBER, avoid: { problems: [], formats: [] }, random }).problem);
    expect(fresh.some((p) => p.festival === 'navratri')).toBe(true);
    for (const p of fresh) if (p.festival) expect(p.festival).toBe('navratri');
    for (let i = 0; i < 200; i++) {
      const { problem, festival } = pickAd('gu', { localDate: OCTOBER, avoid: { problems: ['garba_feet', 'guests_stay'] }, random });
      expect(problem.festival, problem.id).toBeUndefined();
      expect(festival).toBeUndefined();
    }
    for (let i = 0; i < 200; i++) {
      const { problem } = pickAd('gu', { localDate: '2026-12-15', avoid: { problems: [] }, random });
      expect(isFestiveProblem(problem.id), problem.id).toBe(false);
    }
  });

  it('keeps garba for Gujarati listeners', () => {
    const random = seeded(5);
    const hindi = Array.from({ length: 300 }, () => pickAd('hi', { localDate: OCTOBER, avoid: { problems: [] }, random }).problem.id);
    expect(hindi.some((id) => GARBA.includes(id))).toBe(false);
    const inGujarat = Array.from({ length: 300 }, () => pickAd('hi', { localDate: OCTOBER, region: 'Gujarat', avoid: { problems: [] }, random }).problem.id);
    expect(inGujarat.some((id) => GARBA.includes(id))).toBe(true);
    const bangla = Array.from({ length: 300 }, () => pickAd('bn', { localDate: OCTOBER, avoid: { problems: [] }, random }).problem.id);
    expect(bangla.some((id) => GARBA.includes(id))).toBe(false);
  });
});

describe('ad variety', () => {
  it('avoids the last 3 formats and the recent problems', () => {
    const random = seeded(6);
    const formats = ['matrimonial', 'teleshopping', 'lab_coat_expert', 'mf_disclaimer'];
    const problems = ['guests_stay', 'remote_lost', 'alarm_snooze'];
    for (let i = 0; i < 200; i++) {
      const { card, problem } = pickAd('hi', { localDate: OCTOBER, avoid: { formats, problems }, random });
      expect(formats.slice(-3)).not.toContain(card.id);
      expect(problems).not.toContain(problem.id);
    }
  });

  it('draws widely over many breaks', () => {
    const random = seeded(7);
    const cards = new Set(Array.from({ length: 300 }, () => pickAd('hi', { localDate: OCTOBER, random }).card.id));
    expect(cards.size).toBeGreaterThanOrEqual(12);
  });
});
