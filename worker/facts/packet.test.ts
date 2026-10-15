import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFactPacket, clearFactCaches, keptFor, pickFacts, weatherForRequest } from './packet';
import { istInstant } from './util';

const HI = { id: 'hi' as const };
const MR = { id: 'mr' as const };
const GU = { id: 'gu' as const };

/** Sunday 15 Nov 2026, 06:00 IST: Chhath, the 5th ODI in NZ at 07:30, Sania Mirza's birthday. */
const NOW = istInstant('2026-11-15', '06:00');

function forecast(now: number, opts: { chances?: number[]; code?: number; temp?: number; feels?: number } = {}) {
  const t = new Date(now + 5.5 * 3_600_000).toISOString().slice(0, 13);
  const hour = (d: number) => new Date(Date.parse(`${t}:00Z`) + d * 3_600_000).toISOString().slice(0, 16);
  return {
    current: { time: `${t}:00`, temperature_2m: opts.temp ?? 24, apparent_temperature: opts.feels ?? 25, weather_code: opts.code ?? 3, is_day: 1 },
    // the hour before 'now' (90 %) must be ignored
    hourly: { time: [-1, 0, 1, 2, 3].map(hour), precipitation_probability: opts.chances ?? [90, 20, 70, 40, 10] },
    daily: { temperature_2m_max: [30], apparent_temperature_max: [31] },
  };
}

function airJson(now: number, pm25: number, pm10: number) {
  const start = Date.parse(`${new Date(now + 5.5 * 3_600_000).toISOString().slice(0, 10)}T00:00Z`) - 86_400_000;
  const time = Array.from({ length: 48 }, (_, i) => new Date(start + i * 3_600_000).toISOString().slice(0, 16));
  return { hourly: { time, pm2_5: time.map(() => pm25), pm10: time.map(() => pm10) } };
}

const item = (title: string, issuer: string, at: number) =>
  `<item><title>${title}</title><author>sachet@ndma.gov.in (${issuer})</author><category>Met</category><pubDate>${new Date(at).toUTCString()}</pubDate></item>`;

function sachet(now: number) {
  return `<rss><channel><copyright>public domain</copyright>${[
    item('Light to moderate rain with thunderstorm is likely at isolated places over New Delhi, South Delhi in next 3 hours.', 'IMD Delhi', now - 30 * 60_000),
    item('Light to moderate rain with thunderstorm is likely at isolated places over New Delhi, South Delhi in next 3 hours.', 'IMD Delhi', now - 70 * 60_000),
    item('Thunderstorm with lightning is very likely at isolated places over Vadodara, Anand districts of Gujarat in next 3 hours.', 'IMD Ahmedabad', now - 20 * 60_000),
    item('Heavy rain is likely over Delhi in next 3 hours.', 'IMD Delhi', now - 4 * 3_600_000),
  ].join('')}</channel></rss>`;
}

type Route = (url: string) => Response | Promise<Response>;

function mockFetch(now: number, overrides: Partial<Record<'forecast' | 'air' | 'sachet', Route>> = {}) {
  const fn = vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('air-quality-api.open-meteo.com')) return overrides.air?.(url) ?? Response.json(airJson(now, 100, 150));
    if (url.includes('api.open-meteo.com')) return overrides.forecast?.(url) ?? Response.json(forecast(now));
    if (url.includes('sachet.ndma.gov.in')) return overrides.sachet?.(url) ?? new Response(sachet(now));
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => {
  clearFactCaches();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('buildFactPacket ranking', () => {
  it('ranks alert > rain soon > bad air > festival today > cricket today > countdown > on this day > city facts', async () => {
    mockFetch(NOW);
    const p = await buildFactPacket({ station: HI, city: 'Delhi', region: 'National Capital Territory of Delhi', lat: 28.61, lon: 77.21, now: NOW });
    const types = p.facts.map((f) => f.type);
    expect(types.slice(0, 6)).toEqual(['alert', 'weather_notable', 'air_bad', 'festival', 'cricket', 'festival']);
    expect(p.facts[3].id).toBe('fest:chhath:today:2026-11-15');
    expect(p.facts[5].id).toMatch(/^fest:guru-nanak-jayanti:cd9$/);
    const otd = types.indexOf('on_this_day');
    const firstCity = types.indexOf('city_fact');
    expect(otd).toBeGreaterThan(5);
    expect(firstCity).toBeGreaterThan(otd);
    expect(types.slice(firstCity).every((t) => t === 'city_fact')).toBe(true);
    // priorities never increase down the list
    for (let i = 1; i < p.facts.length; i++) expect(p.facts[i].priority).toBeLessThanOrEqual(p.facts[i - 1].priority);
    expect(p.chosen?.type).toBe('alert');
    expect(p.backup?.type).toBe('weather_notable');
    expect(p.sources).toEqual({ weather: true, air: true, alerts: true });
    expect(p.place).toMatchObject({ cityKey: 'delhi', cityNative: 'दिल्ली', region: 'Delhi' });
  });

  it('gives every fact an angle, a source, a future expiry and kept tokens that appear in its native text', async () => {
    mockFetch(NOW);
    const p = await buildFactPacket({ station: HI, city: 'Delhi', region: 'Delhi', lat: 28.61, lon: 77.21, now: NOW });
    for (const f of [...p.facts, ...p.opener.facts]) {
      expect(f.angleEn.length).toBeGreaterThan(10);
      expect(f.source.length).toBeGreaterThan(3);
      expect(f.expiresAt).toBeGreaterThan(NOW);
      expect(f.id.length).toBeLessThanOrEqual(64);
      const hi = f.nativeText?.hi;
      if (hi) for (const token of keptFor(f, 'hi')) expect(hi, `${f.id} keeps ${token}`).toContain(token);
    }
  });

  it('exposes the opener weather in the extended shape', async () => {
    mockFetch(NOW);
    const p = await buildFactPacket({ station: HI, city: 'Delhi', region: 'Delhi', lat: 28.61, lon: 77.21, now: NOW });
    expect(p.opener.weather).toEqual({ tempC: 24, description: 'overcast', notable: 'rain_soon', rainChance3h: 70, pm25: 100 });
    expect(p.opener.facts[0]).toMatchObject({ type: 'weather_now', keptTokens: ['24'] });
    expect(p.opener.facts[0].nativeText?.hi).toBe('अभी 24 डिग्री, घने बादल।');
  });
});

describe('usedFactIds', () => {
  it('excludes aired facts and moves the pick to the next one', async () => {
    mockFetch(NOW);
    const input = { station: HI, city: 'Delhi', region: 'Delhi', lat: 28.61, lon: 77.21, now: NOW };
    const first = await buildFactPacket(input);
    const aired = [first.chosen!.id, first.backup!.id];
    const second = await buildFactPacket({ ...input, usedFactIds: aired });
    expect(second.facts.map((f) => f.id)).not.toContain(aired[0]);
    expect(second.facts.map((f) => f.id)).not.toContain(aired[1]);
    expect(second.chosen?.type).toBe('air_bad');
    // ids are stable between builds, so the client's list keeps working
    expect(first.facts.map((f) => f.id).filter((id) => !aired.includes(id))).toEqual(second.facts.map((f) => f.id));
  });

  it('pickFacts honours allowed and avoided types', async () => {
    mockFetch(NOW);
    const p = await buildFactPacket({ station: HI, city: 'Delhi', region: 'Delhi', lat: 28.61, lon: 77.21, now: NOW });
    const calm = pickFacts(p.facts, { types: ['city_fact', 'on_this_day', 'weather_notable'] });
    expect(calm.chosen?.type).toBe('weather_notable');
    expect(calm.backup?.type).toBe('on_this_day');
    expect(pickFacts(p.facts, { avoidTypes: ['alert', 'weather_notable', 'air_bad'] }).chosen?.type).toBe('festival');
  });
});

describe('scoping', () => {
  it('a Gujarat alert reaches a Vadodara listener but never a Pune one', async () => {
    mockFetch(NOW);
    const vadodara = await buildFactPacket({ station: GU, city: 'Vadodara', region: 'Gujarat', lat: 22.31, lon: 73.18, now: NOW });
    const alertsV = vadodara.facts.filter((f) => f.type === 'alert');
    expect(alertsV).toHaveLength(1);
    expect(alertsV[0].claimEn).toContain('Vadodara');
    expect(alertsV[0].keptNative?.gu).toEqual(['વડોદરા']);

    clearFactCaches();
    mockFetch(NOW);
    const pune = await buildFactPacket({ station: MR, city: 'Pune', region: 'Maharashtra', lat: 18.52, lon: 73.86, now: NOW });
    expect(pune.facts.filter((f) => f.type === 'alert')).toEqual([]);
    expect(pune.facts.filter((f) => f.type === 'city_fact').every((f) => f.id.startsWith('city:pun-'))).toBe(true);
  });

  it('dedupes repeated alerts and drops ones past their window', async () => {
    mockFetch(NOW);
    const p = await buildFactPacket({ station: HI, city: 'New Delhi', region: 'Delhi', lat: 28.61, lon: 77.21, now: NOW });
    const alerts = p.facts.filter((f) => f.type === 'alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].claimEn).toContain('South Delhi');
    expect(alerts[0].expiresAt).toBe(NOW - 30 * 60_000 + 3 * 3_600_000);
    expect(alerts[0].hedgeNative?.hi).toBe('मौसम विभाग के मुताबिक');
  });

  it('keeps regional Hindi-station festivals to their states', async () => {
    const tue = istInstant('2026-11-10', '09:00');
    mockFetch(tue, { sachet: () => new Response('<rss></rss>') });
    const delhi = await buildFactPacket({ station: HI, city: 'Delhi', region: 'Delhi', now: tue });
    expect(delhi.facts.some((f) => f.id.startsWith('fest:bestu-varas'))).toBe(false);
    clearFactCaches();
    mockFetch(tue, { sachet: () => new Response('<rss></rss>') });
    const baroda = await buildFactPacket({ station: HI, city: 'Baroda', region: 'Gujarat', now: tue });
    expect(baroda.facts.some((f) => f.id === 'fest:bestu-varas:today:2026-11-10')).toBe(true);
  });
});

describe('failure tolerance', () => {
  it('builds from the static pools when every live source fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network down'); }));
    const p = await buildFactPacket({ station: HI, city: 'Delhi', region: 'Delhi', lat: 28.61, lon: 77.21, now: NOW });
    expect(p.sources).toEqual({ weather: false, air: false, alerts: false });
    expect(p.opener).toEqual({ weather: undefined, facts: [] });
    const types = new Set(p.facts.map((f) => f.type));
    expect([...types].sort()).toEqual(['city_fact', 'cricket', 'festival', 'on_this_day']);
    expect(p.chosen?.id).toBe('fest:chhath:today:2026-11-15');
  });

  it('treats HTTP errors and malformed bodies as missing sources', async () => {
    mockFetch(NOW, {
      forecast: () => new Response('upstream error', { status: 502 }),
      air: () => Response.json({ hourly: { time: [], pm2_5: [] } }),
      sachet: () => new Response('<html>maintenance</html>'),
    });
    const p = await buildFactPacket({ station: HI, city: 'Delhi', region: 'Delhi', lat: 28.61, lon: 77.21, now: NOW });
    expect(p.sources.weather).toBe(false);
    expect(p.sources.air).toBe(false);
    expect(p.facts.some((f) => f.type === 'alert' || f.type === 'weather_notable' || f.type === 'air_bad')).toBe(false);
    expect(p.facts.length).toBeGreaterThan(5);
  });

  it('fetches the three live sources in parallel, once per grid cell, and serves the cache after', async () => {
    const fn = mockFetch(NOW);
    const input = { station: HI, city: 'Delhi', region: 'Delhi', lat: 28.61, lon: 77.21, now: NOW };
    await buildFactPacket(input);
    expect(fn).toHaveBeenCalledTimes(3);
    await buildFactPacket({ ...input, lat: 28.63, lon: 77.22, now: NOW + 5 * 60_000 });
    expect(fn).toHaveBeenCalledTimes(3);
    const urls = fn.mock.calls.map(([u]) => String(u));
    expect(urls.some((u) => u.endsWith('rss_delhi.xml'))).toBe(true);
    for (const [, init] of fn.mock.calls as unknown as [string, RequestInit][]) {
      expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/^TarangFM\/1\.0 \(\+https:\/\/tarang-fm\.dualmindlab\.tech; /);
      expect(init.signal).toBeDefined();
    }
  });

  it('falls back to the curated city centre when the edge gives no coordinates', async () => {
    const fn = mockFetch(NOW);
    await buildFactPacket({ station: HI, city: 'Bengaluru', region: 'Karnataka', now: NOW });
    expect(fn.mock.calls.some(([u]) => String(u).includes('latitude=12.97&longitude=77.59'))).toBe(true);
  });
});

describe('expiry', () => {
  it('drops a fact once it has expired and scopes "today" to the IST day', async () => {
    const late = istInstant('2026-11-15', '23:59');
    mockFetch(late, { sachet: () => new Response('<rss></rss>') });
    const p = await buildFactPacket({ station: HI, city: 'Delhi', region: 'Delhi', lat: 28.61, lon: 77.21, now: late });
    const chhath = p.facts.find((f) => f.id === 'fest:chhath:today:2026-11-15');
    expect(chhath?.expiresAt).toBe(istInstant('2026-11-16'));
    // the ODI started at 07:30 and play is long over: no cricket line at all
    expect(p.facts.some((f) => f.type === 'cricket')).toBe(false);
    const next = await buildFactPacket({ station: HI, city: 'Delhi', region: 'Delhi', lat: 28.61, lon: 77.21, now: istInstant('2026-11-16', '00:01') });
    expect(next.facts.some((f) => f.id.startsWith('fest:chhath:today'))).toBe(false);
  });
});

describe('weatherForRequest', () => {
  it('returns the extended shape and accepts cf string coordinates', async () => {
    mockFetch(NOW);
    expect(await weatherForRequest({ lat: '28.61', lon: '77.21', now: NOW })).toEqual({
      tempC: 24,
      description: 'overcast',
      notable: 'rain_soon',
      rainChance3h: 70,
      pm25: 100,
    });
  });

  it('is undefined without coordinates or a known city, and when the forecast fails', async () => {
    mockFetch(NOW, { forecast: () => new Response('', { status: 500 }) });
    expect(await weatherForRequest({ now: NOW })).toBeUndefined();
    expect(await weatherForRequest({ lat: 28.61, lon: 77.21, now: NOW })).toBeUndefined();
  });
});
