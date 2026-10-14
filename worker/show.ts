/** Producer-side helpers: time phrases, occasions, local packs, RJ bibles and delivery → voice parameters. */
import type { Delivery, ListenerContext, SegmentType, Station, StationId, Voice } from '../shared/types';

// ---- Delivery → voice parameters ---------------------------------------------------------------

interface DeliveryParams {
  /** Multiplier on the voice's own pace */
  pace: number;
  pitch: number;
  loudness: number;
  /** Silence after the line before type rules and jitter (ms) */
  gapMs: number;
  /** Added to the voice's temperature (expressiveness) */
  temperature: number;
}

/**
 * Starting values from the prompt pack, adjusted by measurement on bulbul:v4-flash:
 * loudness moves output level reliably (1.6 ≈ +3 dB, 0.6 ≈ −5 dB); pitch changes are smaller than
 * take-to-take variation, so pitch stays gentle; pace 1.75 more than doubles speed, so "fast" is 1.35.
 */
export const DELIVERY_PARAMS: Record<Delivery, DeliveryParams> = {
  normal: { pace: 1.0, pitch: 0, loudness: 1.0, gapMs: 250, temperature: 0 },
  warm: { pace: 0.93, pitch: -0.05, loudness: 0.95, gapMs: 350, temperature: 0 },
  excited: { pace: 1.12, pitch: 0.08, loudness: 1.2, gapMs: 150, temperature: 0.1 },
  fast: { pace: 1.35, pitch: 0, loudness: 0.95, gapMs: 100, temperature: 0 },
  hushed: { pace: 0.88, pitch: -0.1, loudness: 0.6, gapMs: 400, temperature: -0.05 },
  shout: { pace: 1.08, pitch: 0.15, loudness: 1.6, gapMs: 200, temperature: 0.1 },
  dramatic: { pace: 0.85, pitch: -0.12, loudness: 1.05, gapMs: 550, temperature: 0.05 },
  sad: { pace: 0.88, pitch: -0.08, loudness: 0.85, gapMs: 450, temperature: -0.05 },
};

export function isDelivery(value: unknown): value is Delivery {
  return typeof value === 'string' && value in DELIVERY_PARAMS;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Voice parameters for one line: the persona's own pace and temperature, shaped by the delivery. */
export function voiceFor(voice: Voice, delivery: Delivery): { pace: number; temperature: number; pitch: number; loudness: number } {
  const d = DELIVERY_PARAMS[delivery];
  return {
    pace: round2(clamp(voice.pace * d.pace, 0.5, 2)),
    temperature: round2(clamp(voice.temperature + d.temperature, 0.01, 1)),
    pitch: round2(clamp(d.pitch, -0.5, 0.5)),
    loudness: round2(clamp(d.loudness, 0.1, 2.5)),
  };
}

/**
 * Gap after a line: the delivery's gap with the pack's rules (a line that continues into the next piece reads as one breath,
 * news is metronomic, ads are tight, Kahani breathes), plus ±30% jitter so the rhythm never sounds mechanical.
 */
export function gapAfter(type: SegmentType, delivery: Delivery, continuesNext: boolean, random = Math.random): number {
  if (continuesNext) return 120;
  let gap = type === 'news' ? 300 : DELIVERY_PARAMS[delivery].gapMs;
  if (type === 'ad_break') gap -= 80;
  if (type === 'kahani') gap += 150;
  if (type !== 'news') gap *= 0.7 + random() * 0.6;
  return Math.max(60, Math.round(gap));
}

// ---- Time -------------------------------------------------------------------------------------

const HOURS_HI = ['बारह', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ', 'दस', 'ग्यारह'];

function dayPartHi(h: number): string {
  if (h >= 4 && h < 12) return 'सुबह';
  if (h >= 12 && h < 16) return 'दोपहर';
  if (h >= 16 && h < 20) return 'शाम';
  return 'रात';
}

/** Colloquial Hindi time, rounded to the quarter hour: "शाम के सवा छह". */
export function hindiTimePhrase(h24: number, m: number): string {
  const hr = (x: number) => HOURS_HI[((x % 12) + 12) % 12];
  const h = h24 % 12;
  let t: string;
  if (m < 8) t = `${hr(h)} बजे`;
  else if (m < 23) t = `सवा ${hr(h)}`;
  else if (m < 38) t = h === 1 ? 'डेढ़' : h === 2 ? 'ढाई' : `साढ़े ${hr(h)}`;
  else if (m < 53) t = `पौने ${hr(h + 1)}`;
  else t = `${hr(h + 1)} बजने वाले`;
  return `${dayPartHi(h24)} के ${t}`;
}

const DAYPART_EN: Record<ListenerContext['daypart'], string> = {
  morning: 'in the morning',
  afternoon: 'in the afternoon',
  evening: 'in the evening',
  night: 'at night',
};

export function localHour(listener: ListenerContext): number {
  return Number(listener.localTime.split(':')[0]) || 0;
}

/** The TIME phrase for prompts: exact colloquial Hindi on the Hindi station, a spoken 12-hour time elsewhere. */
export function timePhrase(station: Station, listener: ListenerContext): string {
  const [h, m] = listener.localTime.split(':').map(Number);
  if (station.language === 'hi-IN') return hindiTimePhrase(h, m);
  const quarter = Math.round(m / 15) * 15;
  const hh = (quarter === 60 ? h + 1 : h) % 24;
  const mm = quarter === 60 ? 0 : quarter;
  return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${DAYPART_EN[listener.daypart]} (say it the colloquial way people tell the time in ${station.languageName}, e.g. quarter past / half past / quarter to)`;
}

const WEEKDAY_HI = ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'];
const WEEKDAY_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function weekdayName(station: Station, weekday?: number): string | undefined {
  if (weekday === undefined) return undefined;
  return station.language === 'hi-IN' ? WEEKDAY_HI[weekday] : WEEKDAY_EN[weekday];
}

const CONDITION_HI: Record<string, string> = {
  'clear sky': 'साफ़ आसमान',
  'partly cloudy': 'हल्के बादल',
  overcast: 'घने बादल',
  foggy: 'कोहरा',
  drizzle: 'हल्की बूँदाबाँदी',
  rain: 'बारिश',
  snow: 'बर्फ़बारी',
  thunderstorm: 'आँधी-तूफ़ान',
  'mild weather': 'सुहाना मौसम',
};

export function conditionFor(station: Station, description: string): string {
  return station.language === 'hi-IN' ? (CONDITION_HI[description] ?? description) : description;
}

// ---- Occasion ---------------------------------------------------------------------------------

/**
 * Sharad Navratri 2026 begins 11 October and Dussehra is 20 October. Published calendars disagree on the
 * Ashtami/Navami dates (a tithi spans two sunrises), so the station never announces a day number.
 */
export function occasionFor(localDate?: string, state?: string): string | null {
  if (!localDate) return null;
  const day = Math.round((Date.parse(localDate) - Date.parse('2026-10-11')) / 86_400_000) + 1;
  if (day >= 1 && day <= 9) {
    let s = 'Navratri (नवरात्रि) is on.';
    if (state === 'Gujarat') s += ' In Gujarat these are garba nights.';
    return `${s} Greet warmly once ("नवरात्रि की शुभकामनाएँ"). Light jokes about garba prep, late nights or garba traffic are fine. No religious commentary. Never say which day of Navratri it is.`;
  }
  if (day === 10) return 'Dussehra (दशहरा). Greet warmly once ("दशहरे की शुभकामनाएँ"). No religious commentary.';
  return null;
}

// ---- Local packs (curated, never model-generated) ---------------------------------------------

export interface LocalPack {
  /** What locals call the city on air, in Devanagari for the Hindi station */
  cityHi: string;
  state: string;
  /** Hindi-station greeting */
  greetHi: string;
  /** Landmarks, areas, foods and vibes in English; the model renders them in the station script */
  places: string[];
  food: string[];
  vibes: string[];
}

export const LOCAL_PACKS: Record<string, LocalPack> = {
  vadodara: {
    cityHi: 'बड़ौदा',
    state: 'Gujarat',
    greetHi: 'केम छो बड़ौदा',
    places: ['Laxmi Vilas Palace', 'Sayaji Baug', 'Sursagar lake', 'Alkapuri', 'Mandvi', 'MS University'],
    food: ['sev usal', 'dabeli'],
    vibes: ['garba all night in Navratri', 'the evening breeze near Sursagar'],
  },
  ahmedabad: {
    cityHi: 'अहमदाबाद',
    state: 'Gujarat',
    greetHi: 'केम छो अमदावाद',
    places: ['Sabarmati Riverfront', 'Kankaria Lake', 'Law Garden', 'Manek Chowk', 'CG Road'],
    food: ['khaman', 'fafda-jalebi'],
    vibes: ['late-night food at Manek Chowk', 'kite-flying terraces'],
  },
  mumbai: {
    cityHi: 'मुंबई',
    state: 'Maharashtra',
    greetHi: 'नमस्ते मुंबई',
    places: ['Marine Drive', 'Gateway of India', 'Juhu Beach', 'Dadar', 'Bandra'],
    food: ['vada pav', 'pav bhaji', 'cutting chai'],
    vibes: ['the local train rush', 'monsoon evenings at Marine Drive'],
  },
  pune: {
    cityHi: 'पुणे',
    state: 'Maharashtra',
    greetHi: 'नमस्ते पुणे',
    places: ['Shaniwar Wada', 'FC Road', 'Koregaon Park', 'Sinhagad'],
    food: ['misal pav', 'Bakarwadi'],
    vibes: ['weekend treks to Sinhagad', 'college crowds on FC Road'],
  },
  delhi: {
    cityHi: 'दिल्ली',
    state: 'Delhi',
    greetHi: 'नमस्ते दिल्ली',
    places: ['India Gate', 'Chandni Chowk', 'Connaught Place', 'Hauz Khas'],
    food: ['chhole bhature', 'parathas'],
    vibes: ['the Metro rush', 'winter evenings with chai'],
  },
  bengaluru: {
    cityHi: 'बेंगलुरु',
    state: 'Karnataka',
    greetHi: 'नमस्ते बेंगलुरु',
    places: ['Lalbagh', 'Cubbon Park', 'MG Road', 'Indiranagar'],
    food: ['filter coffee', 'masala dosa'],
    vibes: ['the famous traffic', 'pleasant weather all year'],
  },
  chennai: {
    cityHi: 'चेन्नई',
    state: 'Tamil Nadu',
    greetHi: 'वणक्कम चेन्नई',
    places: ['Marina Beach', 'Mylapore', 'T. Nagar', 'Besant Nagar'],
    food: ['filter coffee', 'idli-sambar'],
    vibes: ['evening walks on Marina Beach', 'the sea breeze'],
  },
  kolkata: {
    cityHi: 'कोलकाता',
    state: 'West Bengal',
    greetHi: 'नमस्ते कोलकाता',
    places: ['Victoria Memorial', 'Howrah Bridge', 'Park Street', 'College Street'],
    food: ['rosogolla', 'puchka', 'kathi roll'],
    vibes: ['adda over tea', 'the yellow taxis'],
  },
};

const ALIASES: Record<string, string> = { baroda: 'vadodara', bombay: 'mumbai', 'new delhi': 'delhi', bangalore: 'bengaluru', madras: 'chennai', calcutta: 'kolkata', poona: 'pune' };

export function localPackFor(city?: string): LocalPack | undefined {
  const key = city?.trim().toLowerCase();
  if (!key) return undefined;
  return LOCAL_PACKS[ALIASES[key] ?? key];
}

export function localPackLine(pack: LocalPack | undefined): string {
  if (!pack) return 'none, so mention no landmarks, foods or areas';
  return `places: ${pack.places.join(', ')}; food: ${pack.food.join(', ')}; vibes: ${pack.vibes.join(', ')}. Use at most ONE item per segment.`;
}

// ---- RJ bible ---------------------------------------------------------------------------------

export interface RjBit {
  id: string;
  text: string;
}

export interface RjBible {
  /** Cast-sheet block for the rj role */
  block: string;
  catchphrase: string;
  bits: RjBit[];
}

const HI_BIBLES: Record<string, RjBible> = {
  सनी: {
    block:
      'rj — सनी, male, late 20s. Grew up in the city and calls it by its local name. Chai addict. Teases himself first, never the listener.',
    catchphrase: 'तरंग पे रहिए, तरंग में रहिए!',
    bits: [
      { id: 'scooter', text: 'his scooter "बिजली" never starts on the first kick' },
      { id: 'sawaal', text: '"सनी का सवाल": one silly either/or question for listeners' },
      { id: 'uncle', text: '"वर्मा अंकल का ज्ञान": the neighbour with an opinion on everything' },
    ],
  },
  रितु: {
    block: 'rj — रितु, female, early 30s. Lively, treats lunch as a sacred event, gossips about life, never about people.',
    catchphrase: 'पेट भरा, मूड हरा!',
    bits: [
      { id: 'tiffin', text: "what's in today's imaginary tiffin" },
      { id: 'nap', text: 'the 3 PM office nap struggle' },
    ],
  },
  रतन: {
    block:
      'rj — रतन, male, 40s, night show. Slow, warm, older-brother vibe. Small observations about the city at night. Never shouts. Delivery mostly warm or normal.',
    catchphrase: 'रात लंबी है, बातें बाकी हैं।',
    bits: [
      { id: 'chaiwala', text: 'the last chai stall still open' },
      { id: 'stars', text: '"आज आसमान में कितने तारे?"' },
    ],
  },
};

const STATION_BIBLES: Partial<Record<StationId, RjBible>> = {
  mr: {
    block: 'rj — इशिता, female, late 20s. Pune-Mumbai energy, quick wit, loves misal and monsoon treks. Teases herself first, never the listener.',
    catchphrase: 'तरंगवर राहा, मस्त राहा!',
    bits: [
      { id: 'misal', text: 'her quest for the spiciest misal in town' },
      { id: 'aai', text: "Aai's phone calls that always come at the wrong moment" },
    ],
  },
  ta: {
    block: 'rj — கோகுல், male, late 20s. Chennai FM energy, filter-coffee addict, cricket-mad. Teases himself first, never the listener.',
    catchphrase: 'தரங்கோட இருங்க, சந்தோஷமா இருங்க!',
    bits: [
      { id: 'coffee', text: 'his perfect filter-coffee ritual that always goes wrong' },
      { id: 'cricket', text: 'his gully-cricket team that never wins' },
    ],
  },
  bn: {
    block: 'rj — অর্ণব, male, early 30s. Kolkata adda energy, loves tea, fish and debating everything. Teases himself first, never the listener.',
    catchphrase: 'তরঙ্গে থাকুন, ভালো থাকুন!',
    bits: [
      { id: 'adda', text: 'the never-ending neighbourhood adda' },
      { id: 'mishti', text: 'his failed diet versus mishti' },
    ],
  },
  gu: {
    block: 'rj — પૂજા, female, late 20s. Ahmedabad-Vadodara warmth, loves farsan and garba. Teases herself first, never the listener.',
    catchphrase: 'તરંગ પર રહો, મોજમાં રહો!',
    bits: [
      { id: 'farsan', text: 'the daily farsan dilemma: khaman or fafda?' },
      { id: 'garba', text: 'her garba steps that never match the circle' },
    ],
  },
};

/** The RJ bible for the station and, on the Hindi station, the daypart show's RJ. */
export function rjBibleFor(station: Station, rjName: string): RjBible | undefined {
  if (station.id === 'hi') return HI_BIBLES[rjName];
  return STATION_BIBLES[station.id];
}

/** Defaults when the client does not send producer settings. */
export function defaultProducer(random = Math.random): { firstLink: boolean; greetListener: boolean; useCatchphrase: boolean; bit: string } {
  return { firstLink: false, greetListener: false, useCatchphrase: random() < 0.3, bit: random() < 0.35 ? 'any' : 'none' };
}

/** Resolves the producer's bit id ("any" picks one) against the RJ's bits. */
export function resolveBit(bible: RjBible | undefined, bit: string, random = Math.random): RjBit | undefined {
  if (!bible || !bit || bit === 'none') return undefined;
  if (bit === 'any') return bible.bits[Math.floor(random() * bible.bits.length)];
  return bible.bits.find((b) => b.id === bit);
}

export const NEWSREADER_BLOCK = 'newsreader — crisp, neutral, never jokes, never reacts to the news.';


// ---- Run-on guard ------------------------------------------------------------------------------

/** Spoken letters per second at pace 1.0, counting base letters only (combining marks removed). */
const LETTERS_PER_SECOND = 10.5;

/**
 * Most PCM bytes a line may stream. Bulbul occasionally runs a clip on to twice its natural length;
 * past twice the expected duration plus a margin, the rest of the stream is dropped.
 */
export function maxPcmBytes(text: string, pace: number, sampleRate = 24000): number {
  const letters = text.replace(/[\p{M}\s]/gu, '').length;
  const seconds = (letters / LETTERS_PER_SECOND / Math.max(0.5, pace)) * 2 + 1.5;
  return Math.ceil(Math.max(4, seconds) * sampleRate * 2);
}

/** Passes PCM through until `maxBytes`, then ends the stream on a whole sample. */
export function capStream(body: ReadableStream<Uint8Array>, maxBytes: number): ReadableStream<Uint8Array> {
  let sent = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (sent >= maxBytes) return;
        const room = maxBytes - sent;
        const out = chunk.byteLength <= room ? chunk : chunk.subarray(0, room - (room % 2));
        sent += out.byteLength;
        if (out.byteLength) controller.enqueue(out);
        if (sent >= maxBytes) controller.terminate();
      },
    }),
  );
}
