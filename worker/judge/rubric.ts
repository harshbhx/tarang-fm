/**
 * The producer rubric, evidence first (bible §5.2, rewritten after two calibration rounds):
 * 1. heard_en: what the lines say, nothing else.
 * 2. unsupported_en: every real-world claim not in CONTEXT, with its line, before any score.
 * 3. faults_en: the problems a listener would notice, with their lines, before any score.
 * 4. Each criterion as one string, the quoted line first and the score last: `L1 "<words>" => 4`. Anchors carry
 *    real bad (1-2) examples from this station's old scripts and good (4-5) ones.
 * 5. Code caps (`applyCaps`): a score the model's own lists or quotes cannot carry is lowered, so a lenient model
 *    cannot pass a script whose evidence shows the failure.
 * Flat JSON, every value a string. Short on purpose: the whole verdict is about 200 output tokens, so one call
 * fits the producer's 3 s time box.
 */
import type { Dim, JudgeInput, JudgeVerdict, ReviewType, Scores } from './types';
import { DIMS } from './types';
import { leaksDirection } from '../checks/free';

export const RUBRIC_VERSION = 'producer-v5.2';

/**
 * Field order is thinking order: summary, unsupported claims, faults, then each criterion (evidence before its
 * score inside the string). The letter prefixes keep that order under decoders that emit schema keys
 * alphabetically (Workers AI does).
 */
export const VERDICT_FIELDS = [
  'a_heard_en',
  'b_unsupported_en',
  'c_faults_en',
  'd_hook',
  'e_coherence',
  'f_point',
  'g_specificity',
  'h_fidelity',
  'i_ending',
  'j_worst_line',
  'k_fix',
] as const;

export const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...VERDICT_FIELDS],
  properties: Object.fromEntries(VERDICT_FIELDS.map((f) => [f, { type: 'string' }])),
} as const;

/** Which verdict field scores which dimension (the ending field scores the story's ending dimension). */
const SCORE_FIELD: Record<Exclude<Dim, 'story_resolved' | 'cliffhanger'> | 'ending', string> = {
  hook: 'hook',
  coherence: 'coherence',
  point_landed: 'point',
  specificity: 'specificity',
  fidelity: 'fidelity',
  ending: 'ending',
};

// ---- What each segment is for ---------------------------------------------------------------------------------------

export function defaultPoint(input: Pick<JudgeInput, 'type' | 'mode' | 'part' | 'oneShot'>): string {
  const { type, mode, part, oneShot } = input;
  if (type === 'rj_link') {
    if (mode === 'opener') return 'a warm live welcome: the greeting, the time and weather as a feeling (the only link where they belong), one light line, then an honest handover';
    if (mode === 'kahani_in') return part && part > 1 ? 'one line on where the story left off (only what aired), then the handover into the next part; no spoilers' : 'one true, spoiler-free tease of the story, then the handover';
    if (mode === 'kahani_out') return 'one line reacting to what actually aired in the story, then one real thing (a laugh, an opinion, a fact, a question), then an honest handover';
    return 'one real thing (a laugh, an opinion with a reason, a fact, a question) delivered in lines 1-2, plus an honest handover';
  }
  if (type === 'news') return mode === 'update' ? '3 real stories the listener has not heard, one clear line each, nothing made up' : '5-6 real things that happened, city first, each told clearly with who/what/where, nothing made up';
  if (type === 'ad_break') return 'a 15-20 second spoof of an ad format every Indian listener knows, for a fictional product, ending on one punchline that gets a laugh';
  if (oneShot || part === 3) return 'a complete story: people you can tell apart, a want against a clock, a twist that pays off a clue heard earlier, and a last line that lands (never a question)';
  if (part === 2) return 'a one-line recap, then a complication that makes things worse, ending on a new concrete fact that raises the stakes';
  return 'the listener meets 2-3 named people they can tell apart, one wants something against a clock, and the part ends on a new concrete fact (a cliffhanger)';
}

const isFinal = (i: Pick<JudgeInput, 'type' | 'part' | 'oneShot'>) => i.type === 'kahani' && (Boolean(i.oneShot) || i.part === 3);
const isFiction = (t: ReviewType) => t === 'ad_break' || t === 'kahani';

export function applicableDims(input: Pick<JudgeInput, 'type' | 'part' | 'oneShot'>): Dim[] {
  const dims: Dim[] = ['hook', 'coherence', 'point_landed', 'specificity', 'fidelity'];
  if (input.type === 'kahani') dims.push(isFinal(input) ? 'story_resolved' : 'cliffhanger');
  return dims;
}

// ---- Anchors -------------------------------------------------------------------------------------------------------

const ANCHORS = `ANCHORS (when torn between two scores, give the lower; most careless drafts score 2, airable-but-forgettable is 3, 5 means a top Indian FM producer airs it unchanged):
hook (lines 1-2): 1 filler or a line anyone could say · 2 clear but no reason to listen · 3 expected · 4 a concrete image, name or stake · 5 a surprise or stake within 5 seconds. In an opener the welcome is the hook: 2 a bare "hello, welcome" · 3 a plain greeting · 4 it names the city or the listener and the moment · 5 it also lands a fresh image.
coherence: 1 cannot tell who is who or what happens; a contradiction (wrong kinship or gender, a person who changes role, someone addressing themselves); refers to something that never aired; a stage direction read aloud · 2 followable only by guessing, or one line that makes no sense · 3 followable with effort · 4 clear, one small jump · 5 every line follows; you could retell it.
point: 1 the POINT is missing · 2 gestured at, the core absent (no payload, no punchline, no payoff, no information) · 3 delivered but buried or flat · 4 delivered early and clearly (an opener with the greeting, the time or weather as a feeling and an honest handover is a 4) · 5 it lands: the laugh, the fact that sticks, the wait-what.
specificity: 1 could be any show; vague words ("ये नए spots", "देखने लायक") · 2 one concrete detail in filler · 3 some · 4 mostly concrete · 5 names, numbers, objects and places that belong only here.
fidelity: 1 states a real-world fact, news item, event, or something about what aired or comes next that CONTEXT does not give · 2 one embellishment stated as fact · 3 a small stretch of a given fact · 4 faithful, one loose phrase · 5 every real-world claim is in CONTEXT; fiction stays in fiction. Ad or story: 1 real brands, celebrities or landmarks used as fact, or it contradicts the outline · 5 consistent with the format or outline.
ending (story only, else "na"): final part: 1 stops before the payoff or on a question · 2 payoff summarised by the narrator or senseless · 3 resolved but the twist ignores the clue · 4 resolved through the clue · 5 the clue pays off and the last line lands. Parts 1-2: 1 ends on nothing · 2 a vague word or question ("क्यों?") · 3 a mild question · 4 a new concrete fact · 5 a new concrete fact that raises the stakes.`;

/** Real failures (score 1-2) from the old scripts and good lines (4-5), as anchors. Hindi, judged in any language. */
const EXAMPLES: Record<ReviewType, string> = {
  rj_link: `EXAMPLES:
- hook 1, point 1: L1 "अरे यार, शो तो बस शुरू हो रहा है और मैं अभी से एक्साइटेड हूँ।" (filler, says nothing)
- fidelity 1: "अभी देखिए, खबर में बात होगी Alkapuri के नए flyover opening की।" when no item mentions it (invents the news it hands over to)
- coherence 1, fidelity 1: "उफ़्फ़, वो आख़िरी twist अभी तक दिमाग में घूम रहा है।" when SHOW LOG shows no twist aired
- point 2: only the time, the temperature, a breeze and the catchphrase (no payload)
- point 5: "मेरा साफ़ मानना है, lift का सबसे मुश्किल काम ऊपर जाना नहीं, बीस सेकंड तक पड़ोसी से नज़र बचाना है।" (an opinion with a turn)
- fidelity 5: "अब खबरें, सिमरन के साथ।" (the handover says only what NEXT allows)`,
  news: `EXAMPLES:
- fidelity 1: "Alkapuri flyover की opening की खबर भी आ रही है।" when no item says it
- specificity 1, point 2: "जंतर-मंतर की जगह अब ये नए spots हैं, और locals ने अपनी राय दी है।" (which spots? what opinion?)
- fidelity 2: "बताया जा रहा है कि हालात बेहद गंभीर हैं।" (hearsay no item gives)
- fidelity 5, specificity 5: "बड़ौदा से: नगर निगम के मुताबिक, पुल की मरम्मत शुक्रवार तक चलेगी।" when the item says exactly that`,
  ad_break: `EXAMPLES:
- coherence 1, point 1: "उनके shoes हैं PannaPani. delivery: hushed।" (a stage direction read aloud)
- point 1: ends on "तो आज ही लीजिए Papad-Chhata, Papad-Chhata! Papad-Chhata!" (the brand chanted, no punchline)
- point 2: ends on "आज ही घर लाइए" (a plain call to action instead of a joke)
- coherence 2: shoes that shoot out kachori outside a palace (solves no problem, no format)
- point 5: "पूरे मोहल्ले में Rank 1, और इसका पूरा श्रेय 'रटंतु Classes' को!" then the fine print "इस Rank 1 का दावा 4 और institutes भी करते हैं।" (the fine print is the joke)`,
  kahani: `EXAMPLES:
- coherence 1: an adult man says "अरे पापा" while the kid also calls someone "पापा"; "Sushila" is a boy, then a 70-year-old aunt (who is who?)
- coherence 2: nobody is named until narration at line 9 ("इमरान को एक मुड़ा हुआ कागज़ मिला।")
- hook 2: L1 "अरे, ये बहुत भारी है।" (anyone could say it)
- ending 1 (final part): stops on "अचानक? क्यों?", or on someone at the door with nothing revealed
- hook 5: "इशान, तूने फिर मेरी साइकिल की घंटी बेच दी? कल सुबह 6 बजे race है!" (a name, a stake and a clock in line 1)
- ending 5 (part 1): "घंटी वापस मिल गई… पर उस पर किसी ने खरोंच कर लिखा था, 'race मत जाना।'" (a new concrete fact)`,
};

/** What a producer listens for, per type: the faults list is written against this. */
const FAULTS: Record<ReviewType, string> = {
  rj_link: 'no payload in lines 1-2 (only greeting, time, weather, filler); a reaction to something SHOW LOG does not show ("never aired"); a handover that says more than NEXT allows; time or weather outside the opener; a line that makes no sense',
  news: 'a line no ITEM supports; a vague line with no who/what/where ("vague"); hearsay; a story told twice',
  ad_break: 'the format is unclear in line 1; "no punchline" (it ends on the brand chanted or a plain "buy it now"); a stage direction read aloud; a product that solves no problem; whole English sentences',
  kahani: '"who is who" unclear (a speaker not named by their second line); a kinship or gender "contradiction"; someone addressing themselves by name; a character talking to nobody for many lines; final part: "no payoff" (stops before the culprit or answer is revealed, the clue never pays off, ends on a question); parts 1-2: a vague ending instead of a new fact',
};

// ---- Prompt ------------------------------------------------------------------------------------------------------------

const LANG: Record<string, string> = { hi: 'Hindi', mr: 'Marathi', ta: 'Tamil', bn: 'Bangla', gu: 'Gujarati', en: 'English', te: 'Telugu', kn: 'Kannada', pa: 'Punjabi' };

function contextBlock(input: JudgeInput): string {
  const c = input.context;
  const out: string[] = [];
  for (const b of c.blocks ?? []) out.push(`${b.label}: ${b.text}`);
  if (c.frame?.length) out.push(`FRAME (always allowed): ${c.frame.join(', ')}`);
  if (input.type === 'news') {
    const items = c.slate ?? [];
    out.push(
      `ITEMS:\n${items.length
        ? items.map((h, i) => `[N${i + 1}] slot=${h.slot ?? '-'} · source=${h.source ?? '-'}${h.light ? ' · light' : ''}\n  title: ${h.title}\n  detail: ${h.detail ? h.detail.slice(0, 250) : 'none'}`).join('\n')
        : '(none)'}`,
    );
  }
  if (input.type === 'rj_link') {
    if (c.payloadType) out.push(`PAYLOAD TYPE: ${c.payloadType}`);
    if (c.next) out.push(`NEXT: ${c.next.type}. What the handover may say: ${c.next.allowed}`);
    out.push(`SHOW LOG (what actually aired, oldest first; nothing else aired):${c.showLog?.length ? c.showLog.map((s) => `\n- ${s}`).join('') : ' nothing yet'}`);
    if (c.catchphrase) out.push(`CATCHPHRASE "${c.catchphrase.text}": ${c.catchphrase.allowed ? 'allowed once' : 'not allowed'}`);
  }
  if (input.type === 'ad_break') {
    out.push(`All of it is fiction: the product, the people and the claims are invented. Only real brands, real people and real landmarks are not allowed.${c.ad?.format ? ` FORMAT: ${c.ad.format}${c.ad.signature ? ` (${c.ad.signature})` : ''}.` : ''}`);
  }
  if (input.type === 'kahani') {
    if (c.outline && Object.keys(c.outline).length) out.push(`OUTLINE:\n${Object.entries(c.outline).map(([k, v]) => `  ${k}: ${v}`).join('\n')}`);
    else out.push('No outline: the story is fiction; its people, times, objects and events are invented on purpose.');
    if (c.names && Object.keys(c.names).length) out.push(`CAST (role: name): ${Object.entries(c.names).map(([r, n]) => `${r}: ${n}`).join(', ')}`);
    if (c.relations) out.push(`RELATIONS: ${c.relations}`);
    if (c.expectedLastLine) out.push(`THIS PART MUST END ON: ${c.expectedLastLine}`);
    if (c.recap) out.push(`LAST PART HEARD: ${c.recap.heard} It ended on: ${c.recap.cliffhanger}`);
  }
  return out.join('\n');
}

function numbered(input: JudgeInput): string {
  return input.lines.map((l, i) => `${i + 1}. ${l.role} · ${l.delivery ?? 'normal'} · ${l.text}`).join('\n');
}

export interface JudgePrompt {
  system: string;
  user: string;
}

export function judgePrompt(input: JudgeInput): JudgePrompt {
  const onAir = input.onAir ?? 'Tarang FM';
  const lang = LANG[input.station] ?? input.station;
  const kind = input.type === 'kahani' ? (input.oneShot ? 'one complete story (final part)' : `part ${input.part ?? 1} of 3${isFinal(input) ? ' (final part)' : ''}`) : `mode ${input.mode ?? '-'}`;
  const fiction = isFiction(input.type);
  const system = `You are the senior producer of ${onAir}, a ${lang} radio station. You did not write this script. You hear it once, in order, like a listener, and you are strict. You list what is wrong before you score anything, and every score sits after the line that proves it. A 4 or 5 needs a quoted line that shows the good thing. Return only flat JSON with exactly the schema's fields, every value a string, in English except the quotes.`;
  const step2 = fiction
    ? 'b_unsupported_en: real brands, real famous people, real landmarks or real news named in it, as "L<n>: <name>" separated by " | ", or "none". Everything invented for the story or ad (its people, times, objects, events, claims, prices) is fiction: never list it.'
    : 'b_unsupported_en: go line by line. A claim is a checkable statement about the real world (a place, person, organisation, event, number, news item, someone\'s reaction) or about what aired or what comes next. List every claim CONTEXT does not give, as "L<n>: <claim in up to 8 words>" separated by " | ", or "none". Not claims: opinions, jokes, feelings, exaggeration, playful phrasing about a given fact (the clear sky "saying yes" to garba), greetings, the RJ\'s own life, and anything CONTEXT gives in any script or spelling (गरबा = garba, बड़ौदा = Vadodara).';
  const user = `SEGMENT: ${input.type} · ${kind} · ${lang}
POINT the script had to deliver: ${input.context.point ?? defaultPoint(input)}
CONTEXT (${fiction ? 'what the writer was given' : 'the only real-world facts the writer was given; any other real-world claim is invented'}):
${contextBlock(input)}
SCRIPT (numbered; role · delivery · text):
${numbered(input)}

Fill the fields in this order (the letter prefixes fix it):
a_heard_en: what a listener heard, past tense, at most 25 words; only what the lines say, never what they were meant to say.
${step2}
c_faults_en: up to 3 problems a listener would notice, as "L<n>: <problem in up to 8 words>" separated by " | ", or "none". Listen for: ${FAULTS[input.type]}.
d_hook, e_coherence, f_point, g_specificity, h_fidelity, i_ending: each is the evidence, then the score: L<n> "<up to 6 words copied from that line>" => <1-5>. Fidelity may cite b_unsupported_en instead of a quote. i_ending is "na" for anything but a story.
j_worst_line: the number of the weakest line. k_fix: "Line <n>: <what to change>", at most 20 words.
${ANCHORS}

${EXAMPLES[input.type]}

THE CODE ALSO ENFORCES: anything in b_unsupported_en caps fidelity at 2; a stage direction read aloud caps coherence at 2; "no punchline" or "no payoff" in c_faults_en caps point or ending at 2; a final part that ends on a question gets ending 1.
Shape (placeholders, not answers): {"a_heard_en":"<what was heard>","b_unsupported_en":"L<n>: <claim> | ... or none","c_faults_en":"L<n>: <problem> | ... or none","d_hook":"L<n> \\"<quote>\\" => <1-5>","e_coherence":"L<n> \\"<quote>\\" => <1-5>","f_point":"L<n> \\"<quote>\\" => <1-5>","g_specificity":"L<n> \\"<quote>\\" => <1-5>","h_fidelity":"<L<n> \\"<quote>\\" or b_unsupported_en> => <1-5>","i_ending":"<L<n> \\"<quote>\\" => <1-5>, or na>","j_worst_line":"<n>","k_fix":"Line <n>: <what to change>"}`;
  return { system, user };
}

// ---- Parsing and caps --------------------------------------------------------------------------------------------

const NONE_RE = /^\s*["'`]?(none|nothing|n\/a|na|nil|-|no(ne)? (unsupported|invented|real[- ]world)( claims?| facts?| names?)?|no (faults|problems|issues)|कोई नहीं)\.?["'`]?\s*$/i;

export function isNone(s: string | undefined): boolean {
  return !s || NONE_RE.test(s);
}

/** "L1 "…" => 4" → {score 4, evidence 'L1 "…"'}; a bare "4" also works (older verdicts keep the evidence apart). */
export function splitScored(v: unknown): { score: number | null; na: boolean; evidence: string } {
  const s = String(v ?? '').trim();
  if (!s) return { score: null, na: false, evidence: '' };
  const arrow = [...s.matchAll(/(?:=>|→|=|:|\bscore\b)\s*\**\s*["']?\s*([1-5](?:\.\d)?|na|n\/a)\b(?:\s*\/\s*5)?/giu)].pop();
  const bare = s.match(/^["']?\s*([1-5]|na|n\/a)\s*["']?$/iu);
  const trail = s.match(/(?:^|[\s(])([1-5])\s*(?:\/\s*5)?\s*\)?\s*$/u);
  const hit = arrow?.[1] ?? bare?.[1] ?? trail?.[1];
  if (!hit) return { score: null, na: /^\s*["']?n\/?a\b/i.test(s), evidence: s };
  const na = /^n\/?a$/i.test(hit);
  const at = arrow?.index ?? (trail ? s.length - trail[0].length : 0);
  const evidence = (bare ? '' : s.slice(0, at)).trim();
  return { score: na ? null : Math.round(Number(hit)), na, evidence };
}

/** Lenient JSON: an object, a JSON string, a string with prose or fences around the JSON, or "key: value" lines. */
export function parseJsonLoose(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  try {
    const v = JSON.parse(t);
    if (v && typeof v === 'object') return v as Record<string, unknown>;
    if (typeof v === 'string') return parseJsonLoose(v);
  } catch {
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(t.slice(a, b + 1)) as Record<string, unknown>;
      } catch {
        /* fall through to key: value lines */
      }
    }
  }
  // Some models answer with one "field: value" per line instead of JSON
  const obj: Record<string, unknown> = {};
  for (const line of t.split(/\r?\n/)) {
    const m = line.match(/^\s*[-*]?\s*["']?([a-k]_[a-z_]+|heard_en|unsupported_en|faults_en|hook|coherence|point|specificity|fidelity|ending|worst_line|fix)["']?\s*[:=]\s*(.*?)\s*,?\s*$/i);
    if (m) obj[m[1].toLowerCase()] = m[2].replace(/^"(.*)"$/s, '$1');
  }
  return Object.keys(obj).length >= 4 ? obj : null;
}

/** A model's note that its own entry is not a claim ("… is not a real-world claim but a reaction"). */
const DISCLAIMER = /\b(is|are) (fiction|fictional|allowed|given|in (the )?context)\b|\bnot a (real[- ]world |checkable )?(claim|fact)\b|\bnot checkable\b|\b(is|are) (a |an )?(reaction|opinion|joke)\b/i;

/** Splits "L5: x | L6: y" into claims, dropping "none" and the fiction disclaimers some models add. */
export function splitClaims(s: string): string[] {
  if (isNone(s)) return [];
  return s
    .split(/\s*\|\s*|\n+|;\s*(?=L\d)/)
    .map((x) => x.trim())
    .filter((x) => x && !isNone(x) && !isNone(x.replace(/^\s*L\s?\d+\s*[:：.-]?\s*/i, '')) && !/^(no|none|nothing)\b/i.test(x) && !DISCLAIMER.test(x));
}

/** All the text the writer was given, folded, for checking the judge's claims against. */
function contextText(input: JudgeInput): string {
  const c = input.context;
  return [
    ...(c.blocks ?? []).map((b) => `${b.label} ${b.text}`),
    ...(c.slate ?? []).map((h) => `${h.title} ${h.detail ?? ''} ${h.source ?? ''}`),
    ...(c.showLog ?? []),
    c.next?.allowed,
    ...(c.frame ?? []),
    c.timePhrase,
    c.listenerName,
    c.catchphrase?.text,
    ...(c.keptTokens ?? []),
    ...Object.values(c.outline ?? {}),
    ...Object.values(c.names ?? {}),
    c.recap?.heard,
    c.relations,
  ]
    .filter(Boolean)
    .join(' ')
    .normalize('NFC')
    .toLowerCase();
}

const CLAIM_STOP = new Set([
  'the', 'and', 'that', 'not', 'any', 'item', 'items', 'context', 'given', 'line', 'claim', 'says', 'said', 'about', 'with', 'from', 'this', 'there', 'mention', 'mentions', 'mentioned', 'description', 'details', 'report', 'reports', 'reported',
  'है', 'हैं', 'की', 'का', 'के', 'में', 'और', 'से', 'पर', 'को', 'भी', 'तो', 'ने', 'उल्लेख', 'विवरण', 'जानकारी', 'प्रस्तुत', 'किया', 'द्वारा', 'होने',
]);

/**
 * A judge sometimes lists a word the context does give ("L2: garba" when FESTIVAL says garba nights), or every
 * line of a faithful bulletin as "the mention of <item>". A claim whose content words are (nearly) all in the
 * context is dropped: all of them for a short claim, 80% for one of 5 or more words. A new name stays.
 */
export function supportedByContext(claim: string, ctx: string): boolean {
  const body = claim.replace(/^\s*L\s?\d+\s*[:：.-]?\s*/i, '').replace(/\(.*?\)/g, ' ');
  const words = body
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !CLAIM_STOP.has(w));
  if (!words.length) return false;
  const hits = words.filter((w) => ctx.includes(w)).length;
  return words.length >= 5 ? hits / words.length >= 0.8 : hits === words.length;
}

/** Parses the model's verdict and applies the code caps. Returns null when the output is not usable. */
export function parseVerdict(raw: unknown, input: JudgeInput): JudgeVerdict | null {
  const parsed = parseJsonLoose(raw);
  if (!parsed) return null;
  // Accept the letter-prefixed fields ("d_hook") and bare ones ("hook")
  const obj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed)) obj[k.toLowerCase().replace(/^[a-p]_/, '')] = v;
  const str = (...keys: string[]) => {
    for (const k of keys) if (obj[k] != null && obj[k] !== '') return typeof obj[k] === 'string' ? (obj[k] as string) : String(obj[k]);
    return '';
  };
  const dims = applicableDims(input);
  const scores = Object.fromEntries(DIMS.map((d) => [d, null])) as Scores;
  const evidence: JudgeVerdict['evidence'] = {};
  const endingDim = dims.find((d) => d === 'story_resolved' || d === 'cliffhanger');
  for (const d of dims) {
    const field = d === endingDim ? SCORE_FIELD.ending : SCORE_FIELD[d as keyof typeof SCORE_FIELD];
    const alias = d === 'point_landed' ? ['point', 'point_landed'] : d === endingDim ? ['ending', d] : [field];
    const s = splitScored(str(...alias));
    scores[d] = s.score;
    // Older verdicts keep the evidence in its own field
    evidence[d] = s.evidence || str(`${field}_evidence`, `${d}_evidence`);
  }
  if (dims.filter((d) => scores[d] == null).length > 1) return null;
  const wl = Number.parseInt(str('worst_line').replace(/[^\d]/g, ''), 10);
  const ctx = contextText(input);
  const verdict: JudgeVerdict = {
    heardSummaryEn: str('heard_en', 'heard_summary_en').trim(),
    invented: splitClaims(str('unsupported_en', 'invented_en')).filter((claim) => !supportedByContext(claim, ctx)),
    faults: splitClaims(str('faults_en')),
    scores,
    evidence,
    worstLine: Number.isFinite(wl) && wl >= 1 && wl <= input.lines.length ? wl : null,
    fix: str('fix').trim(),
    capped: [],
  };
  applyCaps(verdict, input);
  return verdict;
}

/** Quoted evidence: a line reference or a quote, not "none". */
const hasQuote = (ev: string | undefined) => Boolean(ev) && !isNone(ev) && /\bL\s?\d+|["“”'‘’«»]|line\s*\d+/iu.test(ev!);

/**
 * Code caps: the score can't be higher than the model's own evidence allows.
 * - Any unsupported claim: fidelity ≤ 2 (rj_link and news: real facts). In an ad or a story only a real-world
 *   name counts, and it caps fidelity at 3 (below the bar of 4).
 * - A 4-5 with no quoted line → 3 (fidelity may rest on an empty unsupported list).
 * - Faults the model named itself: a stage direction (coherence ≤ 2), "no punchline" in an ad (point ≤ 2),
 *   "no payoff" in a final part (ending ≤ 2), "who is who" / a contradiction in a story (coherence ≤ 2),
 *   a reaction to something that "never aired" in a link (fidelity ≤ 2).
 * - A final story part ending on "?" → ending 1.
 */
export function applyCaps(v: JudgeVerdict, input: JudgeInput): void {
  const cap = (d: Dim, max: number, why: string) => {
    const s = v.scores[d];
    if (s != null && s > max) {
      v.scores[d] = max;
      v.capped.push(`${d}→${max}: ${why}`);
    }
  };
  const fiction = isFiction(input.type);
  if (v.invented.length) cap('fidelity', fiction ? 3 : 2, fiction ? 'a real-world name in fiction' : 'unsupported claims listed');
  for (const d of applicableDims(input)) {
    if (d === 'fidelity') continue;
    if ((v.scores[d] ?? 0) >= 4 && !hasQuote(v.evidence[d])) cap(d, 3, 'a high score with no quoted line');
  }
  const faults = v.faults.join(' | ').toLowerCase();
  // Only when a line really leaks one: the free checks fail those first, so the judge's word alone is a false alarm
  if (/stage direction|read(s)? (out )?aloud|speaker label/.test(faults) && input.lines.some((l) => leaksDirection(l.text))) cap('coherence', 2, 'a stage direction read aloud');
  if (input.type === 'ad_break' && /no (real )?(punchline|joke)|without (a )?(punchline|joke)|chant/.test(faults)) cap('point_landed', 2, 'no punchline');
  if (input.type === 'kahani') {
    if (/who is who|contradict|changes? role|addresses? (him|her|them)sel/.test(faults)) cap('coherence', 2, 'who is who');
    if (isFinal(input) && /no payoff|unresolved|not resolved|never (revealed|resolved)|stops before|ends before|cliffhanger/.test(faults)) cap('story_resolved', 2, 'no payoff');
  }
  if (input.type === 'rj_link' && /never aired|did ?n[o']t air|not (in|on) (the )?show log|not aired/.test(faults)) cap('fidelity', 2, 'refers to something that never aired');
  if (isFinal(input)) {
    const last = input.lines[input.lines.length - 1]?.text ?? '';
    if (/[?？]["'”’»)\s]*$/u.test(last.trim())) cap('story_resolved', 1, 'the final part ends on a question');
  }
  if (input.type === 'ad_break' && !hasQuote(v.evidence.point_landed)) cap('point_landed', 2, 'no punchline quoted');
}

/** Mean of the applicable scores (null when none came back). */
export function meanScore(scores: Scores, dims: Dim[]): number | null {
  const vals = dims.map((d) => scores[d]).filter((x): x is number => x != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
