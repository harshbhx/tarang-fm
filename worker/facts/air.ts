/**
 * Air quality from Open-Meteo's CAMS model (free, no key). There is no Indian AQI in the feed, so the CPCB National
 * AQI is computed from 24-hour mean PM2.5 and PM10. It is a ~45 km model, not station data: the RJ only speaks when
 * the band is "poor" or worse (index > 200), says the category word, and never a number or "the air is clean".
 */
import type { Fact, FactLang } from './types';
import { HOUR_MS, MINUTE_MS, TtlCache, cached, fetchWithTimeout, gridKey, istParts } from './util';

export type AirCategory = 'good' | 'satisfactory' | 'moderate' | 'poor' | 'very_poor' | 'severe';

export interface AirReading {
  /** 24-hour means, µg/m³ */
  pm25: number;
  pm10: number;
  /** CPCB National AQI (max of the PM sub-indices) */
  naqi: number;
  category: AirCategory;
}

/** CPCB breakpoints: [conc low, conc high, index low, index high] */
const PM25: number[][] = [[0, 30, 0, 50], [30, 60, 50, 100], [60, 90, 100, 200], [90, 120, 200, 300], [120, 250, 300, 400], [250, 500, 400, 500]];
const PM10: number[][] = [[0, 50, 0, 50], [50, 100, 50, 100], [100, 250, 100, 200], [250, 350, 200, 300], [350, 430, 300, 400], [430, 600, 400, 500]];
const BANDS: [number, AirCategory][] = [[50, 'good'], [100, 'satisfactory'], [200, 'moderate'], [300, 'poor'], [400, 'very_poor'], [Infinity, 'severe']];

/** Speak only above this index ("poor" starts at 201). */
export const AQI_SPEAK_ABOVE = 200;
/** CAMS reads implausibly clean on some coastal cells; a metro below this PM2.5 is a model artefact, not clean air. */
const MIN_PLAUSIBLE_PM25 = 8;

function subIndex(c: number, table: number[][]): number {
  const row = table.find(([, hi]) => c <= hi) ?? table[table.length - 1];
  const [blo, bhi, ilo, ihi] = row;
  return Math.round(ilo + ((Math.min(c, bhi) - blo) * (ihi - ilo)) / (bhi - blo));
}

export function naqiOf(pm25: number, pm10?: number): { naqi: number; category: AirCategory } {
  const naqi = Math.max(subIndex(pm25, PM25), pm10 !== undefined ? subIndex(pm10, PM10) : 0);
  return { naqi, category: BANDS.find(([max]) => naqi <= max)![1] };
}

interface AirJson {
  hourly?: { time?: string[]; pm2_5?: (number | null)[]; pm10?: (number | null)[] };
}

/** 24-hour mean up to the current IST hour; undefined with fewer than 12 valid hours. */
export function parseAir(json: AirJson, now: number): AirReading | undefined {
  const times = json.hourly?.time ?? [];
  const p = istParts(now);
  const nowKey = `${p.date}T${String(p.hour).padStart(2, '0')}`;
  const idx = times.map((t, i) => (t.slice(0, 13) <= nowKey ? i : -1)).filter((i) => i >= 0).slice(-24);
  const mean = (series: (number | null)[] | undefined) => {
    const vals = idx.map((i) => series?.[i]).filter((v): v is number => typeof v === 'number');
    return vals.length >= 12 ? vals.reduce((a, b) => a + b, 0) / vals.length : undefined;
  };
  const pm25 = mean(json.hourly?.pm2_5);
  if (pm25 === undefined) return undefined;
  const pm10 = mean(json.hourly?.pm10);
  return { pm25: Math.round(pm25), pm10: Math.round(pm10 ?? 0), ...naqiOf(pm25, pm10) };
}

const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality?hourly=pm2_5,pm10&past_days=1&forecast_days=1&timezone=Asia%2FKolkata';
const airCache = new TtlCache<AirReading>(60 * MINUTE_MS, 3 * HOUR_MS);

/** CPCB-scale reading for the 0.1° grid cell, cached 60 minutes. Never throws. */
export function getAirReading(lat: number, lon: number, now: number): Promise<AirReading | undefined> {
  return cached(
    airCache,
    gridKey(lat, lon),
    now,
    async () => {
      const res = await fetchWithTimeout(`${AIR_URL}&latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}`, 'application/json');
      const reading = parseAir((await res.json()) as AirJson, now);
      if (!reading) throw new Error('air quality without enough hours');
      return reading;
    },
    'air',
  );
}

export function clearAirCache(): void {
  airCache.clear();
}

/** True when the band may be spoken: "poor" or worse, and not a clean-looking model artefact. */
export function isBadAir(r: AirReading | undefined): boolean {
  return !!r && r.naqi > AQI_SPEAK_ABOVE && r.pm25 >= MIN_PLAUSIBLE_PM25;
}

const CATEGORY_EN: Record<AirCategory, string> = {
  good: 'good',
  satisfactory: 'satisfactory',
  moderate: 'moderate',
  poor: 'poor',
  very_poor: 'very poor',
  severe: 'severe',
};

const CATEGORY_NATIVE: Partial<Record<AirCategory, Record<FactLang, string>>> = {
  poor: { hi: 'ख़राब', mr: 'वाईट', ta: 'மோசம்', bn: 'খারাপ', gu: 'ખરાબ' },
  very_poor: { hi: 'बहुत ख़राब', mr: 'अतिशय वाईट', ta: 'மிக மோசம்', bn: 'খুব খারাপ', gu: 'ખૂબ ખરાબ' },
  severe: { hi: 'गंभीर', mr: 'गंभीर', ta: 'கடுமையானது', bn: 'গুরুতর', gu: 'ગંભીર' },
};

/** The bad-air payload fact: the CPCB category word only. Undefined unless the band is "poor" or worse. */
export function airFact(r: AirReading | undefined, now: number, gridId: string): Fact | undefined {
  if (!r || !isBadAir(r)) return undefined;
  const words = CATEGORY_NATIVE[r.category];
  if (!words) return undefined;
  return {
    id: `air:${r.category}:${istParts(now).date}:${gridId}`,
    type: 'air_bad',
    priority: 80,
    claimEn: `Air quality today is in the "${CATEGORY_EN[r.category]}" band of India's national air quality index (daily average, model estimate).`,
    nativeText: {
      hi: `आज हवा की गुणवत्ता '${words.hi}' श्रेणी में है।`,
      mr: `आज हवेची गुणवत्ता '${words.mr}' श्रेणीत आहे.`,
      ta: `இன்று காற்றின் தரம் '${words.ta}' நிலையில் உள்ளது.`,
      bn: `আজ বাতাসের মান '${words.bn}' পর্যায়ে।`,
      gu: `આજે હવાની ગુણવત્તા '${words.gu}' શ્રેણીમાં છે.`,
    },
    keptTokens: [],
    keptNative: { hi: [words.hi], mr: [words.mr], ta: [words.ta], bn: [words.bn], gu: [words.gu] },
    hedge: 'A model estimate: say only the category word, never an index number or PM value, and never claim the air is clean.',
    angleEn: 'Morning walkers and anyone with asthma: go a little later, and keep a mask handy.',
    expiresAt: now + 3 * HOUR_MS,
    source: 'CAMS model via Open-Meteo (CPCB scale, daily mean)',
  };
}
