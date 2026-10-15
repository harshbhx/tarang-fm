/**
 * The producer's free checks (bible §5.1, prompt pack §10.3–10.4): deterministic gates that run before any
 * scoring call, for every segment type. No model calls, no I/O.
 *
 * - `hard` problems fail the script (rewrite once, with the messages as the producer note).
 * - `soft` problems only join the note.
 * - `dropLines` (0-based indices) are lines the caller may cut instead of rewriting: an invented news line,
 *   a catchphrase that was not allowed, a copied example line on the second attempt.
 *
 * Every message names the line (1-based, "Line 3") and says what to change, so it can go straight into the
 * rewrite note.
 */
import type { StationId } from '../../shared/types';

export type FreeSegmentType = 'rj_link' | 'news' | 'ad_break' | 'kahani';

export interface FreeLine {
  role: string;
  text: string;
  delivery?: string;
}

export interface FreeContext {
  station: StationId;
  /** rj_link: opener | payload | kahani_in | kahani_out; news: full | update */
  mode?: string;
  /** kahani: serial part */
  part?: 1 | 2 | 3;
  /** kahani: one complete story (the /live show) */
  oneShot?: boolean;
  /** rj_link: the payload type chosen in code (weather allows time and weather outside the opener) */
  payloadType?: string;
  /**
   * Every real-world fact the writer was given, as plain text: slate titles, details and publishers for news;
   * PAYLOAD, the fact text, FESTIVAL, WEATHER, NEXT_ALLOWED for RJ links. Names and numbers outside it are invented.
   */
  factText?: string;
  /** Numbers and Latin tokens the payload must keep verbatim (they are also allowed) */
  keptTokens?: string[];
  /** Heard summaries of what aired, oldest first (RJ links may refer to these) */
  showLog?: string[];
  /** What the handover may say about the next segment */
  nextAllowed?: string;
  /** The next segment's type, so a handover line can be recognised */
  nextType?: string;
  /** Words the segment may always say: station name, frequency, RJ or newsreader name, city, state */
  frame?: string[];
  /** The exact TIME phrase (opener and news) */
  timePhrase?: string;
  /** The RJ's catchphrase and whether this link may use it */
  catchphrase?: { text: string; allowed: boolean };
  /** The listener's name; at most once, and only in an opener greeting or a shout-out */
  listenerName?: string;
  /** Place-name groups (aliases across scripts). A place said without any alias in the context is invented. */
  knownPlaces?: string[][];
  /** Lines that already aired this session (a repeat on air is a hard failure) */
  airedLines?: string[];
  /** More example fragments to guard (the prompts' own example sets) */
  extraFragments?: string[];
  // ---- kahani
  /** Character names by role (char_a, char_b, char_kid), from the outline */
  names?: Partial<Record<string, string>>;
  /** The outline's relations_en: kinship words are allowed only as defined here */
  relations?: string;
  /** The line this part must end on (outline) */
  expectedLastLine?: string;
  // ---- ad_break
  /** The invented brand (the title) */
  brand?: string;
  /** The writer's planned punchline (plan_punchline) */
  punchline?: string;
  /** Whether the format card needs the fine-print beat */
  tnc?: 'required' | 'optional';
}

export interface FreeResult {
  pass: boolean;
  hard: string[];
  soft: string[];
  /** 0-based line indices the caller may cut instead of rewriting */
  dropLines?: number[];
}

// ---- Text helpers -----------------------------------------------------------------------------------------------

const VOWEL_FOLD: Record<string, string> = {
  'ी': 'ि', 'ू': 'ु', 'ई': 'इ', 'ऊ': 'उ',
  'ী': 'ি', 'ূ': 'ু', 'ঈ': 'ই', 'ঊ': 'উ',
  'ી': 'િ', 'ૂ': 'ુ', 'ઈ': 'ઇ', 'ઊ': 'ઉ',
  'ீ': 'ி', 'ூ': 'ு', 'ஈ': 'இ', 'ஊ': 'உ',
};

/** NFC, no nukta or joiners, long vowels folded, lower case: spelling variants compare equal. */
export function fold(text: string): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[़়઼‌‍]/gu, '')
    .normalize('NFC')
    .replace(/[ीूईऊীূঈঊીૂઈઊீூஈஊ]/gu, (c) => VOWEL_FOLD[c] ?? c)
    .toLowerCase();
}

/** The folded words of a text (letters, marks and digits). */
export function wordsOf(text: string): string[] {
  return fold(text)
    .split(/[^\p{L}\p{M}\p{N}&]+/u)
    .filter((w) => w.length >= 1);
}

const squash = (t: string) => fold(t).replace(/[\s\p{P}]+/gu, '');
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NB = String.raw`(?<![\p{L}\p{M}])`;
const NA = String.raw`(?![\p{L}\p{M}])`;

/** A regex matching any of `list` as a whole word (Indic-safe: no \b), on folded text. */
function wordRe(list: string[], flags = 'u'): RegExp {
  return new RegExp(`${NB}(?:${list.map((w) => escapeRe(fold(w))).join('|')})${NA}`, flags);
}

/** Indic digits as ASCII, so "२०२६" and "2026" compare equal. */
export function asciiDigits(text: string): string {
  return text.replace(/[०-९০-৯૦-૯௦-௯]/gu, (c) => String((c.codePointAt(0)! - 0x0966) % 16 % 10));
}

function numbersIn(text: string): string[] {
  return asciiDigits(text).match(/\d+(?:[.,:]\d+)*/g)?.map((d) => d.replace(/,/g, '')) ?? [];
}

/** Share of the expected text's words that the actual text also has (inflections allowed by prefix). */
export function overlap(actual: string, expected: string): number {
  const exp = [...new Set(wordsOf(expected).filter((w) => w.length >= 2))];
  if (!exp.length) return 1;
  const act = wordsOf(actual);
  const stem = (w: string) => (w.length > 4 ? w.slice(0, Math.max(3, w.length - 2)) : w);
  return exp.filter((e) => act.some((a) => a === e || a.startsWith(stem(e)) || e.startsWith(stem(a)))).length / exp.length;
}

const endsWithQuestion = (text: string) => /[?？]["'”’»)\s]*$/u.test(text.trim());
const n1 = (i: number) => `Line ${i + 1}`;

// ---- Stage-direction and label leaks --------------------------------------------------------------------------------

const DELIVERY_WORDS = 'normal|warm|excited|fast|hushed|shout|dramatic|sad|whisper\\w*';
const LEAKS: RegExp[] = [
  /(delivery|role|narrator|char_[a-z]+|ad_(?:announcer|customer)|hushed|excited|dramatic|whisper\w*|sfx|sound|speaker|voice)\s*[:：=]/iu,
  new RegExp(`\\bdelivery\\s*[-=:]?\\s*(?:${DELIVERY_WORDS})\\b`, 'iu'),
  /\b(?:char_[a-z]+|ad_announcer|ad_customer|narrator)\b/iu,
  /[()[\]{}*#<>♪🎵]/u,
  /\bSFX\b/iu,
  /\p{Extended_Pictographic}/u,
  /(?:धीमी|ऊँची|ऊंची|तेज़|तेज|हल्की|भारी)\s+आवाज़?\s+में\s*[:：]?|आवाज़\s+में\s*[:：]/u,
  /(?:फुसफुसा\S*|चिल्ला\S*|हँसते हुए|रोते हुए|ज़ोर से|धीरे से)\s*[:：]/u,
];

/** A stage direction, role name, speaker label, bracket or emoji inside spoken text. */
export function leaksDirection(text: string): boolean {
  const t = (text ?? '').trim();
  if (LEAKS.some((re) => re.test(t))) return true;
  // A one-word speaker label at the start ("मेहर: …"), except the fine print ("T&C: …", "शर्तें: …")
  return /^[^\s:：]{1,24}\s*[:：]\s/u.test(t) && !/^(t\s*&\s*c|शर्तें|शर्त|terms)/iu.test(t);
}

// ---- Copied example fragments ---------------------------------------------------------------------------------------

/**
 * Prompt pack §10.4, the old validator's list, the old prompts' own examples (one aired word for word) and the
 * localized story and ad example sets. A line that contains one was copied from the instructions.
 */
export const EXAMPLE_FRAGMENTS: readonly string[] = [
  // §10.4 (bible and prompt pack examples)
  'lift का सबसे मुश्किल काम', 'पड़ोसी से नज़र बचाना', 'पकौड़ों के बहाने बारिश', 'बाकी बातें एक छोटे से break',
  'शहर के नए food street', 'आज का माहौल तो एकदम मस्त', 'शहर में त्योहार की रौनक देखने लायक',
  'हालात बेहद गंभीर', 'रटंतु', 'Rank 1 का दावा', 'अगर आप ख़ुद उड़ सकें', 'पंख शामिल नहीं',
  'ज़िंदगी बदल देगा, आज ही', 'साइकिल की घंटी बेच दी', 'कुकर की तीसरी सीटी', 'पूरी गली की बत्ती चली गई',
  'race मत जाना', 'सबको सच पता चल गया', 'स्टार्ट नहीं, attention चाहिए', 'garba में सबसे आगे जो नाचता',
  'आख़िरी twist अभी तक दिमाग में घूम',
  // bible §4 examples not in §10.4
  'पकौड़े, क्योंकि बारिश तो Monday', 'छाता नहीं, पूरा plan B', 'पुल की मरम्मत शुक्रवार तक', 'बड़ौदा से साथ हैं तो',
  'घंटी पर एक धमकी मिली', 'तो घंटी दादी ने छुपाई थी', 'मेरे scooter की चाबी कहाँ गई',
  // the old validator and the old prompts
  'हवेली का दरवाज़ा अभी तक', 'दरवाज़ा है, जो सिर्फ़ रात को खुलता', 'जो सिर्फ़ रात को खुलता है',
  'seat पे बैठना अब adventure sport', 'seat अब adventure sport', 'अब आ रही है कहानी', 'अब आ रही है खबरें',
  'हवेली की पुरानी घड़ी अचानक रुक गई', 'delivery hushed',
  // localized story examples
  'मेरा टिफ़िन फिर बदल दिया', 'गिनकर बारह लड्डू', 'तीन बार दरवाज़ा खटखटाया',
  'सायकलची घंटी विकलीस', 'कुकरची तिसरी शिट्टी', 'गल्लीतले दिवे गेले',
  'சைக்கிள் மணியை வித்துட்டியா', 'குக்கர் மூணாவது விசில்', 'தெரு முழுக்க கரண்ட் போச்சு',
  'সাইকেলের ঘণ্টি বেচে', 'তিন নম্বর সিটি', 'গলির আলো নিভে গেল',
  'સાઇકલની ઘંટડી વેચી', 'કૂકરની ત્રીજી સીટી', 'શેરીની લાઇટ જતી રહી',
  // localized ad examples
  'घोकंपट्टी', 'स्वतः उडू शकलात', 'पंख समाविष्ट नाहीत',
  'மனப்பாடம் Classes', 'பறக்க முடிஞ்சா', 'இறக்கை தனியா',
  'মুখস্থ Classes', 'নিজে উড়তে পারেন', 'ডানা আলাদা',
  'ગોખણપટ્ટી', 'જાતે ઊડી શકો', 'પાંખો સામેલ નથી',
];

const FRAGMENT_KEYS = [...new Set(EXAMPLE_FRAGMENTS.map(squash))];

/** The fragment a line copies, if any. */
export function copiedFragment(text: string, extra: string[] = []): string | undefined {
  const key = squash(text);
  const hit = FRAGMENT_KEYS.find((f) => f && key.includes(f));
  if (hit) return EXAMPLE_FRAGMENTS.find((f) => squash(f) === hit);
  return extra.find((f) => squash(f).length >= 6 && key.includes(squash(f)));
}

// ---- Fillers and tics -------------------------------------------------------------------------------------------------

/** Bible §3.1: the filler words, per station language. Counted in code, at most 2 per segment. */
export const FILLERS: Partial<Record<StationId, string[]>> = {
  hi: ['अरे', 'यार', 'वैसे', 'सच में', 'बिल्कुल', 'बिलकुल', 'मतलब', 'हाँ जी', 'उफ़्फ़', 'उफ़', 'अरे बाप रे', 'सच बताऊँ तो'],
  mr: ['अरे', 'बरं', 'म्हणजे', 'खरंच'],
  ta: ['அட', 'சரி', 'ஆமா', 'அப்புறம்'],
  bn: ['আরে', 'আসলে', 'মানে', 'সত্যি'],
  gu: ['અરે', 'હા', 'એટલે', 'ખરેખર'],
  en: ['basically', 'literally', 'you know', 'like'],
};

/** Tags glued to a line end ("…, सच में।", "बिल्कुल सही।"). */
const END_TAGS: Partial<Record<StationId, string[]>> = {
  hi: ['सच में', 'बिल्कुल सही', 'बिलकुल सही', 'है ना', 'यार', 'हाँ जी', 'मतलब'],
  mr: ['खरंच', 'हो ना', 'बरं'],
  ta: ['சரியா', 'ஆமா', 'சூப்பர்'],
  bn: ['সত্যি', 'তাই না'],
  gu: ['ખરેખર', 'બરાબર ને', 'હા'],
};

export interface FillerReport {
  total: number;
  /** 0-based lines that open on a filler */
  starts: number[];
  /** 0-based lines that end on a filler tag */
  tags: number[];
  /** 0-based line → filler words found */
  found: Map<number, string[]>;
}

export function fillerReport(lines: FreeLine[], station: StationId): FillerReport {
  const list = FILLERS[station] ?? [];
  const tags = END_TAGS[station] ?? [];
  const report: FillerReport = { total: 0, starts: [], tags: [], found: new Map() };
  if (!list.length) return report;
  // Longest first, so "सच बताऊँ तो" counts once, not as "सच" + ...
  const sorted = [...list].sort((a, b) => b.length - a.length).map(fold);
  const any = new RegExp(`${NB}(?:${sorted.map(escapeRe).join('|')})${NA}`, 'gu');
  const startRe = new RegExp(`^[\\s"'“‘…,.!?।-]*(?:${sorted.map(escapeRe).join('|')})${NA}`, 'u');
  const tagRe = tags.length ? new RegExp(`[,，]\\s*(?:${tags.map((t) => escapeRe(fold(t))).join('|')})\\s*[।.!?]*["'”’]*$`, 'u') : null;
  const bareTagRe = tags.length ? new RegExp(`^(?:${tags.map((t) => escapeRe(fold(t))).join('|')})\\s*[।.!?]*$`, 'u') : null;
  lines.forEach((line, i) => {
    const t = fold(line.text).trim();
    const hits = t.match(any) ?? [];
    if (hits.length) {
      report.total += hits.length;
      report.found.set(i, hits);
    }
    if (startRe.test(t)) report.starts.push(i);
    // A sentence that ends on a tag: "…, सच में।" or "… बिल्कुल सही।" as its own last sentence
    const lastSentence = t.split(/[।.!?]\s+/u).pop()?.trim() ?? '';
    if ((tagRe && tagRe.test(t)) || (bareTagRe && bareTagRe.test(lastSentence) && t !== lastSentence)) report.tags.push(i);
  });
  return report;
}

// ---- Time and weather -------------------------------------------------------------------------------------------------

const TIME_WEATHER: Partial<Record<StationId, RegExp>> = {
  hi: wordRe(['सवा', 'साढ़े', 'पौने', 'बजे', 'बजकर', 'डिग्री', 'तापमान', 'मौसम']),
  mr: wordRe(['वाजले', 'वाजता', 'वाजून', 'सव्वा', 'साडे', 'पावणे', 'अंश', 'डिग्री', 'तापमान', 'हवामान']),
  bn: wordRe(['টা বাজে', 'সাড়ে', 'সোয়া', 'পৌনে', 'ডিগ্রি', 'তাপমাত্রা', 'আবহাওয়া']),
  gu: wordRe(['વાગ્યે', 'વાગ્યા', 'સવા', 'સાડા', 'પોણા', 'ડિગ્રી', 'તાપમાન', 'હવામાન']),
  ta: /மணி|டிகிரி|வெப்பநிலை|வானிலை/u,
};
const TIME_COMMON = /\d{1,2}\s?[:.]\s?\d{2}(?!\d)|°|\bdegrees?\b|\btemperature\b|\b[ap]\.?m\.?\b/iu;

/** True when the line says the clock time or the weather. */
export function saysTimeOrWeather(text: string, station: StationId, timePhrase?: string): boolean {
  const t = fold(asciiDigits(text));
  if (TIME_COMMON.test(t)) return true;
  if (timePhrase && squash(timePhrase).length >= 4 && squash(text).includes(squash(timePhrase))) return true;
  return Boolean(TIME_WEATHER[station]?.test(t));
}

// ---- Invented names and numbers ---------------------------------------------------------------------------------------

/**
 * Landmarks of the cities in the local packs, in every script a station might render them in. A place said
 * on air that the context never gave is an invented detail (the "Alkapuri flyover", the "Laxmi Vilas Palace
 * traffic" story). Callers may add more groups through `knownPlaces`.
 */
export const LANDMARKS: readonly string[][] = [
  ['Laxmi Vilas', 'Lakshmi Vilas', 'लक्ष्मी विलास', 'लक्ष्मीविलास', 'લક્ષ્મી વિલાસ', 'லக்ஷ்மி விலாஸ்', 'லட்சுமி விலாஸ்', 'লক্ষ্মী বিলাস'],
  ['Sayaji Baug', 'Sayajibaug', 'Sayaji Garden', 'सयाजी बाग', 'सयाजीबाग', 'સયાજી બાગ', 'સયાજીબાગ', 'சயாஜி பாக்', 'সয়াজি বাগ'],
  ['Sursagar', 'सुरसागर', 'सूरसागर', 'સુરસાગર', 'સૂરસાગર', 'சூர்சாகர்', 'சூர்யாசகர்', 'சுர்சாகர்', 'সুরসাগর'],
  ['Alkapuri', 'अलकापुरी', 'અલકાપુરી', 'அல்காபுரி', 'அலகாபுரி', 'আলকাপুরী'],
  ['Mandvi', 'मांडवी', 'માંડવી', 'மாண்ட்வி', 'মান্ডবী'],
  ['MS University', 'M.S. University', 'एमएस यूनिवर्सिटी', 'એમએસ યુનિવર્સિટી'],
  ['Sabarmati Riverfront', 'साबरमती रिवरफ्रंट', 'સાબરમતી રિવરફ્રન્ટ'],
  ['Kankaria', 'कांकरिया', 'કાંકરિયા'],
  ['Law Garden', 'लॉ गार्डन', 'લૉ ગાર્ડન', 'લો ગાર્ડન'],
  ['Manek Chowk', 'माणेक चौक', 'માણેક ચોક'],
  ['CG Road', 'सीजी रोड', 'સીજી રોડ'],
  ['Marine Drive', 'मरीन ड्राइव', 'मरीन ड्राईव्ह', 'મરીન ડ્રાઇવ', 'மரைன் டிரைவ்', 'মেরিন ড্রাইভ'],
  ['Gateway of India', 'गेटवे ऑफ इंडिया', 'ગેટવે ઓફ ઇન્ડિયા', 'கேட்வே ஆஃப் இந்தியா'],
  ['Juhu', 'जुहू', 'જુહુ', 'ஜூஹு', 'জুহু'],
  ['Dadar', 'दादर', 'દાદર'],
  ['Bandra', 'बांद्रा', 'वांद्रे', 'બાંદ્રા'],
  ['Shaniwar Wada', 'Shaniwarwada', 'शनिवार वाडा', 'शनिवारवाडा', 'શનિવાર વાડા'],
  ['FC Road', 'एफसी रोड'],
  ['Koregaon Park', 'कोरेगांव पार्क', 'कोरेगाव पार्क'],
  ['Sinhagad', 'सिंहगड', 'सिंहगढ़'],
  ['India Gate', 'इंडिया गेट', 'ઇન્ડિયા ગેટ', 'இந்தியா கேட்', 'ইন্ডিয়া গেট'],
  ['Chandni Chowk', 'चांदनी चौक', 'ચાંદની ચોક', 'চাঁদনি চক'],
  ['Connaught Place', 'कनॉट प्लेस', 'કનોટ પ્લેસ'],
  ['Hauz Khas', 'हौज़ खास', 'हौज खास'],
  ['Jantar Mantar', 'जंतर-मंतर', 'जंतर मंतर', 'જંતર મંતર'],
  ['Rajiv Chowk', 'राजीव चौक'],
  ['Lalbagh', 'लालबाग', 'ಲಾಲ್‌ಬಾಗ್'],
  ['Cubbon Park', 'कब्बन पार्क'],
  ['MG Road', 'एमजी रोड'],
  ['Indiranagar', 'इंदिरानगर'],
  ['Marina', 'मरीना', 'மெரினா', 'মেরিনা'],
  ['Mylapore', 'मायलापुर', 'மயிலாப்பூர்', 'மைலாப்பூர்'],
  ['T. Nagar', 'T Nagar', 'தி. நகர்', 'தி.நகர்', 'டி நகர்'],
  ['Besant Nagar', 'பெசன்ட் நகர்'],
  ['Victoria Memorial', 'विक्टोरिया मेमोरियल', 'ভিক্টোরিয়া মেমোরিয়াল'],
  ['Howrah Bridge', 'हावड़ा ब्रिज', 'হাওড়া ব্রিজ'],
  ['Park Street', 'पार्क स्ट्रीट', 'পার্ক স্ট্রিট'],
  ['College Street', 'कॉलेज स्ट्रीट', 'কলেজ স্ট্রিট'],
  ['Sarafa', 'सराफा'],
  ['Rameswaram', 'रामेश्वरम', 'ராமேஸ்வரம்', 'রামেশ্বরম'],
];

/** Latin words a segment may always say (frame, units, everyday capitalised words). */
const FRAME_LATIN = new Set([
  'fm', 'tarang', 'rj', 'news', 'update', 'bulletin', 'live', 'ok', 'okay', 'tv', 'km', 'kg', 'am', 'pm', 't', 'c', 'tnc',
  'hi', 'hello', 'hey', 'bye', 'sorry', 'please', 'thank', 'thanks', 'wow', 'yes', 'no', 'good', 'happy', 'sir', 'madam', 'mr', 'mrs', 'ms', 'dr',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'weekend',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'india', 'indian', 'english', 'hindi', 'whatsapp', 'google', 'sms', 'app', 'online', 'ac', 'pdf', 'id', 'otp', 'vip', 'lol',
  'classes', 'class', 'pro', 'plus', 'max', 'super', 'premium', 'gold', 'apply', 'conditions', 'terms', 'only',
]);

/** Capitalised Latin words and acronyms: the names an English-script line can invent. */
function latinNames(text: string): string[] {
  return text.match(/\b[A-Z][A-Za-z]{2,}\b|\b[A-Z]{2,}\b/g) ?? [];
}

/** All Latin words of 3+ letters, lower case. */
function latinWords(text: string): string[] {
  return (text.match(/[A-Za-z][A-Za-z'’-]*[A-Za-z]/g) ?? []).map((w) => w.toLowerCase().replace(/[’']s$/, '')).filter((w) => w.length >= 3);
}

interface Allowed {
  text: string;
  folded: string;
  squashed: string;
  numbers: Set<string>;
}

function allowedFrom(ctx: FreeContext, extra: string[] = []): Allowed {
  const text = asciiDigits(
    [ctx.factText, ...(ctx.keptTokens ?? []), ...(ctx.showLog ?? []), ctx.nextAllowed, ...(ctx.frame ?? []), ctx.timePhrase, ctx.listenerName, ctx.catchphrase?.text, ...extra]
      .filter(Boolean)
      .join(' \n '),
  );
  const numbers = new Set<string>();
  for (const n of numbersIn(text)) {
    numbers.add(n);
    for (const part of n.split(/[.:]/)) numbers.add(part);
  }
  return { text, folded: fold(text), squashed: squash(text), numbers };
}

function placeMentioned(group: readonly string[], text: string): string | undefined {
  const f = fold(text);
  return group.find((name) => {
    const n = fold(name);
    if (/[a-z]/.test(n)) return new RegExp(`\\b${escapeRe(n)}`, 'iu').test(f);
    return new RegExp(`${NB}${escapeRe(n)}`, 'u').test(f);
  });
}

export interface Unsupported {
  line: number;
  token: string;
  kind: 'number' | 'name' | 'place' | 'word';
}

/**
 * Numbers, capitalised Latin names and known places in the lines that the context never gave. `words: true`
 * also reports lower-case Latin words (news: an English word the slate never used is usually invented detail).
 */
export function unsupportedTokens(lines: FreeLine[], ctx: FreeContext, opts: { words?: boolean; numbers?: boolean } = {}): Unsupported[] {
  const allowed = allowedFrom(ctx);
  const groups = [...LANDMARKS, ...(ctx.knownPlaces ?? [])];
  const out: Unsupported[] = [];
  const seen = new Set<string>();
  const push = (u: Unsupported) => {
    const k = `${u.line}:${u.kind}:${u.token.toLowerCase()}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(u);
    }
  };
  lines.forEach((line, i) => {
    const text = asciiDigits(line.text);
    if (opts.numbers !== false) {
      for (const num of numbersIn(text)) {
        const parts = num.split(/[.:]/);
        if (!allowed.numbers.has(num) && !parts.every((p) => allowed.numbers.has(p))) push({ line: i, token: num, kind: 'number' });
      }
    }
    for (const name of latinNames(text)) {
      const low = name.toLowerCase();
      if (FRAME_LATIN.has(low)) continue;
      if (!allowed.folded.includes(low)) push({ line: i, token: name, kind: 'name' });
    }
    if (opts.words) {
      for (const w of latinWords(text)) {
        if (FRAME_LATIN.has(w) || allowed.folded.includes(w)) continue;
        if (latinNames(text).some((n) => n.toLowerCase() === w)) continue;
        push({ line: i, token: w, kind: 'word' });
      }
    }
    for (const group of groups) {
      const said = placeMentioned(group, line.text);
      if (said && !placeMentioned(group, allowed.text)) push({ line: i, token: said, kind: 'place' });
    }
  });
  // A place already reported covers the Latin name inside it ("Sursagar" once, not as a name and a place)
  return out.filter((u) => u.kind !== 'name' || !out.some((p) => p.kind === 'place' && p.line === u.line && p.token.toLowerCase().includes(u.token.toLowerCase())));
}

// ---- Kahani: kinship words ------------------------------------------------------------------------------------------

/** Kinship words that name a real relation, with English aliases the outline's relations_en may use. */
export const KIN_WORDS: Partial<Record<StationId, [string, string[]][]>> = {
  hi: [
    ['पापा', ['father', 'dad', 'papa']], ['पिताजी', ['father', 'dad', 'pitaji']], ['मम्मी', ['mother', 'mom', 'mummy']],
    ['दादी', ['grandmother', 'grandma', 'dadi']], ['दादा', ['grandfather', 'grandpa', 'dada']], ['नानी', ['grandmother', 'nani']],
    ['नाना', ['grandfather', 'nana']], ['चाचा', ['uncle', 'chacha']], ['चाची', ['aunt', 'chachi']], ['बुआ', ['aunt', 'bua']],
    ['मामा', ['uncle', 'mama']], ['मामी', ['aunt', 'mami']], ['मौसी', ['aunt', 'mausi']], ['बेटा', ['son', 'beta', 'child']], ['बेटी', ['daughter', 'beti']],
  ],
  mr: [['बाबा', ['father', 'dad', 'baba']], ['आई', ['mother', 'aai']], ['आजी', ['grandmother', 'aaji', 'aji']], ['आजोबा', ['grandfather', 'ajoba']], ['काका', ['uncle', 'kaka']], ['काकू', ['aunt', 'kaku']], ['मावशी', ['aunt', 'mavshi']]],
  ta: [['அப்பா', ['father', 'dad', 'appa']], ['அம்மா', ['mother', 'amma']], ['தாத்தா', ['grandfather', 'thatha']], ['பாட்டி', ['grandmother', 'paati', 'patti']], ['சித்தப்பா', ['uncle', 'chithappa']], ['மகன்', ['son', 'magan']]],
  bn: [['বাবা', ['father', 'dad', 'baba']], ['মা', ['mother', 'maa', 'ma']], ['দাদু', ['grandfather', 'dadu']], ['দিদা', ['grandmother', 'dida']], ['ঠাকুমা', ['grandmother', 'thakuma']], ['কাকু', ['uncle', 'kaku']], ['মাসি', ['aunt', 'masi', 'mashi']]],
  gu: [['પપ્પા', ['father', 'dad', 'pappa']], ['મમ્મી', ['mother', 'mummy']], ['બા', ['grandmother', 'mother', 'ba']], ['દાદા', ['grandfather', 'dada']], ['દાદી', ['grandmother', 'dadi']], ['કાકા', ['uncle', 'kaka']], ['માસી', ['aunt', 'masi']]],
};

/** Kinship words a line uses (exact word or its inflections by prefix for words of 3+ letters). */
export function kinshipWords(text: string, station: StationId): string[] {
  const list = KIN_WORDS[station] ?? [];
  const ws = wordsOf(text);
  return list
    .filter(([w]) => {
      const k = fold(w);
      return ws.some((x) => x === k || (k.length >= 3 && x.startsWith(k) && x.length <= k.length + 3));
    })
    .map(([w]) => w);
}

/** Kinship words used in the lines that `relations` (relations_en) never defines. */
export function undefinedKinship(lines: FreeLine[], relations: string, station: StationId): { line: number; word: string }[] {
  const rel = fold(relations);
  const list = KIN_WORDS[station] ?? [];
  const out: { line: number; word: string }[] = [];
  lines.forEach((l, i) => {
    for (const w of kinshipWords(l.text, station)) {
      const aliases = list.find(([k]) => k === w)?.[1] ?? [];
      if (rel.includes(fold(w)) || aliases.some((a) => new RegExp(`\\b${escapeRe(a)}\\b`, 'i').test(rel))) continue;
      out.push({ line: i, word: w });
    }
  });
  return out;
}

/** Does the line say this name (its first word, inflected or not)? */
function saysName(text: string, name: string): boolean {
  const first = wordsOf(name)[0];
  if (!first) return false;
  const key = first.replace(/[्্્்]$/u, '');
  return wordsOf(text).some((w) => w.startsWith(key));
}

// ---- Per-type shape checks -----------------------------------------------------------------------------------------

const LINE_RANGE: Record<string, [number, number]> = {
  'rj_link:opener': [3, 4],
  'rj_link:payload': [3, 5],
  'rj_link:kahani_in': [2, 3],
  'rj_link:kahani_out': [3, 5],
  'news:full': [10, 15],
  'news:update': [4, 6],
  ad_break: [3, 6],
  kahani: [12, 18],
};

const NEWS_WORDS = /खबर|ख़बर|समाचार|news|बातम्या|செய்தி|খবর|সংবাদ|સમાચાર/iu;
const BREAK_WORDS = /break|ब्रेक|विज्ञापन|जाहिरात|இடைவேளை|বিরতি|બ્રેક/iu;
const STORY_WORDS = /कहानी|कड़ी|story|गोष्ट|भाग|கதை|பகுதி|গল্প|পর্ব|વાર્તા|ભાગ/iu;
/** Unattributed hearsay, allowed only when the slate itself says it */
const HEARSAY = /बताया जा रहा है|सूत्रों के मुताबिक|सूत्रों के अनुसार|विशेषज्ञों का कहना है|माना जा रहा है/u;
/** A call to action as the last line (the ad ended on "buy it" instead of the joke) */
const CTA_END = /आज ही|अभी\s+(?:call|order|मंगा|ख़रीद|खरीद)|ख़रीदिए|खरीदिए|लीजिए|मंगाइए|मंगवाइए|order now|buy now|call now/iu;
const TNC = /T\s*&\s*C|terms|conditions|शर्तें|शर्त|अटी|நிபந்தனை|শর্ত|શરત|\*/iu;
/** Five or more Latin words in a row: a full English sentence */
const LATIN_RUN = /(?:\b[A-Za-z][A-Za-z'&.-]*\b[\s,!?]+){4,}\b[A-Za-z][A-Za-z'&.-]*\b/u;

function rangeFor(type: FreeSegmentType, mode?: string): [number, number] | undefined {
  if (type === 'rj_link') return LINE_RANGE[`rj_link:${mode ?? 'payload'}`] ?? LINE_RANGE['rj_link:payload'];
  if (type === 'news') return LINE_RANGE[`news:${mode === 'update' ? 'update' : 'full'}`];
  return LINE_RANGE[type];
}

/** Lines said twice in this segment (exact or near-exact), and lines that already aired this session. */
export function repeatedLines(lines: FreeLine[], aired: string[] = []): { line: number; of?: number; aired?: boolean }[] {
  const out: { line: number; of?: number; aired?: boolean }[] = [];
  const keys = lines.map((l) => squash(l.text));
  lines.forEach((l, i) => {
    if (keys[i].length < 6) return;
    const j = keys.findIndex((k, x) => x < i && (k === keys[i] || (Math.min(k.length, keys[i].length) > 20 && overlap(l.text, lines[x].text) >= 0.85 && overlap(lines[x].text, l.text) >= 0.85)));
    if (j >= 0) out.push({ line: i, of: j });
    else if (aired.some((a) => squash(a) === keys[i] || (keys[i].length > 20 && overlap(l.text, a) >= 0.85 && overlap(a, l.text) >= 0.85))) out.push({ line: i, aired: true });
  });
  return out;
}

/** Rhythm (bible §3.2): soft notes only. */
function rhythmNotes(lines: FreeLine[]): string[] {
  const soft: string[] = [];
  if (lines.length >= 4) {
    const lens = lines.map((l) => l.text.length);
    if (Math.max(...lens) - Math.min(...lens) < 30) soft.push(`Lines are all ${Math.min(...lens)}-${Math.max(...lens)} characters: add one short line (under 6 words) and one longer one.`);
  }
  const firsts = lines.map((l) => wordsOf(l.text)[0] ?? '');
  const dup = firsts.findIndex((w, i) => w && w.length > 1 && firsts.indexOf(w) !== i);
  if (dup >= 0) soft.push(`${n1(firsts.indexOf(firsts[dup]))} and ${n1(dup)} start with the same word: vary the openings.`);
  return soft;
}

// ---- The gate ---------------------------------------------------------------------------------------------------

/**
 * Runs every free check that applies to the segment type. `pass` is true when there is no hard problem.
 * Lines are judged as spoken text only (`text`), never the subtitle.
 */
export function freeChecks(type: FreeSegmentType, lines: FreeLine[], ctx: FreeContext): FreeResult {
  const hard: string[] = [];
  const soft: string[] = [];
  const drop = new Set<number>();
  const station = ctx.station;
  const n = lines.length;

  if (!n) return { pass: false, hard: ['The script has no lines.'], soft: [] };

  // Line count
  const range = rangeFor(type, ctx.mode);
  if (range) {
    const [min, max] = range;
    if (n < min) hard.push(`Too short: ${n} lines; this segment needs ${min}-${max}.`);
    else if (n > max) hard.push(`Too long: ${n} lines; this segment needs ${min}-${max}. Cut a middle line, keep the ending.`);
  }

  // Leaks and copies (all types)
  lines.forEach((l, i) => {
    if (leaksDirection(l.text)) hard.push(`${n1(i)} reads a stage direction, role name, bracket or label aloud: only spoken words go in "text", acting goes in "delivery".`);
    const frag = copiedFragment(l.text, ctx.extraFragments);
    if (frag) {
      hard.push(`${n1(i)} copies the instructions' example ("${frag}"): write your own line.`);
      drop.add(i);
    }
    if (!l.text.trim()) hard.push(`${n1(i)} is empty.`);
  });

  // Repeats
  for (const r of repeatedLines(lines, ctx.airedLines)) {
    if (r.aired) hard.push(`${n1(r.line)} already aired earlier in the show: say something new.`);
    else hard.push(`${n1(r.line)} repeats ${n1(r.of!)}: every line must move on.`);
  }

  // Fillers and tics (not news: "आपके लिए मतलब:" is a news cue)
  if (type !== 'news') {
    const f = fillerReport(lines, station);
    if (f.total > 2) {
      const where = [...f.found.entries()].map(([i, ws]) => `${n1(i)}: ${ws.join(', ')}`).join('; ');
      hard.push(`${f.total} filler words (${where}): at most 2 in the whole script.`);
    }
    if (f.starts.includes(0)) hard.push(`${n1(0)} opens on a filler word: open on the point instead.`);
    const otherStarts = f.starts.filter((i) => i > 0);
    if (otherStarts.length >= 2) soft.push(`${otherStarts.map(n1).join(', ')} open on a filler word.`);
    if (f.tags.length) hard.push(`${f.tags.map(n1).join(', ')} end${f.tags.length === 1 ? 's' : ''} on a filler tag ("…, सच में।"): end on the meaning.`);
  }

  if (type === 'rj_link') checkRj(lines, ctx, hard, soft, drop);
  else if (type === 'news') checkNews(lines, ctx, hard, soft, drop);
  else if (type === 'ad_break') checkAd(lines, ctx, hard, soft);
  else if (type === 'kahani') checkKahani(lines, ctx, hard, soft);

  if (type !== 'news') soft.push(...rhythmNotes(lines));

  const dropLines = [...drop].sort((a, b) => a - b);
  return { pass: hard.length === 0, hard: [...new Set(hard)], soft: [...new Set(soft)], ...(dropLines.length ? { dropLines } : {}) };
}

function checkRj(lines: FreeLine[], ctx: FreeContext, hard: string[], soft: string[], drop: Set<number>): void {
  const station = ctx.station;
  const opener = ctx.mode === 'opener';
  // Time and weather only in the opener (or a weather payload). A kahani_in tease may carry the story's own clock.
  if (!opener && ctx.payloadType !== 'weather' && ctx.mode !== 'kahani_in') {
    lines.forEach((l, i) => {
      if (saysTimeOrWeather(l.text, station, ctx.timePhrase)) hard.push(`${n1(i)} gives the time or the weather: they belong only in the opener. Cut it and go straight to the payload.`);
    });
  }
  // Catchphrase
  const cp = ctx.catchphrase;
  if (cp?.text && squash(cp.text).length >= 4) {
    const hits = lines.map((l, i) => (squash(l.text).includes(squash(cp.text)) ? i : -1)).filter((i) => i >= 0);
    if (!cp.allowed) {
      for (const i of hits) {
        drop.add(i);
        soft.push(`${n1(i)} says the catchphrase, which this link may not use: cut it.`);
      }
    } else if (hits.length > 1) {
      for (const i of hits.slice(1)) drop.add(i);
      soft.push(`The catchphrase is said ${hits.length} times: once at most.`);
    }
  }
  // The listener's name
  if (ctx.listenerName && ctx.listenerName.length >= 2) {
    const nameHits = lines.filter((l) => saysName(l.text, ctx.listenerName!)).length;
    if (nameHits > 1) soft.push(`The listener's name is said ${nameHits} times: once, in the greeting.`);
  }
  // Invented names, numbers and places
  for (const u of unsupportedTokens(lines, ctx)) {
    hard.push(`${n1(u.line)} says "${u.token}", which is not in the context: never add a ${u.kind === 'number' ? 'number' : u.kind === 'place' ? 'place' : 'name'} the blocks did not give.`);
  }
  // The handover says more than NEXT allows
  const nextRe = ctx.nextType === 'news' ? NEWS_WORDS : ctx.nextType === 'ad_break' ? BREAK_WORDS : ctx.nextType === 'kahani' ? STORY_WORDS : null;
  if (nextRe) {
    const allowed = allowedFrom(ctx);
    lines.forEach((l, i) => {
      if (!nextRe.test(l.text)) return;
      const extra = latinWords(l.text).filter((w) => !FRAME_LATIN.has(w) && !allowed.folded.includes(w) && !nextRe.test(w));
      if (extra.length) hard.push(`${n1(i)} describes what is next ("${extra.join(' ')}"), which you were not given: say only what NEXT allows.`);
    });
  }
}

function checkNews(lines: FreeLine[], ctx: FreeContext, hard: string[], soft: string[], drop: Set<number>): void {
  const unsupported = unsupportedTokens(lines, ctx, { words: true });
  const byLine = new Map<number, Unsupported[]>();
  for (const u of unsupported) byLine.set(u.line, [...(byLine.get(u.line) ?? []), u]);
  for (const [i, us] of byLine) {
    const strong = us.filter((u) => u.kind !== 'word');
    if (strong.length) {
      drop.add(i);
      soft.push(`${n1(i)} says ${strong.map((u) => `"${u.token}"`).join(', ')}, which no item gives: dropped.`);
    } else {
      soft.push(`${n1(i)} uses English words no item uses (${us.map((u) => u.token).join(', ')}): say it in the item's own words.`);
    }
  }
  const allowed = allowedFrom(ctx);
  lines.forEach((l, i) => {
    const m = l.text.match(HEARSAY);
    if (m && !allowed.text.includes(m[0])) {
      drop.add(i);
      soft.push(`${n1(i)} says "${m[0]}", which no item says: dropped.`);
    }
  });
  const min = ctx.mode === 'update' ? 4 : 8;
  const left = lines.length - drop.size;
  if (drop.size && left < min) hard.push(`Only ${left} lines are left after dropping invented ones: rewrite from the items only.`);
  const first = lines.find((_, i) => !drop.has(i));
  if (first && /[!]/.test(first.text) && /excited|shout/.test(first.delivery ?? '')) soft.push('The open is shouted: news opens calm.');
}

function checkAd(lines: FreeLine[], ctx: FreeContext, hard: string[], soft: string[]): void {
  const n = lines.length;
  const chars = lines.reduce((s, l) => s + l.text.length, 0);
  if (chars > 520) hard.push(`Too long to say in 20 seconds (${chars} characters): under 400.`);
  else if (chars > 420) soft.push(`${chars} characters: aim for under 400.`);

  const brand = (ctx.brand ?? '').trim();
  const brandKey = brand ? squash(brand.split(/\s+/)[0]) : '';
  if (brandKey.length >= 2) {
    const mentions = lines.reduce((s, l) => s + (squash(l.text).split(brandKey).length - 1), 0);
    if (mentions === 0) hard.push(`The brand "${brand}" is never said: say it once or twice.`);
    else if (mentions > 3) hard.push(`The brand is said ${mentions} times: once or twice, never chanted.`);
    lines.forEach((l, i) => {
      const rest = wordsOf(l.text).filter((w) => !squash(w).startsWith(brandKey.slice(0, Math.max(2, brandKey.length - 1))) && w.length > 1);
      if (rest.length < 2) hard.push(`${n1(i)} is only the brand name: every line must move the joke.`);
    });
  }
  // One brand: two different invented Latin product names is two brands
  const brandsSaid = new Set(lines.flatMap((l) => latinNames(l.text)).map((b) => b.toLowerCase()).filter((b) => !FRAME_LATIN.has(b) && b.length >= 4));
  if (brandKey && brandsSaid.size >= 2 && ![...brandsSaid].every((b) => squash(brand).includes(b) || b.includes(brandKey))) {
    const others = [...brandsSaid].filter((b) => !squash(brand).includes(b));
    if (others.length >= 2) soft.push(`More than one product name (${others.join(', ')}): one brand per ad.`);
  }

  const tncLine = lines.findIndex((l) => TNC.test(l.text));
  const fastEnd = lines.slice(-2).some((l) => l.delivery === 'fast');
  if (ctx.tnc === 'required' && tncLine < 0 && !fastEnd) hard.push('This format needs the fast fine-print beat near the end, and the joke lives in it.');
  lines.forEach((l, i) => {
    if (i === tncLine || i === n - 1) return;
    if (LATIN_RUN.test(l.text)) hard.push(`${n1(i)} is a full English sentence: keep the sentence in the station language, English only for single words.`);
  });

  // The punchline: planned and landed at the end, or at least not a bare call to action
  const tail = lines.slice(-2).map((l) => l.text).join(' ');
  if (ctx.punchline && wordsOf(ctx.punchline).length >= 2) {
    if (overlap(tail, ctx.punchline) < 0.25) hard.push('The punchline you planned never lands in the last two lines: end on the joke.');
  }
  const last = lines[n - 1]?.text ?? '';
  if (CTA_END.test(last) && !TNC.test(last) && (!ctx.punchline || overlap(last, ctx.punchline) < 0.25)) soft.push(`${n1(n - 1)} ends on "buy it now": the last laugh should be the punchline, not a call to action.`);

  // Real landmarks in a fictional ad (no local pack in ads)
  for (const group of LANDMARKS) {
    lines.forEach((l, i) => {
      const said = placeMentioned(group, l.text);
      if (said) hard.push(`${n1(i)} puts a real landmark ("${said}") in a fictional ad: keep it to the everyday problem.`);
    });
  }
}

function checkKahani(lines: FreeLine[], ctx: FreeContext, hard: string[], soft: string[]): void {
  const n = lines.length;
  const station = ctx.station;
  const final = Boolean(ctx.oneShot) || ctx.part === 3;
  const last = lines[n - 1]?.text ?? '';
  if (final && endsWithQuestion(last)) hard.push(`${n1(n - 1)} ends the story on a question: the final part ends on the payoff, a smile or a one-line moral.`);
  if (!final && n && /^(?:क्यों|क्या|अचानक|why|what)\s*[?？!।.]*$/iu.test(fold(last).replace(/[?？!।.\s]+$/u, '').trim())) {
    hard.push(`${n1(n - 1)} ends on a vague word, not a new concrete fact.`);
  }
  if (ctx.expectedLastLine && overlap(last, ctx.expectedLastLine) < 0.3) {
    hard.push(`The part must end on the outline's line: "${ctx.expectedLastLine}".`);
  }

  // Names early: before a character's 2nd line ends, the listener has heard their name
  const names = ctx.names ?? {};
  const spoken = new Map<string, number>();
  lines.forEach((l, i) => {
    if (!l.role.startsWith('char_')) return;
    const count = (spoken.get(l.role) ?? 0) + 1;
    spoken.set(l.role, count);
    const name = names[l.role];
    if (count === 2 && name && !lines.slice(0, i + 1).some((x) => saysName(x.text, name))) {
      hard.push(`${n1(i)}: ${l.role} has spoken twice but the listener never heard their name ("${name}"). Have someone say it in their first exchange.`);
    }
  });
  // Kinship words only as the outline's relations define them
  if (ctx.relations) {
    for (const k of undefinedKinship(lines, ctx.relations, station)) {
      hard.push(`${n1(k.line)} says "${k.word}", but the relations never make anyone that: use names or the outline's relations.`);
    }
  } else {
    // Without relations: the same kinship address from two different speakers is a likely mix-up
    const users = new Map<string, Set<string>>();
    lines.forEach((l) => {
      if (l.role === 'narrator') return;
      for (const w of kinshipWords(l.text, station)) users.set(w, new Set([...(users.get(w) ?? []), l.role]));
    });
    for (const [w, roles] of users) if (roles.size >= 2) soft.push(`"${w}" is said by ${[...roles].join(' and ')}: check who is whose ${w}.`);
  }

  // Narrator share and monologues
  const narr = lines.filter((l) => l.role === 'narrator').length;
  if (n >= 8 && narr / n > 0.4) soft.push(`The narrator has ${narr} of ${n} lines: at most 40%, let the dialogue carry it.`);
  let run = 1;
  for (let i = 1; i < n; i++) {
    run = lines[i].role === lines[i - 1].role ? run + 1 : 1;
    if (run === 4 && lines[i].role !== 'narrator') hard.push(`Lines ${i - 2}-${i + 1}: ${lines[i].role} speaks 4 lines in a row to nobody: give the other character a reply.`);
  }
  const roles = new Set(lines.map((l) => l.role));
  for (const r of Object.keys(names)) if (names[r] && !roles.has(r)) soft.push(`${r} (${names[r]}) never speaks in this part.`);
}
