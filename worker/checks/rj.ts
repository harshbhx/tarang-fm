/**
 * The RJ link's free checks (bible §5.1, prompt pack §10.3): deterministic, no model call. They run on the
 * writer's draft before it airs; `hard` problems trigger one rewrite with the messages as the producer note,
 * and `dropLines` are lines that may be cut instead (a catchphrase that was not allowed, an invented place,
 * the time outside the opener, a copied example) when the rewrite still has them.
 *
 * Built on the shared helpers in ./free (fillers, leaks, time and weather words, invented tokens).
 */
import type { StationId } from '../../shared/types';
import type { FactType } from '../facts';
import type { LinkMode, PayloadType } from '../linkPlan';
import { asciiDigits, copiedFragment, fillerReport, fold, kinshipWords, leaksDirection, overlap, repeatedLines, saysTimeOrWeather, unsupportedTokens, wordsOf, type FreeLine } from './free';
import { FILLER_MAX, RHYTHM_MIN_LINES, RHYTHM_MIN_SPREAD, rjLines } from './limits';

export interface RjCheckContext {
  station: StationId;
  mode: LinkMode;
  payloadType: PayloadType;
  /** fact payloads: the kind of fact */
  factKind?: FactType;
  /** Every real-world thing the link was given: the payload, its fact (native and English), the opener's time and weather */
  factText: string;
  /** What the handover may say (the rendered NEXT_ALLOWED, plus the tease or heard summary) */
  nextAllowed: string;
  nextType: string;
  /** Numbers, Latin tokens and native names the payload must keep */
  kept: string[];
  /** Station name, frequency, RJ, newsreader, city, the RJ bible: always allowed */
  frame: string[];
  /** Heard summaries of what aired */
  showLog: string[];
  /** The exact time phrase of now (opener only may say it) */
  nowPhrase?: string;
  catchphrase?: { text: string; allowed: boolean };
  listenerName?: string;
  calls: number;
  /** The payload question, which must be asked */
  question?: string;
  extraFragments?: string[];
}

export interface RjCheckResult {
  pass: boolean;
  hard: string[];
  soft: string[];
  dropLines: number[];
}

const n1 = (i: number) => `Line ${i + 1}`;
const squash = (t: string) => fold(t).replace(/[\s\p{P}]+/gu, '');

/** Words that name the next segment, per language (a handover line uses one). */
const NEXT_WORDS: Record<string, RegExp> = {
  news: /खबर|ख़बर|समाचार|news|बातम्या|செய்தி|খবর|সংবাদ|સમાચાર/iu,
  ad_break: /break|ब्रेक|विज्ञापन|जाहिरात|இடைவேளை|বিরতি|બ્રેક/iu,
  kahani: /कहानी|कड़ी|story|गोष्ट|भाग|கதை|பகுதி|গল্প|পর্ব|વાર્તા|ભાગ/iu,
};

/** Phrases that describe what is IN the next segment ("about…", "you'll hear that…"): never allowed before news or a break. */
const DESCRIBES: Partial<Record<StationId, string[]>> = {
  hi: ['के बारे में', 'की खबर', 'की ख़बर', 'में बात होगी', 'पता चलेगा', 'जानेंगे', 'सुनेंगे कि', 'में सुनिए', 'खबर है कि', 'ख़बर है कि', 'की जानकारी', 'का पूरा हाल', 'की पूरी'],
  mr: ['बद्दल', 'ची बातमी', 'जाणून घेऊ', 'कळेल', 'ऐकूया की'],
  ta: ['பத்தி', 'பற்றி', 'தெரிஞ்சுக்கலாம்', 'செய்தி என்னன்னா', 'பாக்கலாம்'],
  bn: ['সম্পর্কে', 'নিয়ে খবর', 'জানা যাবে', 'জানব', 'শুনব যে'],
  gu: ['વિશે', 'ના સમાચાર', 'જાણીશું', 'ખબર પડશે', 'સાંભળીશું કે'],
};

/** Payloads whose numbers and names are real-world facts (an invented one is a lie, not a joke). */
const FACTUAL: ReadonlySet<PayloadType> = new Set(['fact', 'opener', 'kahani_tease', 'shoutout', 'studio_calls']);

function hasKept(text: string, token: string): boolean {
  const t = asciiDigits(token).trim();
  if (!t) return true;
  if (/^[\x00-\x7F]+$/.test(t)) return fold(asciiDigits(text)).includes(fold(t));
  // A native name or phrase: most of its words, inflections allowed
  return overlap(text, t) >= 0.5;
}

/** The server's placeholders ({name}, {caller1}) are not brackets read aloud. */
const PLACEHOLDER = /\{\s*(?:name|nickname|caller\s*\d)\s*\}/giu;

export function rjLinkChecks(input: FreeLine[], ctx: RjCheckContext): RjCheckResult {
  const lines = input.map((l) => ({ ...l, text: l.text.replace(PLACEHOLDER, 'X') }));
  const hard: string[] = [];
  const soft: string[] = [];
  const drop = new Set<number>();
  const n = lines.length;
  if (!n) return { pass: false, hard: ['The script has no lines.'], soft: [], dropLines: [] };
  const factual = FACTUAL.has(ctx.payloadType);
  const handoverAt = n - 1;

  // Line count for the mode
  // A studio call may take the place of a line, so calls raise only the maximum
  const range = rjLines(ctx.mode, ctx.calls);
  if (range) {
    const [min, max] = [range[0] - ctx.calls, range[1]];
    if (n < min) hard.push(`Too short: ${n} lines; this link needs ${min}-${max}.`);
    else if (n > max + 1) hard.push(`Too long: ${n} lines; this link needs ${min}-${max}. Cut a middle line, keep the handover.`);
    else if (n > max) soft.push(`${n} lines; aim for ${min}-${max}.`);
  }

  // Leaks, copies, repeats
  lines.forEach((l, i) => {
    if (leaksDirection(l.text)) {
      hard.push(`${n1(i)} reads a stage direction, label or bracket aloud: only spoken words go in "text".`);
      drop.add(i);
    }
    const frag = copiedFragment(l.text, ctx.extraFragments);
    if (frag) {
      hard.push(`${n1(i)} copies an example from the instructions ("${frag}"): write your own line.`);
      drop.add(i);
    }
  });
  for (const r of repeatedLines(lines)) hard.push(`${n1(r.line)} repeats ${n1(r.of ?? 0)}: every line must move on.`);

  // Fillers on a budget (bible §3.1)
  const f = fillerReport(lines, ctx.station);
  if (f.total > FILLER_MAX) {
    const where = [...f.found.entries()].map(([i, ws]) => `${n1(i)}: ${ws.join(', ')}`).join('; ');
    hard.push(`${f.total} filler words (${where}): at most ${FILLER_MAX} in the whole link.`);
  }
  if (f.starts.includes(0)) hard.push(`${n1(0)} opens on a filler word: open on the point instead.`);
  if (f.tags.length) hard.push(`${f.tags.map(n1).join(', ')} end${f.tags.length === 1 ? 's' : ''} on a filler tag: end on the meaning.`);

  // Time and weather only in the opener, or when the payload itself is the weather (or tells a time of its own)
  if (ctx.mode !== 'opener' && ctx.mode !== 'kahani_in') {
    const payloadSaysIt = saysTimeOrWeather(ctx.factText, ctx.station);
    lines.forEach((l, i) => {
      const now = ctx.nowPhrase && squash(ctx.nowPhrase).length >= 4 && squash(l.text).includes(squash(ctx.nowPhrase));
      if (now || (saysTimeOrWeather(l.text, ctx.station) && !payloadSaysIt)) {
        hard.push(`${n1(i)} gives the time or the weather: they belong only in the opener. Go straight to the payload.`);
        drop.add(i);
      }
    });
  }

  // Catchphrase: only when code allowed it, once, at the end
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

  // Invented places, names and numbers: places always fail; names and numbers fail on a factual payload or in the handover
  const allowedCtx = {
    station: ctx.station,
    factText: ctx.factText,
    keptTokens: ctx.kept,
    showLog: ctx.showLog,
    nextAllowed: ctx.nextAllowed,
    frame: ctx.frame,
    timePhrase: ctx.mode === 'opener' ? ctx.nowPhrase : undefined,
    listenerName: ctx.listenerName,
    catchphrase: cp,
  };
  for (const u of unsupportedTokens(lines, allowedCtx)) {
    const msg = `${n1(u.line)} says "${u.token}", which is not in what you were given: never add a ${u.kind === 'number' ? 'number' : u.kind === 'place' ? 'place' : 'name'} the blocks did not give.`;
    if (u.kind === 'place' || factual || u.line === handoverAt) {
      hard.push(msg);
      if (u.kind === 'place') drop.add(u.line);
    } else soft.push(msg);
  }

  // The handover says only what NEXT allows (bible §4.1): before news or a break, the label and nothing more
  const nextRe = NEXT_WORDS[ctx.nextType];
  if (nextRe && (ctx.nextType === 'news' || ctx.nextType === 'ad_break')) {
    const cues = DESCRIBES[ctx.station] ?? [];
    lines.forEach((l, i) => {
      if (!nextRe.test(l.text)) return;
      const t = fold(l.text);
      const cue = cues.find((c) => t.includes(fold(c)));
      if (cue) {
        hard.push(`${n1(i)} describes what is in the ${ctx.nextType === 'news' ? 'news' : 'break'} ("${cue}"), which you were not given: say only that it is next.`);
        if (i !== handoverAt) drop.add(i);
      }
    });
  }
  if (nextRe && !lines.slice(-2).some((l) => nextRe.test(l.text))) {
    hard.push('The handover is missing: the last line must say, in a few words, what is next (only what NEXT allows).');
  }

  // A full English sentence, a stock YouTube opener, or a relative the RJ bible doesn't have
  lines.forEach((l, i) => {
    const latin = (l.text.match(/[A-Za-z]+/g) ?? []).length;
    const words = wordsOf(l.text).length;
    if (words >= 3 && latin / words > 0.6) hard.push(`${n1(i)} is an English sentence: say it in the station language.`);
    if (/आज हम .{0,40}बात करेंगे|चलिए .{0,20}बात करते हैं/u.test(l.text)) hard.push(`${n1(i)} announces the topic ("आज हम … बात करेंगे"): open on the point itself.`);
    const frame = fold(ctx.frame.join(' '));
    for (const kin of kinshipWords(l.text, ctx.station)) {
      if (!frame.includes(fold(kin)) && !fold(ctx.factText).includes(fold(kin))) hard.push(`${n1(i)} mentions "${kin}", who is not in your RJ BIBLE: use only your own people.`);
    }
  });

  // The payload is delivered: the fact's kept numbers and names, the question itself
  if (ctx.payloadType === 'fact' && ctx.kept.length) {
    const all = lines.map((l) => l.text).join(' ');
    const missing = ctx.kept.filter((k) => !hasKept(all, k));
    if (missing.length) hard.push(`The fact is not delivered as given: keep ${missing.map((m) => `"${m}"`).join(', ')} exactly.`);
  }
  if (ctx.payloadType === 'question' && ctx.question) {
    const best = Math.max(...lines.map((l) => overlap(l.text, ctx.question!)));
    if (best < 0.4) hard.push(`The question of the day is not asked: ask "${ctx.question}" in your own words, then promise your answer for the next break.`);
  }

  // Rhythm: soft notes only
  if (n >= RHYTHM_MIN_LINES) {
    const lens = lines.map((l) => l.text.length);
    if (Math.max(...lens) - Math.min(...lens) < RHYTHM_MIN_SPREAD) soft.push('Every line is about the same length: add one short line and one longer one.');
  }
  const firsts = lines.map((l) => wordsOf(l.text)[0] ?? '');
  const dup = firsts.findIndex((w, i) => w.length > 1 && firsts.indexOf(w) !== i);
  if (dup >= 0) soft.push(`${n1(firsts.indexOf(firsts[dup]))} and ${n1(dup)} start with the same word: vary the openings.`);

  const unique = [...new Set(hard)];
  return { pass: unique.length === 0, hard: unique, soft: [...new Set(soft)], dropLines: [...drop].sort((a, b) => a - b) };
}
