/**
 * Story engine: every Kahani and RJ link is built from a fresh brief drawn from large pools, so no two
 * segments share a premise. A Kahani brief seeds the serial outline with a setting, a hook and a twist type
 * (the daypart genre is seasoning) and comes with region-appropriate character names, so the writer starts
 * from something specific instead of reaching for the same haunted mansion every night. Each language's
 * storytelling words (part names, recap openers, fillers, examples) live here too. Ads are in pools/ads.ts,
 * casting in casting.ts.
 */
import type { Daypart, RecapSource, Segment, StationId } from '../shared/types';

type Random = () => number;

export function pickWith<T>(list: readonly T[], random: Random): T {
  return list[Math.floor(random() * list.length) % list.length];
}

/** `n` distinct items, in random order. */
export function sample<T>(list: readonly T[], n: number, random: Random): T[] {
  const pool = [...list];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(random() * pool.length) % pool.length, 1)[0]);
  return out;
}

// ---- Kahani --------------------------------------------------------------------------------------

export const STORY_GENRES: Record<Daypart, string[]> = {
  morning: [
    'a heart-warming slice-of-life story',
    'a clever-kid adventure',
    'an underdog story with a cheeky win',
    'a folk tale retold in a modern city',
    'a funny race against the clock',
    'a talking-animal fable for grown-ups',
    'a small-town sports story',
    'a feel-good story about an unlikely friendship',
    'a comedy about a family tradition gone wrong',
    'a story of a small act of kindness that snowballs',
  ],
  afternoon: [
    'a comedy of errors',
    'a light detective mystery',
    'a desi heist caper with nothing truly valuable at stake',
    'a workplace comedy',
    'a school-days comedy',
    'a food-rivalry comedy',
    'a mistaken-identity farce',
    'a gentle science-fiction story set in India',
    'a courtroom comedy over something tiny',
    'a road-trip story',
  ],
  evening: [
    'a family drama with a sweet twist',
    'a romantic misunderstanding',
    'a neighbourhood mystery',
    'a wedding-chaos comedy',
    'a reunion story',
    'a bittersweet story about a letter that arrives very late',
    'a story about a secret recipe',
    'a monsoon love story',
    'a story told across two generations',
    'a comedy about a family WhatsApp group',
  ],
  night: [
    'a mildly spooky ghost story where the ghost is not what it seems',
    'a suspense story on a night train',
    'a strange encounter on an empty road',
    'a time-loop mystery',
    'a story about a radio that picks up a voice from the past',
    'a lighthouse or watchtower mystery',
    'a night-shift story with an eerie visitor',
    'an urban legend that turns out to be true, sort of',
    'a quiet sci-fi story under the stars',
    'a cosy midnight mystery in a closed shop',
  ],
};

/** Settings close to each station's listeners, plus pan-India ones every station can use. */
export const STORY_SETTINGS: Record<StationId | 'any', string[]> = {
  hi: [
    'a ghat in Banaras at 5 am, as the first aarti bells ring',
    'a Lucknow kebab lane on the last night of Ramzan',
    'a toy train between Kalka and Shimla stuck in fog',
    'a Jaipur stepwell during a heatwave',
    'the Sarafa night market in Indore after midnight',
    'a Delhi Metro coach on the last train of the night',
    'a dhaba on the Grand Trunk Road at 2 am',
    'a Rishikesh rafting camp on the Ganga',
    'a Bhopal lakeside on a windy evening',
    'a cramped coaching centre in Kota before the results',
  ],
  mr: [
    'a Mumbai local train compartment at 11:40 pm',
    'a Pune wada with a creaky wooden staircase',
    'a Konkan beach village during the first monsoon rain',
    'a Kolhapur wrestling akhada at dawn',
    'a Nashik vineyard during harvest',
    'a Dadar flower market at 4 am',
    'a Ganpati pandal the night before visarjan',
    'a chawl in Girgaon where everyone knows everyone\'s business',
    'a fort on the Sahyadris in thick cloud',
    'a vada-pav stall outside a college in Thane',
  ],
  gu: [
    'the white desert of the Rann of Kutch on a full-moon night',
    'an Ahmedabad pol house with a secret passage',
    'a Navratri garba ground at 1 am',
    'the diamond market in Surat on a busy morning',
    'a Gir forest village where lions pass at night',
    'a kite-flying terrace in Ahmedabad on Uttarayan',
    'a Vadodara palace garden after closing time',
    'a farsan shop in Rajkot before Diwali',
    'a shipbreaking yard at Alang',
    'a Dwarka temple town during a sea storm',
  ],
  bn: [
    'a Kolkata tram depot at closing time',
    'College Street\'s old bookshops on a rainy afternoon',
    'a Durga Puja pandal on Ashtami night',
    'a Darjeeling tea estate in the morning mist',
    'a boat in the Sundarbans after dark',
    'a para adda on a north Kolkata rooftop',
    'a Shantiniketan mela at dusk',
    'a sweet shop famous for its rosogolla, the night of a big order',
    'a Howrah station platform when the last train is late',
    'a Puri-bound overnight train full of Bengali families',
  ],
  ta: [
    'a Chennai filter-coffee stall at dawn on Marina Beach road',
    'a Madurai temple street during the Chithirai festival',
    'an Ooty toy train climbing through the Nilgiris',
    'a Kanchipuram silk weaver\'s home on the night before a wedding',
    'a Rameswaram fishing boat before sunrise',
    'a single-screen cinema in Coimbatore on a first-day-first-show',
    'a Chettinad mansion with a hundred doors',
    'a Pondicherry French-quarter street in the rain',
    'a jasmine market in Madurai at 4 am',
    'a Kodaikanal lake on a foggy evening',
  ],
  en: [],
  te: [],
  kn: [],
  pa: [],
  any: [
    'a lighthouse on the Konkan coast',
    'a houseboat on a Kerala backwater',
    'a Ladakh dhaba at 4,000 metres',
    'a sleeper bus on a ghat road at night',
    'a hospital canteen during a night shift',
    'a small-town post office on its last day',
    'a radio station studio during a power cut',
    'an airport lounge when every flight is delayed',
    'a cricket ground during a rain delay',
    'a Shillong music shop during a thunderstorm',
    'a Goa ferry crossing at sunset',
    'a 24-hour pharmacy in a sleepy town',
  ],
};

export const STORY_HOOKS = [
  'a wrong-number phone call that keeps coming back',
  'a library book returned thirty years late',
  'a parrot that only speaks English',
  'a lottery ticket hidden in an old sari',
  'a tiffin that arrives at the wrong desk every day',
  'an old radio that announces tomorrow\'s weather',
  'a love letter with no name on it',
  'a scooter that only starts for one person',
  'a recipe with one ingredient missing',
  'a key that fits no lock in the house',
  'a cassette tape labelled "do not play"',
  'a cricket bat signed by someone no one remembers',
  'a stray dog that leads people somewhere every night',
  'a photograph in which one person keeps changing',
  'a wedding invitation for a wedding no one planned',
  'a jar of pickle that must not be opened until Diwali',
  'an auto-rickshaw driver who knows every passenger\'s secret',
  'a map drawn on the back of an electricity bill',
  'a clock that runs exactly ten minutes ahead',
  'a borrowed umbrella that has to be returned tonight',
  'a lost passport and a train leaving in an hour',
  'a goat that wins a local election, almost',
  'a missing gold bangle at a family function',
  'a telescope on a rooftop pointed at the wrong window',
];

export const STORY_TELLINGS = [
  'told straight, as it happens',
  'told mostly through a phone conversation',
  'told as a race against a clock the characters keep mentioning',
  'starting at the end, then rewinding to how it began',
  'told by a narrator who turns out to be one of the characters',
  'told through a letter or voice note read aloud, with scenes in between',
  'set in a single place, in real time',
  'told by two characters who remember the same night differently',
];

export const STORY_TWISTS = [
  'the "villain" was secretly trying to help',
  'the scary thing turns out to be someone lonely',
  'the clue was a sound everyone heard and nobody noticed',
  'a misheard word changes everything',
  'the kid figured it out first and was ignored',
  'the two rivals were working towards the same goal',
  'the object was never lost; it was being protected',
  'the narrator was there all along',
  'an animal is the real hero',
  'the date or time everyone assumed was wrong',
  'the stranger is family',
  'the prize was something other than what everyone chased',
];

export const STORY_ENDINGS = ['warm', 'laugh-out-loud funny', 'bittersweet', 'a gentle shiver', 'triumphant', 'a cheeky last-line joke'];

/** Character names by language: modern, regionally right, and rarely the stock "Raju" or "Ramu". */
export const STORY_NAMES: Partial<Record<StationId, { masculine: string[]; feminine: string[] }>> = {
  hi: {
    masculine: ['Kabir', 'Ishaan', 'Vihaan', 'Pranav', 'Aditya', 'Yash', 'Imran', 'Devansh', 'Rohit', 'Anmol', 'Harish chacha', 'Bansi dada'],
    feminine: ['Meher', 'Tara', 'Zoya', 'Naina', 'Kavya', 'Riddhi', 'Ananya', 'Shabnam', 'Pallavi', 'Gunjan', 'Kamla bua', 'Sushila dadi'],
  },
  mr: {
    masculine: ['Aniket', 'Omkar', 'Sahil', 'Chinmay', 'Tejas', 'Mandar', 'Shrikant kaka', 'Baban', 'Vinayak', 'Rohan'],
    feminine: ['Gauri', 'Mrunal', 'Sai', 'Ketaki', 'Rutuja', 'Manasi', 'Shalini kaku', 'Aaji', 'Pooja', 'Radha'],
  },
  gu: {
    masculine: ['Dhruv', 'Parth', 'Jignesh', 'Hetal bhai', 'Kunal', 'Malhar', 'Bhavesh', 'Nirav', 'Ramnik kaka', 'Tirth'],
    feminine: ['Hetvi', 'Krupa', 'Diya', 'Nidhi', 'Mansi', 'Foram', 'Jasu ba', 'Riya', 'Kinjal', 'Urvi'],
  },
  bn: {
    masculine: ['Arko', 'Rishi', 'Tathagata', 'Sayan', 'Ritam', 'Bappa', 'Nilu da', 'Tublu', 'Sourav', 'Debu jethu'],
    feminine: ['Mishti', 'Ishani', 'Tithi', 'Rupsha', 'Moumita', 'Poulami', 'Didima', 'Tumpa', 'Srabanti', 'Chumki'],
  },
  ta: {
    masculine: ['Arjun', 'Karthik', 'Vetri', 'Surya', 'Balu', 'Prabhu', 'Selvam anna', 'Murugan thatha', 'Dinesh', 'Hari'],
    feminine: ['Meena', 'Nila', 'Divya', 'Kayal', 'Janani', 'Thenmozhi', 'Paati', 'Revathi', 'Malar', 'Anjali'],
  },
};

/**
 * The same names in each station's script, so code can fix a story's names before the writer starts and every
 * part spells them the same way (a name is also the speaker value of its lines). Kin-suffixed names are left
 * out: a relation belongs in RELATIONS, not in a name.
 */
export const STORY_NAMES_NATIVE: Partial<Record<StationId, Record<string, string>>> = {
  hi: {
    Kabir: 'कबीर', Ishaan: 'इशान', Vihaan: 'विहान', Pranav: 'प्रणव', Aditya: 'आदित्य', Yash: 'यश', Imran: 'इमरान', Devansh: 'देवांश', Rohit: 'रोहित', Anmol: 'अनमोल',
    Meher: 'मेहर', Tara: 'तारा', Zoya: 'ज़ोया', Naina: 'नैना', Kavya: 'काव्या', Riddhi: 'रिद्धि', Ananya: 'अनन्या', Shabnam: 'शबनम', Pallavi: 'पल्लवी', Gunjan: 'गुंजन',
  },
  mr: {
    Aniket: 'अनिकेत', Omkar: 'ओंकार', Sahil: 'साहिल', Chinmay: 'चिन्मय', Tejas: 'तेजस', Mandar: 'मंदार', Baban: 'बबन', Vinayak: 'विनायक', Rohan: 'रोहन',
    Gauri: 'गौरी', Mrunal: 'मृणाल', Sai: 'सई', Ketaki: 'केतकी', Rutuja: 'ऋतुजा', Manasi: 'मानसी', Pooja: 'पूजा', Radha: 'राधा',
  },
  gu: {
    Dhruv: 'ધ્રુવ', Parth: 'પાર્થ', Jignesh: 'જીગ્નેશ', Kunal: 'કુણાલ', Malhar: 'મલ્હાર', Bhavesh: 'ભાવેશ', Nirav: 'નિરવ', Tirth: 'તીર્થ',
    Hetvi: 'હેત્વી', Krupa: 'કૃપા', Diya: 'દિયા', Nidhi: 'નિધિ', Mansi: 'માનસી', Foram: 'ફોરમ', Riya: 'રિયા', Kinjal: 'કિંજલ', Urvi: 'ઉર્વી',
  },
  bn: {
    Arko: 'অর্ক', Rishi: 'ঋষি', Tathagata: 'তথাগত', Sayan: 'সায়ন', Ritam: 'ঋতম', Bappa: 'বাপ্পা', Tublu: 'টুবলু', Sourav: 'সৌরভ',
    Mishti: 'মিষ্টি', Ishani: 'ঈশানী', Tithi: 'তিথি', Rupsha: 'রূপসা', Moumita: 'মৌমিতা', Poulami: 'পৌলমী', Tumpa: 'টুম্পা', Srabanti: 'শ্রাবন্তী', Chumki: 'চুমকি',
  },
  ta: {
    Arjun: 'அர்ஜுன்', Karthik: 'கார்த்திக்', Vetri: 'வெற்றி', Surya: 'சூர்யா', Balu: 'பாலு', Prabhu: 'பிரபு', Dinesh: 'தினேஷ்', Hari: 'ஹரி',
    Meena: 'மீனா', Nila: 'நிலா', Divya: 'திவ்யா', Kayal: 'கயல்', Janani: 'ஜனனி', Revathi: 'ரேவதி', Malar: 'மலர்', Anjali: 'அஞ்சலி',
  },
};

/** A name in the station's script, or undefined when the table has no spelling for it. */
export function nativeName(station: StationId, latin: string): string | undefined {
  return STORY_NAMES_NATIVE[station]?.[latin];
}

// ---- How a Kahani opens and closes -------------------------------------------------------------------

export interface StoryOpening {
  id: string;
  /** What lines 1–2 do; the title is woven in, never announced */
  how: string;
}

/**
 * Radio dramas never open the same way twice. Each opening drops the listener into the story first and
 * lets the narrator name it in passing, instead of announcing "today's story is…".
 */
export const STORY_OPENINGS: StoryOpening[] = [
  {
    id: 'cold-open',
    how: 'Line 1 is a character, mid-sentence, in the middle of trouble (no narrator first). Line 2, narrator: where and when we are, and the title said in passing, e.g. "…and that is how <title> began."',
  },
  {
    id: 'one-image',
    how: 'Line 1, narrator: one sharp image or sound from the setting, in under 12 words. Line 2, narrator: the title woven into a sentence that pulls us in, never "today\'s story is".',
  },
  {
    id: 'question',
    how: 'Line 1, narrator: a quiet question to the listener that the story will answer (tied to the hook). Line 2: a character answers it without knowing they are answering it; the narrator names the title on line 3.',
  },
  {
    id: 'overheard',
    how: 'Lines 1–2: two characters arguing or whispering mid-scene, as if we walked in on them. Line 3, narrator: steps in with the place, the time and the title.',
  },
  {
    id: 'note-read-aloud',
    how: 'Line 1: a character reads a short note, message or voice note aloud (the hook is in it). Line 2, narrator: who found it, where, and the title in passing.',
  },
  {
    id: 'ending-first',
    how: 'Line 1, narrator: the strange last moment of the story, without explaining it. Line 2, narrator: rewinds ("but an hour earlier…") and names the title.',
  },
];

export interface StoryClosing {
  id: string;
  how: string;
}

/** How the last line lands: never a moral, never "the end". */
export const STORY_CLOSINGS: StoryClosing[] = [
  { id: 'character-last', how: 'A character has the last line: short, in their own voice, and it lands the twist. No narrator after it.' },
  { id: 'callback', how: 'The last line echoes the very first line, now meaning something new.' },
  { id: 'quiet-image', how: 'Narrator: one quiet, specific image to end on (an object, a sound, a light), under 14 words.' },
  { id: 'button-joke', how: 'A tiny, character-true joke after the twist, like the button on a sitcom scene.' },
  { id: 'open-door', how: 'Narrator: the twist lands, then one line hints the story is not quite over, without a cliffhanger.' },
];

// ---- The brief ------------------------------------------------------------------------------------

export interface StoryBrief {
  genre: string;
  setting: string;
  hook: string;
  telling: string;
  twist: string;
  ending: string;
  opening: StoryOpening;
  closing: StoryClosing;
  names: { masculine: string[]; feminine: string[] };
}

/** Ingredients used recently (by any listener of this station): the brief avoids them while others remain. */
export interface StoryAvoid {
  settings?: Iterable<string>;
  hooks?: Iterable<string>;
  twists?: Iterable<string>;
  openings?: Iterable<string>;
  names?: Iterable<string>;
}

/** Picks from the items not used recently; falls back to the whole list when everything was. */
function fresh<T>(list: readonly T[], used: Iterable<string> | undefined, key: (t: T) => string, random: Random): T {
  const avoid = new Set(used ?? []);
  const unused = list.filter((item) => !avoid.has(key(item)));
  return pickWith(unused.length ? unused : list, random);
}

/** A fresh, specific premise for one Kahani. Most settings come from the station's own region. */
export function storyBrief(station: StationId, daypart: Daypart, random: Random = Math.random, avoid: StoryAvoid = {}): StoryBrief {
  const local = STORY_SETTINGS[station] ?? [];
  const settings = local.length && random() < 0.6 ? local : [...local, ...STORY_SETTINGS.any];
  const names = STORY_NAMES[station] ?? STORY_NAMES.hi!;
  const usedNames = new Set(avoid.names ?? []);
  const freshNames = (list: string[]) => {
    const unused = list.filter((n) => !usedNames.has(n));
    return sample(unused.length >= 4 ? unused : list, 4, random);
  };
  const same = (t: string) => t;
  return {
    genre: pickWith(STORY_GENRES[daypart], random),
    setting: fresh(settings, avoid.settings, same, random),
    hook: fresh(STORY_HOOKS, avoid.hooks, same, random),
    telling: pickWith(STORY_TELLINGS, random),
    twist: fresh(STORY_TWISTS, avoid.twists, same, random),
    ending: pickWith(STORY_ENDINGS, random),
    opening: fresh(STORY_OPENINGS, avoid.openings, (o) => o.id, random),
    closing: pickWith(STORY_CLOSINGS, random),
    names: { masculine: freshNames(names.masculine), feminine: freshNames(names.feminine) },
  };
}

// ---- Spooky stories -----------------------------------------------------------------------------------

const SPOOKY = /ghost|spooky|eerie|night train|urban legend|empty road|strange|mystery|suspense|time-loop|lighthouse|night-shift/i;

/** Ghost stories and night mysteries get a suspense narrator. */
export function isSpooky(genre: string): boolean {
  return SPOOKY.test(genre);
}

// ---- Each language's storytelling words ----------------------------------------------------------------

/**
 * One example line for the writer (style only; every one is registered in the copied-example check). Examples
 * are in the station language only, never English, and use names no story is ever given.
 */
export interface ExampleLine {
  /** "a character" or "narrator" for a story; ad_announcer or ad_customer for an ad */
  role: string;
  delivery: string;
  text: string;
  /** What it shows, in English */
  note: string;
}

/** How a child addresses a parent, and the loose words for an older neighbour (not checked as kinship). */
export interface KinWords {
  mother: string;
  father: string;
  elderSister: string;
  elderBrother: string;
}

export interface FictionLocale {
  /** A serial part on air: "कड़ी" */
  partWord: string;
  /** How the narrator's recap starts: "पिछली बार" */
  recap: string;
  /** Sentence end */
  punct: string;
  /** The fine-print phrase in an ad */
  tnc: string;
  /** Spoken fillers (bible §3.1): budgeted, never at the start of a line */
  fillers: string[];
  /** How the characters talk, one line for the writer */
  dialogue: string;
  kin: KinWords;
  /** Kahani examples: 2-3 sets of a cold open and a sound said in words (one set is shown per call) */
  storyExamples: ExampleLine[][];
  /** Two lines a story must never sound like: a stub, and the payoff summarised */
  storyBad: ExampleLine[];
  /** Ad examples by the format they show (an ad never sees the example of its own format) */
  adExamples: { format: string; lines: ExampleLine[] }[];
  /** Two lines an ad must never sound like: no format and no joke, and a stage direction read aloud */
  adBad: ExampleLine[];
}

const C = 'a character';
const bad = (text: string, note: string): ExampleLine => ({ role: '', delivery: '', text, note });
const NO_JOKE = 'no format, no joke';
const DIRECTION = 'a stage direction read aloud';
const STUB = 'a stub anyone could say; tells us nothing';
const SUMMARY = 'the payoff summarised, not played';

export const FICTION_LOCALE: Partial<Record<StationId, FictionLocale>> = {
  hi: {
    partWord: 'कड़ी',
    recap: 'पिछली बार',
    punct: '।',
    tnc: 'शर्तें लागू',
    fillers: ['अरे', 'यार', 'वैसे', 'सच में', 'बिल्कुल', 'मतलब', 'हाँ जी', 'उफ़्फ़'],
    dialogue: 'Everyday spoken Hindi, the way families and friends really talk; an English word only where people really say it (phone, tiffin, race, office).',
    kin: { mother: 'मम्मी', father: 'पापा', elderSister: 'दीदी', elderBrother: 'भैया' },
    storyExamples: [
      [
        { role: C, delivery: 'shout', text: 'शेखर, तूने फिर मेरी साइकिल की घंटी बेच दी? कल सुबह 6 बजे race है!', note: 'cold open, a name in line 1, a want with a clock' },
        { role: 'narrator', delivery: 'dramatic', text: 'बाहर कुकर की तीसरी सीटी बजी, और उसी पल पूरी गली की बत्ती चली गई।', note: 'a sound said in words' },
      ],
      [
        { role: C, delivery: 'fast', text: 'मीनू, तूने मेरा टिफ़िन फिर बदल दिया? आज उसमें गिनकर बारह लड्डू थे!', note: 'cold open, a name in line 1, one concrete number' },
        { role: 'narrator', delivery: 'hushed', text: 'ऊपर वाले flat में किसी ने तीन बार दरवाज़ा खटखटाया, और फिर सन्नाटा।', note: 'a sound said in words' },
      ],
      [
        { role: C, delivery: 'hushed', text: "'जो ये पढ़े, रात 9 बजे छत की टंकी के पास आए।' चिंटू, ये पर्ची तेरे बस्ते में कैसे आई?", note: 'a note read aloud, a name in line 1, a clock' },
        { role: 'narrator', delivery: 'dramatic', text: 'नीचे गली में कोई सीटी बजाता हुआ गुज़रा, तीन लंबी, एक छोटी।', note: 'a sound said in words' },
      ],
    ],
    storyBad: [bad('अरे, ये क्या है?', STUB), bad('और फिर सबको सच पता चल गया, और सब ख़ुश हो गए।', SUMMARY)],
    adExamples: [
      {
        format: 'coaching_topper',
        lines: [
          { role: 'ad_customer', delivery: 'excited', text: "पूरे मोहल्ले में Rank 1, और इसका पूरा श्रेय 'रटंतु Classes' को!", note: 'the format is obvious in line 1' },
          { role: 'ad_announcer', delivery: 'fast', text: 'रटंतु Classes। इस Rank 1 का दावा 4 और institutes भी करते हैं, topper एक ही है।', note: 'the fine print is the punchline' },
        ],
      },
      {
        format: 'real_estate',
        lines: [
          { role: 'ad_announcer', delivery: 'excited', text: 'सपनों का घर, शहर के बीचों-बीच, airport से सिर्फ़ 10 मिनट!', note: 'the grand claim with one number' },
          { role: 'ad_announcer', delivery: 'fast', text: '10 मिनट, अगर आप ख़ुद उड़ सकें। पंख शामिल नहीं।', note: 'the asterisk is the joke' },
        ],
      },
      {
        format: 'lab_coat_expert',
        lines: [
          { role: 'ad_announcer', delivery: 'normal', text: "देश के experts की राय: गहरी नींद के लिए सबसे असरदार है 'ऊँघ-अमृत'।", note: 'the white-coat voice in line 1' },
          { role: 'ad_announcer', delivery: 'normal', text: 'Experts, यानी park की bench पर रोज़ दोपहर सोने वाले दो uncle।', note: "the expert's credentials are the joke" },
        ],
      },
    ],
    adBad: [bad('ये product आपकी ज़िंदगी बदल देगा, आज ही ख़रीदिए!', NO_JOKE), bad('धीमी आवाज़ में: ये है मेरा राज़, delivery hushed।', DIRECTION)],
  },
  mr: {
    partWord: 'भाग',
    recap: 'मागच्या भागात',
    punct: '.',
    tnc: 'अटी लागू',
    fillers: ['अरे', 'बरं', 'म्हणजे', 'खरंच'],
    dialogue: 'Everyday spoken Marathi (बोलीभाषा) with Marathi grammar and Marathi words only: never Hindi words such as है, नहीं, क्या, बहुत (say आहे, नाही, काय, खूप). Sentences end with ".".',
    kin: { mother: 'आई', father: 'बाबा', elderSister: 'ताई', elderBrother: 'दादा' },
    storyExamples: [
      [
        { role: C, delivery: 'shout', text: 'पिंट्या, तू पुन्हा माझ्या सायकलची घंटी विकलीस? उद्या सकाळी 6 वाजता race आहे!', note: 'cold open, a name in line 1, a want with a clock' },
        { role: 'narrator', delivery: 'dramatic', text: 'बाहेर कुकरची तिसरी शिट्टी वाजली, आणि त्याच क्षणी अख्ख्या गल्लीतले दिवे गेले.', note: 'a sound said in words' },
      ],
      [
        { role: C, delivery: 'fast', text: 'बंड्या, माझा डबा पुन्हा बदललास? त्यात मोजून बारा मोदक होते!', note: 'cold open, a name in line 1, one concrete number' },
        { role: 'narrator', delivery: 'hushed', text: 'वरच्या मजल्यावर कोणीतरी तीनदा दार ठोठावलं, आणि मग शांतता.', note: 'a sound said in words' },
      ],
    ],
    storyBad: [bad('अरे, हे काय आहे?', STUB), bad('आणि मग सगळ्यांना खरं कळलं, आणि सगळे खूश झाले.', SUMMARY)],
    adExamples: [
      {
        format: 'coaching_topper',
        lines: [
          { role: 'ad_customer', delivery: 'excited', text: "अख्ख्या सोसायटीत Rank 1, आणि याचं सगळं श्रेय 'घोकंपट्टी Classes' ला!", note: 'the format is obvious in line 1' },
          { role: 'ad_announcer', delivery: 'fast', text: 'घोकंपट्टी Classes. या Rank 1 चा दावा आणखी 4 institutes करतात, topper एकच आहे.', note: 'the fine print is the punchline' },
        ],
      },
      {
        format: 'real_estate',
        lines: [
          { role: 'ad_announcer', delivery: 'excited', text: 'स्वप्नातलं घर, शहराच्या मधोमध, airport पासून फक्त 10 मिनिटं!', note: 'the grand claim with one number' },
          { role: 'ad_announcer', delivery: 'fast', text: '10 मिनिटं, जर तुम्ही स्वतः उडू शकलात तर. पंख समाविष्ट नाहीत.', note: 'the asterisk is the joke' },
        ],
      },
    ],
    adBad: [bad('हे product तुमचं आयुष्य बदलून टाकेल, आजच घ्या!', NO_JOKE), bad('हळू आवाजात: हे माझं गुपित आहे, delivery hushed.', DIRECTION)],
  },
  ta: {
    partWord: 'பகுதி',
    recap: 'போன பகுதியில்',
    punct: '.',
    tnc: 'T&C apply',
    fillers: ['அட', 'சரி', 'ஆமா', 'அப்புறம்'],
    dialogue: 'Colloquial Chennai Tamil (பேச்சுத் தமிழ், never formal written Tamil) with natural English words in Latin script. Every voice is male: every character is a man or a boy (masculine verb forms). Sentences end with ".".',
    kin: { mother: 'அம்மா', father: 'அப்பா', elderSister: 'அக்கா', elderBrother: 'அண்ணா' },
    storyExamples: [
      [
        { role: C, delivery: 'shout', text: 'மணி அண்ணா, நீ மறுபடியும் என் சைக்கிள் மணியை வித்துட்டியா? நாளைக்கு காலைல 6 மணிக்கு race!', note: 'cold open, a name in line 1, a want with a clock' },
        { role: 'narrator', delivery: 'dramatic', text: 'வெளியே குக்கர் மூணாவது விசில் அடிச்சுது, அதே நொடியில தெரு முழுக்க கரண்ட் போச்சு.', note: 'a sound said in words' },
      ],
      [
        { role: C, delivery: 'fast', text: 'சின்னா, என் tiffin-ஐ மறுபடியும் மாத்திட்டியா? அதுல எண்ணி பன்னிரண்டு லட்டு இருந்துச்சு!', note: 'cold open, a name in line 1, one concrete number' },
        { role: 'narrator', delivery: 'hushed', text: 'மேல் வீட்டுல யாரோ மூணு தடவை கதவைத் தட்டினாங்க, அப்புறம் அமைதி.', note: 'a sound said in words' },
      ],
    ],
    storyBad: [bad('அட, இது என்ன?', STUB), bad('அப்புறம் எல்லாருக்கும் உண்மை தெரிஞ்சுது, எல்லாரும் சந்தோஷமா ஆனாங்க.', SUMMARY)],
    adExamples: [
      {
        format: 'coaching_topper',
        lines: [
          { role: 'ad_customer', delivery: 'excited', text: "தெரு முழுக்க Rank 1, எல்லா credit-உம் 'மனப்பாடம் Classes'-க்கு தான்!", note: 'the format is obvious in line 1' },
          { role: 'ad_announcer', delivery: 'fast', text: 'மனப்பாடம் Classes. இந்த Rank 1-ஐ இன்னும் 4 institutes claim பண்றாங்க, topper ஒரே ஆள் தான்.', note: 'the fine print is the punchline' },
        ],
      },
      {
        format: 'real_estate',
        lines: [
          { role: 'ad_announcer', delivery: 'excited', text: 'கனவு வீடு, நகரத்தோட நடுவுல, airport-ல இருந்து வெறும் 10 நிமிஷம்!', note: 'the grand claim with one number' },
          { role: 'ad_announcer', delivery: 'fast', text: '10 நிமிஷம், நீங்களே பறக்க முடிஞ்சா. இறக்கை தனியா வாங்கணும்.', note: 'the asterisk is the joke' },
        ],
      },
    ],
    adBad: [bad('இந்த product உங்க வாழ்க்கையையே மாத்திடும், இன்னிக்கே வாங்குங்க!', NO_JOKE), bad('மெதுவான குரலில்: இது என் ரகசியம், delivery hushed.', DIRECTION)],
  },
  bn: {
    partWord: 'পর্ব',
    recap: 'গত পর্বে',
    punct: '।',
    tnc: 'শর্তাবলী প্রযোজ্য',
    fillers: ['আরে', 'আসলে', 'মানে', 'সত্যি'],
    dialogue: 'Natural spoken Bangla (চলিত ভাষা, never সাধু), witty, the way a Kolkata family argues; English words only where people really say them. Sentences end with "।".',
    kin: { mother: 'মা', father: 'বাবা', elderSister: 'দিদি', elderBrother: 'দাদা' },
    storyExamples: [
      [
        { role: C, delivery: 'shout', text: 'বুবাই, তুই আবার আমার সাইকেলের ঘণ্টি বেচে দিলি? কাল সকাল 6টায় race!', note: 'cold open, a name in line 1, a want with a clock' },
        { role: 'narrator', delivery: 'dramatic', text: 'বাইরে প্রেশার কুকারের তিন নম্বর সিটি বাজল, আর ঠিক তখনই গোটা গলির আলো নিভে গেল।', note: 'a sound said in words' },
      ],
      [
        { role: C, delivery: 'fast', text: 'পিকলু, আমার টিফিন আবার বদলে দিলি? ওতে গুনে গুনে বারোটা রসগোল্লা ছিল!', note: 'cold open, a name in line 1, one concrete number' },
        { role: 'narrator', delivery: 'hushed', text: 'ওপরের ফ্ল্যাটে কেউ তিনবার দরজায় টোকা দিল, তারপর সব চুপ।', note: 'a sound said in words' },
      ],
    ],
    storyBad: [bad('আরে, এটা কী?', STUB), bad('তারপর সবাই সত্যিটা জেনে গেল, আর সবাই খুশি হয়ে গেল।', SUMMARY)],
    adExamples: [
      {
        format: 'coaching_topper',
        lines: [
          { role: 'ad_customer', delivery: 'excited', text: "গোটা পাড়ায় Rank 1, আর পুরো কৃতিত্ব 'মুখস্থ Classes'-এর!", note: 'the format is obvious in line 1' },
          { role: 'ad_announcer', delivery: 'fast', text: 'মুখস্থ Classes। এই Rank 1-এর দাবি আরও 4টে institute করে, topper একজনই।', note: 'the fine print is the punchline' },
        ],
      },
      {
        format: 'real_estate',
        lines: [
          { role: 'ad_announcer', delivery: 'excited', text: 'স্বপ্নের বাড়ি, শহরের একদম মাঝখানে, airport থেকে মাত্র 10 মিনিট!', note: 'the grand claim with one number' },
          { role: 'ad_announcer', delivery: 'fast', text: '10 মিনিট, যদি আপনি নিজে উড়তে পারেন। ডানা আলাদা কিনতে হবে।', note: 'the asterisk is the joke' },
        ],
      },
    ],
    adBad: [bad('এই product আপনার জীবন বদলে দেবে, আজই কিনুন!', NO_JOKE), bad('নিচু গলায়: এটাই আমার গোপন কথা, delivery hushed।', DIRECTION)],
  },
  gu: {
    partWord: 'ભાગ',
    recap: 'ગયા ભાગમાં',
    punct: '.',
    tnc: 'શરતો લાગુ',
    fillers: ['અરે', 'હા', 'એટલે', 'ખરેખર'],
    dialogue: 'Warm everyday spoken Gujarati with Gujarati grammar and Gujarati words only: never Hindi words such as है, नहीं, क्या, बहुत (say છે, નથી, શું, બહુ). Sentences end with ".".',
    kin: { mother: 'મમ્મી', father: 'પપ્પા', elderSister: 'બેન', elderBrother: 'ભાઈ' },
    storyExamples: [
      [
        { role: C, delivery: 'shout', text: 'ભોલુ, તેં ફરી મારી સાઇકલની ઘંટડી વેચી દીધી? કાલે સવારે 6 વાગ્યે race છે!', note: 'cold open, a name in line 1, a want with a clock' },
        { role: 'narrator', delivery: 'dramatic', text: 'બહાર કૂકરની ત્રીજી સીટી વાગી, અને એ જ પળે આખી શેરીની લાઇટ જતી રહી.', note: 'a sound said in words' },
      ],
      [
        { role: C, delivery: 'fast', text: 'ટીનુ, તેં મારો ડબ્બો ફરી બદલી નાખ્યો? એમાં ગણીને બાર લાડુ હતા!', note: 'cold open, a name in line 1, one concrete number' },
        { role: 'narrator', delivery: 'hushed', text: 'ઉપરના ફ્લેટમાં કોઈએ ત્રણ વાર બારણું ખખડાવ્યું, અને પછી સન્નાટો.', note: 'a sound said in words' },
      ],
      [
        { role: C, delivery: 'hushed', text: "'જે આ વાંચે, એ રાતે 9 વાગ્યે ધાબાની ટાંકી પાસે આવે.' પપ્પુ, આ ચિઠ્ઠી તારા દફતરમાં ક્યાંથી આવી?", note: 'a note read aloud, a name in line 1, a clock' },
        { role: 'narrator', delivery: 'dramatic', text: 'નીચે પોળમાં કોઈ સીટી વગાડતું પસાર થયું, ત્રણ લાંબી, એક ટૂંકી.', note: 'a sound said in words' },
      ],
    ],
    storyBad: [bad('અરે, આ શું છે?', STUB), bad('અને પછી બધાને સાચી વાત ખબર પડી ગઈ, અને બધા ખુશ થઈ ગયા.', SUMMARY)],
    adExamples: [
      {
        format: 'coaching_topper',
        lines: [
          { role: 'ad_customer', delivery: 'excited', text: "આખી સોસાયટીમાં Rank 1, અને એનો બધો શ્રેય 'ગોખણપટ્ટી Classes' ને!", note: 'the format is obvious in line 1' },
          { role: 'ad_announcer', delivery: 'fast', text: 'ગોખણપટ્ટી Classes. આ Rank 1 નો દાવો બીજા 4 institutes પણ કરે છે, topper એક જ છે.', note: 'the fine print is the punchline' },
        ],
      },
      {
        format: 'real_estate',
        lines: [
          { role: 'ad_announcer', delivery: 'excited', text: 'સપનાનું ઘર, શહેરની વચ્ચોવચ, airport થી ફક્ત 10 મિનિટ!', note: 'the grand claim with one number' },
          { role: 'ad_announcer', delivery: 'fast', text: '10 મિનિટ, જો તમે જાતે ઊડી શકો તો. પાંખો સામેલ નથી.', note: 'the asterisk is the joke' },
        ],
      },
      {
        format: 'lab_coat_expert',
        lines: [
          { role: 'ad_announcer', delivery: 'normal', text: "નિષ્ણાતોની ભલામણ: ગાઢ ઊંઘ માટે સૌથી અસરકારક છે 'ઝોકું-અમૃત'.", note: 'the white-coat voice in line 1' },
          { role: 'ad_announcer', delivery: 'normal', text: 'નિષ્ણાત એટલે બગીચાના બાંકડે રોજ બપોરે સૂતા બે વડીલો.', note: "the expert's credentials are the joke" },
        ],
      },
    ],
    adBad: [bad('આ product તમારી જિંદગી બદલી નાખશે, આજે જ ખરીદો!', NO_JOKE), bad('ધીમા અવાજે: આ મારું રહસ્ય છે, delivery hushed.', DIRECTION)],
  },
};

export function fictionLocale(station: StationId): FictionLocale {
  return FICTION_LOCALE[station] ?? FICTION_LOCALE.hi!;
}

// ---- The recap the next part is written from -----------------------------------------------------------

/**
 * What part n+1's recap may draw on, built from what part n actually aired: the heard summary (the producer's
 * when there is one, else the part's own summary of its lines), the cliffhanger the part ended on, and its
 * last 3 lines verbatim. The client (and the live station) send this back as `recapSource`.
 */
export function recapSourceFrom(segment: Pick<Segment, 'heardSummary' | 'summary' | 'serial' | 'lines'>): RecapSource {
  return {
    heard: (segment.heardSummary ?? segment.summary ?? '').slice(0, 400),
    cliffhanger: (segment.serial?.outline.aired_cliffhanger_en ?? '').slice(0, 300),
    lastLines: segment.lines.slice(-3).map((l) => ({ role: l.role, text: l.text.slice(0, 300) })),
  };
}

/** Story openings and endings that make every Kahani sound alike. */
export const STORY_CLICHES: Partial<Record<StationId, string[]>> & { any: string[] } = {
  any: [
    '"today\'s story is…" or announcing the story corner by name',
    '"once upon a time"',
    'it was all a dream',
    'a moral at the end ("so the lesson is…")',
    'an old haveli or mansion (unless the theme asks for one)',
    'a clock striking twelve',
    'footsteps on the stairs',
    'a mysterious old man who "knew everything"',
    '"everyone was shocked"',
    'the end',
  ],
  hi: ['"एक बार की बात है"', '"सब हैरान रह गए"', '"रहस्यमयी"', '"वो सपना था"', '"सीख"', '"और फिर अचानक"'],
  mr: ['"एकदा काय झालं"', '"सगळे थक्क झाले"', '"ते स्वप्न होतं"'],
  gu: ['"એક વખતની વાત છે"', '"બધા ચોંકી ગયા"', '"એ સપનું હતું"'],
  bn: ['"এক দেশে ছিল"', '"সবাই অবাক হয়ে গেল"', '"সবটাই স্বপ্ন ছিল"'],
  ta: ['"ஒரு ஊர்ல"', '"எல்லோரும் அதிர்ந்து போனார்கள்"', '"அது ஒரு கனவு"'],
};

/** Phrases that open or close a story in the tired way; any of them in a script triggers the retry. */
export const STORY_BANNED: Partial<Record<StationId, RegExp>> = {
  hi: /एक बार की बात है|सब हैरान रह गए|वो सपना था|यह सपना था|सीख मिलती है|आज की कहानी|तरंग कहानी|कहानी कॉर्नर/u,
  mr: /एकदा काय झालं|ते स्वप्न होतं|आजची गोष्ट|गोष्टींचा कट्टा/u,
  gu: /એક વખતની વાત છે|એ સપનું હતું|આજની વાર્તા|વાર્તાનો ઓટલો/u,
  bn: /এক দেশে ছিল|সবটাই স্বপ্ন ছিল|আজকের গল্প|গল্পের আসর/u,
  ta: /ஒரு ஊர்ல ஒரு|அது ஒரு கனவு|இன்றைய கதை|கதை நேரம்/u,
};

// ---- RJ links ------------------------------------------------------------------------------------

/** Small on-air formats an RJ can use for the link's "one thing", so links don't all sound alike. */
export const RJ_DEVICES = [
  'a one-question listener poll ("call the studio and tell me…")',
  'a tiny, funny confession from your own day',
  'a mock traffic report for something at home (the kitchen, the TV remote)',
  'a this-or-that question for the listener',
  'a quick shout-out to one food the city is famous for',
  'a mini weather "forecast" for the listener\'s mood',
  'a dramatic reading of an ordinary sign or notice, as if it were poetry',
  'a challenge for the next ten minutes (drink water, call someone you miss)',
];

export function rjDevice(random: Random = Math.random): string {
  return pickWith(RJ_DEVICES, random);
}
