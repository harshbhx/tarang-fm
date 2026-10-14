/**
 * Live welcomes for "Listen together": cleans the name a listener types, and writes the RJ's on-air
 * welcome from fixed templates. Names are only ever dropped into these templates, never sent to a model.
 */
import { LIVE_NAME_MAX } from '../../shared/live';
import type { Station, StationId } from '../../shared/types';
import { hasProfanity } from '../subtitle';

// ---- Name sanitizer ---------------------------------------------------------------------------

/** Latin plus the Indic scripts the stations can voice. */
const SCRIPTS =
  '\\p{Script=Latin}\\p{Script=Devanagari}\\p{Script=Bengali}\\p{Script=Gurmukhi}\\p{Script=Gujarati}' +
  '\\p{Script=Oriya}\\p{Script=Tamil}\\p{Script=Telugu}\\p{Script=Kannada}\\p{Script=Malayalam}';
/** Everything else goes, including stacked combining diacritics (Indic vowel signs belong to their own script). */
const DISALLOWED = new RegExp(`[^${SCRIPTS}\\p{Nd}\\u200C\\u200D .'’-]`, 'gu');

const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}︀-️⃣]/gu;
const FORMAT_CHARS = /(?![‌‍])\p{Cf}/gu;
/** Generic combining diacritics (after NFC, ordinary accented Latin letters are single characters). */
const DIACRITICS = /[̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-︯]/gu;
const URL = /(?:https?:\/\/|www\.)\S*/giu;
const BARE_DOMAIN =
  /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|in|io|co|me|ai|app|dev|xyz|info|biz|gg|tv|ly|to|link|site|online|store|shop|live|club|tech|us|uk)\b\S*/giu;
const EMAIL_OR_HANDLE = /\S*@\S*/gu;
const HASHTAG = /#\S*/gu;
/** A digit run, allowing the spaces and dashes people put inside phone numbers. */
const DIGIT_RUN = /\p{Nd}(?:[\s().\-–]*\p{Nd})*/gu;
const MIN_STRIPPED_DIGITS = 3;
/** Marks and joiners left without a letter to sit on. */
const ORPHAN_MARKS = /(^|[^\p{L}\p{M}‌‍])[\p{M}‌‍]+/gu;
const TRAILING_JOINER = /[‌‍]+(?![\p{L}\p{M}])/gu;
const VIRAMA_OR_JOINER = /[्্੍્୍்్್്‌‍]/u;
const MARK_OR_JOINER = /[\p{M}‌‍]/u;

/** "my name is Harsh" → "Harsh"; "मेरा नाम हर्ष है" → "हर्ष". */
const NAME_INTRO = /^(?:(?:hi|hello|hey|namaste)[\s,!]+)?(?:my name is|my name['’]s|myself|i am|i['’]?m|this is|it['’]?s|mera naam|मेरा नाम|माझं नाव)\s+/iu;
const NAME_OUTRO = /\s+(?:hai|है|आहे)$/iu;

/** Instructions and spam typed as a name: never read on air. */
const NOT_A_NAME = new RegExp(
  [
    '\\bignor(?:e|ing)\\b',
    '\\bdisregard\\b',
    '\\binstruction',
    '\\bprompts?\\b',
    '\\bsystem\\b',
    '\\bjailbreak',
    '\\boverride\\b',
    '\\bdeveloper mode\\b',
    '\\bact as\\b',
    '\\bpretend\\b',
    '\\byou are\\b',
    '\\bforget\\b',
    '\\bprevious\\b',
    '\\brepeat after\\b',
    '\\b(?:chat)?gpt\\b',
    '\\bsudo\\b',
    '\\bcall me\\b',
    '\\b(?:dm|text|ping) me\\b',
    '\\bfollow me\\b',
    '\\bwhats\\s?app\\b',
    '\\btelegram\\b',
    '\\binsta(?:gram)?\\b',
    '\\bsubscribe\\b',
    '\\bcontact\\b',
    '\\bphone\\b',
    '\\bnumber\\b',
    '\\bclick\\b',
    'निर्देश',
    'अनदेखा',
    'नजरअंदाज',
    'प्रॉम्प्ट',
    'सिस्टम',
  ].join('|'),
  'iu',
);

/** Abuse in Latin script that the subtitle guard does not list. */
const ABUSE_LATIN = new RegExp(
  [
    '\\br[au]ndi\\w*',
    '\\b(?:lund|lauda|lavda|lawda|lavde|loda|lodu)\\b',
    '\\bjhaa?tu\\b',
    '\\bbhadw[ae]\\w*',
    '\\bchinaa?l\\b',
    '\\bkamine?a?\\b',
    '\\bz(?:h)?avad\\w*',
    '\\bpunda[i]?\\b',
    '\\bthev(?:i|u)?diya\\w*',
    '\\bo(?:t)?tha\\b',
    '\\bommala\\b',
    '\\bkhanki\\w*',
    '\\bboka\\s?choda\\b',
    '\\bporn\\w*',
    '\\bsexy?\\b',
    '\\bnude\\w*',
    '\\bnaked\\b',
    '\\brap(?:e|es|ed|ist|ists)\\b',
    '\\bnigg\\w*',
    '\\bfag(?:s|got\\w*)?\\b',
    '\\bpuss(?:y|ies)\\b',
    '\\bcocks?\\b',
    '\\bpenis\\w*',
    '\\bvagina\\w*',
    '\\bboobs?\\b',
    '\\btits\\b',
    '\\bretard\\w*',
    '\\bnazi\\w*',
    '\\bhitler\\b',
  ].join('|'),
  'iu',
);

/** Nukta signs are dropped before matching, so "हरामज़ादा" and "हरामजादा" match alike. */
const NUKTA = /[़়਼઼଼]/gu;
const plain = (s: string) => s.normalize('NFC').replace(NUKTA, '');

/** Abuse in Devanagari (Hindi, Marathi), Bengali, Tamil and Gujarati: matched anywhere in the name. */
const ABUSE_ANYWHERE = [
  // Devanagari
  'चूतिय', 'चुतिय', 'चोद', 'भोसड', 'रंडी', 'रण्डी', 'हरामी', 'हरामजाद', 'हरामखोर', 'गांडू', 'गाँडू', 'गान्डू',
  'लौडा', 'लवडा', 'लवड्या', 'झवाड', 'भडव', 'रांडेच', 'छिनाल', 'कमीन', 'कुत्ती', 'आईघाल',
  // Bengali
  'চোদ(?!্দ)', 'চুদ', 'খানকি', 'গান্ডু', 'বেশ্যা', 'হারামি', 'শুয়োরের বাচ্চা', 'বাঁড়া',
  // Tamil
  'ஓத்த', 'ஓம்மால', 'ஒம்மால', 'தேவடியா', 'தேவுடியா', 'தேவிடியா', 'புண்டை', 'கூதி', 'சூத்து', 'தாயோளி', 'லவடா',
  // Gujarati
  'ચોદ', 'ભોસડ', 'રંડી', 'છિનાળ', 'હરામી', 'હરામખોર', 'લવડ',
];
/** Short words that are abuse only on their own (they also occur inside harmless words). */
const ABUSE_WHOLE_WORD = ['लंड', 'झाटू', 'गांड', 'गाँड', 'रांड', 'মাগী', 'মাগি', 'புண்ட', 'மயிரு', 'பூல்', 'ગાંડ', 'લોડો'];
const ABUSE_INDIC = new RegExp(
  [
    ...ABUSE_ANYWHERE.map(plain),
    ...ABUSE_WHOLE_WORD.map((w) => `(?<![\\p{L}\\p{M}])${plain(w)}(?![\\p{L}\\p{M}])`),
  ].join('|'),
  'u',
);

function isAbusive(name: string): boolean {
  const variants = [name];
  // Spelled out letter by letter ("b i t c h", "f.u.c.k"): check it joined up too.
  const parts = name.split(/[\s.'’\-*_]+/u).filter(Boolean);
  if (parts.filter((p) => [...p].length <= 2).length >= 3) variants.push(parts.join(''));
  return variants.some((s) => hasProfanity(s) || ABUSE_LATIN.test(s) || ABUSE_INDIC.test(plain(s)));
}

/** Cuts at `max` chars without splitting a syllable (no dangling vowel sign, virama or joiner). */
function sliceSyllables(s: string, max: number): string {
  let end = Math.min(max, s.length);
  while (end > 1 && (MARK_OR_JOINER.test(s[end] ?? '') || VIRAMA_OR_JOINER.test(s[end - 1]))) end--;
  return s.slice(0, end);
}

/** Shortens to `max` chars on a word boundary (or a syllable boundary for a single long word). */
function clipName(name: string, max: number): string {
  if (name.length <= max) return name;
  const space = name.lastIndexOf(' ', max);
  const cut = space > 0 ? name.slice(0, space) : sliceSyllables(name, max);
  return cut.replace(/[\s.'’-]+$/u, '');
}

/**
 * Cleans a typed listener name for on-air use: drops control characters, emoji, links, emails,
 * @handles and phone-number-like digit runs, keeps Latin and Indic letters, and caps the length at
 * LIVE_NAME_MAX on a word boundary. Returns undefined for an empty, abusive or instruction-like name.
 */
export function sanitizeLiveName(raw: string): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const input = raw.normalize('NFC');
  if (NOT_A_NAME.test(plain(input)) || isAbusive(input)) return undefined;

  let s = input
    .replace(/[\p{Cc}\p{Zl}\p{Zp}\p{Zs}]/gu, ' ')
    .replace(FORMAT_CHARS, '')
    .replace(URL, ' ')
    .replace(EMAIL_OR_HANDLE, ' ')
    .replace(BARE_DOMAIN, ' ')
    .replace(HASHTAG, ' ')
    .replace(EMOJI, '')
    .replace(DIACRITICS, '')
    .replace(DIGIT_RUN, (run) => (run.replace(/\P{Nd}/gu, '').length >= MIN_STRIPPED_DIGITS ? ' ' : run))
    .replace(DISALLOWED, ' ')
    .replace(ORPHAN_MARKS, '$1')
    .replace(TRAILING_JOINER, '')
    .replace(/([.'’-])[.'’-]+/gu, '$1')
    .replace(/(\p{L})\1{2,}/gu, '$1$1');

  // Keep words that have a letter in them, without stray punctuation at their edges.
  s = s
    .split(/\s+/u)
    .map((word) => word.replace(/^[.'’-]+|[.'’-]+$/gu, ''))
    .filter((word) => /\p{L}/u.test(word))
    .join(' ');

  if (NAME_INTRO.test(s)) s = s.replace(NAME_INTRO, '').replace(NAME_OUTRO, '');
  s = clipName(s.trim(), LIVE_NAME_MAX);

  if (!/\p{L}/u.test(s) || isAbusive(s)) return undefined;
  return s;
}

// ---- Welcome lines ----------------------------------------------------------------------------

/** Max chars of a welcome line. */
const WELCOME_MAX_CHARS = 200;
/** Names longer than this (a long transliteration) are shortened before they go into a line. */
const WELCOME_NAME_MAX = 40;

/** [spoken text, English subtitle]; `{who}` is the name or names, `{n}` the number listening. */
type Template = readonly [text: string, en: string];

interface WelcomePack {
  /** The first listener, alone in the studio */
  solo: Template[];
  /** One new name, others already listening */
  one: Template[];
  two: Template[];
  /** Three or more names */
  many: Template[];
  /** List separator and the word before the last item: "हर्ष, प्रिया और अमित" */
  sep: string;
  and: string;
  /** "2 more friends" */
  others: (n: number) => string;
  /** Used when no name came through */
  friend: string;
}

/** Hindi is required: it is the fallback for stations without their own pack. */
const PACKS: { hi: WelcomePack } & Partial<Record<StationId, WelcomePack>> = {
  hi: {
    solo: [
      ['अरे, {who}! आज की पहली entry आपकी है, studio अभी सिर्फ़ आपके लिए खुला है।', "Hey, {who}! You're the first one in today, the studio is open just for you."],
      ['Welcome {who}! अभी तरंग पर सिर्फ़ आप और मैं हैं, तो आज का show पूरा आपके नाम।', "Welcome {who}! Right now it's just you and me on Tarang, so today's show is all yours."],
      ['{who}, studio के दरवाज़े पर पहली दस्तक आपकी! आइए, बैठिए, आज बातें खूब होंगी।', "{who}, the first knock on the studio door is yours! Come in, have a seat, we've got lots to talk about."],
      ['नमस्ते {who}! आज की महफ़िल आपसे शुरू हो रही है, बाकी दोस्त भी बस आते ही होंगे।', "Namaste {who}! Today's gathering starts with you, the others must be on their way."],
    ],
    one: [
      ['अरे वाह, {who} भी हमारे साथ हैं! अब हम {n} लोग साथ सुन रहे हैं, welcome {who}!', 'Oh wow, {who} is here too! Now {n} of us are listening together, welcome {who}!'],
      ['{who}, तरंग पर आपका स्वागत है! अब {n} लोग एक साथ सुन रहे हैं।', '{who}, welcome to Tarang! Now {n} people are listening together.'],
      ['Hello {who}! बढ़िया timing, अभी तरंग पर {n} लोग साथ-साथ सुन रहे हैं।', 'Hello {who}! Great timing, {n} people are listening to Tarang together right now.'],
      ['स्वागत है {who}! महफ़िल जम रही है, अब हम {n} लोग साथ हैं।', 'Welcome, {who}! The party is warming up, now there are {n} of us together.'],
      ['तरंग परिवार में एक और नाम, {who}! अब {n} लोग साथ सुन रहे हैं। दिल से सुनिए, दिल की बात!', 'One more name in the Tarang family, {who}! Now {n} people are listening together. Listen with your heart!'],
    ],
    two: [
      ['अरे वाह, {who} दोनों हमारे साथ हैं! अब हम {n} लोग साथ सुन रहे हैं, welcome!', 'Oh wow, both {who} are here! Now {n} of us are listening together, welcome!'],
      ['{who}, आप दोनों का तरंग पर स्वागत है! अब {n} लोग एक साथ सुन रहे हैं।', '{who}, welcome to Tarang, both of you! Now {n} people are listening together.'],
      ['Double entry! {who}, स्वागत है! अब हम {n} लोग साथ हैं।', 'Double entry! {who}, welcome! Now there are {n} of us together.'],
      ['Hello {who}! एक साथ 2 नए दोस्त, अब तरंग पर {n} लोग साथ-साथ सुन रहे हैं।', 'Hello {who}! 2 new friends at once, now {n} people are listening to Tarang together.'],
    ],
    many: [
      ['अरे वाह, पूरी टोली आ गई! {who}, आप सबका स्वागत है! अब हम {n} लोग साथ सुन रहे हैं।', 'Oh wow, the whole gang is here! {who}, welcome, all of you! Now {n} of us are listening together.'],
      ['{who}, तरंग पर आप सबका स्वागत है! अब {n} लोग एक साथ सुन रहे हैं, क्या बात है!', '{who}, welcome to Tarang, everyone! Now {n} people are listening together, how wonderful!'],
      ['महफ़िल जम गई! {who}, welcome! अब हम पूरे {n} लोग साथ हैं।', "Now it's a party! {who}, welcome! There are {n} of us together now."],
      ['Hello hello! {who} भी हमारे साथ हैं, अब तरंग पर {n} लोग साथ-साथ सुन रहे हैं।', 'Hello hello! {who} are here too, now {n} people are listening to Tarang together.'],
    ],
    sep: ', ',
    and: ' और ',
    others: (n) => `${n} और दोस्त`,
    friend: 'दोस्त',
  },
  mr: {
    solo: [
      ['अरे, {who}! आजची पहिली entry तुमची, studio आत्ता खास तुमच्यासाठी उघडा आहे.', "Hey, {who}! Today's first entry is yours, the studio is open just for you right now."],
      ['Welcome {who}! आत्ता तरंगवर फक्त तुम्ही आणि मी, म्हणजे आजचा show खास तुमचा!', "Welcome {who}! Right now it's just you and me on Tarang, so today's show is all yours!"],
      ['{who}, स्टुडिओच्या दारावर पहिली थाप तुमचीच! या, बसा, गप्पा मारूया.', "{who}, the first knock on the studio door is yours! Come in, sit down, let's chat."],
      ['नमस्कार {who}! आजची मैफल तुमच्यापासून सुरू होतेय, बाकीचे मित्रही येतीलच इतक्यात.', "Namaskar {who}! Today's gathering starts with you, the other friends will be here any moment."],
    ],
    one: [
      ['अरे वा, {who} पण आपल्यासोबत आहेत! आता आपण {n} जण एकत्र ऐकतोय, welcome {who}!', 'Oh wow, {who} is with us too! Now {n} of us are listening together, welcome {who}!'],
      ['{who}, तरंगवर तुमचं मनापासून स्वागत! आता {n} जण एकत्र ऐकत आहेत.', '{who}, a warm welcome to Tarang! Now {n} people are listening together.'],
      ['Hello {who}! एकदम perfect timing, आत्ता तरंगवर आपण {n} जण एकत्र आहोत.', 'Hello {who}! Perfect timing, there are {n} of us together on Tarang right now.'],
      ['स्वागत आहे {who}! गप्पांची मैफल रंगतेय, आता आपण {n} जण आहोत. तरंगवर राहा, मस्त राहा!', 'Welcome, {who}! The chat is getting lively, there are {n} of us now. Stay with Tarang, stay happy!'],
    ],
    two: [
      ['अरे वा, {who} दोघंही आपल्यासोबत आहेत! आता आपण {n} जण एकत्र ऐकतोय, welcome!', 'Oh wow, both {who} are with us! Now {n} of us are listening together, welcome!'],
      ['{who}, तुम्हा दोघांचं तरंगवर मनापासून स्वागत! आता {n} जण एकत्र ऐकत आहेत.', '{who}, a warm welcome to Tarang to both of you! Now {n} people are listening together.'],
      ['Double entry! {who}, या या! आता आपण {n} जण एकत्र आहोत.', 'Double entry! {who}, come on in! Now there are {n} of us together.'],
      ['Hello {who}! एकाच वेळी 2 नवे मित्र, आता तरंगवर {n} जण एकत्र ऐकत आहेत.', 'Hello {who}! 2 new friends at once, now {n} people are listening to Tarang together.'],
    ],
    many: [
      ['अरे वा, मित्रांची अख्खी टोळीच आली! {who}, तुम्हा सगळ्यांचं स्वागत! आता आपण {n} जण एकत्र ऐकतोय.', 'Oh wow, the whole gang is here! {who}, welcome, all of you! Now {n} of us are listening together.'],
      ['{who}, तरंगवर तुम्हा सगळ्यांचं मनापासून स्वागत! आता {n} जण एकत्र ऐकत आहेत, एकदम मस्त!', '{who}, a warm welcome to Tarang, everyone! Now {n} people are listening together, awesome!'],
      ['मैफल रंगली! {who}, welcome! आता आपण {n} जण एकत्र आहोत.', "Now it's a party! {who}, welcome! There are {n} of us together now."],
      ['Hello hello! {who} पण आपल्यासोबत आहेत, आता तरंगवर {n} जण एकत्र ऐकत आहेत.', 'Hello hello! {who} are with us too, now {n} people are listening to Tarang together.'],
    ],
    sep: ', ',
    and: ' आणि ',
    others: (n) => `अजून ${n} मित्र`,
    friend: 'मित्र',
  },
  ta: {
    solo: [
      ['அட, {who}! இன்னைக்கு first entry உங்களோடது தான், studio இப்போ உங்களுக்காகவே திறந்திருக்கு.', "Hey, {who}! Today's first entry is yours, the studio is open just for you right now."],
      ['Welcome {who}! இப்போ தரங்ல நீங்களும் நானும் மட்டும் தான், அதனால இன்னைக்கு show முழுக்க உங்களுக்கு தான்!', "Welcome {who}! Right now it's just you and me on Tarang, so today's show is all yours!"],
      ['{who}, studio கதவை முதல்ல தட்டினது நீங்க தான்! வாங்க, பேசலாம்.', "{who}, you're the first to knock on the studio door! Come in, let's talk."],
      ['வணக்கம் {who}! இன்னைக்கு கொண்டாட்டம் உங்ககிட்ட இருந்து தான் ஆரம்பம், மத்த நண்பர்களும் சீக்கிரம் வந்துடுவாங்க.', "Vanakkam {who}! Today's celebration starts with you, the other friends will be here soon."],
    ],
    one: [
      ['அட, {who} வந்தாச்சு! இப்போ நாம {n} பேர் சேர்ந்து கேட்டுட்டு இருக்கோம், welcome {who}!', 'Hey, {who} is here! Now {n} of us are listening together, welcome {who}!'],
      ['{who}, தரங்குக்கு உங்களை அன்போட வரவேற்கிறோம்! இப்போ {n} பேர் ஒண்ணா கேட்டுட்டு இருக்காங்க.', '{who}, a warm welcome to Tarang! Now {n} people are listening together.'],
      ['Hello {who}! சரியான timing, இப்போ தரங்ல நாம {n} பேர் ஒண்ணா இருக்கோம்.', 'Hello {who}! Perfect timing, there are {n} of us together on Tarang right now.'],
      ['வாங்க {who}, வாங்க! இப்போ நாம {n} பேர். தரங்கோட இருங்க, சந்தோஷமா இருங்க!', 'Come on in, {who}! There are {n} of us now. Stay with Tarang, stay happy!'],
    ],
    two: [
      ['அட, {who} ரெண்டு பேரும் வந்தாச்சு! இப்போ நாம {n} பேர் சேர்ந்து கேட்டுட்டு இருக்கோம், welcome!', 'Hey, {who} are both here! Now {n} of us are listening together, welcome!'],
      ['{who}, உங்க ரெண்டு பேரையும் தரங்குக்கு அன்போட வரவேற்கிறோம்! இப்போ {n} பேர் ஒண்ணா கேட்டுட்டு இருக்காங்க.', '{who}, a warm welcome to Tarang to both of you! Now {n} people are listening together.'],
      ['Double entry! {who}, வாங்க வாங்க! இப்போ நாம {n} பேர் ஒண்ணா இருக்கோம்.', 'Double entry! {who}, come on in! Now there are {n} of us together.'],
      ['Hello {who}! ஒரே நேரத்துல 2 புது நண்பர்கள், இப்போ தரங்ல {n} பேர் ஒண்ணா கேட்டுட்டு இருக்காங்க.', 'Hello {who}! 2 new friends at once, now {n} people are listening to Tarang together.'],
    ],
    many: [
      ['அட, நம்ம கூட்டமே வந்தாச்சு! {who}, எல்லாருக்கும் welcome! இப்போ நாம {n} பேர் சேர்ந்து கேட்டுட்டு இருக்கோம்.', 'Hey, the whole crowd is here! {who}, welcome, everyone! Now {n} of us are listening together.'],
      ['{who}, உங்க எல்லாரையும் தரங்குக்கு அன்போட வரவேற்கிறோம்! இப்போ {n} பேர் ஒண்ணா கேட்டுட்டு இருக்காங்க, சூப்பர்!', '{who}, a warm welcome to Tarang, everyone! Now {n} people are listening together, super!'],
      ['களை கட்டிடுச்சு! {who}, welcome! இப்போ நாம {n} பேர் ஒண்ணா இருக்கோம்.', "Now it's a party! {who}, welcome! There are {n} of us together now."],
      ['Hello hello! {who} எல்லாரும் நம்ம கூட இருக்காங்க, இப்போ தரங்ல {n} பேர் ஒண்ணா கேட்டுட்டு இருக்காங்க.', 'Hello hello! {who} are all with us, now {n} people are listening to Tarang together.'],
    ],
    sep: ', ',
    and: ', ',
    others: (n) => `இன்னும் ${n} பேர்`,
    friend: 'நண்பர்',
  },
  bn: {
    solo: [
      ['আরে, {who}! আজকের প্রথম entry আপনার, studio এখন শুধু আপনার জন্যই খোলা।', "Hey, {who}! Today's first entry is yours, the studio is open just for you right now."],
      ['Welcome {who}! এখন তরঙ্গে শুধু আপনি আর আমি, তাই আজকের show পুরোটাই আপনার!', "Welcome {who}! Right now it's just you and me on Tarang, so today's show is all yours!"],
      ['{who}, স্টুডিওর দরজায় প্রথম কড়া নাড়লেন আপনিই! আসুন, আড্ডা শুরু করা যাক।', "{who}, you're the first to knock on the studio door! Come in, let's get the adda going."],
      ['নমস্কার {who}! আজকের আসর শুরু হচ্ছে আপনাকে দিয়েই, বাকি বন্ধুরাও এই এল বলে।', "Namaskar {who}! Today's gathering starts with you, the other friends will be here any moment."],
    ],
    one: [
      ['আরে বাহ, {who} এসে গেছেন! এখন আমরা {n} জন একসঙ্গে শুনছি, welcome {who}!', 'Oh wow, {who} is here! Now {n} of us are listening together, welcome {who}!'],
      ['{who}, তরঙ্গে আপনাকে স্বাগত! এখন {n} জন একসঙ্গে শুনছেন।', '{who}, welcome to Tarang! Now {n} people are listening together.'],
      ['Hello {who}! একদম ঠিক সময়ে এসেছেন, এখন তরঙ্গে আমরা {n} জন একসঙ্গে।', 'Hello {who}! Perfect timing, there are {n} of us together on Tarang now.'],
      ['আসুন {who}, আসুন! আড্ডা জমে উঠেছে, এখন আমরা {n} জন। তরঙ্গে থাকুন, ভালো থাকুন!', 'Come on in, {who}! The adda is heating up, there are {n} of us now. Stay with Tarang, stay well!'],
    ],
    two: [
      ['আরে বাহ, {who} দুজনেই এসে গেছেন! এখন আমরা {n} জন একসঙ্গে শুনছি, welcome!', 'Oh wow, both {who} are here! Now {n} of us are listening together, welcome!'],
      ['{who}, তরঙ্গে আপনাদের দুজনকেই স্বাগত! এখন {n} জন একসঙ্গে শুনছেন।', '{who}, welcome to Tarang, both of you! Now {n} people are listening together.'],
      ['Double entry! {who}, আসুন আসুন! এখন আমরা {n} জন একসঙ্গে।', 'Double entry! {who}, come on in! Now there are {n} of us together.'],
      ['Hello {who}! একসঙ্গে 2 জন নতুন বন্ধু, এখন তরঙ্গে {n} জন একসঙ্গে শুনছেন।', 'Hello {who}! 2 new friends at once, now {n} people are listening to Tarang together.'],
    ],
    many: [
      ['আরে বাহ, পুরো দলবল এসে গেছে! {who}, সবাইকে স্বাগত! এখন আমরা {n} জন একসঙ্গে শুনছি।', 'Oh wow, the whole gang is here! {who}, welcome, everyone! Now {n} of us are listening together.'],
      ['{who}, তরঙ্গে আপনাদের সবাইকে স্বাগত! এখন {n} জন একসঙ্গে শুনছেন, দারুণ ব্যাপার!', '{who}, welcome to Tarang, everyone! Now {n} people are listening together, brilliant!'],
      ['আড্ডা জমে গেছে! {who}, welcome! এখন আমরা {n} জন একসঙ্গে।', 'The adda is on! {who}, welcome! Now there are {n} of us together.'],
      ['Hello hello! {who} সবাই আমাদের সঙ্গে আছেন, এখন তরঙ্গে {n} জন একসঙ্গে শুনছেন।', 'Hello hello! {who} are all with us, now {n} people are listening to Tarang together.'],
    ],
    sep: ', ',
    and: ' আর ',
    others: (n) => `আরও ${n} জন বন্ধু`,
    friend: 'বন্ধু',
  },
  gu: {
    solo: [
      ['અરે, {who}! આજની પહેલી entry તમારી છે, studio અત્યારે ખાસ તમારા માટે ખુલ્લો છે.', "Hey, {who}! Today's first entry is yours, the studio is open just for you right now."],
      ['Welcome {who}! અત્યારે તરંગ પર ફક્ત તમે અને હું છીએ, એટલે આજનો show આખો તમારો!', "Welcome {who}! Right now it's just you and me on Tarang, so today's show is all yours!"],
      ['{who}, સ્ટુડિયોના દરવાજે પહેલો ટકોરો તમારો! આવો, વાતો કરીએ.', "{who}, the first knock on the studio door is yours! Come in, let's chat."],
      ['કેમ છો {who}! આજની મહેફિલ તમારાથી શરૂ થાય છે, બાકીના મિત્રો પણ હમણાં આવતા જ હશે.', "Kem cho, {who}! Today's gathering starts with you, the other friends must be on their way."],
    ],
    one: [
      ['અરે વાહ, {who} પણ આપણી સાથે છે! હવે આપણે {n} જણ સાથે સાંભળી રહ્યા છીએ, welcome {who}!', 'Oh wow, {who} is with us too! Now {n} of us are listening together, welcome {who}!'],
      ['{who}, તરંગ પર તમારું દિલથી સ્વાગત છે! હવે {n} લોકો સાથે સાંભળી રહ્યા છે.', '{who}, a heartfelt welcome to Tarang! Now {n} people are listening together.'],
      ['Hello {who}! એકદમ perfect timing, અત્યારે તરંગ પર આપણે {n} જણ સાથે છીએ.', 'Hello {who}! Perfect timing, there are {n} of us together on Tarang right now.'],
      ['આવો {who}, આવો! મહેફિલ જામી છે, હવે આપણે {n} જણ છીએ. તરંગ પર રહો, મોજમાં રહો!', "Come on in, {who}! The party's on, there are {n} of us now. Stay with Tarang, stay happy!"],
    ],
    two: [
      ['અરે વાહ, {who} બંને આપણી સાથે છે! હવે આપણે {n} જણ સાથે સાંભળી રહ્યા છીએ, welcome!', 'Oh wow, both {who} are with us! Now {n} of us are listening together, welcome!'],
      ['{who}, તરંગ પર તમારા બંનેનું દિલથી સ્વાગત છે! હવે {n} લોકો સાથે સાંભળી રહ્યા છે.', '{who}, a heartfelt welcome to Tarang to both of you! Now {n} people are listening together.'],
      ['Double entry! {who}, આવો આવો! હવે આપણે {n} જણ સાથે છીએ.', 'Double entry! {who}, come on in! Now there are {n} of us together.'],
      ['Hello {who}! એક સાથે 2 નવા મિત્રો, હવે તરંગ પર {n} લોકો સાથે સાંભળી રહ્યા છે.', 'Hello {who}! 2 new friends at once, now {n} people are listening to Tarang together.'],
    ],
    many: [
      ['અરે વાહ, આખી ટોળકી આવી ગઈ! {who}, તમારા બધાનું સ્વાગત છે! હવે આપણે {n} જણ સાથે સાંભળી રહ્યા છીએ.', 'Oh wow, the whole gang is here! {who}, welcome, all of you! Now {n} of us are listening together.'],
      ['{who}, તરંગ પર તમારા બધાનું દિલથી સ્વાગત છે! હવે {n} લોકો સાથે સાંભળી રહ્યા છે, મજા આવી ગઈ!', '{who}, a heartfelt welcome to Tarang, everyone! Now {n} people are listening together, what fun!'],
      ['મહેફિલ જામી ગઈ! {who}, welcome! હવે આપણે {n} જણ સાથે છીએ.', "Now it's a party! {who}, welcome! There are {n} of us together now."],
      ['Hello hello! {who} બધા આપણી સાથે છે, હવે તરંગ પર {n} લોકો સાથે સાંભળી રહ્યા છે.', 'Hello hello! {who} are all with us, now {n} people are listening to Tarang together.'],
    ],
    sep: ', ',
    and: ' અને ',
    others: (n) => `બીજા ${n} મિત્રો`,
    friend: 'મિત્ર',
  },
};

const EN_LIST = { sep: ', ', and: ' and ', others: (n: number) => `${n} more friends`, friend: 'friend' };

function joinNames(items: string[], sep: string, and: string): string {
  if (items.length < 2) return items[0] ?? '';
  return `${items.slice(0, -1).join(sep)}${and}${items[items.length - 1]}`;
}

function fill(template: string, who: string, n: number): string {
  return template.replace(/\{who\}/g, () => who).replace(/\{n\}/g, () => String(n));
}

/**
 * The RJ's live welcome for listeners who just joined, in the station's language and script, with an
 * English subtitle. `names` are already in the station script; `enNames` (same order) are the spellings
 * for the subtitle and default to `names`. `listenerCount` is everyone listening now, including them.
 */
export function welcomeLine(
  station: Station,
  names: string[],
  listenerCount: number,
  random: () => number = Math.random,
  enNames: string[] = names,
): { text: string; en: string } {
  const pack = PACKS[station.id] ?? PACKS.hi;

  // Unique, non-empty names, shortened so any line fits.
  const seen = new Set<string>();
  const people: { name: string; en: string }[] = [];
  names.forEach((raw, i) => {
    const name = clipName(String(raw ?? '').replace(/\s+/gu, ' ').trim(), WELCOME_NAME_MAX);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return;
    seen.add(key);
    const en = clipName(String(enNames[i] ?? '').replace(/\s+/gu, ' ').trim(), WELCOME_NAME_MAX);
    people.push({ name, en: en || name });
  });
  if (!people.length) people.push({ name: pack.friend, en: EN_LIST.friend });

  const count = Math.max(Number.isFinite(listenerCount) ? Math.floor(listenerCount) : 0, people.length, 1);
  const k = people.length;
  const pool = count === 1 ? pack.solo : k === 1 ? pack.one : k === 2 ? pack.two : pack.many;

  // Ways to say who joined, fullest first: "A, B and C" → "A and 2 more friends".
  const form = (listed: number): [string, string] => {
    const head = people.slice(0, listed);
    const rest = k - listed;
    const native = rest ? [...head.map((p) => p.name), pack.others(rest)] : head.map((p) => p.name);
    const en = rest ? [...head.map((p) => p.en), EN_LIST.others(rest)] : head.map((p) => p.en);
    return [joinNames(native, pack.sep, pack.and), joinNames(en, EN_LIST.sep, EN_LIST.and)];
  };
  const forms = k <= 2 ? [form(k)] : k === 3 ? [form(3), form(1)] : [form(2), form(1)];

  const pick = pool[Math.min(pool.length - 1, Math.floor(Math.max(0, random()) * pool.length))];
  const order = [pick, ...pool.filter((t) => t !== pick).sort((a, b) => a[0].length - b[0].length)];
  for (const [text, en] of order) {
    for (const [who, whoEn] of forms) {
      const line = fill(text, who, count);
      if (line.length <= WELCOME_MAX_CHARS) return { text: line, en: fill(en, whoEn, count) };
    }
  }
  // Unreachable with names capped at WELCOME_NAME_MAX; kept as a hard guarantee.
  const [text, en] = order[order.length - 1];
  const [who, whoEn] = [people[0].name, people[0].en];
  return { text: fill(text, who, count).slice(0, WELCOME_MAX_CHARS), en: fill(en, whoEn, count) };
}
