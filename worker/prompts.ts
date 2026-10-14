/** Prompts and response schemas for Sarvam-105B. See docs/TECH-SPEC.md §8. */
import type { SegmentRequest } from '../shared/schemas';
import type { Daypart, ListenerContext, Role, SegmentType, Source, Station, TtsLanguage, Voice } from '../shared/types';
import type { ChatMessage } from './sarvam';

export type LlmSegmentType = Exclude<SegmentType, 'station_id'>;

export const SEGMENT_ROLES: Record<LlmSegmentType, Role[]> = {
  rj_link: ['rj'],
  news: ['news'],
  ad_break: ['ad_announcer', 'ad_customer'],
  kahani: ['narrator', 'char_a', 'char_b', 'char_kid'],
};

export interface LlmPlan {
  temperature: number;
  maxTokens: number;
  reasoningEffort: 'low' | null;
  timeoutMs: number;
}

export const SEGMENT_PLAN: Record<LlmSegmentType, LlmPlan> = {
  rj_link: { temperature: 0.7, maxTokens: 1200, reasoningEffort: null, timeoutMs: 9000 },
  news: { temperature: 0.3, maxTokens: 1500, reasoningEffort: null, timeoutMs: 9000 },
  ad_break: { temperature: 0.8, maxTokens: 1500, reasoningEffort: null, timeoutMs: 10_000 },
  kahani: { temperature: 0.7, maxTokens: 2000, reasoningEffort: null, timeoutMs: 12_000 },
};

export const CALL_PLAN: LlmPlan = { temperature: 0.7, maxTokens: 400, reasoningEffort: null, timeoutMs: 8000 };

/** Number of headlines read in one bulletin. */
export const NEWS_HEADLINES = 4;

/** Most lines the model may write per type (Kahani lines can still be split later). */
export const MAX_LINES: Record<LlmSegmentType, number> = { rj_link: 4, news: NEWS_HEADLINES + 2, ad_break: 6, kahani: 14 };

/**
 * Short English planning fields written before the lines. They act as a cheap scratchpad that keeps
 * the script coherent without paying for reasoning tokens; zod strips them after validation.
 * The model-facing schemas stay flat and carry no maxLength/maxItems: nested objects and
 * force-closed strings make the model loop on whitespace until max_tokens, so limits are
 * enforced in post-processing instead.
 */
const PLAN_FIELDS: Partial<Record<LlmSegmentType, Record<string, string>>> = {
  rj_link: { joke: 'the one specific, clever joke or observation this link is built around' },
  ad_break: { product: 'the invented product, its funny brand name and what it absurdly does' },
  kahani: {
    cast: 'who each role plays, e.g. char_a = Ramesh (father), char_kid = Kavin (his son)',
    twist: 'the surprising but logical twist, and the earlier clue that sets it up',
  },
};

/** Instruction listing the planning fields, appended to each user prompt. */
export function planInstruction(type: LlmSegmentType): string | undefined {
  const plan = PLAN_FIELDS[type];
  if (!plan) return undefined;
  const fields = Object.entries(plan).map(([k, v]) => `"${k}" (${v})`).join(' and ');
  return `Before the title and lines, fill ${fields}: one short sentence each, in English.`;
}

export function segmentJsonSchema(type: LlmSegmentType): Record<string, unknown> {
  const plan = Object.keys(PLAN_FIELDS[type] ?? {});
  const lines = {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['role', 'text'],
      properties: {
        role: { type: 'string', enum: SEGMENT_ROLES[type] },
        text: { type: 'string' },
      },
    },
  };
  return {
    type: 'object',
    additionalProperties: false,
    required: [...plan, 'title', 'lines'],
    properties: {
      ...Object.fromEntries(plan.map((k) => [k, { type: 'string' }])),
      title: { type: 'string' },
      lines,
    },
  };
}

export const CALL_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['intent', 'theme', 'reply'],
  properties: {
    intent: { type: 'string', enum: ['chat', 'dedication', 'story_request', 'news_request', 'other'] },
    theme: { type: 'string' },
    reply: { type: 'string' },
  },
};

interface LanguageStyle {
  name: string;
  script: string;
  register: string;
  punctuation: string;
  gender?: string;
}

const LANGUAGE_STYLE: Partial<Record<TtsLanguage, LanguageStyle>> = {
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

const KAHANI_NAMES: Partial<Record<TtsLanguage, string>> = {
  'hi-IN': 'कहानी कॉर्नर',
  'ta-IN': 'கதை நேரம்',
  'bn-IN': 'গল্পের আসর',
  'mr-IN': 'गोष्टींचा कट्टा',
  'gu-IN': 'વાર્તાનો ઓટલો',
};

/** RJ names in native script, keyed by the persona's first name. */
const NATIVE_NAMES: Record<string, Partial<Record<TtsLanguage, string>>> = {
  Sunny: { 'hi-IN': 'सनी' },
  Gokul: { 'ta-IN': 'கோகுல்' },
  Arnab: { 'bn-IN': 'অর্ণব' },
  Ishita: { 'mr-IN': 'इशिता' },
  Pooja: { 'gu-IN': 'પૂજા' },
};

const ROLE_DESCRIPTION: Record<Role, string> = {
  station_id: 'station jingle voice',
  rj: 'the RJ (radio host)',
  news: 'the news reader',
  ad_announcer: 'the ad voice-over announcer (big, salesy voice)',
  ad_customer: 'a customer in the ad (an ordinary person with a funny problem)',
  narrator: 'the story narrator (speaks in third person)',
  char_a: 'adult character A',
  char_b: 'adult character B',
  char_kid: 'the child character',
};

function voiceName(voice: Voice): string {
  return voice.label.split('·')[0].trim();
}

export function rjName(station: Station): string {
  const name = voiceName(station.cast.rj);
  return NATIVE_NAMES[name]?.[station.language] ?? name;
}

/** On-air brand as the jingle says it, e.g. "तरंग FM 91.1". */
export function onAirName(station: Station): string {
  const fromJingle = /(\S+)\s+FM\s+\d+(?:\.\d+)?/u.exec(station.stationIdText)?.[0];
  return fromJingle ?? `${station.nativeName.split(' ')[0]} FM ${station.frequency}`;
}

function languageName(station: Station): string {
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

function kahaniName(station: Station): string {
  const native = KAHANI_NAMES[station.language];
  return native ? `"${native}" (Kahani Corner)` : 'Kahani Corner';
}

function genderNoun(role: Role, voice: Voice): string {
  const f = voice.gender === 'feminine';
  if (role === 'char_kid') return f ? 'a girl' : 'a boy';
  if (role === 'char_a' || role === 'char_b' || role === 'ad_customer') return f ? 'a woman' : 'a man';
  return f ? 'female' : 'male';
}

/** Lists each allowed role with its grammatical gender so verbs agree with the voice. */
export function castSheet(station: Station, roles: Role[]): string {
  const rows = roles.map((role) => {
    const voice = station.cast[role];
    const extra = role === 'rj' ? `, named ${rjName(station)}` : '';
    return `- ${role}: ${ROLE_DESCRIPTION[role]}; ${genderNoun(role, voice)}; grammatical gender ${voice.gender}${extra}.`;
  });
  return `Cast (use ONLY these role values):\n${rows.join('\n')}`;
}

export function systemPreamble(station: Station, roles: Role[], opts: { allowRealNames?: boolean } = {}): string {
  const lang = languageName(station);
  const style = LANGUAGE_STYLE[station.language];
  const rules = [
    `You are the script writer for ${station.name}, a lively Indian FM radio station broadcasting in ${lang}. On air the station is always called "${onAirName(station)}". Its jingle: "${station.stationIdText}".`,
    `Write ONLY in ${lang} using ${style?.script ?? 'its native'} script; English words may stay in Latin script. Never write romanized ${lang}.`,
    style?.register,
    style?.punctuation,
    'Every line is exactly what one voice says out loud on air: short spoken sentences, ideally 40 to 140 characters and never over 200 characters per line, numbers as digits.',
    'No SSML, markdown, emojis, hashtags, speaker names, stage directions, sound-effect or music cues, and nothing in brackets.',
    'The station plays talk, news, ads and radio dramas, not songs: never mention songs or music.',
    'Family-friendly. Be genuinely witty and specific; avoid generic filler, clichés, nonsense words and repeating the same phrase. Every sentence must make sense.',
    opts.allowRealNames
      ? 'Do not mention brands or celebrities beyond what the supplied headlines contain.'
      : 'Never mention real brands, politicians or celebrities.',
    style?.gender,
    castSheet(station, roles),
    'Output JSON matching the schema exactly.',
  ];
  return rules.filter(Boolean).join('\n');
}

function upNext(station: Station, req: SegmentRequest): string {
  const next = req.upNext ?? 'kahani';
  if (next !== 'kahani') return UP_NEXT[next];
  return `${kahaniName(station)}, a short radio drama with a full voice cast${req.theme ? `; today's story: ${req.theme}` : ''}`;
}

const UP_NEXT: Record<SegmentType, string> = {
  station_id: 'the station jingle',
  rj_link: 'more chat with the RJ',
  news: 'the latest news headlines',
  ad_break: 'a short break',
  kahani: 'Kahani Corner, a short radio drama with a full voice cast',
};

const DAYPART_SPARKS: Record<Daypart, string[]> = {
  morning: ['the snooze-button battle', 'the first cup of chai or coffee', 'the morning rush to school and office', 'a morning walk in the park', 'breakfast', 'the neighbourhood milkman and newspaper'],
  afternoon: ['the post-lunch sleepiness', 'the afternoon sun', 'long meetings and online classes', 'a sudden rain shower', 'the 4 pm chai break', 'lunch-box envy'],
  evening: ['evening traffic jams', 'street-food cravings', 'gully cricket', 'the evening walk', 'weekend plans', 'TV-remote fights at home'],
  night: ['late-night cravings', 'scrolling the phone in bed', 'the quiet of the night', 'tomorrow\'s to-do list', 'stargazing from the terrace', 'the neighbour\'s barking dog'],
};

const AD_CATEGORIES = [
  'a kitchen gadget',
  'a monsoon accessory',
  'a wedding-season service',
  'an exam-stress remedy',
  'an auto-rickshaw accessory',
  'a gadget for joint families',
  'a phone app for parents who forward too many messages',
  'a pet product',
  'a traffic-jam survival kit',
  'a hair oil with ridiculous claims',
  'a pressure-cooker accessory',
  'a crunchy snack',
  'smart footwear',
  'a festive house-cleaning service',
  'a neighbour-gossip blocker',
  'an alarm clock for heavy sleepers',
];

const KAHANI_GENRES: Record<Daypart, string[]> = {
  morning: ['a heart-warming slice-of-life story', 'a funny village tale', 'a clever-kid adventure', 'an inspiring underdog story'],
  afternoon: ['a comedy of errors', 'a light detective mystery', 'a funny office or school story', 'a quirky neighbourhood comedy'],
  evening: ['a family drama with a sweet twist', 'a romantic misunderstanding', 'a mystery in the neighbourhood', 'a funny wedding story'],
  night: ['a mildly spooky ghost story (no gore)', 'a suspense story on a night train', 'a mystery in an old house', 'a strange encounter on an empty road at night'],
};

const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

function listenerBrief(listener: ListenerContext, language: TtsLanguage): string[] {
  return [
    listener.name
      ? `Listener's name: ${listener.name}. Wherever you say the listener's name, write exactly {name} instead; it is filled in later.`
      : "Listener's name: unknown (address all listeners warmly)",
    listener.city ? `Listener's city: ${listener.city}` : "Listener's city: unknown (do not invent one)",
    `Local time: ${spokenTime(listener, language)}. Say it the way people speak and use exactly that word for the time of day (never call the evening "night"); never use a 24-hour clock.`,
  ];
}

function rjLinkPrompt(station: Station, req: SegmentRequest): string {
  const lines = [
    'Write an RJ link: 3 lines (at most 4), all spoken by the rj.',
    ...listenerBrief(req.listener, station.language),
    `Coming up right after this link: ${upNext(station, req)}.`,
    `Topic for one joke: ${pick(DAYPART_SPARKS[req.listener.daypart])}. Make it a specific, relatable observation, like a stand-up comic would, with a local touch for the city if known. Not a generic statement.`,
  ];
  if (req.weather && req.listener.city) {
    lines.push(`Weather right now in ${req.listener.city}: ${req.weather.tempC}°C, ${req.weather.description}. Mention it naturally in one short phrase (temperature as a number with degrees).`);
  }
  if (req.recentCalls?.length) {
    lines.push(`Recent callers said: ${req.recentCalls.map((c) => `"${c}"`).join('; ')}. Give one of them a quick, warm shout-out.`);
  }
  lines.push(
    `Line 1: greet the listener by name (if known) and city (if known), mention the time of day, and say you are RJ ${rjName(station)} on ${onAirName(station)}.`,
    'Middle: the joke, conversational and clever, like a real RJ chatting with a friend.',
    'Last line: tease what is coming up next so people stay tuned.',
    'title: a short catchy caption for this link in the station language.',
  );
  return lines.join('\n');
}

function newsPrompt(station: Station, req: SegmentRequest, headlines: Source[]): string {
  return [
    `Write a short news bulletin read by the news reader, ${headlines.length + 2} lines in total:`,
    `- Line 1: a crisp intro on ${onAirName(station)}: the news reader, ${voiceName(station.cast.news)}, may say their own name (never the word "news" as a name), then say these are the latest headlines${headlines.some((h) => h.local) && req.listener.city ? `, starting with news from the listener's own city, ${req.listener.city}` : ''}.`,
    `- Then exactly one line per headline below, in the same order (${headlines.length} lines).`,
    '- Last line: a short, polite sign-off that hands back to the station.',
    'News integrity rules (strict): rephrase each headline as one clear, natural spoken news sentence in the station language. Use ONLY facts stated in that headline. Do not add any new fact, number, name, place, cause, quote, prediction or opinion. If a headline is a teaser question or clickbait, state only what it actually reports, as a statement. If a headline is in another language, translate it faithfully. Keep names exactly as given.',
    `Local time: ${spokenTime(req.listener, station.language)}.`,
    headlines.some((h) => h.local)
      ? `Headlines marked [LOCAL] are from the listener's city${req.listener.city ? ` (${req.listener.city})` : ''}: introduce the first of them as local news from that city (for example "and now from your city ..." in the station language).`
      : '',
    'Headlines:',
    ...headlines.map((h, i) => `${i + 1}. ${h.local ? '[LOCAL] ' : ''}${h.title}${h.source ? ` (source: ${h.source})` : ''}`),
    'title: a short bulletin name in the station language.',
  ]
    .filter(Boolean)
    .join('\n');
}

function adPrompt(station: Station, req: SegmentRequest): string {
  const customer = station.cast.ad_customer;
  return [
    'Write one radio ad: 5 lines (at most 6) between ad_announcer and ad_customer.',
    `Product category: ${pick(AD_CATEGORIES)}. Invent ONE fictional, absurd but believable desi product with a funny made-up brand name (never a real brand).`,
    `Flow: (1) the customer, ${genderNoun('ad_customer', customer)}, complains about a relatable, comic everyday problem; (2) the announcer swoops in with the product and over-the-top claims; (3) the customer is delighted by the absurd result; (4) the announcer delivers a catchy, rhyming tagline with the product name; (5) the announcer rattles off a super-fast, funny "terms and conditions apply" disclaimer joke.`,
    `Time of day for flavour: ${req.listener.daypart}.`,
    'title: the product name in the station language.',
  ].join('\n');
}

function kahaniPrompt(station: Station, req: SegmentRequest): string {
  const theme = req.theme ? `Theme requested by a listener: "${req.theme}".` : `Genre: ${pick(KAHANI_GENRES[req.listener.daypart])}.`;
  const people = (['char_a', 'char_b', 'char_kid'] as const).map((r) => `${r} is ${genderNoun(r, station.cast[r])}`).join(', ');
  return [
    `Write a complete mini radio drama for ${kahaniName(station)}: 10 lines (between 8 and 12).`,
    theme,
    `Characters: ${people}. Give each character a short, everyday name that fits their gender and a ${languageName(station)}-speaking setting. Use 2 or 3 characters; include char_kid only if it fits the story.`,
    'Line 1: the narrator sets the scene with a gripping hook (go straight into the story; do not mention the station or the show). Most lines are dialogue between the characters; the narrator speaks in at most 4 lines.',
    'Keep it simple: one setting, one clear problem. Characters address each other by name early on so listeners know who is speaking. Each line must follow logically from the previous one, and the twist must be set up by an earlier clue.',
    'Characters only speak their own words; descriptions such as "he said" or "she smiled" belong to the narrator alone. Each role is one distinct person: never let one role speak both sides of a conversation.',
    'Build suspense or comedy, then land the twist in the last 1 or 2 lines. The story must be complete and satisfying, with no cliffhanger.',
    `Listener's local time is ${spokenTime(req.listener, station.language)}.`,
    'title: a short, intriguing story title in the station language.',
  ].join('\n');
}

export function segmentMessages(station: Station, type: LlmSegmentType, req: SegmentRequest, headlines: Source[] = []): ChatMessage[] {
  const roles = SEGMENT_ROLES[type];
  const system = systemPreamble(station, roles, { allowRealNames: type === 'news' });
  let user: string;
  switch (type) {
    case 'rj_link':
      user = rjLinkPrompt(station, req);
      break;
    case 'news':
      user = newsPrompt(station, req, headlines);
      break;
    case 'ad_break':
      user = adPrompt(station, req);
      break;
    case 'kahani':
      user = kahaniPrompt(station, req);
      break;
  }
  const plan = planInstruction(type);
  return [
    { role: 'system', content: system },
    { role: 'user', content: plan ? `${user}\n${plan}` : user },
  ];
}

export function callMessages(
  station: Station,
  payload: { transcript: string; listener: ListenerContext; nowPlaying?: string },
): ChatMessage[] {
  const lang = languageName(station);
  const style = LANGUAGE_STYLE[station.language];
  const rj = station.cast.rj;
  const system = [
    `You are RJ ${rjName(station)}, the live host of ${onAirName(station)}, an Indian FM station broadcasting in ${lang}. You are ${rj.gender === 'feminine' ? 'female' : 'male'}; use ${rj.gender} grammatical forms for yourself.`,
    'A listener is calling in live and you reply on air right now.',
    `Reply ONLY in ${lang} using ${style?.script ?? 'its native'} script (English words may stay in Latin script; never romanized ${lang}), in at most 2 short spoken sentences and under 220 characters. Warm, witty and specific to what the caller said. Use the caller's name if known.`,
    style?.register,
    style?.punctuation,
    style?.gender,
    'Classify intent: "chat" (small talk or feedback), "dedication" (dedicating a message to someone), "story_request" (asks for a story; set theme to the kind of story they asked for, keeping their own words, e.g. a ghost story, a funny story, a love story, in the station language; never a generic "short story"), "news_request" (asks about news), or "other".',
    'For story_request, promise the story is coming up next in Kahani Corner. For news_request, say the headlines are coming up soon; never state any news facts yourself. For a dedication, read it out warmly. The station plays no songs, so never promise to play one.',
    'If the input is abusive, unsafe or nonsense, set intent "other" and deflect politely with humour. Never repeat personal data such as phone numbers or addresses.',
    'No emojis, markdown, stage directions or brackets. theme is an empty string unless intent is story_request.',
    payload.listener.name ? 'Wherever you say the caller\'s name, write exactly {name} instead; it is filled in later.' : undefined,
    'Output JSON matching the schema exactly.',
  ]
    .filter(Boolean)
    .join('\n');
  const user = JSON.stringify({
    transcript: payload.transcript,
    listener: { ...payload.listener, localTime: spokenTime(payload.listener, station.language) },
    nowPlaying: payload.nowPlaying ?? null,
  });
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
