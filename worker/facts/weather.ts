/**
 * Open-Meteo forecast (free, no key, CC BY 4.0: credit "Weather data by Open-Meteo.com"). `current` refreshes every
 * 15 minutes, so readings are cached 15 minutes per 0.1° grid cell and never aired when older than 90 minutes.
 */
import type { Weather } from '../../shared/types';
import type { Fact, FactLang } from './types';
import { HOUR_MS, MINUTE_MS, TtlCache, cached, endOfIstDay, fetchWithTimeout, gridKey, istInstant, istParts } from './util';

export interface WeatherReading {
  /** Epoch ms of the model's current reading */
  observedAt: number;
  tempC: number;
  feelsLikeC: number;
  code: number;
  isDay: boolean;
  /** Highest precipitation probability in the next 3 hours (from the current hour) */
  rainChance3h: number;
  today: { maxC: number; feelsMaxC: number };
}

type Condition = 'clear' | 'partly_cloudy' | 'overcast' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunderstorm' | 'mild';

const WMO: [number[], Condition][] = [
  [[0], 'clear'],
  [[1, 2], 'partly_cloudy'],
  [[3], 'overcast'],
  [[45, 48], 'fog'],
  [[51, 53, 55, 56, 57], 'drizzle'],
  [[61, 63, 65, 66, 67, 80, 81, 82], 'rain'],
  [[71, 73, 75, 77, 85, 86], 'snow'],
  [[95, 96, 99], 'thunderstorm'],
];

/** English description, same words as the rest of the worker uses ('clear sky', 'rain'…). */
const DESCRIPTION: Record<Condition, string> = {
  clear: 'clear sky',
  partly_cloudy: 'partly cloudy',
  overcast: 'overcast',
  fog: 'foggy',
  drizzle: 'drizzle',
  rain: 'rain',
  snow: 'snow',
  thunderstorm: 'thunderstorm',
  mild: 'mild weather',
};

const CONDITION_NATIVE: Record<Condition, Record<FactLang, string>> = {
  clear: { hi: 'साफ़ आसमान', mr: 'निरभ्र आकाश', ta: 'தெளிவான வானம்', bn: 'পরিষ্কার আকাশ', gu: 'સ્વચ્છ આકાશ' },
  partly_cloudy: { hi: 'हल्के बादल', mr: 'थोडे ढग', ta: 'ஓரளவு மேகமூட்டம்', bn: 'আংশিক মেঘলা', gu: 'આંશિક વાદળછાયું' },
  overcast: { hi: 'घने बादल', mr: 'ढगाळ वातावरण', ta: 'மேகமூட்டம்', bn: 'মেঘলা আকাশ', gu: 'વાદળછાયું આકાશ' },
  fog: { hi: 'कोहरा', mr: 'धुकं', ta: 'மூடுபனி', bn: 'কুয়াশা', gu: 'ધુમ્મસ' },
  drizzle: { hi: 'बूँदाबाँदी', mr: 'रिमझिम पाऊस', ta: 'தூறல்', bn: 'গুঁড়ি গুঁড়ি বৃষ্টি', gu: 'ઝરમર વરસાદ' },
  rain: { hi: 'बारिश', mr: 'पाऊस', ta: 'மழை', bn: 'বৃষ্টি', gu: 'વરસાદ' },
  snow: { hi: 'बर्फ़बारी', mr: 'हिमवर्षाव', ta: 'பனிப்பொழிவு', bn: 'তুষারপাত', gu: 'હિમવર્ષા' },
  thunderstorm: { hi: 'गरज के साथ बारिश', mr: 'विजांच्या कडकडाटासह पाऊस', ta: 'இடியுடன் மழை', bn: 'বজ্রবিদ্যুৎ সহ বৃষ্টি', gu: 'ગાજવીજ સાથે વરસાદ' },
  mild: { hi: 'सुहाना मौसम', mr: 'आल्हाददायक हवा', ta: 'இதமான வானிலை', bn: 'মনোরম আবহাওয়া', gu: 'ખુશનુમા વાતાવરણ' },
};

export function conditionOf(code: number): Condition {
  return WMO.find(([codes]) => codes.includes(code))?.[1] ?? 'mild';
}

export function describeCode(code: number): string {
  return DESCRIPTION[conditionOf(code)];
}

const isWet = (c: Condition) => c === 'drizzle' || c === 'rain' || c === 'thunderstorm';

// ---- Thresholds (show bible §4.1: rain within 3 h ≥ 60 %, heat ≥ 38 °C, cold ≤ 12 °C, fog) -------------------
export const RAIN_SOON_PCT = 60;
export const HEAT_C = 38;
export const COLD_C = 12;
/** A reading older than this is not aired (stale cache after a failed refresh). */
export const WEATHER_MAX_AGE_MS = 90 * MINUTE_MS;

const FORECAST_URL =
  'https://api.open-meteo.com/v1/forecast?current=temperature_2m,apparent_temperature,weather_code,is_day' +
  '&hourly=precipitation_probability&forecast_hours=5&daily=temperature_2m_max,apparent_temperature_max' +
  '&timezone=Asia%2FKolkata&forecast_days=1';

interface ForecastJson {
  current?: { time?: string; temperature_2m?: number; apparent_temperature?: number; weather_code?: number; is_day?: number };
  hourly?: { time?: string[]; precipitation_probability?: (number | null)[] };
  daily?: { temperature_2m_max?: number[]; apparent_temperature_max?: number[] };
}

/** Parses an Open-Meteo forecast (timezone Asia/Kolkata). Undefined when the current block is missing. */
export function parseForecast(json: ForecastJson): WeatherReading | undefined {
  const c = json.current;
  if (!c?.time || typeof c.temperature_2m !== 'number') return undefined;
  const [date, time] = c.time.split('T');
  const observedAt = istInstant(date, time.slice(0, 5));
  // forecast_hours can start an hour before 'now': keep the current hour and the next two
  const hourly = json.hourly ?? {};
  const fromHour = c.time.slice(0, 13);
  const chances = (hourly.time ?? [])
    .map((t, i) => (t.slice(0, 13) >= fromHour ? hourly.precipitation_probability?.[i] : undefined))
    .filter((p): p is number => typeof p === 'number')
    .slice(0, 3);
  const tempC = Math.round(c.temperature_2m);
  return {
    observedAt,
    tempC,
    feelsLikeC: Math.round(c.apparent_temperature ?? c.temperature_2m),
    code: c.weather_code ?? -1,
    isDay: c.is_day === 1,
    rainChance3h: chances.length ? Math.max(...chances) : 0,
    today: {
      maxC: Math.round(json.daily?.temperature_2m_max?.[0] ?? tempC),
      feelsMaxC: Math.round(json.daily?.apparent_temperature_max?.[0] ?? c.apparent_temperature ?? tempC),
    },
  };
}

const forecastCache = new TtlCache<WeatherReading>(15 * MINUTE_MS, 60 * MINUTE_MS);

/** Current reading for the 0.1° grid cell, cached 15 minutes. Never throws. */
export function getWeatherReading(lat: number, lon: number, now: number): Promise<WeatherReading | undefined> {
  return cached(
    forecastCache,
    gridKey(lat, lon),
    now,
    async () => {
      const res = await fetchWithTimeout(`${FORECAST_URL}&latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}`, 'application/json');
      const reading = parseForecast((await res.json()) as ForecastJson);
      if (!reading) throw new Error('forecast without current block');
      return reading;
    },
    'weather',
  );
}

export function clearWeatherCache(): void {
  forecastCache.clear();
}

export type Notable = NonNullable<Weather['notable']>;

/** Heat "now" (feels-like right now) or "today" (the day's feels-like max, before 15:00 IST). */
function heatOf(r: WeatherReading, now: number): 'now' | 'today' | undefined {
  if (r.feelsLikeC >= HEAT_C) return 'now';
  if (istParts(now).hour < 15 && r.today.feelsMaxC >= HEAT_C) return 'today';
  return undefined;
}

/** What is worth saying about the weather right now, in priority order. Air is passed in when it is "poor" or worse. */
export function notableOf(r: WeatherReading, now: number, badAir = false): Notable {
  const cond = conditionOf(r.code);
  if (isWet(cond)) return 'raining';
  if (r.rainChance3h >= RAIN_SOON_PCT) return 'rain_soon';
  if (badAir) return 'bad_air';
  if (cond === 'fog') return 'fog';
  if (heatOf(r, now)) return 'heat';
  if (r.tempC <= COLD_C) return 'cold';
  return 'none';
}

const fresh = (r: WeatherReading, now: number) => now - r.observedAt <= WEATHER_MAX_AGE_MS;

/** The extended Weather shape for the opener. Undefined when there is no fresh reading. */
export function toWeather(r: WeatherReading | undefined, now: number, pm25?: number, badAir = false): Weather | undefined {
  if (!r || !fresh(r, now)) return undefined;
  return {
    tempC: r.tempC,
    description: describeCode(r.code),
    notable: notableOf(r, now, badAir),
    rainChance3h: r.rainChance3h,
    ...(pm25 !== undefined ? { pm25 } : {}),
  };
}

const SOURCE = 'Open-Meteo forecast';

/** The opener's basic weather line: always available when there is a fresh reading. */
export function weatherNowFact(r: WeatherReading, now: number, gridId: string): Fact {
  const cond = conditionOf(r.code);
  const feels = Math.abs(r.feelsLikeC - r.tempC) >= 3;
  const n = CONDITION_NATIVE[cond];
  return {
    id: `wx:now:${istParts(now).date}:${gridId}`,
    type: 'weather_now',
    priority: 0,
    claimEn: `Now ${r.tempC}°C, ${describeCode(r.code)}${feels ? `, feels like ${r.feelsLikeC}°C` : ''}.`,
    nativeText: {
      hi: `अभी ${r.tempC} डिग्री, ${n.hi}।`,
      mr: `सध्या ${r.tempC} अंश, ${n.mr}.`,
      ta: `இப்போது ${r.tempC} டிகிரி, ${n.ta}.`,
      bn: `এখন ${r.tempC} ডিগ্রি, ${n.bn}।`,
      gu: `અત્યારે ${r.tempC} ડિગ્રી, ${n.gu}.`,
    },
    keptTokens: [String(r.tempC)],
    ...(feels ? { allowedTokens: [String(r.feelsLikeC)] } : {}),
    hedge: 'Opener only. Say the weather as a feeling; the temperature digits only if the weather is notable.',
    angleEn: 'What it feels like to step outside right now.',
    expiresAt: Math.min(r.observedAt + WEATHER_MAX_AGE_MS, endOfIstDay(now)),
    source: SOURCE,
  };
}

/** The notable-weather payload fact, if anything is notable. Bad air is a separate fact (air.ts). */
export function weatherNotableFact(r: WeatherReading, now: number, gridId: string): Fact | undefined {
  if (!fresh(r, now)) return undefined;
  const kind = notableOf(r, now);
  const date = istParts(now).date;
  const base = { type: 'weather_notable' as const, source: SOURCE, id: `wx:${kind}:${date}:${gridId}` };
  const soon = Math.min(now + 3 * HOUR_MS, endOfIstDay(now) + 3 * HOUR_MS);
  switch (kind) {
    case 'raining': {
      const n = CONDITION_NATIVE[conditionOf(r.code)];
      return {
        ...base,
        priority: 92,
        claimEn: `It is raining now (${describeCode(r.code)}).`,
        nativeText: { hi: `अभी ${n.hi} हो रही है।`, mr: `सध्या ${n.mr} सुरू आहे.`, ta: `இப்போது ${n.ta} பெய்கிறது.`, bn: `এখন ${n.bn} হচ্ছে।`, gu: `અત્યારે ${n.gu} ચાલુ છે.` },
        keptTokens: [],
        angleEn: 'People heading out need an umbrella or a raincoat right now; one practical line.',
        expiresAt: now + HOUR_MS,
      };
    }
    case 'rain_soon': {
      const p = r.rainChance3h;
      return {
        ...base,
        priority: 90,
        claimEn: `Rain chance up to ${p}% in the next three hours (forecast).`,
        nativeText: {
          hi: `अगले तीन घंटे में बारिश की संभावना ${p} प्रतिशत है।`,
          mr: `पुढच्या तीन तासांत पावसाची शक्यता ${p} टक्के आहे.`,
          ta: `அடுத்த மூன்று மணி நேரத்தில் மழை பெய்ய ${p} சதவீதம் வாய்ப்பு உள்ளது.`,
          bn: `আগামী তিন ঘণ্টায় বৃষ্টির সম্ভাবনা ${p} শতাংশ।`,
          gu: `આગામી ત્રણ કલાકમાં વરસાદની શક્યતા ${p} ટકા છે.`,
        },
        keptTokens: [String(p)],
        hedge: 'A forecast chance, not a certainty: say "chance" (संभावना), never "it will rain".',
        angleEn: 'Anyone about to step out should carry an umbrella; the laundry on the balcony needs a decision.',
        expiresAt: Math.min(now + 2 * HOUR_MS, r.observedAt + 3 * HOUR_MS),
      };
    }
    case 'fog':
      return {
        ...base,
        priority: 72,
        claimEn: 'There is fog right now.',
        nativeText: { hi: 'अभी कोहरा छाया है।', mr: 'सध्या धुकं पसरलं आहे.', ta: 'இப்போது மூடுபனி சூழ்ந்துள்ளது.', bn: 'এখন কুয়াশা রয়েছে।', gu: 'અત્યારે ધુમ્મસ છવાયું છે.' },
        keptTokens: [],
        angleEn: 'Drivers and two-wheeler riders: headlights on, slow down.',
        expiresAt: now + 2 * HOUR_MS,
      };
    case 'heat': {
      const mode = heatOf(r, now) ?? 'now';
      const t = mode === 'now' ? r.tempC : r.today.maxC;
      const f = mode === 'now' ? r.feelsLikeC : r.today.feelsMaxC;
      const withFeels = f - t >= 2;
      const text: Record<FactLang, string> =
        mode === 'now'
          ? withFeels
            ? {
                hi: `अभी पारा ${t} डिग्री है, पर लग रहा है ${f} डिग्री जैसा।`,
                mr: `सध्या ${t} अंश तापमान आहे, पण ${f} अंशांसारखं जाणवतंय.`,
                ta: `இப்போது ${t} டிகிரி, ஆனால் ${f} டிகிரி போல உணரப்படுகிறது.`,
                bn: `এখন ${t} ডিগ্রি, কিন্তু মনে হচ্ছে ${f} ডিগ্রির মতো।`,
                gu: `અત્યારે ${t} ડિગ્રી છે, પણ ${f} ડિગ્રી જેવું લાગે છે.`,
              }
            : { hi: `अभी पारा ${t} डिग्री है।`, mr: `सध्या तापमान ${t} अंश आहे.`, ta: `இப்போது வெப்பநிலை ${t} டிகிரி.`, bn: `এখন তাপমাত্রা ${t} ডিগ্রি।`, gu: `અત્યારે તાપમાન ${t} ડિગ્રી છે.` }
          : withFeels
            ? {
                hi: `आज पारा ${t} डिग्री तक जाएगा, पर लगेगा ${f} डिग्री जैसा।`,
                mr: `आज पारा ${t} अंशांपर्यंत जाईल, पण ${f} अंशांसारखं जाणवेल.`,
                ta: `இன்று வெப்பநிலை ${t} டிகிரி வரை செல்லும், ஆனால் ${f} டிகிரி போல உணரப்படும்.`,
                bn: `আজ তাপমাত্রা ${t} ডিগ্রি পর্যন্ত উঠবে, কিন্তু মনে হবে ${f} ডিগ্রির মতো।`,
                gu: `આજે પારો ${t} ડિગ્રી સુધી જશે, પણ ${f} ડિગ્રી જેવું લાગશે.`,
              }
            : { hi: `आज पारा ${t} डिग्री तक जाएगा।`, mr: `आज पारा ${t} अंशांपर्यंत जाईल.`, ta: `இன்று வெப்பநிலை ${t} டிகிரி வரை செல்லும்.`, bn: `আজ তাপমাত্রা ${t} ডিগ্রি পর্যন্ত উঠবে।`, gu: `આજે પારો ${t} ડિગ્રી સુધી જશે.` };
      return {
        ...base,
        id: `wx:heat-${mode}:${date}:${gridId}`,
        priority: 72,
        claimEn:
          mode === 'now'
            ? `It is ${t}°C now${withFeels ? `, and it feels like ${f}°C` : ''}.`
            : `Today's high is ${t}°C${withFeels ? `, and it will feel like ${f}°C` : ''} (forecast).`,
        nativeText: text,
        keptTokens: withFeels ? [String(t), String(f)] : [String(t)],
        angleEn: 'Water bottle, cap, and skip the midday errand if you can.',
        expiresAt: mode === 'now' ? soon : istInstant(date, '15:00'),
      };
    }
    case 'cold':
      return {
        ...base,
        priority: 72,
        claimEn: `It is ${r.tempC}°C right now.`,
        nativeText: {
          hi: `अभी पारा ${r.tempC} डिग्री है।`,
          mr: `सध्या तापमान ${r.tempC} अंश आहे.`,
          ta: `இப்போது வெப்பநிலை ${r.tempC} டிகிரி.`,
          bn: `এখন তাপমাত্রা ${r.tempC} ডিগ্রি।`,
          gu: `અત્યારે તાપમાન ${r.tempC} ડિગ્રી છે.`,
        },
        keptTokens: [String(r.tempC)],
        angleEn: 'A sweater morning: layer up before heading out, and chai tastes better.',
        expiresAt: now + 3 * HOUR_MS,
      };
    default:
      return undefined;
  }
}
