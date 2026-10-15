import { describe, expect, it } from 'vitest';
import { airFact, isBadAir, naqiOf, parseAir } from './air';
import { alertMatches, alertsFor, normalizeState, parseSachet, validityMs, type Alert } from './alerts';
import { festivalFacts } from './calendar';
import { cricketFacts, fixtureFor } from './cricket';
import { onThisDayFacts } from './onThisDay';
import { istInstant, istParts } from './util';
import { notableOf, parseForecast, weatherNotableFact, type WeatherReading } from './weather';

const at = (date: string, time = '09:00') => istInstant(date, time);

describe('IST helpers', () => {
  it('converts between instants and IST wall time', () => {
    const t = at('2026-10-22', '12:30');
    expect(new Date(t).toISOString()).toBe('2026-10-22T07:00:00.000Z');
    expect(istParts(t)).toMatchObject({ date: '2026-10-22', time: '12:30', weekday: 4, hour: 12 });
    // 23:00 UTC is already the next day in India
    expect(istParts(Date.parse('2026-10-21T23:00:00Z')).date).toBe('2026-10-22');
  });
});

describe('weather', () => {
  const reading = (over: Partial<WeatherReading> = {}): WeatherReading => ({
    observedAt: at('2026-10-15', '09:00'),
    tempC: 30,
    feelsLikeC: 31,
    code: 0,
    isDay: true,
    rainChance3h: 10,
    today: { maxC: 34, feelsMaxC: 35 },
    ...over,
  });
  const now = at('2026-10-15', '09:10');

  it('ignores forecast hours before the current one', () => {
    const r = parseForecast({
      current: { time: '2026-10-15T09:00', temperature_2m: 27.6, apparent_temperature: 30.9, weather_code: 0, is_day: 1 },
      hourly: { time: ['2026-10-15T08:00', '2026-10-15T09:00', '2026-10-15T10:00', '2026-10-15T11:00', '2026-10-15T12:00'], precipitation_probability: [95, 10, 20, 30, 99] },
      daily: { temperature_2m_max: [37.1], apparent_temperature_max: [39.8] },
    });
    expect(r).toMatchObject({ tempC: 28, feelsLikeC: 31, rainChance3h: 30, today: { maxC: 37, feelsMaxC: 40 } });
    expect(r?.observedAt).toBe(at('2026-10-15', '09:00'));
  });

  it('flags only notable weather, in priority order', () => {
    expect(notableOf(reading(), now)).toBe('none');
    expect(notableOf(reading({ code: 63 }), now)).toBe('raining');
    expect(notableOf(reading({ rainChance3h: 59 }), now)).toBe('none');
    expect(notableOf(reading({ rainChance3h: 60 }), now)).toBe('rain_soon');
    expect(notableOf(reading({ rainChance3h: 60 }), now, true)).toBe('rain_soon');
    expect(notableOf(reading(), now, true)).toBe('bad_air');
    expect(notableOf(reading({ code: 45, tempC: 9 }), now)).toBe('fog');
    expect(notableOf(reading({ today: { maxC: 37, feelsMaxC: 40 } }), now)).toBe('heat');
    // a hot afternoon forecast is old news at night
    expect(notableOf(reading({ today: { maxC: 37, feelsMaxC: 40 } }), at('2026-10-15', '21:00'))).toBe('none');
    expect(notableOf(reading({ tempC: 12, feelsLikeC: 11 }), now)).toBe('cold');
  });

  it('never airs a stale reading', () => {
    const r = reading({ rainChance3h: 80 });
    expect(weatherNotableFact(r, now, 'g')?.type).toBe('weather_notable');
    expect(weatherNotableFact(r, at('2026-10-15', '10:31'), 'g')).toBeUndefined();
  });

  it('keeps feels-like numbers in the heat line and hedges a forecast chance', () => {
    const heat = weatherNotableFact(reading({ today: { maxC: 37, feelsMaxC: 40 } }), now, 'g');
    expect(heat).toMatchObject({ keptTokens: ['37', '40'], id: 'wx:heat-today:2026-10-15:g' });
    expect(heat?.nativeText?.hi).toBe('आज पारा 37 डिग्री तक जाएगा, पर लगेगा 40 डिग्री जैसा।');
    expect(heat?.expiresAt).toBe(at('2026-10-15', '15:00'));
    const rain = weatherNotableFact(reading({ rainChance3h: 70 }), now, 'g');
    expect(rain?.hedge).toMatch(/chance/);
    expect(rain?.keptTokens).toEqual(['70']);
  });
});

describe('air quality (CPCB scale)', () => {
  it('computes the national AQI band from PM means', () => {
    expect(naqiOf(25, 40)).toEqual({ naqi: 42, category: 'good' });
    expect(naqiOf(85, 120)).toMatchObject({ category: 'moderate' });
    expect(naqiOf(90).naqi).toBe(200);
    expect(naqiOf(100, 150)).toEqual({ naqi: 233, category: 'poor' });
    expect(naqiOf(200).category).toBe('very_poor');
    expect(naqiOf(300).category).toBe('severe');
  });

  it('speaks only above 200, with the category word and never a number', () => {
    const now = at('2026-11-20', '08:00');
    expect(airFact({ pm25: 90, pm10: 100, naqi: 200, category: 'moderate' }, now, 'g')).toBeUndefined();
    const poor = airFact({ pm25: 100, pm10: 150, ...naqiOf(100, 150) }, now, 'g');
    expect(poor?.type).toBe('air_bad');
    expect(poor?.keptTokens).toEqual([]);
    expect(poor?.keptNative?.hi).toEqual(['ख़राब']);
    for (const text of [poor!.claimEn, ...Object.values(poor!.nativeText ?? {})]) expect(text).not.toMatch(/\d/);
    // an implausibly clean model cell is not "clean air" and not bad air either
    expect(isBadAir({ pm25: 5, pm10: 400, naqi: 300, category: 'poor' })).toBe(false);
  });

  it('averages the last 24 hours up to now and needs at least 12 of them', () => {
    const now = at('2026-11-20', '08:30');
    const time = Array.from({ length: 48 }, (_, i) => new Date(Date.parse('2026-11-19T00:00Z') + i * 3_600_000).toISOString().slice(0, 16));
    const pm2_5 = time.map((t) => (t.slice(0, 13) > '2026-11-20T08' ? 999 : 100));
    expect(parseAir({ hourly: { time, pm2_5, pm10: time.map(() => 150) } }, now)).toEqual({ pm25: 100, pm10: 150, naqi: 233, category: 'poor' });
    expect(parseAir({ hourly: { time: time.slice(0, 5), pm2_5: pm2_5.slice(0, 5) } }, at('2026-11-19', '04:00'))).toBeUndefined();
  });
});

describe('NDMA SACHET alerts', () => {
  const xml = `<rss><channel>
    <item><title><![CDATA[Thunderstorm &amp; lightning likely over Chennai, Thiruvallur in next 3 hours.]]></title>
      <author>sachet@ndma.gov.in (IMD Chennai)</author><pubDate>Thu, 15 Oct 2026 04:10:00 IST</pubDate></item>
    <item><title>Flood alert for low-lying areas of Kolkata.</title><author>CWC</author><pubDate>Thu, 15 Oct 2026 03:00:00 +0530</pubDate></item>
  </channel></rss>`;

  it('parses issuer, IST dates and the validity window', () => {
    const [a, b] = parseSachet(xml);
    expect(a).toMatchObject({ issuer: 'IMD Chennai', title: 'Thunderstorm & lightning likely over Chennai, Thiruvallur in next 3 hours.' });
    expect(a.issuedAt).toBe(at('2026-10-15', '04:10'));
    expect(a.expiresAt - a.issuedAt).toBe(3 * 3_600_000);
    expect(b.issuer).toBe('CWC');
    expect(b.expiresAt - b.issuedAt).toBe(6 * 3_600_000);
    expect(validityMs('valid for next 24 hours')).toBe(24 * 3_600_000);
    expect(validityMs('in next 5 days')).toBe(48 * 3_600_000);
  });

  const alert = (title: string, issuer = 'IMD', issuedAt = at('2026-10-15', '08:00')): Alert => ({ title, issuer, issuedAt, expiresAt: issuedAt + 3 * 3_600_000 });

  it('matches whole place names only, within the listener’s state', () => {
    const pune = { names: ['Pune', 'Poona'], state: 'Maharashtra' };
    expect(alertMatches(alert('Heavy rain over Pune ghat areas of Madhya Maharashtra in next 3 hours.'), pune)).toBe(true);
    expect(alertMatches(alert('Thunderstorm over Vadodara, Anand districts of Gujarat in next 3 hours.'), pune)).toBe(false);
    expect(alertMatches(alert('Rain over Punekar Nagar'), pune)).toBe(false);
    // same district name, different state
    const aurangabad = { names: ['Aurangabad'], state: 'Maharashtra' };
    expect(alertMatches(alert('Heat wave over Aurangabad district of Bihar.'), aurangabad)).toBe(false);
    expect(alertMatches(alert('Heat wave over Aurangabad district.'), aurangabad)).toBe(true);
    // a state SDMA issuer counts as naming that state
    expect(alertMatches(alert('Rain over Aurangabad.', 'Bihar SDMA'), aurangabad)).toBe(false);
    // unknown listener state: an alert naming a state is not assumed to be theirs
    expect(alertMatches(alert('Rain over Vadodara district of Gujarat.'), { names: ['Vadodara'] })).toBe(false);
  });

  it('keeps fresh alerts, newest first, one per issuer (updates replace earlier versions), at most two', () => {
    const now = at('2026-10-15', '10:00');
    const chennai = { names: ['Chennai'], state: 'Tamil Nadu' };
    const list = [
      alert('Light to moderate rain over Chennai in next 3 hours.', 'IMD Chennai', at('2026-10-15', '09:30')),
      alert('Moderate rain over Chennai in next 3 hours.', 'IMD Chennai', at('2026-10-15', '08:30')),
      alert('Waterlogging advisory for low-lying areas of Chennai.', 'Tamil Nadu SDMA', at('2026-10-15', '09:00')),
      alert('Strong wind over Chennai coast.', 'CWC', at('2026-10-15', '08:45')),
      alert('Old rain over Chennai.', 'Puducherry SDMA', at('2026-10-15', '06:00')),
      alert('Future-dated over Chennai.', 'IMD Chennai', at('2026-10-15', '11:00')),
    ];
    const got = alertsFor(list, chennai, now);
    expect(got.map((a) => [a.issuer, a.title])).toEqual([
      ['IMD Chennai', 'Light to moderate rain over Chennai in next 3 hours.'],
      ['Tamil Nadu SDMA', 'Waterlogging advisory for low-lying areas of Chennai.'],
    ]);
  });

  it('normalises edge region names', () => {
    expect(normalizeState('National Capital Territory of Delhi')).toBe('Delhi');
    expect(normalizeState('tamil nadu')).toBe('Tamil Nadu');
    expect(normalizeState(undefined)).toBeUndefined();
  });
});

describe('festivals', () => {
  it('says "this week" for a disputed date, never today, tomorrow or a date', () => {
    // Govardhan Puja is listed for Tue 10 Nov 2026 (Google says Mon 9 Nov)
    for (const day of ['2026-11-09', '2026-11-10']) {
      const f = festivalFacts(day, 'hi', 'Delhi', at(day), () => 0).find((x) => x.id.startsWith('fest:govardhan-puja'));
      expect(f?.id).toBe('fest:govardhan-puja:week:2026-11-10');
      expect(f?.claimEn).toMatch(/this week/);
      expect(f?.claimEn).not.toMatch(/today|tomorrow|\d/i);
      expect(f?.nativeText?.hi).toBe('गोवर्धन पूजा इसी हफ़्ते है।');
      expect(f?.hedge).toMatch(/never "today", "tomorrow"/);
      expect(f?.hedgeNative?.hi).toBe('इस हफ़्ते');
      expect(f?.keptTokens).toEqual([]);
    }
    // on Saturday 7 Nov the 10th is next week: no claim at all
    expect(festivalFacts('2026-11-07', 'hi', 'Delhi', at('2026-11-07'), () => 0).some((x) => x.id.startsWith('fest:govardhan-puja'))).toBe(false);
  });

  it('greets confirmed festivals today and tomorrow, and counts down only to confirmed ones', () => {
    const today = festivalFacts('2026-11-08', 'hi', 'Delhi', at('2026-11-08'), () => 0);
    expect(today.find((f) => f.id === 'fest:diwali:today:2026-11-08')?.nativeText?.hi).toBe('आज दीवाली है।');
    const eve = festivalFacts('2026-11-07', 'mr', 'Maharashtra', at('2026-11-07'), () => 0);
    expect(eve.find((f) => f.id === 'fest:diwali:tomorrow:2026-11-07')?.nativeText?.mr).toBe('उद्या दिवाळी आहे.');
    const cd = festivalFacts('2026-10-15', 'hi', 'Delhi', at('2026-10-15'), () => 0).find((f) => f.id.includes(':cd'));
    expect(cd).toMatchObject({ id: 'fest:dussehra:cd5', keptTokens: ['5'] });
    expect(cd?.nativeText?.hi).toBe('दशहरा में 5 दिन बाकी हैं।');
  });

  it('never says which day of a multi-day festival it is, and picks the local custom', () => {
    const f = festivalFacts('2026-10-15', 'ta', 'Tamil Nadu', at('2026-10-15'), () => 0).find((x) => x.id.startsWith('fest:navratri'));
    expect(f?.id).toBe('fest:navratri:ongoing:2026-10-15');
    expect(f?.claimEn).toContain('golu');
    expect(f?.claimEn).not.toContain('garba');
    expect(f?.hedge).toMatch(/Never say which day/);
  });

  it('never announces a moon-sighting date in advance', () => {
    expect(festivalFacts('2027-03-09', 'hi', 'Delhi', at('2027-03-09'), () => 0).some((f) => f.id.includes('eid'))).toBe(false);
  });
});

describe('cricket', () => {
  it('states the IST start time before play, says "on now" during play, and stops after', () => {
    const before = cricketFacts(at('2026-10-22', '09:00'))[0];
    expect(before.id).toBe('cric:2026-10-22:1st-t20i:today');
    expect(before.claimEn).toContain('12:30 IST');
    expect(before.nativeText?.hi).toBe('आज क्राइस्टचर्च में भारत और न्यूज़ीलैंड के बीच पहला T20 मैच है, दोपहर साढ़े बारह बजे से।');
    expect(before.keptTokens).toEqual(['T20']);
    expect(before.keptNative?.ta).toEqual(['மதியம் பன்னிரண்டரை மணிக்கு']);
    expect(before.expiresAt).toBe(at('2026-10-22', '12:30'));
    const live = cricketFacts(at('2026-10-22', '13:00'))[0];
    expect(live.id).toBe('cric:2026-10-22:1st-t20i:live');
    expect(live.hedge).toMatch(/never say who is winning/);
    expect(cricketFacts(at('2026-10-22', '17:00'))).toEqual([]);
  });

  it('never states a time for home matches without one', () => {
    const f = cricketFacts(at('2026-10-17', '10:00'))[0];
    expect(f.claimEn).toContain('No start time is published');
    expect(f.hedge).toMatch(/never state one/);
    expect(cricketFacts(at('2026-10-17', '18:00'))).toEqual([]);
    const eve = cricketFacts(at('2026-10-16', '20:00'))[0];
    expect(eve.id).toBe('cric:2026-10-17:5th-t20i:tomorrow');
    expect(eve.claimEn).not.toMatch(/\d{2}:\d{2}/);
  });

  it('covers Test days in progress and ranks tomorrow above a match later in the week', () => {
    expect(fixtureFor('2026-11-21')?.fixture.match).toBe('1st Test');
    const tomorrow = cricketFacts(at('2026-11-18', '20:00'))[0];
    expect(tomorrow).toMatchObject({ id: 'cric:2026-11-19:1st-test:tomorrow', priority: 52 });
    expect(tomorrow.nativeText?.hi).toContain('तड़के साढ़े तीन बजे');
    const later = cricketFacts(at('2026-12-10'))[0];
    expect(later).toMatchObject({ id: 'cric:2026-12-13:1st-odi:in3', priority: 35, keptTokens: ['3'] });
  });
});

describe('on this day', () => {
  it('gives the curated item with its year kept and native spellings', () => {
    const facts = onThisDayFacts(at('2026-10-15'));
    expect(facts.map((f) => f.id)).toEqual(['otd:10-15:q69906', 'otd:10-15:q9513']);
    const kalam = facts[1];
    expect(kalam.keptTokens).toEqual(['1931']);
    expect(kalam.nativeText?.hi).toBe('आज ही के दिन 1931 में ए॰ पी॰ जे॰ अब्दुल कलाम का जन्म हुआ था।');
    expect(kalam.expiresAt).toBe(at('2026-10-16', '00:00'));
  });
});
