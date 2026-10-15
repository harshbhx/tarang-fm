/**
 * Free checks for the Kahani (bible §5.1, prompt pack §10.3): code, no model call. A "hard" problem sends the
 * script back for one rewrite with the problem as the note; a "soft" one only joins that note. Every message
 * is written as an instruction the writer can act on.
 */
import type { Station, StationId } from '../../shared/types';
import { fictionLocale, FICTION_LOCALE, STORY_BANNED } from '../story';

export interface CheckLine {
  role: string;
  text: string;
  delivery?: string;
}

export interface CheckResult {
  hard: string[];
  soft: string[];
}

// ---- Text helpers --------------------------------------------------------------------------------------

const VIRAMA = /[्্્்]$/u;
/** Long vowels folded to short ones, so "ईशान" finds "इशान" (names are spelled loosely). */
const VOWEL_FOLD: Record<string, string> = {
  'ी': 'ि', 'ू': 'ु', 'ई': 'इ', 'ऊ': 'उ',
  'ী': 'ি', 'ূ': 'ু', 'ঈ': 'ই', 'ঊ': 'উ',
  'ી': 'િ', 'ૂ': 'ુ', 'ઈ': 'ઇ', 'ઊ': 'ઉ',
  'ீ': 'ி', 'ூ': 'ு', 'ஈ': 'இ', 'ஊ': 'உ',
};

/** NFC, no nukta or joiners, lower case: for comparing names and words across spellings. */
export function fold(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[़়઼‌‍]/gu, '')
    .replace(/[ीूईऊীূঈঊીૂઈઊீூஈஊ]/gu, (c) => VOWEL_FOLD[c] ?? c)
    .toLowerCase();
}

/** The words of a line, folded. */
export function words(text: string): string[] {
  return fold(text)
    .split(/[^\p{L}\p{M}\p{N}&]+/u)
    .filter((w) => w.length >= 2);
}

function stem(word: string): string {
  const w = word.replace(VIRAMA, '');
  return w.length > 4 ? w.slice(0, Math.max(3, w.length - 2)) : w;
}

const sameWord = (a: string, b: string) => a === b || a.startsWith(stem(b)) || b.startsWith(stem(a));

/** Share of the expected line's words that the actual line also has (inflections allowed). */
export function lineOverlap(actual: string, expected: string): number {
  const exp = [...new Set(words(expected))];
  if (!exp.length) return 1;
  const act = words(actual);
  return exp.filter((e) => act.some((a) => sameWord(a, e))).length / exp.length;
}

/** True when the text says this name (its first word, inflected or not). */
export function saysName(text: string, name: string): boolean {
  const first = words(name)[0];
  if (!first) return false;
  const key = first.replace(VIRAMA, '');
  return words(text).some((w) => w.startsWith(key) || w.replace(VIRAMA, '') === key);
}

export const endsWithQuestion = (text: string) => /[?？]["'”’»)\s]*$/u.test(text.trim());

/** Share of a text's letters that are Latin (0 for pure Devanagari, 1 for English). */
export function latinShare(text: string): number {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (!letters.length) return 0;
  return letters.filter((c) => /\p{Script=Latin}/u.test(c)).length / letters.length;
}

/** An English sentence where the station language belongs (a few English words are fine). */
export function isEnglishLine(text: string): boolean {
  const latinWords = text.match(/\b[A-Za-z][A-Za-z'-]*\b/gu)?.length ?? 0;
  return latinShare(text) > 0.5 && latinWords >= 4;
}

// ---- Leaks: anything in "text" that is not meant to be spoken ----------------------------------------------

const LEAKS: RegExp[] = [
  /\b(delivery|role|narrator|char_[a-z]+|ad_(?:announcer|customer)|hushed|excited|dramatic|whisper\w*|sfx|sound)\s*[:：]/iu,
  /\bdelivery\s*[-=]?\s*(normal|warm|excited|fast|hushed|shout|dramatic|sad)\b/iu,
  /[()[\]{}*#<>♪]/u,
  /\bSFX\b/u,
  /(धीमी|ऊँची|तेज़|तेज) आवाज़? में\s*[:：]|(फुसफुसा\S*|चिल्ला\S*|हँसते हुए|रोते हुए|ज़ोर से|धीरे से)\s*[:：]/u,
];

/** A stage direction, role name, speaker label or bracketed note inside spoken text. */
export function leaksDirection(text: string, names: string[] = []): boolean {
  const t = text.trim();
  if (LEAKS.some((re) => re.test(t))) return true;
  // A one-word speaker label at the start ("मेहर: …"), except the fine print
  if (/^[^\s:：]{1,24}\s*[:：]\s/u.test(t) && !/^(t&c|t\s*&\s*c)/iu.test(t)) return true;
  return names.some((n) => {
    const first = n.trim().split(/\s+/)[0];
    return first && new RegExp(`^${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:：]`, 'u').test(t);
  });
}

// ---- Copied examples ------------------------------------------------------------------------------------------

/** Fragments of every example line in the story and ad prompts (and the bible): a copy is caught on air. */
export const STORY_EXAMPLE_FRAGMENTS = [
  'साइकिल की घंटी बेच दी', 'कुकर की तीसरी सीटी', 'पूरी गली की बत्ती चली गई', "race मत जाना", 'सबको सच पता चल गया',
  'मेरा टिफ़िन फिर बदल दिया', 'गिनकर बारह लड्डू', 'तीन बार दरवाज़ा खटखटाया',
  'सायकलची घंटी विकलीस', 'कुकरची तिसरी शिट्टी', 'गल्लीतले दिवे गेले',
  'சைக்கிள் மணியை வித்துட்டியா', 'குக்கர் மூணாவது விசில்', 'தெரு முழுக்க கரண்ட் போச்சு',
  'সাইকেলের ঘণ্টি বেচে', 'তিন নম্বর সিটি', 'গলির আলো নিভে গেল',
  'સાઇકલની ઘંટડી વેચી', 'કૂકરની ત્રીજી સીટી', 'શેરીની લાઇટ જતી રહી',
  'हवेली की पुरानी घड़ी अचानक रुक गई', 'अब आ रही है कहानी', 'adventure sport', 'scooter की seat',
];

export const AD_EXAMPLE_FRAGMENTS = [
  'रटंतु', 'Rank 1 का दावा', 'अगर आप ख़ुद उड़ सकें', 'पंख शामिल नहीं', 'ज़िंदगी बदल देगा, आज ही', 'delivery hushed',
  'घोकंपट्टी', 'स्वतः उडू शकलात', 'पंख समाविष्ट नाहीत',
  'மனப்பாடம் Classes', 'பறக்க முடிஞ்சா', 'இறக்கை தனியா',
  'মুখস্থ Classes', 'নিজে উড়তে পারেন', 'ডানা আলাদা',
  'ગોખણપટ્ટી', 'જાતે ઊડી શકો', 'પાંખો સામેલ નથી',
];

const squash = (t: string) => fold(t).replace(/\s+/gu, '');

export function copiesFictionExample(text: string, fragments: string[] = [...STORY_EXAMPLE_FRAGMENTS, ...AD_EXAMPLE_FRAGMENTS]): boolean {
  const n = squash(text);
  return fragments.some((f) => n.includes(squash(f)));
}

// ---- Fillers ------------------------------------------------------------------------------------------------

/** How many lines open on a filler word, and how many fillers the script holds in all (bible §3.1). */
export function fillerCount(lines: CheckLine[], station: StationId): { starts: number; total: number } {
  const fillers = fictionLocale(station).fillers.map(fold);
  let starts = 0;
  let total = 0;
  for (const line of lines) {
    const t = fold(line.text).replace(/^[\s"'“‘…,.!?।-]+/u, '');
    if (fillers.some((f) => t.startsWith(f) && !/[\p{L}\p{M}]/u.test(t.charAt(f.length) || ' '))) starts++;
    const ws = ` ${words(line.text).join(' ')} `;
    for (const f of fillers) total += ws.split(` ${f} `).length - 1;
  }
  return { starts, total };
}

// ---- Kinship ---------------------------------------------------------------------------------------------------

/**
 * Kinship words that name a real relation (father, grandmother, uncle…). A story may use one only if the
 * outline's relations define it. Loose terms everyone uses for strangers (भैया, दीदी, अंकल, அண்ணா) are not
 * checked. A word matches as a prefix (inflections), unless it is marked exact because a common word starts
 * the same way (आई/आईस्क्रीम, பாட்டி/பாட்டில், মাসি/মাসিক); then only the word and its listed forms match.
 */
interface Kin {
  word: string;
  forms?: string[];
  exact?: boolean;
  aliases: string[];
}

const PARENT = ['father', 'dad', 'papa'];
const MOTHER = ['mother', 'mom', 'mum', 'mummy'];
const GRANDMA = ['grandmother', 'grandma', 'granny'];
const GRANDPA = ['grandfather', 'grandpa'];
const UNCLE = ['uncle'];
const AUNT = ['aunt', 'aunty', 'auntie'];

export const KINSHIP: Partial<Record<StationId, Kin[]>> = {
  hi: [
    { word: 'पापा', aliases: [...PARENT] },
    { word: 'पिताजी', aliases: [...PARENT, 'pitaji'] },
    { word: 'मम्मी', aliases: [...MOTHER] },
    { word: 'माँ', forms: ['मां'], exact: true, aliases: [...MOTHER, 'maa', 'ma'] },
    { word: 'दादी', aliases: [...GRANDMA, 'dadi'] },
    { word: 'दादा', forms: ['दादाजी'], aliases: [...GRANDPA, 'dada'] },
    { word: 'नानी', aliases: [...GRANDMA, 'nani'] },
    { word: 'नाना', forms: ['नानाजी'], aliases: [...GRANDPA, 'nana'] },
    { word: 'चाचा', forms: ['चाचाजी'], aliases: [...UNCLE, 'chacha'] },
    { word: 'चाची', aliases: [...AUNT, 'chachi'] },
    { word: 'बुआ', aliases: [...AUNT, 'bua'] },
    { word: 'मामा', forms: ['मामाजी'], aliases: [...UNCLE, 'mama'] },
    { word: 'मामी', aliases: [...AUNT, 'mami'] },
    { word: 'मौसी', aliases: [...AUNT, 'mausi'] },
    { word: 'ताऊ', forms: ['ताऊजी'], aliases: [...UNCLE, 'tau', 'tauji'] },
  ],
  mr: [
    { word: 'बाबा', forms: ['बाबांना', 'बाबांनी', 'बाबांचा', 'बाबांची'], aliases: [...PARENT, 'baba'] },
    { word: 'आई', forms: ['आईला', 'आईने', 'आईचा', 'आईची', 'आईचे', 'आईच्या'], exact: true, aliases: [...MOTHER, 'aai'] },
    { word: 'आजी', forms: ['आजीला', 'आजीने', 'आजीचा', 'आजीची', 'आजीच्या'], aliases: [...GRANDMA, 'aaji', 'aji'] },
    { word: 'आजोबा', aliases: [...GRANDPA, 'ajoba', 'aajoba'] },
    { word: 'काका', aliases: [...UNCLE, 'kaka'] },
    { word: 'काकू', aliases: [...AUNT, 'kaku'] },
    { word: 'मावशी', aliases: [...AUNT, 'mavshi', 'mavashi'] },
    { word: 'आत्या', aliases: [...AUNT, 'atya', 'aatya'] },
  ],
  ta: [
    { word: 'அப்பா', aliases: [...PARENT, 'appa'] },
    { word: 'அம்மா', aliases: [...MOTHER, 'amma'] },
    { word: 'தாத்தா', aliases: [...GRANDPA, 'thatha', 'thaatha'] },
    { word: 'பாட்டி', forms: ['பாட்டிக்கு', 'பாட்டியோட', 'பாட்டியை', 'பாட்டியும்', 'பாட்டிம்மா', 'பாட்டியின்'], exact: true, aliases: [...GRANDMA, 'paati', 'patti'] },
    { word: 'சித்தப்பா', aliases: [...UNCLE, 'chithappa'] },
    { word: 'பெரியப்பா', aliases: [...UNCLE, 'periyappa'] },
  ],
  bn: [
    { word: 'বাবা', forms: ['বাবার', 'বাবাকে'], aliases: [...PARENT, 'baba'] },
    { word: 'মা', forms: ['মায়ের', 'মাকে', 'মাগো'], exact: true, aliases: [...MOTHER, 'maa', 'ma'] },
    { word: 'দাদু', aliases: [...GRANDPA, 'dadu'] },
    { word: 'দিদা', aliases: [...GRANDMA, 'dida'] },
    { word: 'ঠাকুমা', aliases: [...GRANDMA, 'thakuma'] },
    { word: 'জেঠু', aliases: [...UNCLE, 'jethu'] },
    { word: 'কাকু', aliases: [...UNCLE, 'kaku'] },
    { word: 'পিসি', aliases: [...AUNT, 'pishi', 'pisi'] },
    { word: 'মাসি', forms: ['মাসির', 'মাসিকে', 'মাসিমা'], exact: true, aliases: [...AUNT, 'mashi', 'masi'] },
  ],
  gu: [
    { word: 'પપ્પા', aliases: [...PARENT, 'pappa'] },
    { word: 'મમ્મી', aliases: [...MOTHER] },
    { word: 'બા', forms: ['બાએ', 'બાને', 'બાનું', 'બાની', 'બાના'], exact: true, aliases: [...GRANDMA, ...MOTHER, 'ba'] },
    { word: 'દાદા', aliases: [...GRANDPA, 'dada'] },
    { word: 'દાદી', aliases: [...GRANDMA, 'dadi'] },
    { word: 'કાકા', aliases: [...UNCLE, 'kaka'] },
    { word: 'કાકી', aliases: [...AUNT, 'kaki'] },
    { word: 'મામા', aliases: [...UNCLE, 'mama'] },
    { word: 'માસી', forms: ['માસીએ', 'માસીને', 'માસીનું', 'માસીની'], exact: true, aliases: [...AUNT, 'masi', 'maasi'] },
  ],
};

/** Like fold(), but keeps vowel length: kinship words are short, and length tells them apart. */
const kinFold = (t: string) => t.normalize('NFC').replace(/[़়઼‌‍]/gu, '').toLowerCase();
const kinWords = (text: string) => kinFold(text).split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);

function kinIn(word: string, kin: Kin): boolean {
  const w = kinFold(kin.word);
  if (w === word || (kin.forms ?? []).some((f) => kinFold(f) === word)) return true;
  const letters = w.match(/\p{L}/gu)?.length ?? 0;
  return !kin.exact && letters >= 2 && word.startsWith(w);
}

/**
 * Kinship words the lines use that the outline never defined (the "two people call each other पापा" bug).
 * `defined` is everything the outline says about people: relations, names and who-is-who.
 */
export function kinshipOutside(lines: CheckLine[], station: StationId, defined: string): string[] {
  const table = KINSHIP[station] ?? [];
  const known = kinFold(defined);
  const knownWords = new Set(kinWords(defined));
  const englishWords = new Set(defined.toLowerCase().split(/[^a-z]+/u).filter(Boolean));
  const out = new Set<string>();
  for (const line of lines) {
    for (const word of kinWords(line.text)) {
      for (const kin of table) {
        if (!kinIn(word, kin)) continue;
        const ok =
          known.includes(kinFold(kin.word)) ||
          [...knownWords].some((k) => kinIn(k, kin)) ||
          kin.aliases.some((a) => englishWords.has(a));
        if (!ok) out.add(kin.word);
      }
    }
  }
  return [...out];
}

// ---- Names early -------------------------------------------------------------------------------------------------

/**
 * Speaking roles whose name the listener has not heard by the end of that role's second line (bible §4.4).
 * `names` maps each character role to the name the outline gave it.
 */
export function namesLate(lines: CheckLine[], names: Partial<Record<string, string>>): string[] {
  const late: string[] = [];
  for (const [role, name] of Object.entries(names)) {
    if (!name || /^none$/i.test(name.trim())) continue;
    const own = lines.map((l, i) => (l.role === role ? i : -1)).filter((i) => i >= 0);
    if (!own.length) continue;
    const by = own[Math.min(1, own.length - 1)];
    if (!lines.slice(0, by + 1).some((l) => saysName(l.text, name))) late.push(role);
  }
  return late;
}

// ---- The shape of a part (or a one-shot story) -------------------------------------------------------------------

export interface SerialShapeOptions {
  /** 1-3 for a serial part; 0 for a one-shot story */
  part: 0 | 1 | 2 | 3;
  /** The roles in this story, besides the narrator */
  characters: string[];
  /** role → name */
  names: Partial<Record<string, string>>;
  /** Relations and who-is-who, for the kinship check */
  defined: string;
  /** The line this part should end on, when the outline wrote one */
  expectedLast?: string;
  /** Line count limits */
  min: number;
  max: number;
  /** Set when the listener's name ({name}) must never appear */
  noListenerName?: boolean;
  /** The previous part's last lines (parts 2-3): never repeated word for word */
  recapLines?: string[];
}

export function serialShape(station: Station, lines: CheckLine[], opts: SerialShapeOptions): CheckResult {
  const hard: string[] = [];
  const soft: string[] = [];
  const n = lines.length;
  if (n > opts.max) hard.push(`Too long: ${n} lines. Write ${opts.max - 2} lines at most: cut a middle exchange, keep the ending line.`);
  if (n < opts.min) hard.push(`Too short: ${n} lines. Write at least ${opts.min}: the story needs its middle (a try that fails, the turn).`);
  const allowed = new Set(['narrator', ...opts.characters]);
  const strangers = [...new Set(lines.map((l) => l.role).filter((r) => !allowed.has(r)))];
  if (strangers.length) hard.push(`Roles ${strangers.join(', ')} are not in this story: use only ${[...allowed].join(', ')}.`);
  const speaking = new Set(lines.map((l) => l.role).filter((r) => r !== 'narrator'));
  if (speaking.size < Math.min(2, opts.characters.length)) hard.push('At least two characters must speak: dialogue carries the story.');
  const narrator = lines.filter((l) => l.role === 'narrator').length;
  if (n >= 6 && narrator / n > 0.4) hard.push(`The narrator has ${narrator} of ${n} lines: give the characters the story (narrator at most ${Math.floor(n * 0.4)}).`);

  const late = namesLate(lines, opts.names);
  for (const role of late) hard.push(`The listener never hears ${role}'s name (${opts.names[role]}) by that character's second line: have someone say it early.`);
  const kin = kinshipOutside(lines, station.id, opts.defined);
  if (kin.length) hard.push(`Kinship words not in RELATIONS: ${kin.join(', ')}. Use names, or only the relations the outline defines.`);

  const last = lines[n - 1]?.text ?? '';
  if (opts.expectedLast && lineOverlap(last, opts.expectedLast) < 0.3) {
    hard.push(`The part must end on its ending line: "${opts.expectedLast}". Make that (or a close variant) the very last line.`);
  }
  if ((opts.part === 3 || opts.part === 0) && endsWithQuestion(last)) hard.push('The story must resolve: the last line is never a question. End on the payoff and a smile.');

  const names = Object.values(opts.names).filter((v): v is string => Boolean(v && !/^none$/i.test(v)));
  const banned = STORY_BANNED[station.id];
  const lang = station.languageName;
  lines.forEach((l, i) => {
    if (isEnglishLine(l.text)) hard.push(`Line ${i + 1} is in English: write it in ${lang} (English only for single everyday words).`);
    const own = opts.names[l.role];
    if (own && !/^none$/i.test(own) && new RegExp(`^\\s*${words(own)[0] ?? '\u0000'}`, 'u').test(fold(l.text)) && /^[^,!?।.]{1,30}[,!]/u.test(l.text)) {
      hard.push(`Line ${i + 1}: ${l.role} (${own}) calls out their own name. Someone else says it, or use the other character's name.`);
    }
    if (opts.recapLines?.some((r) => r.length > 12 && lineOverlap(l.text, r) >= 0.8)) hard.push(`Line ${i + 1} repeats a line from the last part: recap in new words.`);
    if (leaksDirection(l.text, names)) hard.push(`Line ${i + 1} has a stage direction, label or bracket in "text": only spoken words go there (acting goes in "delivery").`);
    if (copiesFictionExample(l.text)) hard.push(`Line ${i + 1} copies an example from the instructions: write your own.`);
    if (banned?.test(l.text)) hard.push(`Line ${i + 1} uses a stock story phrase: drop it.`);
    if (opts.noListenerName && /\{\s*(name|nickname)\s*\}/iu.test(l.text)) hard.push(`Line ${i + 1} has {name}: the listener is never named inside a story.`);
  });

  const fillers = fillerCount(lines, station.id);
  if (fillers.starts > 1) hard.push(`${fillers.starts} lines start with a filler word (${fictionLocale(station.id).fillers.slice(0, 3).join(', ')}…): start lines with the point.`);
  else if (fillers.starts === 1) soft.push('One line starts with a filler word: start with the point instead.');
  if (fillers.total > 3) soft.push(`Fillers: ${fillers.total} (allowed 3).`);

  const starts = lines.map((l) => words(l.text)[0]).filter(Boolean);
  if (new Set(starts).size < starts.length - 2) soft.push('Several lines start with the same word: vary the openings.');
  return { hard, soft };
}

/** True for a station whose stories are written with the locale table (all on-air languages). */
export const hasFictionLocale = (station: StationId) => Boolean(FICTION_LOCALE[station]);
