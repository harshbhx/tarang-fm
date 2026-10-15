/** Shared prompt pieces: types, language rules, the system preamble, the context block and the subtitle rule. */
import type { SegmentRequest } from '../../shared/schemas';
import { showAt } from '../../shared/stations';
import type { Daypart, ListenerContext, Role, SegmentType, Station, TtsLanguage, Voice } from '../../shared/types';
import {
  conditionFor,
  localHour,
  localPackFor,
  localPackLine,
  NEWSREADER_BLOCK,
  occasionFor,
  rjBibleFor,
  timePhrase,
  weekdayName,
} from '../show';

export type LlmSegmentType = Exclude<SegmentType, 'station_id'>;

export interface LlmPlan {
  temperature: number;
  maxTokens: number;
  reasoningEffort: 'low' | null;
  timeoutMs: number;
}

/** Token budget for a plan: subtitles add an English string to every line, so they get room for it. */
export function maxTokensFor(plan: LlmPlan, subtitles: boolean): number {
  return subtitles ? Math.round(plan.maxTokens * 1.4) : plan.maxTokens;
}

/** English subtitles are written with the script only when the listener asked, and never for an English station. */
export function subtitlesOn(station: Station, requested: boolean | undefined): boolean {
  return requested === true && station.language !== 'en-IN';
}

/** A line's English subtitle: a plain string like the rest (no length limit, see PLAN_FIELDS in ./index), right after the line it subtitles. */
export const EN_FIELD = { en: { type: 'string' } };

interface LanguageStyle {
  name: string;
  script: string;
  register: string;
  punctuation: string;
  gender?: string;
}

export const LANGUAGE_STYLE: Partial<Record<TtsLanguage, LanguageStyle>> = {
  'hi-IN': {
    name: 'Hindi',
    script: 'Devanagari',
    register:
      'Natural spoken Hindi, the way a popular Hindi FM RJ really talks: warm, quick and conversational. Use an English word only where people genuinely say it in Hindi (FM, traffic, weekend, breaking news), written in Latin script; every Hindi word must be in Devanagari.',
    punctuation: 'End every sentence with । or ! or ? (never a full stop after Hindi words).',
    gender:
      'Hindi verbs agree with the speaker\'s gender: a masculine speaker says "मैं आ रहा हूँ / मैं थक गया", a feminine speaker says "मैं आ रही हूँ / मैं थक गई". Get this right in every line.',
  },
  'ta-IN': {
    name: 'Tamil',
    script: 'Tamil',
    register:
      'Colloquial spoken Tamil like a popular Chennai FM RJ (பேச்சுத் தமிழ், not formal written Tamil), lively and friendly, with correct grammar. A few common English words (FM, phone, traffic, weekend) may stay in Latin script, but every Tamil word must be in Tamil script.',
    punctuation: 'End every sentence with . or ! or ? (never use the danda ।).',
    gender: 'Every voice on this station is male: every speaker and character is a man or a boy, so use masculine forms (for example வந்தான், சொன்னான், அவன்).',
  },
  'bn-IN': {
    name: 'Bangla',
    script: 'Bengali',
    register:
      'Natural, grammatical spoken Bangla as on a Kolkata FM station (চলিত ভাষা, never সাধু ভাষা), witty, with adda energy. Use only real, common Bangla words. Common English words (FM, phone, traffic, weekend) may stay in Latin script, but every Bangla word must be in Bengali script.',
    punctuation: 'End every sentence with । or ! or ?.',
  },
  'mr-IN': {
    name: 'Marathi',
    script: 'Devanagari',
    register:
      'Natural spoken Marathi like a popular Pune or Mumbai FM RJ: warm, witty and conversational (बोलीभाषा, not stiff written Marathi), with correct Marathi grammar and vocabulary, never Hindi words. Common English words (FM, traffic, weekend) may stay in Latin script, but every Marathi word must be in Devanagari.',
    punctuation: 'End every sentence with . or ! or ? (Marathi uses the full stop, not the danda).',
    gender:
      "Marathi verbs agree with the speaker's gender: a masculine speaker says 'मी आलो / मी दमलो', a feminine speaker says 'मी आले / मी दमले'. Get this right in every line.",
  },
  'gu-IN': {
    name: 'Gujarati',
    script: 'Gujarati',
    register:
      'Natural spoken Gujarati like a popular Ahmedabad or Vadodara FM RJ: warm, playful and full of Gujarati charm (garba, farsan, chai), with correct Gujarati grammar and vocabulary, never Hindi words. Common English words (FM, traffic, weekend) may stay in Latin script, but every Gujarati word must be in Gujarati script.',
    punctuation: 'End every sentence with . or ! or ? (Gujarati uses the full stop, not the danda).',
    gender:
      "Gujarati verbs agree with the speaker's gender: a masculine speaker says 'હું આવ્યો / હું થાકી ગયો', a feminine speaker says 'હું આવી / હું થાકી ગઈ'. Get this right in every line.",
  },
};

const DAYPART_WORDS: Partial<Record<TtsLanguage, Record<Daypart, string>>> = {
  'hi-IN': { morning: 'सुबह', afternoon: 'दोपहर', evening: 'शाम', night: 'रात' },
  'ta-IN': { morning: 'காலை', afternoon: 'மதியம்', evening: 'மாலை', night: 'இரவு' },
  'bn-IN': { morning: 'সকাল', afternoon: 'দুপুর', evening: 'সন্ধে', night: 'রাত' },
  'mr-IN': { morning: 'सकाळ', afternoon: 'दुपार', evening: 'संध्याकाळ', night: 'रात्र' },
  'gu-IN': { morning: 'સવાર', afternoon: 'બપોર', evening: 'સાંજ', night: 'રાત' },
};

/** RJ names in native script, keyed by the persona's first name. */
const NATIVE_NAMES: Record<string, Partial<Record<TtsLanguage, string>>> = {
  Sunny: { 'hi-IN': 'सनी' },
  Gokul: { 'ta-IN': 'கோகுல்' },
  Arnab: { 'bn-IN': 'অর্ণব' },
  Ishita: { 'mr-IN': 'इशिता' },
  Pooja: { 'gu-IN': 'પૂજા' },
};

function voiceName(voice: Voice): string {
  return voice.label.split('·')[0].trim();
}

/** The RJ on air at this listener's local hour: the daypart show's RJ on the Hindi station, else the cast RJ. */
export function rjOnAir(station: Station, listener?: ListenerContext): { name: string; voice: Voice; showName?: string } {
  const show = listener ? showAt(station, localHour(listener)) : undefined;
  if (show) return { name: show.rjName, voice: show.rj, showName: show.name };
  const name = voiceName(station.cast.rj);
  return { name: NATIVE_NAMES[name]?.[station.language] ?? name, voice: station.cast.rj };
}

export function rjName(station: Station, listener?: ListenerContext): string {
  return rjOnAir(station, listener).name;
}

/** On-air brand as the jingle says it, e.g. "तरंग FM 91.1". */
export function onAirName(station: Station): string {
  const fromJingle = /(\S+)\s+FM\s+\d+(?:\.\d+)?/u.exec(station.stationIdText)?.[0];
  return fromJingle ?? `${station.nativeName.split(' ')[0]} FM ${station.frequency}`;
}

export function languageName(station: Station): string {
  return LANGUAGE_STYLE[station.language]?.name ?? station.languageName;
}

/** "21:40" → "9:40 at night (रात)", so the model does not read 24-hour times aloud. */
export function spokenTime(listener: ListenerContext, language?: TtsLanguage): string {
  const [h, m] = listener.localTime.split(':').map(Number);
  const hour12 = h % 12 || 12;
  const part = { morning: 'in the morning', afternoon: 'in the afternoon', evening: 'in the evening', night: 'at night' }[listener.daypart];
  const native = language ? DAYPART_WORDS[language]?.[listener.daypart] : undefined;
  return `${hour12}:${String(m).padStart(2, '0')} ${part}${native ? ` (${native})` : ''}`;
}

const NEWSREADER_NAMES: Partial<Record<string, string>> = { hi: 'सिमरन', mr: 'नेहा', ta: 'விஜய்', bn: 'রূপা', gu: 'નીતા' };

export function newsreaderName(station: Station): string {
  return NEWSREADER_NAMES[station.id] ?? voiceName(station.cast.news);
}

export function genderWord(voice: Voice): string {
  return voice.gender === 'feminine' ? 'female' : 'male';
}

export function personNoun(role: Role, voice: Voice): string {
  const f = voice.gender === 'feminine';
  if (role === 'char_kid') return f ? 'a girl' : 'a boy';
  return f ? 'a woman' : 'a man';
}

export function cityFor(station: Station, listener: ListenerContext): string | undefined {
  const pack = localPackFor(listener.city);
  if (station.language === 'hi-IN' && pack) return pack.cityHi;
  return listener.city;
}

/** The pack's cast sheet: the RJ bible for the RJ on air, then the other roles with their genders. */
function castSheet(station: Station, roles: Role[], listener: ListenerContext, cast?: Partial<Record<Role, Voice>>): string {
  const rows: string[] = [];
  for (const role of roles) {
    if (role === 'rj') {
      const rj = rjOnAir(station, listener);
      const bible = rjBibleFor(station, rj.name);
      if (bible) {
        rows.push(`RJ BIBLE (the RJ's own life is fiction, and the only fiction an RJ may tell; stay consistent with it):\n${bible.block}`);
        rows.push('  Greeting: only in the opener, built on the line the task gives.');
        rows.push('  Catchphrase: only when the task says CATCHPHRASE yes.');
      } else {
        rows.push(`rj — ${rj.name}, ${genderWord(rj.voice)}. A warm, quick-witted city RJ who works from the Tarang studio.`);
      }
      continue;
    }
    const voice = cast?.[role] ?? station.cast[role];
    if (role === 'news') rows.push(`news — ${newsreaderName(station)}, ${genderWord(voice)}. ${NEWSREADER_BLOCK.replace('newsreader — ', '')}`);
    else if (role === 'ad_announcer') rows.push(`ad_announcer — the announcer, ${genderWord(voice)}.`);
    else if (role === 'ad_customer') rows.push(`ad_customer — the customer (also the happy customer), ${personNoun(role, voice)}.`);
    else if (role === 'narrator') rows.push(`narrator — the story narrator, ${genderWord(voice)}.`);
    else rows.push(`${role} — ${personNoun(role, voice)}.`);
  }
  return `Role values to use (ONLY these): ${roles.join(', ')}.\n${rows.join('\n')}`;
}

// ---- §3 systemPreamble (v3: truth first, fillers on a budget, no quoted example lines) -------------------------

interface PreambleLocale {
  /** How to address the one listener */
  address: string;
  /** Spoken fillers counted by the budget (bible §3.1) */
  fillers: string[];
  /** About one English word in this many */
  englishEvery: number;
  /** Phrases that sound like AI or YouTube, in the language */
  banned: string[];
  /** Textbook words to avoid */
  stiff?: string;
}

const PREAMBLE_LOCALE: Partial<Record<TtsLanguage, PreambleLocale>> = {
  'hi-IN': {
    address: '"आप" with plural verbs ("आप सुन रहे हैं"); never "प्रिय श्रोताओं"',
    fillers: ['अरे', 'यार', 'वैसे', 'सच में', 'बिल्कुल', 'मतलब', 'हाँ जी', 'उफ़्फ़'],
    englishEvery: 8,
    banned: ['चलिए जानते हैं', 'आइए नज़र डालते हैं', 'उम्मीद है आपको पसंद आया होगा', 'इस रोमांचक सफ़र में', 'आज के डिजिटल युग में', 'दोस्तों, आज हम बात करेंगे'],
    stiff: 'अतः, किंतु, तत्पश्चात, उपरोक्त, निम्नलिखित, हेतु',
  },
  'mr-IN': {
    address: '"तुम्ही" with plural verbs; never "प्रिय श्रोतेहो"',
    fillers: ['अरे', 'बरं', 'म्हणजे', 'खरंच'],
    englishEvery: 10,
    banned: ['चला जाणून घेऊया', 'चला नजर टाकूया', 'आशा आहे तुम्हाला आवडलं असेल', 'या रोमांचक प्रवासात', 'आजच्या डिजिटल युगात', 'मित्रांनो, आज आपण बोलणार आहोत'],
  },
  'ta-IN': {
    address: '"நீங்க" (colloquial, respectful); never "அன்பார்ந்த நேயர்களே"',
    fillers: ['அட', 'சரி', 'ஆமா', 'அப்புறம்'],
    englishEvery: 5,
    banned: ['வாங்க தெரிஞ்சுக்கலாம்', 'ஒரு பார்வை பார்ப்போம்', 'உங்களுக்கு பிடிச்சிருக்கும்னு நம்பறேன்', 'இந்த அற்புதமான பயணத்துல', 'இன்றைய டிஜிட்டல் யுகத்தில்', 'நண்பர்களே, இன்னைக்கு நாம பேசப்போறது'],
  },
  'bn-IN': {
    address: '"আপনি"; never "প্রিয় শ্রোতাবন্ধুরা"',
    fillers: ['আরে', 'আসলে', 'মানে', 'সত্যি'],
    englishEvery: 8,
    banned: ['চলুন জেনে নেওয়া যাক', 'চলুন একবার চোখ বুলিয়ে নিই', 'আশা করি আপনাদের ভালো লেগেছে', 'এই রোমাঞ্চকর যাত্রায়', 'আজকের ডিজিটাল যুগে', 'বন্ধুরা, আজ আমরা কথা বলব'],
  },
  'gu-IN': {
    address: '"તમે" with plural verbs; never "પ્રિય શ્રોતાઓ"',
    fillers: ['અરે', 'હા', 'એટલે', 'ખરેખર'],
    englishEvery: 10,
    banned: ['ચાલો જાણીએ', 'ચાલો નજર કરીએ', 'આશા છે તમને ગમ્યું હશે', 'આ રોમાંચક સફરમાં', 'આજના ડિજિટલ યુગમાં', 'મિત્રો, આજે આપણે વાત કરીશું'],
  },
};

/** Preamble v3 (prompt pack §2), localized per station. Shared by RJ links, ads and Kahani parts. */
function preambleV3(station: Station, castSheetText: string): string {
  const lang = languageName(station);
  const style = LANGUAGE_STYLE[station.language];
  const loc = PREAMBLE_LOCALE[station.language];
  const hindi = station.language === 'hi-IN';
  const fillers = loc ? loc.fillers.join(', ') : 'the spoken fillers of the language';
  const banned = loc ? loc.banned.map((b) => `"${b}"`).join(', ') : `the ${lang} versions of "let's find out", "let's take a look", "hope you liked it", "on this exciting journey", "in today's digital age"`;
  return `You write live on-air scripts for ${onAirName(station)}, a ${lang} city talk station. Every word you write is spoken aloud by a voice actor to one listener. Write for the ear.

## The station
- On air it is always "${onAirName(station)}". Jingle: "${station.stationIdText}".
- A talk station: talk, news, parody ads and the Kahani serial. There is no music: never mention songs, playlists or "the next song". A dedication becomes a shout-out.
- It sounds like a real Indian city FM station in 2026: quick, warm, a little cheeky, never cringe, never preachy.

## The job
Each task says what the listener walks away with: one point, one punchline or one story beat. Deliver it early and specifically, then stop. A line that doesn't serve it is cut.

## Truth (most important)
- You know only what this message tells you. Real-world facts (the city, news, festivals, weather, dates, what aired, what comes next) come only from the blocks in the task. If a block doesn't say it, it didn't happen, and you don't mention it.
- Fiction is allowed only inside fiction: the RJ's own life as the RJ BIBLE describes it, an ad's invented product, a Kahani.
- Never describe a segment whose content you were not given. Never claim listeners called, messaged or voted unless the task's STUDIO CALLS say so.

## How it sounds
1. Talk to one person: ${loc?.address ?? `the respectful everyday "you" of ${lang}`}.
2. Spoken ${lang}, not textbook ${lang}. ${style?.register ?? ''}${loc?.stiff ? ` Avoid ${loc.stiff}.` : ''}
3. Fillers (${fillers}) are a budget, not a vocabulary: at most 2 in the whole script. Line 1 never starts with one. No line ends with a filler tag.
4. Rhythm: at least one short line (under 6 words) and at least one longer line (14-22 words). Never three lines of similar length in a row. Two lines never start with the same word.
5. One idea per line. Concrete beats general: a number, a name, an object, a time of day, but only ones the task gave you or the RJ's own fiction.
6. Mix English the way a city RJ does: everyday English nouns in Latin script, about one every ${loc?.englishEvery ?? 8} words. The sentence stays ${lang}. No full English sentence, except an ad's tagline or its fine-print line.
7. Never explain a joke. Never announce one.
8. Never write: ${banned}.

## Script rules (the voice breaks otherwise)
- ${lang} in ${style?.script ?? 'its own'} script, English in Latin script. Never romanized ${lang}${hindi ? ' ("aap", "kya", "yaar" are errors)' : ''}.
- ${style?.punctuation ?? 'End sentences with normal sentence punctuation.'} Use "," for a short breath, "…" at most once. No "—".
- Numbers, prices and dates as digits. A time of day only as the task's TIME, copied exactly.
- Each line is 8-150 characters, with at most 2 sentences.
- "text" holds only the words that are spoken. Never put role names, the word "delivery", stage directions, brackets, asterisks, emojis, hashtags or sound-effect tags inside "text". Acting goes in "delivery". A sound is said in words by a speaker.
- The listener's name: write the token {name} only where the task says, and then exactly once. Never write their name yourself.

## Grammar
- ${style?.gender ?? 'Verb forms follow the speaker in the cast sheet.'}
- When talking about someone else, follow that person's gender.
- Address the listener with the standard respectful form. Never guess the listener's gender.

## Content
- Family-friendly, always. A kid might be listening.
- No real brands, celebrities, politicians, businesses, films or slogans. Invent names.
- Tease situations (traffic, Mondays, exams, a mother's phone call), never groups of people. No jokes about religion, caste, region, gender, body, age or accent.
- No opinions on politics or religion. Festivals: customs, food and greetings only.

## Delivery
Every line has "delivery": one of normal | warm | excited | fast | hushed | shout | dramatic | sad. Pick what an actor would do. Most lines are "normal". At most 2 "shout".

## Cast sheet
${castSheetText}

Return only JSON matching the schema, filling the fields in schema order: plan_* fields in short English first, then lines that carry out that plan.`;
}

export function systemPreamble(station: Station, roles: Role[], listener: ListenerContext, cast?: Partial<Record<Role, Voice>>): string {
  const sheet = castSheet(station, roles, listener, cast);
  return preambleV3(station, sheet);
}

// ---- §5 shared context block ----------------------------------------------------------------

const DAYPART_NATIVE = (station: Station, listener: ListenerContext): string =>
  DAYPART_WORDS[station.language]?.[listener.daypart] ?? listener.daypart;

function showLogLines(req: SegmentRequest): string {
  if (!req.showLog?.length) return '- nothing yet, this is the first segment';
  return req.showLog.map((e) => `- [${e.type}] ${e.summary}`).join('\n');
}

/** The last caller line: the request's own, else the most recent phone or web call-in. */
function lastCallerLine(req: SegmentRequest): string {
  if (req.lastCaller) return req.lastCaller;
  const last = req.recentCalls?.[req.recentCalls.length - 1];
  return last ? last : 'none';
}

export function contextBlock(station: Station, req: SegmentRequest): string {
  // The RJ link carries its own scoped context (prompts/rj.ts): no local pack, no occasion, time only in the opener
  if (req.type === 'rj_link') return '';
  const l = req.listener;
  const city = cityFor(station, l);
  const pack = localPackFor(l.city);
  const rj = rjOnAir(station, l);
  const weekday = weekdayName(station, l.weekday);
  const degrees = station.language === 'hi-IN' ? 'डिग्री' : 'degrees';
  const weather = req.weather && city ? `WEATHER in ${city}: ${req.weather.tempC} ${degrees}, ${conditionFor(station, req.weather.description)}` : 'WEATHER: unknown';
  // Only RJ links may greet by name; every other segment just knows "a listener".
  const listener = `a listener${city ? ` from ${city}` : ''} (never write {name} in this segment)`;
  return [
    `NOW: ${timePhrase(station, l)} (${DAYPART_NATIVE(station, l)})${weekday ? `, ${weekday}` : ''}`,
    weather,
    `OCCASION: ${occasionFor(l.localDate, l.region ?? pack?.state) ?? 'none'}`,
    `LISTENER: ${listener}`,
    `LOCAL PACK: ${localPackLine(pack)}`,
    `SHOW: ${rj.showName ?? onAirName(station)} with RJ ${rj.name}`,
    'PREVIOUSLY ON AIR (oldest first):',
    showLogLines(req),
    `LAST CALLER: ${lastCallerLine(req)}`,
  ].join('\n');
}

/**
 * How to write the "en" subtitle next to each line (only sent when the listener turned subtitles on). It sits with
 * the format rules in the system message, so it never outweighs the task's own instructions.
 */
export function subtitleRule(type: LlmSegmentType): string {
  const tokens = type === 'rj_link' ? ' (such as {name} or {caller1})' : '';
  return `## English subtitles
Every line also has "en": a short, natural English subtitle of that line (its meaning, not word for word, at most 200 characters). Subtitles never change the script: write each line exactly as the task asks, then subtitle it. A placeholder in the line${tokens} appears the same way in its "en". People's and places' names stay names, in English letters; the station is "Tarang FM". No swearing in any English.`;
}

export const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];
