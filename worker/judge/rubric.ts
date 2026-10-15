/**
 * The producer rubric, evidence first (bible §5.2, rewritten after calibration):
 * 1. heard_summary_en: what the lines say, nothing else.
 * 2. unsupported_en: every real-world claim not in CONTEXT, with its line, before any score.
 * 3. For each criterion: the quoted line(s) first, then a 1-5 score against anchored definitions with real
 *    bad (1-2) and good (4-5) examples from this station.
 * 4. Code caps: a score the evidence cannot carry is lowered (`applyCaps`), so a lenient model cannot pass a
 *    script whose own quotes show the failure.
 * Flat JSON: every field a string, scores as string enums.
 */
import type { Dim, JudgeInput, JudgeVerdict, ReviewType, Scores } from './types';
import { DIMS } from './types';

export const RUBRIC_VERSION = 'producer-v4.0';

const SCORE_ENUM = { type: 'string', enum: ['1', '2', '3', '4', '5', 'na'] };

/**
 * Field order is thinking order: summary, unsupported claims, then evidence before each score. The letter
 * prefixes keep that order under decoders that emit schema keys alphabetically (Workers AI does).
 */
export const VERDICT_FIELDS = [
  'a_heard_summary_en',
  'b_unsupported_en',
  'c_hook_evidence', 'd_hook',
  'e_coherence_evidence', 'f_coherence',
  'g_point_evidence', 'h_point_landed',
  'i_specificity_evidence', 'j_specificity',
  'k_fidelity_evidence', 'l_fidelity',
  'm_ending_evidence', 'n_ending',
  'o_worst_line',
  'p_fix',
] as const;

const SCORE_FIELDS = new Set(['d_hook', 'f_coherence', 'h_point_landed', 'j_specificity', 'l_fidelity', 'n_ending']);

export const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...VERDICT_FIELDS],
  properties: Object.fromEntries(VERDICT_FIELDS.map((f) => [f, SCORE_FIELDS.has(f) ? SCORE_ENUM : { type: 'string' }])),
} as const;

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

export function applicableDims(input: Pick<JudgeInput, 'type' | 'part' | 'oneShot'>): Dim[] {
  const dims: Dim[] = ['hook', 'coherence', 'point_landed', 'specificity', 'fidelity'];
  if (input.type === 'kahani') dims.push(isFinal(input) ? 'story_resolved' : 'cliffhanger');
  return dims;
}

// ---- Anchors -------------------------------------------------------------------------------------------------------

const ANCHORS = `ANCHORS (score what the evidence shows; when torn between two scores, give the lower):
hook (line 1-2): 1 = a filler, a bare greeting or a line anyone could say · 2 = clear but gives no reason to listen · 3 = clear and expected · 4 = a concrete image, name or stake · 5 = a surprise or a stake within 5 seconds.
coherence: 1 = you cannot tell who is who or what is happening; contradictions (wrong kinship or gender, a person who changes role); refers to something that never aired; reads a stage direction aloud · 2 = followable only by guessing; a line that makes no sense · 3 = followable with effort · 4 = clear, one small jump · 5 = every line follows from the last; you could retell it.
point_landed: 1 = the POINT is missing · 2 = gestured at but the core is absent (no payload, no punchline, no payoff, no information) · 3 = delivered but buried or flat · 4 = delivered early and clearly · 5 = it lands: the laugh, the fact that sticks, the wait-what moment.
specificity: 1 = could be from any show; vague words ("ये नए spots", "देखने लायक") · 2 = one concrete detail among filler · 3 = some concrete details · 4 = mostly concrete · 5 = names, numbers, objects and places that belong only here.
fidelity: 1 = states a real-world fact, news item, event or "what aired / what comes next" that CONTEXT does not give · 2 = one embellishment presented as fact · 3 = a small stretch of a given fact · 4 = faithful, one loose phrasing · 5 = every real-world claim is in CONTEXT; fiction stays inside fiction (an ad's product, a story, the RJ's own life). For an ad or a story: 1 = real brands, celebrities or landmarks used as fact, or it contradicts the outline · 5 = consistent with the format or outline.
ending (story only): final part: 1 = ends before the payoff or on a question · 2 = the payoff is summarised by the narrator or makes no sense · 3 = resolved but the twist ignores the clue · 4 = resolved through the clue · 5 = the clue pays off, the want is resolved, the last line lands. Parts 1-2: 1 = ends on nothing · 2 = ends on a vague word or question ("क्यों?") · 3 = a mild question · 4 = a new concrete fact · 5 = a new concrete fact that raises the stakes. Not a story: "na".`;

/** Real failures (score 1-2) and good lines (4-5) per type, as anchors. Hindi examples, judged in any language. */
const EXAMPLES: Record<ReviewType, string> = {
  rj_link: `EXAMPLES (rj_link):
- hook 1, point 1: L1 "अरे यार, शो तो बस शुरू हो रहा है और मैं अभी से एक्साइटेड हूँ।" (filler, says nothing)
- fidelity 1: "अभी देखिए, खबर में बात होगी Alkapuri के नए flyover opening की।" when no item mentions Alkapuri or a flyover (invents the news it hands over to)
- coherence 1, fidelity 1: "उफ़्फ़, वो आख़िरी twist अभी तक दिमाग में घूम रहा है।" when SHOW LOG shows no twist aired
- point 2: a link of only the time, the temperature, a breeze and the catchphrase (no payload)
- point 5, specificity 4: "मेरा साफ़ मानना है, lift का सबसे मुश्किल काम ऊपर जाना नहीं, बीस सेकंड तक पड़ोसी से नज़र बचाना है।" (an opinion with a turn)
- fidelity 5: "अब खबरें, सिमरन के साथ।" (the handover says only what NEXT allows)`,
  news: `EXAMPLES (news):
- fidelity 1: "Alkapuri flyover की opening की खबर भी आ रही है।" when no item says it
- specificity 1, point 2: "जंतर-मंतर की जगह अब ये नए spots हैं, और locals ने अपनी राय दी है।" (which spots? what opinion?)
- specificity 1: "वडोदरा का decoration देखने लायक है।" (tells the listener nothing)
- fidelity 2: "बताया जा रहा है कि हालात बेहद गंभीर हैं।" (hearsay the item never gave)
- fidelity 5, specificity 5: "बड़ौदा से: नगर निगम के मुताबिक, पुल की मरम्मत शुक्रवार तक चलेगी।" when the item says exactly that`,
  ad_break: `EXAMPLES (ad_break):
- coherence 1, point 1: "उनके shoes हैं PannaPani. delivery: hushed।" (a stage direction read aloud)
- point 1: ends on "तो आज ही लीजिए Papad-Chhata, Papad-Chhata! Papad-Chhata!" (the brand chanted, no punchline)
- coherence 2: shoes that shoot out kachori outside a palace (a product that solves no problem, no format)
- point 5: "पूरे मोहल्ले में Rank 1, और इसका पूरा श्रेय 'रटंतु Classes' को!" then "रटंतु Classes। इस Rank 1 का दावा 4 और institutes भी करते हैं, topper एक ही है।" (the fine print is the joke)`,
  kahani: `EXAMPLES (kahani):
- coherence 1: an adult man says "अरे पापा" while the kid also calls someone "पापा"; "Sushila नाम का लड़का" becomes a 70-year-old aunt (who is who?)
- coherence 2: the first name heard is in narration at line 9 ("इमरान को एक मुड़ा हुआ कागज़ मिला।") (nobody was named)
- hook 2: L1 "अरे, ये बहुत भारी है।" (anyone could say it)
- ending 1 (final part): the story stops on "अचानक? क्यों?" or "पापा, वो थुषिला कौन है?" (no payoff)
- hook 5: "इशान, तूने फिर मेरी साइकिल की घंटी बेच दी? कल सुबह 6 बजे race है!" (a name, a stake and a clock in line 1)
- ending 5 (part 1): "घंटी वापस मिल गई… पर उस पर किसी ने खरोंच कर लिखा था, 'race मत जाना।'" (a new concrete fact)`,
};

const CHECKLIST: Record<ReviewType, string> = {
  rj_link: '- Is the PAYLOAD (or, in an opener, the greeting + time/weather feeling) in lines 1-2?\n- Does anything about NEXT go beyond what NEXT allows? Does any line claim something aired that SHOW LOG does not show?\n- Is the time or weather said outside the opener?',
  news: '- Can every line be traced to one ITEM? Any name, place, number, cause or reaction not in an item is unsupported.\n- Is each story told with who/what/where, or is it vague?',
  ad_break: '- Is the format obvious from line 1? Which line is the punchline (quote it), and would a listener laugh?\n- Is any spoken text a stage direction? Does the ad end on the joke or on a chant/call to action?',
  kahani: '- Can you name every speaker by their second line? Any kinship or gender confusion?\n- Final part: does it reach the payoff through the clue? Parts 1-2: does it end on a new concrete fact?',
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
        ? items.map((h, i) => `[N${i + 1}] slot=${h.slot ?? '-'} · source=${h.source ?? '-'} · light=${h.light ? 'yes' : 'no'}\n  title: ${h.title}\n  detail: ${h.detail ? h.detail.slice(0, 250) : 'none'}`).join('\n')
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
    out.push(`All of it is fiction: there are no real-world facts. Real brands, people and landmarks are not allowed.${c.ad?.format ? ` FORMAT: ${c.ad.format}${c.ad.signature ? ` (${c.ad.signature})` : ''}.` : ''}`);
  }
  if (input.type === 'kahani') {
    if (c.outline && Object.keys(c.outline).length) out.push(`OUTLINE:\n${Object.entries(c.outline).map(([k, v]) => `  ${k}: ${v}`).join('\n')}`);
    else out.push('No outline: everything in it is fiction.');
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
  const kind = input.type === 'kahani' ? (input.oneShot ? 'one complete story' : `part ${input.part ?? 1} of 3${isFinal(input) ? ' (final part)' : ''}`) : `mode ${input.mode ?? '-'}`;
  const system = `You are the senior producer of ${onAir}, a ${lang} radio station. You did not write this script. You hear it once, in order, like a listener. You are strict: most drafts from a careless writer score 2, an airable but forgettable one scores 3, and 5 means a top Indian FM producer would air it unchanged. A score of 4 or 5 needs a quoted line that shows the good thing; if you cannot quote it, the score is 2 or lower.
Work in this order and write every field in this order: first what was heard, then every unsupported claim, then for each criterion the quoted evidence followed by the score.
Quote lines as L<n> "<up to 10 words copied exactly from that line>", separated by " | ". Return only flat JSON with exactly the schema's fields, all strings.`;
  const user = `SEGMENT: ${input.type} · ${kind} · ${lang}
POINT the script had to deliver: ${input.context.point ?? defaultPoint(input)}
CONTEXT (the only real-world facts the writer was given; any other real-world claim is invented):
${contextBlock(input)}
SCRIPT (numbered; role · delivery · text):
${numbered(input)}

Field names carry a letter prefix (a_ to p_) that fixes their order; write them in that order.
STEP 1. heard_summary_en: 1-2 sentences, past tense, what a listener heard. Only what the lines say; never what they were meant to say.
STEP 2. unsupported_en: go line by line. A claim is a checkable statement about the real world: a place, person, organisation, event, number, news item or someone's reaction, or a statement about what aired or what comes next. List every claim that CONTEXT does not give, as L<n>: <the claim in up to 10 words>, separated by " | ". NOT claims: opinions, jokes, feelings, exaggeration, advice, greetings, the RJ's own life, anything inside an ad or a story, and anything CONTEXT gives in any script or spelling (गरबा = garba, बड़ौदा = Vadodara). Write "none" only after checking every line.
STEP 3. For each criterion write <criterion>_evidence (the quoted line or lines that decide the score, or "none"), then the score "1"-"5" ("na" where it does not apply).
${ANCHORS}

${EXAMPLES[input.type]}

CHECK:
${CHECKLIST[input.type]}

RULES THE CODE ALSO ENFORCES: anything in unsupported_en caps fidelity at 2; a stage direction read aloud caps coherence at 2; a final story part that ends on a question gets ending 1; an ad whose point_evidence quotes no joke gets point_landed 2 at most.
worst_line: the number of the weakest line. fix: one sentence naming the line ("Line 3: ...") and what to change.
Keep it short: heard_summary_en at most 35 words; each evidence one or two quotes; fix at most 25 words.
Fields: ${VERDICT_FIELDS.join(', ')}.`;
  return { system, user };
}

// ---- Parsing and caps --------------------------------------------------------------------------------------------

const NONE_RE = /^\s*(none|nothing|n\/a|na|-|no(ne)? (unsupported|invented)( claims?| facts?)?|कोई नहीं)\.?\s*$/i;

export function isNone(s: string | undefined): boolean {
  return !s || NONE_RE.test(s);
}

function toScore(v: unknown): number | null {
  const s = String(v ?? '').trim();
  return /^[1-5]$/.test(s) ? Number(s) : null;
}

/** Lenient JSON: an object, a JSON string, or a string with prose or fences around the JSON. */
export function parseJsonLoose(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  try {
    return JSON.parse(t) as Record<string, unknown>;
  } catch {
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try {
      return JSON.parse(t.slice(a, b + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

/** Splits "L5: x | L6: y" into claims, dropping "none" and the fiction disclaimers some models add. */
export function splitClaims(s: string): string[] {
  if (isNone(s)) return [];
  return s
    .split(/\s*\|\s*|\n+|;\s*(?=L\d)/)
    .map((x) => x.trim())
    .filter((x) => x && !isNone(x) && !/^(no|none|nothing)\b/i.test(x) && !/\b(is|are) (fiction|fictional|allowed)\b.*$/i.test(x));
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
    c.recap?.heard,
    c.relations,
  ]
    .filter(Boolean)
    .join(' ')
    .normalize('NFC')
    .toLowerCase();
}

const CLAIM_STOP = new Set(['the', 'and', 'that', 'not', 'any', 'item', 'items', 'context', 'given', 'line', 'claim', 'says', 'said', 'about', 'with', 'from', 'this', 'there', 'है', 'हैं', 'की', 'का', 'के', 'में', 'और', 'से', 'पर', 'को', 'भी', 'तो', 'ने']);

/**
 * A judge sometimes lists a word the context does give ("L2: garba" when FESTIVAL says garba nights). A claim
 * whose every content word is in the context is dropped; a claim with one new name or word stays.
 */
export function supportedByContext(claim: string, ctx: string): boolean {
  const body = claim.replace(/^\s*L\s?\d+\s*[:：.-]?\s*/i, '').replace(/\(.*?\)/g, ' ');
  const words = body
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !CLAIM_STOP.has(w));
  return words.length > 0 && words.every((w) => ctx.includes(w));
}

/** Parses the model's verdict and applies the code caps. Returns null when the output is not usable. */
export function parseVerdict(raw: unknown, input: JudgeInput): JudgeVerdict | null {
  const parsed = parseJsonLoose(raw);
  if (!parsed) return null;
  // Accept the letter-prefixed fields ("d_hook") and bare ones ("hook")
  const obj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed)) obj[k.replace(/^[a-p]_/, '')] = v;
  const str = (k: string) => (typeof obj[k] === 'string' ? (obj[k] as string) : obj[k] == null ? '' : String(obj[k]));
  const dims = applicableDims(input);
  const scores = Object.fromEntries(DIMS.map((d) => [d, null])) as Scores;
  scores.hook = toScore(obj.hook);
  scores.coherence = toScore(obj.coherence);
  scores.point_landed = toScore(obj.point_landed);
  scores.specificity = toScore(obj.specificity);
  scores.fidelity = toScore(obj.fidelity);
  if (dims.includes('story_resolved')) scores.story_resolved = toScore(obj.ending ?? obj.story_resolved);
  if (dims.includes('cliffhanger')) scores.cliffhanger = toScore(obj.ending ?? obj.cliffhanger);
  if (dims.filter((d) => scores[d] == null).length > 1) return null;
  const evidence: JudgeVerdict['evidence'] = {
    hook: str('hook_evidence'),
    coherence: str('coherence_evidence'),
    point_landed: str('point_evidence'),
    specificity: str('specificity_evidence'),
    fidelity: str('fidelity_evidence'),
  };
  if (dims.includes('story_resolved')) evidence.story_resolved = str('ending_evidence');
  if (dims.includes('cliffhanger')) evidence.cliffhanger = str('ending_evidence');
  const wl = Number.parseInt(str('worst_line').replace(/[^\d]/g, ''), 10);
  const verdict: JudgeVerdict = {
    heardSummaryEn: str('heard_summary_en').trim(),
    invented: splitClaims(str('unsupported_en') || str('invented_en')).filter((claim) => !supportedByContext(claim, contextText(input))),
    scores,
    evidence,
    worstLine: Number.isFinite(wl) && wl >= 1 && wl <= input.lines.length ? wl : null,
    fix: str('fix').trim(),
    capped: [],
  };
  applyCaps(verdict, input);
  return verdict;
}

/**
 * Code caps: the score can't be higher than the model's own evidence allows.
 * - Any unsupported claim → fidelity ≤ 2 (rj_link and news: the facts are real; ad and story: real brands or landmarks).
 * - A 4-5 with evidence "none" → 3.
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
  if (v.invented.length) cap('fidelity', 2, 'unsupported claims listed');
  for (const d of applicableDims(input)) {
    const ev = v.evidence[d];
    if ((v.scores[d] ?? 0) >= 4 && (ev === undefined || isNone(ev) || ev.trim().length < 4)) cap(d, 3, 'a high score with no quoted line');
  }
  if (isFinal(input)) {
    const last = input.lines[input.lines.length - 1]?.text ?? '';
    if (/[?？]["'”’»)\s]*$/u.test(last.trim())) cap('story_resolved', 1, 'the final part ends on a question');
  }
  if (input.type === 'ad_break') {
    const ev = v.evidence.point_landed ?? '';
    if (isNone(ev) || /\bno (joke|punchline)\b/i.test(ev)) cap('point_landed', 2, 'no punchline quoted');
  }
}

/** Mean of the applicable scores (null when none came back). */
export function meanScore(scores: Scores, dims: Dim[]): number | null {
  const vals = dims.map((d) => scores[d]).filter((x): x is number => x != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
