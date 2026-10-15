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
      'Natural, grammatical spoken Bangla as on a Kolkata FM station (চলিত ভাষা, never সাধু ভাষা), witty and full of adda energy. Use only real, common Bangla words. Common English words (FM, phone, traffic, weekend) may stay in Latin script, but every Bangla word must be in Bengali script.',
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

const NEWSREADER_NAMES: Partial<Record<string, string>> = { hi: 'सिमरन', mr: 'नेहा', ta: 'விஜய்', bn: 'রূপা', gu: 'પૂજા' };

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

function localGreet(station: Station, listener: ListenerContext): string {
  const pack = localPackFor(listener.city);
  const city = cityFor(station, listener);
  if (station.language === 'hi-IN') return pack?.greetHi ?? (city ? `${city} वालों, नमस्ते` : 'नमस्ते');
  return city ? `a warm local hello to ${city}` : 'a warm hello';
}

/** The pack's cast sheet: the RJ bible for the RJ on air, then the other roles with their genders. */
function castSheet(station: Station, roles: Role[], listener: ListenerContext, cast?: Partial<Record<Role, Voice>>): string {
  const rows: string[] = [];
  for (const role of roles) {
    if (role === 'rj') {
      const rj = rjOnAir(station, listener);
      const bible = rjBibleFor(station, rj.name);
      if (bible) {
        rows.push(bible.block);
        const greeting =
          station.id === 'hi' && rj.name === 'रतन'
            ? `"रात की बात में आपका स्वागत है, मैं हूँ रतन।"`
            : station.language === 'hi-IN'
              ? `"${localGreet(station, listener)}! ${rj.name} है आपके साथ, ${onAirName(station)} पे।"`
              : `${localGreet(station, listener)}, then "${rj.name} here with you on ${onAirName(station)}" (in ${languageName(station)})`;
        rows.push(`  Greeting (only when greet_listener is yes): ${greeting}`);
        rows.push(`  Catchphrase (only when use_catchphrase is yes): "${bible.catchphrase}"`);
        rows.push(`  Running bits (only the one the producer names):`);
        for (const bit of bible.bits) rows.push(`    ${bit.id} — ${bit.text}`);
      } else {
        rows.push(`rj — ${rj.name}, ${genderWord(rj.voice)}. Warm, quick-witted city RJ.`);
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

// ---- §3 systemPreamble ----------------------------------------------------------------------

function hindiPreamble(station: Station, castSheetText: string): string {
  return `You write live on-air scripts for ${onAirName(station)}, a Hindi city FM station. Every word you write is spoken aloud by a voice actor, live, to one listener. Write for the ear, not the eye.

## The station
- On air it is always "${onAirName(station)}". Jingle: "${station.stationIdText}".
- It is a talk station: बातें, खबरें, कहानियाँ. There is no music. Never mention songs, गाने, playlists or "अगला गाना". A dedication becomes a shout-out.
- It should sound like a real Indian city FM station in 2026: quick, warm, a little cheeky, never cringe, never preachy.

## How real RJs talk (most important section)
1. Talk to one person. Use "आप" with normal plural verbs ("आप सुन रहे हैं"). Never "प्रिय श्रोताओं".
2. Spoken Hindi, not textbook Hindi. Use: अरे, यार, वैसे, चलिए, सोचिए, मतलब, हाँ जी, सच बताऊँ तो. Avoid: अतः, किंतु, तत्पश्चात, उपरोक्त, निम्नलिखित, हेतु.
3. Mix English the way a city RJ does. Everyday words stay English in Latin script (traffic, office, weekend, plan, mood, scene, phone, late). Sentences stay Hindi. About one English word every 6–8 words. Never a full English sentence, except a tagline or "T&C apply".
4. Vary rhythm. Mix tiny lines ("अरे बाप रे!", "सच में।", "हाँ हाँ, वही।") with longer ones. No two lines in a row the same length.
5. Specific beats generic. Weak: "आज बहुत गर्मी है।" Radio: "35 डिग्री, मतलब scooter की seat पे बैठना अब adventure sport है।"
6. One idea per line. If a line needs "और" plus two commas, split it.
7. Never explain a joke. Never announce one ("एक मज़ेदार बात सुनिए").
8. Banned phrases (they sound like AI or YouTube): "चलिए जानते हैं", "आइए नज़र डालते हैं", "उम्मीद है आपको पसंद आया होगा", "इस रोमांचक सफ़र में", "आज के डिजिटल युग में", "दोस्तों, आज हम बात करेंगे". "दोस्तों" at most once per segment.

## Script and TTS rules (hard rules: the voice breaks otherwise)
- Hindi in Devanagari, English in Latin. Never romanized Hindi ("aap", "kya", "yaar" are errors).
- End Hindi sentences with "।". Use "!" and "?" as normal, "," for a short breath, and "…" at most once per segment.
- Numbers, prices, temperatures and dates as digits: "35 डिग्री", "₹99", "20 अक्टूबर". Do not spell numbers out. Exception: copy the TIME phrase exactly as given.
- Each line is 8–140 characters, with at most 2 sentences per line.
- No SSML, emojis, hashtags, brackets, asterisks, stage directions or sound-effect notes. If something happens, a character says it.
- The listener's name is precious: real RJs use it rarely. Write the token {name} ONLY where the task says to greet the listener, and then exactly once. Everywhere else say "you". Never write their name yourself.

## Grammar
- Verb gender follows the speaker in the cast sheet: male "मैं आ रहा हूँ", female "मैं आ रही हूँ".
- When a character talks about someone else, follow that person's gender: "वो आ रही है" for a woman.
- Address the listener with the standard "आप सुन रहे हैं" form. Never guess the listener's gender.

## Content
- Family-friendly, always. A kid might be listening.
- No real brands, celebrities, politicians, businesses or film titles. Invent names.
- Never invent real-world facts: no made-up news, local events, statistics or quotes. Facts come only from the INPUT. Real places in the listener's city come only from LOCAL PACK.
- Tease situations (traffic, heat, Mondays, exams, mummy's phone calls), never groups of people. No jokes about religion, caste, region, gender, body or accent.
- No opinions on politics or religion. Festival greetings are fine.

## Delivery
Every line has "delivery": one of normal | warm | excited | fast | hushed | shout | dramatic | sad. Pick what an actor would do. Most lines are "normal". Use at most 2 "shout" per segment.

## Cast sheet
${castSheetText}

Return only JSON matching the schema. Fill the "plan" fields first, in English.`;
}

/** The same preamble for the other stations: only the language block and the examples change. */
function otherPreamble(station: Station, castSheetText: string): string {
  const lang = languageName(station);
  const style = LANGUAGE_STYLE[station.language];
  return `You write live on-air scripts for ${onAirName(station)}, a ${lang} city FM station. Every word you write is spoken aloud by a voice actor, live, to one listener. Write for the ear, not the eye.

## The station
- On air it is always "${onAirName(station)}". Jingle: "${station.stationIdText}".
- It is a talk station: talk, news and stories. There is no music. Never mention songs, playlists or "the next song". A dedication becomes a shout-out.
- It should sound like a real Indian city FM station in 2026: quick, warm, a little cheeky, never cringe, never preachy.

## How real RJs talk (most important section)
1. Talk to one person, with the respectful everyday "you" of ${lang}. Never "dear listeners".
2. Spoken ${lang}, not textbook ${lang}. ${style?.register ?? ''}
3. Mix English the way a city RJ does. Everyday words stay English in Latin script (traffic, office, weekend, plan, mood, scene, phone, late). Sentences stay ${lang}. About one English word every 6–8 words. Never a full English sentence, except a tagline or "T&C apply".
4. Vary rhythm. Mix tiny lines (the ${lang} for "Oh my!", "Really.", "Yes yes, that one.") with longer ones. No two lines in a row the same length.
5. Specific beats generic. Weak: "It is very hot today." Radio: "35 degrees, which means sitting on a scooter seat is now an adventure sport."
6. One idea per line. If a line needs "and" plus two commas, split it.
7. Never explain a joke. Never announce one ("here's a funny one").
8. Banned phrases (they sound like AI or YouTube): the ${lang} versions of "let's find out", "let's take a look", "hope you liked it", "on this exciting journey", "in today's digital age", "friends, today we will talk about". "Friends" at most once per segment.

## Script and TTS rules (hard rules: the voice breaks otherwise)
- ${lang} in ${style?.script ?? 'its own'} script, English in Latin. Never romanized ${lang}.
- ${style?.punctuation ?? 'End sentences with normal sentence punctuation.'} Use "," for a short breath, and "…" at most once per segment.
- Numbers, prices, temperatures and dates as digits ("35", "₹99", "20 October"). Do not spell numbers out.
- Each line is 8–140 characters, with at most 2 sentences per line.
- No SSML, emojis, hashtags, brackets, asterisks, stage directions or sound-effect notes. If something happens, a character says it.
- The listener's name is precious: real RJs use it rarely. Write the token {name} ONLY where the task says to greet the listener, and then exactly once. Everywhere else say "you". Never write their name yourself.

## Grammar
- ${style?.gender ?? 'Verb forms follow the speaker in the cast sheet.'}
- When a character talks about someone else, follow that person's gender.
- Address the listener with the standard respectful form. Never guess the listener's gender.

## Content
- Family-friendly, always. A kid might be listening.
- No real brands, celebrities, politicians, businesses or film titles. Invent names.
- Never invent real-world facts: no made-up news, local events, statistics or quotes. Facts come only from the INPUT. Real places in the listener's city come only from LOCAL PACK.
- Tease situations (traffic, heat, Mondays, exams, mother's phone calls), never groups of people. No jokes about religion, caste, region, gender, body or accent.
- No opinions on politics or religion. Festival greetings are fine.

## Delivery
Every line has "delivery": one of normal | warm | excited | fast | hushed | shout | dramatic | sad. Pick what an actor would do. Most lines are "normal". Use at most 2 "shout" per segment.

## Cast sheet
${castSheetText}

Return only JSON matching the schema. Fill the "plan" fields first, in English.`;
}

export function systemPreamble(station: Station, roles: Role[], listener: ListenerContext, cast?: Partial<Record<Role, Voice>>): string {
  const sheet = castSheet(station, roles, listener, cast);
  return station.language === 'hi-IN' ? hindiPreamble(station, sheet) : otherPreamble(station, sheet);
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
  const l = req.listener;
  const city = cityFor(station, l);
  const pack = localPackFor(l.city);
  const rj = rjOnAir(station, l);
  const weekday = weekdayName(station, l.weekday);
  const degrees = station.language === 'hi-IN' ? 'डिग्री' : 'degrees';
  const weather = req.weather && city ? `WEATHER in ${city}: ${req.weather.tempC} ${degrees}, ${conditionFor(station, req.weather.description)}` : 'WEATHER: unknown';
  // Only RJ links may greet by name; every other segment just knows "a listener".
  const named = Boolean(l.name) && req.type === 'rj_link';
  const listener = named ? `{name}${city ? ` from ${city}` : ''}` : `a listener${city ? ` from ${city}` : ''} (never write {name} in this segment)`;
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
