import { describe, expect, it } from 'vitest';
import { FESTIVALS } from '../pools/festivals';
import { INDIA_FIXTURES } from '../pools/fixtures';
import { CITIES, cityInfo } from '../pools/localFacts';
import { ON_THIS_DAY } from '../pools/onThisDay';
import { LOCAL_PACKS } from '../show';

describe('city facts pool', () => {
  it('covers every local pack city with 6–10 facts', () => {
    for (const key of Object.keys(LOCAL_PACKS)) {
      const city = cityInfo(key);
      expect(city?.key, key).toBe(key);
      expect(city!.facts.length).toBeGreaterThanOrEqual(6);
      expect(city!.facts.length).toBeLessThanOrEqual(10);
    }
  });

  it('has unique ids, Hindi text, a source and a verification date for every fact', () => {
    const ids = new Set<string>();
    for (const city of CITIES) {
      for (const f of city.facts) {
        expect(ids.has(f.id), f.id).toBe(false);
        ids.add(f.id);
        expect(f.text.hi, f.id).toBeTruthy();
        expect(f.source).toMatch(/^en\.wikipedia\.org\/wiki\//);
        expect(f.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(f.angleEn.length).toBeGreaterThan(10);
      }
    }
  });

  it('keeps every number of the claim in every native text, and adds none', () => {
    for (const city of CITIES) {
      for (const f of city.facts) {
        const numbers = f.en.match(/\d+(?:\.\d+)?/g) ?? [];
        expect([...(f.keep ?? [])].filter((k) => /\d/.test(k)).sort(), f.id).toEqual([...new Set(numbers)].sort());
        for (const [lang, text] of Object.entries(f.text)) {
          for (const token of f.keep ?? []) expect(text, `${f.id} ${lang}`).toContain(token);
          for (const n of text!.match(/\d+(?:\.\d+)?/g) ?? []) expect(numbers, `${f.id} ${lang} adds ${n}`).toContain(n);
        }
      }
    }
  });

  it('resolves edge spellings and old names', () => {
    expect(cityInfo('Baroda')?.key).toBe('vadodara');
    expect(cityInfo('New Delhi')?.key).toBe('delhi');
    expect(cityInfo('Bangalore')?.key).toBe('bengaluru');
    expect(cityInfo('Gotham')).toBeUndefined();
  });
});

describe('on this day pool', () => {
  it('has at least one item for every day from 15 Oct to 31 Dec', () => {
    const days = new Set(ON_THIS_DAY.map((x) => x.date));
    for (let t = Date.UTC(2026, 9, 15); t <= Date.UTC(2026, 11, 31); t += 86_400_000) {
      const d = new Date(t).toISOString().slice(5, 10);
      expect(days.has(d), d).toBe(true);
    }
  });

  it('stays neutral: no tragedies, wars, crimes or politics', () => {
    const banned = /kill|massacre|\bbomb(s|ed|ing)?\b|attack|riot|crash|murder|death|died|war\b|battle|terror|politic|minister|election|party\b|army|navy|military|martyr|assassin|disaster/i;
    for (const x of ON_THIS_DAY) {
      expect(x.en, x.en).not.toMatch(banned);
      expect(x.source).toMatch(/^en\.wikipedia\.org\/wiki\//);
      if (x.kind === 'birth') expect(x.en).toContain(String(x.year));
    }
  });
});

describe('static calendars', () => {
  it('festival weekdays match the sources', () => {
    const checks: [string, number][] = [['dussehra', 2], ['karva-chauth', 4], ['diwali', 0], ['govardhan-puja', 2], ['bhai-dooj', 3], ['labh-pancham', 6], ['chhath', 0], ['guru-nanak-jayanti', 2], ['pongal', 5], ['holi', 1], ['sharad-purnima', 0], ['ahoi-ashtami', 0], ['dhanteras', 5]];
    for (const [id, weekday] of checks) {
      const f = FESTIVALS.find((x) => x.id === id)!;
      expect(new Date(`${f.date}T12:00:00Z`).getUTCDay(), id).toBe(weekday);
    }
    expect(new Set(FESTIVALS.map((f) => f.id)).size).toBe(FESTIVALS.length);
  });

  it('fixtures are in date order with IST times only where a source gives one', () => {
    for (let i = 1; i < INDIA_FIXTURES.length; i++) expect(INDIA_FIXTURES[i].date > INDIA_FIXTURES[i - 1].date).toBe(true);
    for (const f of INDIA_FIXTURES) {
      if (f.home) expect(f.istStart).toBeUndefined();
      else expect(f.istStart).toMatch(/^\d{2}:\d{2}$/);
    }
  });
});
