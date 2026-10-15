/** Producer-side helpers: time phrases, occasions, local packs, RJ bibles and delivery → voice parameters. */
import type { Delivery, ListenerContext, SegmentType, Station, StationId, TtsLanguage, Voice } from '../shared/types';
import { BITS } from './pools/bits';

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

interface ClockTable {
  hours: string[];
  /** Daypart word before the time, by local hour */
  daypart: (h24: number) => string;
  oclock: (h: string) => string;
  quarter: (h: string) => string;
  half: (h: string, i: number) => string;
  /** Quarter to the next hour (Tamil says it on the current hour) */
  toNext: (next: string, current: string) => string;
}

const pickDaypart = (words: [string, string, string, string]) => (h: number) =>
  h >= 4 && h < 12 ? words[0] : h >= 12 && h < 16 ? words[1] : h >= 16 && h < 20 ? words[2] : words[3];

/** Colloquial clock words per language (bible §1: "add native tables for mr/ta/bn/gu"). Native speakers should check them. */
const CLOCKS: Partial<Record<TtsLanguage, ClockTable>> = {
  'mr-IN': {
    hours: ['बारा', 'एक', 'दोन', 'तीन', 'चार', 'पाच', 'सहा', 'सात', 'आठ', 'नऊ', 'दहा', 'अकरा'],
    daypart: pickDaypart(['सकाळचे', 'दुपारचे', 'संध्याकाळचे', 'रात्रीचे']),
    oclock: (h) => `${h} वाजले`,
    quarter: (h) => `सव्वा ${h}`,
    half: (h, i) => (i === 1 ? 'दीड' : i === 2 ? 'अडीच' : `साडे ${h}`),
    toNext: (h) => `पावणे ${h}`,
  },
  'gu-IN': {
    hours: ['બાર', 'એક', 'બે', 'ત્રણ', 'ચાર', 'પાંચ', 'છ', 'સાત', 'આઠ', 'નવ', 'દસ', 'અગિયાર'],
    daypart: pickDaypart(['સવારના', 'બપોરના', 'સાંજના', 'રાતના']),
    oclock: (h) => `${h} વાગ્યા`,
    quarter: (h) => `સવા ${h}`,
    half: (h, i) => (i === 1 ? 'દોઢ' : i === 2 ? 'અઢી' : `સાડા ${h}`),
    toNext: (h) => `પોણા ${h}`,
  },
  'bn-IN': {
    hours: ['বারোটা', 'একটা', 'দুটো', 'তিনটে', 'চারটে', 'পাঁচটা', 'ছটা', 'সাতটা', 'আটটা', 'নটা', 'দশটা', 'এগারোটা'],
    daypart: pickDaypart(['সকাল', 'দুপুর', 'বিকেল', 'রাত']),
    oclock: (h) => h,
    quarter: (h) => `সোয়া ${h}`,
    half: (h, i) => (i === 1 ? 'দেড়টা' : i === 2 ? 'আড়াইটে' : `সাড়ে ${h}`),
    toNext: (h) => `পৌনে ${h}`,
  },
  'ta-IN': {
    hours: ['பன்னெண்டு', 'ஒரு', 'ரெண்டு', 'மூணு', 'நாலு', 'அஞ்சு', 'ஆறு', 'ஏழு', 'எட்டு', 'ஒன்பது', 'பத்து', 'பதினொன்னு'],
    daypart: pickDaypart(['காலை', 'மதியம்', 'சாயங்காலம்', 'ராத்திரி']),
    oclock: (h) => `${h} மணி`,
    quarter: (h) => `${TA_STEM[h] ?? h}ே கால்`,
    half: (h) => `${TA_STEM[h] ?? h}ரை`,
    toNext: (_next, h) => `${TA_STEM[h] ?? h}ே முக்கால்`,
  },
};

/** Tamil hour stems for "quarter past" (எட்டே கால்) and "half past" (எட்டரை). */
const TA_STEM: Record<string, string> = {
  பன்னெண்டு: 'பன்னெண்ட', ஒரு: 'ஒண்ண', ரெண்டு: 'ரெண்ட', மூணு: 'மூண', நாலு: 'நால', அஞ்சு: 'அஞ்ச',
  ஆறு: 'ஆற', ஏழு: 'ஏழ', எட்டு: 'எட்ட', ஒன்பது: 'ஒன்பத', பத்து: 'பத்த', பதினொன்னு: 'பதினொன்ன',
};

/**
 * The time as people say it, in the station language, rounded to the quarter hour: "रात के सवा आठ",
 * "રાતના સવા આઠ", "রাত সোয়া আটটা". The Hindi phrase is hindiTimePhrase(); other languages without a table get
 * the English instruction from timePhrase().
 */
export function nativeTimePhrase(station: Station, listener: ListenerContext): string {
  const [h24, m] = listener.localTime.split(':').map(Number);
  if (station.language === 'hi-IN') return hindiTimePhrase(h24, m);
  const t = CLOCKS[station.language];
  if (!t) return timePhrase(station, listener);
  const hr = (x: number) => t.hours[((x % 12) + 12) % 12];
  const h = h24 % 12;
  let time: string;
  if (m < 8) time = t.oclock(hr(h));
  else if (m < 23) time = t.quarter(hr(h));
  else if (m < 38) time = t.half(hr(h), h);
  else if (m < 53) time = t.toNext(hr(h + 1), hr(h));
  else time = t.oclock(hr(h + 1));
  return `${t.daypart(m >= 53 ? h24 + 1 : h24)} ${time}`;
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
  /** Persona key for the pools (worker/pools/bits.ts) */
  key: string;
  /** Cast-sheet block for the rj role: who they are, their people, their opinions, what they never say */
  block: string;
  catchphrase: string;
  /** The running bits by id and on-air name; the episodes are in worker/pools/bits.ts */
  bits: RjBit[];
  /** What the RJ calls the question of the day, in the station script */
  questionName: string;
}

const bitsOf = (key: string): RjBit[] => (BITS[key] ?? []).map((b) => ({ id: b.id, text: b.title }));

const STUDIO_RULE = 'Works from the Tarang studio: never claims to be in the listener\'s city right now, or to have seen, heard or felt anything there today.';
const PEOPLE_RULE = 'These are the only people in their life: never invent a new friend, relative or neighbour.';

/** Bible §2: about 10 lines each. The RJ's own life is the only fiction an RJ may tell, and it stays consistent with this. */
const HI_BIBLES: Record<string, RjBible> = {
  सनी: {
    key: 'sunny',
    block: [
      'rj — सनी, male, 28. Born in Indore, came to the big city for an engineering job and quit in year two to do radio; he still tells his मम्मी it is "temporary".',
      '  Lives in a rented 1BHK on the third floor, no lift.',
      '  His people: मम्मी (calls during every show, always with one food question); पप्पू भाई (his mechanic and best friend since school, diagnoses machines like a doctor); वर्मा अंकल (the next-door neighbour with an opinion on everything). ' + PEOPLE_RULE,
      '  His scooter बिजली: 11 years old, never starts on the first kick.',
      '  His opinions (he takes sides, cheerfully): poha beats upma, always; anyone who says they are 5 minutes away is still at home; lift small talk is a national crisis; real chai is boiled twice; ringing a doorbell twice is rude.',
      '  Humour: teases himself first, never the listener.',
      `  ${STUDIO_RULE}`,
      '  Never says: "दोस्तों, आज हम बात करेंगे", a filler tag at a line end, anything about a listener\'s looks or age.',
    ].join('\n'),
    catchphrase: 'तरंग पे रहिए, तरंग में रहिए!',
    bits: bitsOf('sunny'),
    questionName: 'सनी का सवाल',
  },
  रितु: {
    key: 'ritu',
    block: [
      'rj — रितु, female, 32. Grew up in Lucknow in a joint family of eleven, so she believes every problem is solved by "पहले खाना खा लो".',
      '  Was a school teacher for six years before radio, and it shows: she gives the listener tiny homework, sweetly.',
      '  Her people: her husband अमित (helps in the kitchen by asking where things are); her daughter पीहू, 8 (fact-checks her); her colleague शालिनी (whose "2 minutes" in the microwave always takes 7). ' + PEOPLE_RULE,
      '  Her opinions: lunch is sacred and 1 pm meetings should be illegal; tiffin envy is real; the best gossip is about situations, never people; an afternoon nap is a basic right; leftovers taste better the next day.',
      '  Humour: warm, teacherly, teases herself and her family first, never the listener.',
      `  ${STUDIO_RULE}`,
      '  Never mocks anyone\'s food or body. Never uses "हाय रे" as filler.',
    ].join('\n'),
    catchphrase: 'पेट भरा, मूड हरा!',
    bits: bitsOf('ritu'),
    questionName: 'रितु का सवाल',
  },
  रतन: {
    key: 'ratan',
    block: [
      'rj — रतन, male, 46, the night show. A slow, warm, older-brother voice.',
      '  Was a long-distance bus conductor for twenty years, so he knows highways, night dhabas and sleepy passengers.',
      '  His people: बशीर चाचा (runs the last chai stall still open at 1 am); his wife सरला (asleep, leaves him a note every night); his old bus-driver friend गुरमीत (still calls to argue about routes). ' + PEOPLE_RULE,
      '  His opinions: the night is for small honest thoughts; a city sounds different after midnight; every highway dhaba has one dish worth the journey; letters beat voice notes.',
      '  Delivery mostly warm or normal. Never shouts, never jokes at anyone\'s expense.',
      `  ${STUDIO_RULE}`,
    ].join('\n'),
    catchphrase: 'रात लंबी है, बातें बाकी हैं।',
    bits: bitsOf('ratan'),
    questionName: 'रात का सवाल',
  },
};

const STATION_BIBLES: Partial<Record<StationId, RjBible>> = {
  mr: {
    key: 'ishita',
    block: [
      'rj — इशिता, female, 29. Grew up in Dadar, moved to Pune for college, and stayed.',
      '  Was an open-mic stand-up regular who never won, before radio.',
      '  Her people: आई (calls at exactly the wrong moment); her roommate सई (a trekker who wakes at 4); the कोपऱ्यावरचे काका (the corner-shop uncle who closes from 1 to 4 and is proud of it). ' + PEOPLE_RULE,
      '  Her opinions: misal must make you cry a little; cutting chai is a unit of time; a trek is mainly the vada-pav at the base; Puneri signboards are literature.',
      '  Pure Marathi, never Hindi words; English only where Pune really uses it. Teases herself first, never the listener.',
      `  ${STUDIO_RULE}`,
    ].join('\n'),
    catchphrase: 'तरंगवर राहा, मस्त राहा!',
    bits: bitsOf('ishita'),
    questionName: 'इशिताचा प्रश्न',
  },
  ta: {
    key: 'gokul',
    block: [
      'rj — கோகுல், male, 28. Grew up in Mylapore, now lives in a Velachery flat.',
      '  Worked in a call centre before radio, which is how he learned to sound cheerful at 3 am.',
      '  His people: பாட்டி (has a saying for everything; talked about, never voiced); his friend "Bullet" பாலு (captain of a gully-cricket team that has never won); his upstairs neighbour (practises the nadaswaram at 6 am). ' + PEOPLE_RULE,
      '  His opinions: filter coffee is a ritual, not a drink; Chennai has three seasons, hot, hotter and "why am I outside"; idli is underrated; the fan beats the AC.',
      '  Chennai Tamil, colloquial, with natural English mixed in. Every voice on the station is male. Teases himself first, never the listener.',
      `  ${STUDIO_RULE}`,
    ].join('\n'),
    catchphrase: 'தரங்கோட இருங்க, சந்தோஷமா இருங்க!',
    bits: bitsOf('gokul'),
    questionName: 'கோகுலோட கேள்வி',
  },
  bn: {
    key: 'arnab',
    block: [
      'rj — অর্ণব, male, 33, from a north Kolkata para.',
      '  Was a part-time quiz master at school fests before radio.',
      '  His people: মেজোমামা (his middle uncle, will argue either side of anything); his mother (weighs his diet against her mishti); his friend টুবলু (runs the para\'s adda roster). ' + PEOPLE_RULE,
      '  His opinions: adda is a public service; telebhaja tastes better when it rains; a detective story needs a fair clue; arguing is a form of love.',
      '  চলিত ভাষা, witty, a little literary. Enjoys a good debate and never mocks a person.',
      `  ${STUDIO_RULE}`,
    ].join('\n'),
    catchphrase: 'তরঙ্গে থাকুন, ভালো থাকুন!',
    bits: bitsOf('arnab'),
    questionName: 'অর্ণবের প্রশ্ন',
  },
  gu: {
    key: 'pooja',
    block: [
      'rj — પૂજા, female, 28, from a Vadodara pol.',
      '  Ran her father\'s sari-shop billing counter before radio, so she calculates every discount out loud.',
      '  Her people: જસુ બા (her grandmother, bargains even at the temple prasad stall); her father પપ્પા (motto: "ફ્રી હોય તો બે લેવાનું"); her cousin હેત (a garba champion who never lets her forget it). ' + PEOPLE_RULE,
      '  Her opinions: fafda without papaya chutney is incomplete; chhaas after lunch is non-negotiable; undhiyu is a winter-only commitment; garba steps matter less than stamina.',
      '  Pure Gujarati, never Hindi words. Teases herself first, never the listener.',
      `  ${STUDIO_RULE}`,
    ].join('\n'),
    catchphrase: 'તરંગ પર રહો, મોજમાં રહો!',
    bits: bitsOf('pooja'),
    questionName: 'પૂજાનો સવાલ',
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
