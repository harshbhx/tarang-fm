/**
 * Story engine: every Kahani, ad and RJ link is built from a fresh brief drawn from large pools, so no two
 * segments share a premise. A Kahani brief combines genre × setting × hook × telling × twist × ending
 * (about 3 million combinations) and comes with region-appropriate character names, so the model starts from
 * something specific instead of reaching for the same haunted mansion every night.
 */
import type { Daypart, Station, StationId, StoryPool, Voice } from '../shared/types';

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

// ---- Casting ------------------------------------------------------------------------------------------

export type StoryRole = 'narrator' | 'char_a' | 'char_b' | 'char_kid';
export type StoryCast = Record<StoryRole, Voice>;

const SPOOKY = /ghost|spooky|eerie|night train|urban legend|empty road|strange|mystery|suspense|time-loop|lighthouse|night-shift/i;

/**
 * A fresh cast for one story from the station's verified voices: a narrator who suits the genre, two
 * characters of different voices (either may be a woman or a man), and a kid. No voice plays two roles.
 */
export function castStory(station: Station, brief: Pick<StoryBrief, 'genre'>, random: Random = Math.random): StoryCast {
  const pool: StoryPool | undefined = station.storyPool;
  const base: StoryCast = { narrator: station.cast.narrator, char_a: station.cast.char_a, char_b: station.cast.char_b, char_kid: station.cast.char_kid };
  if (!pool) return base;
  const taken = new Set<string>();
  const take = (options: Voice[] | undefined, fallback: Voice): Voice => {
    const free = (options ?? []).filter((v) => !taken.has(v.speaker));
    const choice = free.length ? pickWith(free, random) : fallback;
    taken.add(choice.speaker);
    return choice;
  };
  const spooky = SPOOKY.test(brief.genre);
  const narrators = spooky && pool.spookyNarrators?.length ? pool.spookyNarrators : pool.narrators;
  const narrator = take(narrators, base.narrator);
  // Character A and B: one man and one woman by default, in either order; two men or two women sometimes
  const men = pool.men;
  const women = pool.women;
  const roll = random();
  const [firstPool, secondPool] =
    roll < 0.4 ? [men, women] : roll < 0.8 ? [women, men] : roll < 0.9 ? [men, men] : [women, women];
  const charA = take(firstPool.length ? firstPool : men.length ? men : women, base.char_a);
  const charB = take(secondPool.length ? secondPool : women.length ? women : men, base.char_b);
  const kid = take(pool.kids, base.char_kid);
  return { narrator, char_a: charA, char_b: charB, char_kid: kid };
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

// ---- Ads -----------------------------------------------------------------------------------------

export const AD_CATEGORIES = [
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
  'a cricket-fan accessory',
  'a dating app for arranged-marriage aunties',
  'a mosquito solution',
  'a power-cut survival product',
  'a chai-related invention',
  'an online class gadget',
  'a remote-control finder',
  'a hostel-life essential',
  'a gift for a boss you don\'t like',
  'a luggage product for overpacked families',
];

export interface AdFormat {
  id: string;
  shape: string;
}

/** How the ad is played. Each has its own shape, so ad breaks don't all sound like the same infomercial. */
export const AD_FORMATS: AdFormat[] = [
  {
    id: 'infomercial',
    shape: `1. customer: a relatable comic problem, mid-scene.
2. announcer crashes in with the brand name. delivery "excited".
3. announcer: one absurd, specific claim that is easy to picture.
4. announcer: a price ladder ("not ₹X, not even ₹Y, just ₹Z!") with fresh numbers. delivery "shout".
5. happy_customer: a slightly-too-emotional testimonial.
6. announcer: a rhyming 5–9 word tagline. delivery "excited".
7. announcer: a super-fast "T&C apply" line hiding one more joke. delivery "fast".`,
  },
  {
    id: 'breaking-news',
    shape: `1. announcer as a breathless newsreader: "Breaking news!" about the everyday problem as if it were a national crisis. delivery "fast".
2. customer as an eyewitness, interviewed live, describing the problem dramatically.
3. announcer: the product is revealed as the "solution experts are calling…" plus the brand name.
4. customer: a reaction that undercuts the drama.
5. announcer: the tagline, then a one-line "back to the studio" sign-off joke.`,
  },
  {
    id: 'customer-care',
    shape: `1. customer phones a helpline, already annoyed, explaining the problem.
2. announcer as the impossibly cheerful helpline agent, who answers every question with the product.
3. customer tries to object; announcer has an absurd answer ready.
4. customer gives in and loves it.
5. announcer: the tagline, then "your call is important to us" turned into a joke. delivery "fast".`,
  },
  {
    id: 'trailer',
    shape: `1. announcer in a blockbuster-trailer voice: "In a world where…" about a tiny household problem. delivery "dramatic".
2. customer: one line of over-the-top suffering.
3. announcer: "One product… will change everything." plus the brand name. delivery "dramatic".
4. customer: an epic line about using the product.
5. announcer: the tagline, then "now in a shop near you" as if it were a release date. delivery "shout".`,
  },
  {
    id: 'gossip',
    shape: `1. customer gossiping over the balcony to a neighbour (announcer plays the neighbour) about someone whose life suddenly got better.
2. announcer (as the neighbour) demands to know the secret.
3. customer reveals the product in a whisper. delivery "hushed".
4. announcer (as the neighbour) is scandalised, then wants one immediately.
5. announcer as the real announcer: the tagline and a fast "T&C" joke.`,
  },
  {
    id: 'commentary',
    shape: `1. announcer as a cricket commentator calling an ordinary household task like the last over of a final. delivery "fast".
2. customer, mid-task, panicking.
3. announcer: the product comes "in to bat", with the brand name. delivery "shout".
4. customer: a victory line.
5. announcer: the tagline, sung-spoken like a stadium chant.`,
  },
  {
    id: 'sad-violin',
    shape: `1. customer: a heartbreaking, slow confession that turns out to be about a tiny problem. delivery "sad".
2. announcer, equally serious, reveals the product.
3. customer: tears of joy, absurdly out of proportion.
4. announcer: the tagline, then a deadpan one-line disclaimer. delivery "fast".`,
  },
  {
    id: 'jingle',
    shape: `1. announcer opens with a catchy rhyming jingle line built on the brand name. delivery "excited".
2. customer: a quick before-and-after, all in one line.
3. announcer: one absurd, specific claim.
4. customer repeats the jingle, slightly wrong.
5. announcer: the jingle once more and a fast "T&C" joke.`,
  },
];

/** A category and a format for one ad, skipping those aired recently on the station. */
export function adBrief(
  random: Random = Math.random,
  avoid: { categories?: Iterable<string>; formats?: Iterable<string> } = {},
): { category: string; format: AdFormat } {
  return {
    category: fresh(AD_CATEGORIES, avoid.categories, (c) => c, random),
    format: fresh(AD_FORMATS, avoid.formats, (f) => f.id, random),
  };
}

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
