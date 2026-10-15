/**
 * The station's fiction: the Kahani (a 3-part serial, or one complete story for the shared live show) and the
 * ad break. Code decides what each one is (the serial's outline and cast, the ad's format and problem), the
 * writer delivers it, and the free checks (checks/story.ts, checks/ad.ts) send a script back once, with the
 * problems as a note, when it misses. Nothing is ever cut from the middle of a story: a part that runs long is
 * rewritten, and a last part that still doesn't resolve gets the outline's payoff appended.
 */
import { z } from 'zod';
import type { SegmentRequest } from '../shared/schemas';
import type { Line, RecapSource, Role, Segment, SerialState, Station } from '../shared/types';
import { castCharacters, castFromRecord, castRecord, castSerial, type CharacterRole, type SerialCast } from './casting';
import { adShape } from './checks/ad';
import {
  addressSlips,
  blockCount,
  copiesFictionExample,
  endsWithQuestion,
  fold,
  kinTargets,
  latinShare,
  leaksDirection,
  lineOverlap,
  serialShape,
  words,
  type AddressSlip,
  type CheckResult,
} from './checks/story';
import type { JudgeInput } from './judge/types';
import { normalizeTitle, type ShowMemory } from './memory';
import { pickAd, punChoices } from './pools/ads';
import { maxTokensFor, SEGMENT_PLAN, subtitlesOn, systemPreamble, type LlmPlan } from './prompts';
import { adJsonSchema, adPrompt, type AdPlan } from './prompts/ad';
import { subtitleRule } from './prompts/common';
import {
  castPeople,
  expectedLast,
  ONE_SHOT_BEATS,
  ONE_SHOT_FIELDS,
  OUTLINE_FIELDS,
  oneShotJsonSchema,
  oneShotPrompt,
  outlineJsonSchema,
  outlinePrompt,
  outlineSystem,
  partJsonSchema,
  partPrompt,
  partTitle,
  pickOpening,
  storyRoles,
  storySystem,
  type SerialOutline,
  type StoryPlan,
} from './prompts/kahani';
import { SarvamError, type ChatMessage, type Sarvam } from './sarvam';
import { applyGaps, fallbackSegment, limitNameTokens, toLine } from './segment';
import { isDelivery } from './show';
import { isSpooky, STORY_NAMES_NATIVE, storyBrief } from './story';
import { modelSubtitle } from './subtitle';
import { cleanText, processLines, type RawLine } from './text';
import type { Timings } from './timing';

/**
 * The serial outline, in the background at tune-in. It thinks in plan_why (its first field) with reasoning off:
 * with reasoning "low", sarvam-105b spent the whole 4,096-token cap on reasoning and returned no JSON
 * (finish_reason "length", twice on 2026-10-15), which the prompt pack's fallback rule covers.
 */
const OUTLINE_PLAN: LlmPlan = { temperature: 0.85, maxTokens: 3500, reasoningEffort: null, timeoutMs: 30_000 };
/** One complete story: a part's plan with room for 18 lines and the story plan. */
const ONE_SHOT_PLAN: LlmPlan = { temperature: 0.85, maxTokens: 3600, reasoningEffort: null, timeoutMs: 28_000 };
/** The Starter plan's output cap (reasoning tokens count against it). */
const MAX_TOKENS_CAP = 4096;

/** Wall-clock budgets, including the one rewrite. Kahani parts are prefetched well ahead of air. */
const OUTLINE_BUDGET_MS = 55_000;
const STORY_BUDGET_MS = 55_000;
const AD_BUDGET_MS = 26_000;
const MIN_ATTEMPT_MS = 5000;
/** The rescue try after a timed-out rewrite may run this far past the budget, with this timeout. */
const RESCUE_GRACE_MS = { story: 20_000, ad: 9000 };
const RESCUE_TIMEOUT_MS = { story: 22_000, ad: 10_000 };

/** Line counts: a part 12-16 (accept up to 18), a one-shot 16-18 (accept 14-20). Never truncated. */
const PART_LINES = { min: 12, max: 18 };
/** Most lines a part is asked for: 16, or 14 with subtitles (a rewrite with 16 subtitled lines hit the 4096-token cap). */
const PART_ASK = { plain: 16, subtitled: 14 };
const ONE_SHOT_LINES = { min: 14, max: 20 };

/** How many recent stories' ingredients a new brief avoids, and how many recent ads' formats/problems. */
const AVOID_STORIES = 24;
const AIRED_LIST = 10;

const OUTLINE_VALUE_MAX = 600;

// ---- Model output (flat, lenient: limits are enforced here, not in the schema) -------------------------------

const ModelLine = z.object({
  /** Stories: the character's name (or "narrator"); code maps it to a role */
  speaker: z.string().max(60).optional(),
  role: z.string().max(60).optional(),
  text: z.string().min(1).max(600),
  delivery: z.string().max(20).optional(),
  en: z.string().max(600).optional(),
});

function clipStrings(value: unknown, max: number): unknown {
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v.slice(0, max);
    else if (k === 'lines' && Array.isArray(v)) {
      out[k] = v.slice(0, 30).map((l) => {
        if (!l || typeof l !== 'object') return l;
        const line = l as Record<string, unknown>;
        return { ...line, ...(typeof line.text === 'string' ? { text: line.text.slice(0, 600) } : {}), ...(typeof line.en === 'string' ? { en: line.en.slice(0, 600) } : {}) };
      });
    } else out[k] = v;
  }
  return out;
}

function scriptSchema(fields: readonly string[]) {
  const shape = Object.fromEntries(fields.filter((f) => f !== 'lines').map((f) => [f, z.string().optional()]));
  return z.preprocess((v) => clipStrings(v, 1200), z.object({ ...shape, lines: z.array(ModelLine).min(1).max(30) }));
}

const OutlineSchema = z.preprocess(
  (v) => clipStrings(v, OUTLINE_VALUE_MAX),
  z.object(Object.fromEntries(OUTLINE_FIELDS.map((f) => [f, z.string().optional()]))),
);

type ScriptLine = { role: string; speaker?: string; text: string; delivery?: string; en?: string };
type ModelScript = { lines: ScriptLine[] } & Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

// ---- One checked write: one rewrite with the problems as the note, the better attempt kept --------------------

interface WriteSpec<T> {
  name: string;
  messages: ChatMessage[];
  schema: Record<string, unknown>;
  zod: z.ZodType<T>;
  plan: LlmPlan;
  subtitles: boolean;
  check: (raw: T) => CheckResult;
  /** Code's reading of the model's answer before any check (speaker names back to roles) */
  normalize?: (raw: T) => T;
  /** Code's own repairs to an attempt (dropping lines that must never air, the safety net), checked again after */
  repair?: (raw: T, check: CheckResult) => T;
  deadline: number;
  /** The plan for the attempt after a failed call (e.g. reasoning off when reasoning used up the tokens) */
  afterError?: LlmPlan;
  /**
   * The shorter task sent once when the rewrite of a draft with a hard problem failed (timed out): that first
   * draft never airs. It may run up to `graceMs` past the deadline.
   */
  rescue?: { user: string; graceMs: number; timeoutMs: number };
}

/** What a checked write came to: the draft that may air (if any), the first draft, and the path taken. */
export interface Written<T> {
  draft?: Draft<T>;
  first?: Draft<T>;
  path: 'first' | 'rewrite' | 'first_kept' | 'first_repaired' | 'second' | 'rescue' | 'rescue_failed' | 'none';
}

/** A draft as it would air: after code's repairs, with the problems it still has. */
export interface Draft<T> {
  raw: T;
  check: CheckResult;
}

/**
 * Sent instead of a producer note after an answer ran into the token cap (finish=length): a note on top of the
 * full task is what ran out of room, so the retry gets the shorter task and only this.
 */
export const LENGTH_NOTE =
  'LENGTH: your last answer ran past the length limit and was cut off. One short line per plan field, the fewest lines the shape allows, short sentences, and stop right after the last line.';

const cutOff = (err: unknown): boolean => err instanceof SarvamError && err.code === 'output_truncated';

/** The note appended to the writer's message on a rewrite (prompt pack §8.4). */
export function producerNote(check: CheckResult): string {
  const items = [...check.hard, ...check.soft].slice(0, 8);
  return `PRODUCER NOTE (the last draft was sent back; fix this and keep what worked):\n${items.map((p) => `- ${p}`).join('\n')}`;
}

/** True when draft `a` is at least as good as `b`: fewer blocks first, then fewer hard problems. */
export function atLeastAsGood(a: CheckResult, b: CheckResult): boolean {
  const blocks = blockCount(a) - blockCount(b);
  return blocks < 0 || (blocks === 0 && a.hard.length <= b.hard.length);
}

/**
 * At most two attempts: the second gets the first one's problems as a note. Each attempt is repaired by code
 * and checked again, and the better repaired draft is returned with its problems (a tie goes to the rewrite,
 * which already fixed what the note named). Throws only when no attempt came back at all.
 */
async function writeChecked<T>(sarvam: Sarvam, timings: Timings, spec: WriteSpec<T>): Promise<Written<T>> {
  let best: Draft<T> | undefined;
  let first: (Draft<T> & { sent: CheckResult }) | undefined;
  let note = '';
  let plan = spec.plan;
  let rewriteFailed = false;
  /** The task for the next attempt when it differs from the first (the shorter one after a cut-off answer) */
  let task: string | undefined;
  let truncated = false;
  const call = async (messages: ChatMessage[], now: LlmPlan, timeoutMs: number): Promise<Draft<T> & { sent: CheckResult }> => {
    const answer = await timings.measure('llm', () =>
      sarvam.chatJson(messages, spec.schema, spec.zod, {
        name: spec.name,
        temperature: now.temperature,
        maxTokens: Math.min(MAX_TOKENS_CAP, maxTokensFor(now, spec.subtitles)),
        reasoningEffort: now.reasoningEffort,
        timeoutMs,
      }),
    );
    const raw = spec.normalize ? spec.normalize(answer) : answer;
    const check = spec.check(raw);
    const fixed = spec.repair ? spec.repair(raw, check) : raw;
    return { raw: fixed, check: fixed === raw ? check : spec.check(fixed), sent: check };
  };
  const withNote = (user: string | undefined, text: string): ChatMessage[] =>
    spec.messages.map((m, i) => (i === spec.messages.length - 1 ? { ...m, content: `${user ?? m.content}${text ? `\n\n${text}` : ''}` } : m));
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = spec.deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) {
      if (attempt === 1 && first) rewriteFailed = true;
      break;
    }
    try {
      const draft = await call(withNote(task, note), plan, Math.min(plan.timeoutMs, remaining));
      if (attempt === 0) first = draft;
      if (!best || atLeastAsGood(draft.check, best.check)) best = draft;
      if (!draft.sent.hard.length) break;
      console.error(`[fiction] ${spec.name} attempt ${attempt + 1} sent back: ${draft.sent.hard.slice(0, 3).join(' | ')}`);
      note = producerNote(draft.sent);
    } catch (err) {
      if (attempt === 1 && first) rewriteFailed = true;
      if (spec.afterError) plan = spec.afterError;
      if (cutOff(err)) {
        // Its own error: one retry on the shorter task with only the length note, never a longer rewrite note
        truncated = true;
        task = spec.rescue?.user;
        note = LENGTH_NOTE;
      }
      console.error(`[fiction] ${spec.name} attempt ${attempt + 1} failed${truncated ? ' (cut off at the token cap)' : ''}: ${String(err)}`);
    }
  }
  const done = (path: Written<T>['path'], draft?: Draft<T>): Written<T> => {
    console.log(`[fiction] ${spec.name} path=${path}${draft ? ` hard=${draft.check.hard.length} blocks=${blockCount(draft.check)}` : ''}`);
    return { draft, first, path };
  };
  if (!first) return done(best ? 'second' : 'none', best);
  if (!first.sent.hard.length) return done('first', first);
  if (!rewriteFailed) return done(best === first ? 'first_kept' : 'rewrite', best);
  // Code's repairs (a dropped line, a line given to the right speaker) already fixed the first draft
  if (!first.check.hard.length) return done('first_repaired', first);
  // The first draft failed a hard check and its rewrite never came back: it never airs. One shorter try, else nothing
  if (!spec.rescue) return done('rescue_failed');
  const left = spec.deadline + spec.rescue.graceMs - Date.now();
  if (left < MIN_ATTEMPT_MS) return done('rescue_failed');
  try {
    // After a cut-off rewrite the rescue carries the length note and only the top hard problems
    const rescueNote = truncated ? [LENGTH_NOTE, ...first.check.hard.slice(0, 3).map((p) => `- ${p}`)].join('\n') : producerNote(first.check);
    const draft = await call(withNote(spec.rescue.user, rescueNote), spec.plan, Math.min(spec.rescue.timeoutMs, left));
    return done('rescue', draft);
  } catch (err) {
    console.error(`[fiction] ${spec.name} rescue failed: ${String(err)}`);
    return done('rescue_failed');
  }
}

/** How far the line-dropping repair may go: a story keeps its ending line and loses at most 2 lines. */
interface DropPolicy {
  keepLast: boolean;
  maxDrops: number;
}
const STORY_DROPS: DropPolicy = { keepLast: true, maxDrops: 2 };
const AD_DROPS: DropPolicy = { keepLast: false, maxDrops: Infinity };

/**
 * Drops the lines whose only must-never-air problems are droppable ones (a stage direction, an English line, a
 * copied example, a placeholder). A line with a block dropping can't repair is kept, so the draft stays blocked;
 * so is everything when the repair would need more drops than the policy allows.
 */
export function dropBlocked<L>(lines: L[], check: CheckResult, policy: DropPolicy): L[] {
  const blocks = check.block ?? [];
  if (!blocks.length) return lines;
  const fixed = new Set(blocks.filter((b) => !b.droppable).map((b) => b.line));
  const drop = new Set(blocks.filter((b) => b.droppable && !fixed.has(b.line) && !(policy.keepLast && b.line === lines.length - 1)).map((b) => b.line));
  if (drop.size > policy.maxDrops) return lines;
  return lines.filter((_l, i) => !drop.has(i));
}

// ---- The acceptance step (owner decision 2, 2026-10-15) -------------------------------------------------------

/** What the producer's judge says about a draft: only coherence decides here. */
export interface FictionVerdict {
  coherence?: number;
}

/** The producer's judge, plugged in by the caller. Resolving undefined (or failing) means "no verdict". */
export type FictionJudge = (input: JudgeInput) => Promise<FictionVerdict | undefined>;

/** A judge that takes longer than this gives no verdict. */
const JUDGE_TIMEOUT_MS = 8000;

/**
 * Whether the better draft may air. A must-never-air problem that dropping lines couldn't repair never airs.
 * Otherwise the judge's verdict decides when there is one (coherence 3 or more airs); with no verdict (no judge
 * yet, or it timed out), the draft airs.
 */
export function mayAir(check: CheckResult, verdict?: FictionVerdict): boolean {
  if (blockCount(check)) return false;
  if (typeof verdict?.coherence === 'number') return verdict.coherence >= 3;
  return true;
}

/** Asks the judge about a draft that still fails the free checks (but has nothing that must never air). */
async function verdictFor(judge: FictionJudge | undefined, check: CheckResult, input: () => JudgeInput): Promise<FictionVerdict | undefined> {
  if (!judge || !check.hard.length || blockCount(check)) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const late = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), JUDGE_TIMEOUT_MS);
    });
    return await Promise.race([judge(input()), late]);
  } catch (err) {
    console.error(`[fiction] judge failed: ${String(err)}`);
    return undefined;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

const reviewLines = (lines: { role: string; text: string; delivery?: string }[]) => lines.map((l) => ({ role: l.role, text: l.text, ...(l.delivery ? { delivery: l.delivery } : {}) }));

// ---- Lines on air ----------------------------------------------------------------------------------------------

/** Cleans the model's lines (no truncation), casts each role's voice and paces the gaps. */
function toAir(
  station: Station,
  type: 'kahani' | 'ad_break',
  raw: { role: string; text: string; delivery?: string; en?: string }[],
  roles: Role[],
  subtitles: boolean,
  voices: Partial<Record<Role, SerialCast['narrator']>> = {},
): Line[] {
  const texts = limitNameTokens(raw.map((l) => l.text), 0);
  const fallbackRole = roles[0];
  const rawLines: RawLine[] = raw.map((l, i) => ({
    role: (roles.includes(l.role as Role) ? l.role : type === 'kahani' ? fallbackRole : l.role) as Role,
    text: texts[i],
    delivery: l.delivery,
    ...(subtitles && l.en ? { en: limitNameTokens([l.en], 0)[0] } : {}),
  }));
  const processed = processLines(rawLines, roles, type, station.language);
  const lines = processed.map((l) => {
    const line = toLine(station, l.role, l.text, type, { delivery: isDelivery(l.delivery) ? l.delivery : 'normal', voice: voices[l.role] });
    const en = subtitles ? modelSubtitle(l.en) : undefined;
    if (en) line.en = en;
    return line;
  });
  return applyGaps(lines, type, Math.random, processed.map((l) => Boolean(l.continuation)));
}

function cleanTitle(raw: string, fallback: string, station: Station): string {
  const title = cleanText(raw, station.language).replace(/[।.]+$/u, '').trim();
  return (title || fallback).slice(0, 80);
}

// ---- Kahani ------------------------------------------------------------------------------------------------------

export type KahaniMode = { kind: 'one_shot' } | { kind: 'part'; part: 1 | 2 | 3; serial?: SerialState };

/**
 * What a kahani request asks for. A request with no part and no serial (older clients) gets one complete
 * story, so nothing on air ever stops halfway; a later part without its serial can't continue, so it too
 * gets a complete story.
 */
export function kahaniMode(req: SegmentRequest): KahaniMode {
  if (req.oneShot) return { kind: 'one_shot' };
  if (req.serial) {
    const part = req.part ?? (Math.min(3, req.serial.part + 1) as 1 | 2 | 3);
    return { kind: 'part', part, serial: req.serial };
  }
  if (req.part === 1) return { kind: 'part', part: 1 };
  return { kind: 'one_shot' };
}

/** What the outline says about people: the kinship check's allow-list. */
function definedPeople(outline: SerialOutline): string {
  return ['relations_en', 'offstage_en', 'char_a_who_en', 'char_b_who_en', 'char_kid_who_en', 'char_a_name_native', 'char_b_name_native', 'char_kid_name_native']
    .map((k) => outline[k] ?? '')
    .join(' | ');
}

function castNames(outline: SerialOutline, cast: SerialCast): Partial<Record<CharacterRole, string>> {
  return Object.fromEntries(castCharacters(cast).map((r) => [r, (outline[`${r}_name_native`] ?? '').trim()]));
}

/** Latin words in a native field, leaving out short all-caps acronyms (FM, ATM). */
const latinWords = (text: string): string[] => (text.match(/[A-Za-z][A-Za-z'-]*/g) ?? []).filter((w) => !/^[A-Z]{2,5}$/.test(w));

/** Problems with an outline that would break the parts. */
export function outlineProblems(outline: SerialOutline, cast: SerialCast, airedTitles?: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  for (const key of ['title_native', 'setting_native', 'relations_en', 'clue_en', 'twist_en', 'part1_last_line_native', 'part2_last_line_native', 'payoff_native', 'final_line_native']) {
    if (!outline[key] || /^none$/i.test(outline[key])) problems.push(`${key} is empty: write it.`);
  }
  for (const role of castCharacters(cast)) {
    const name = outline[`${role}_name_native`];
    if (!name || /^none$/i.test(name)) problems.push(`${role} is in the cast but has no name: give them one.`);
  }
  if (outline.final_line_native && endsWithQuestion(outline.final_line_native)) problems.push('final_line_native is a question: the serial must end resolved, on a smile.');
  if (outline.title_native && airedTitles?.has(normalizeTitle(outline.title_native))) problems.push(`The title "${outline.title_native}" already aired: pick another.`);
  for (const key of ['part1_last_line_native', 'part2_last_line_native', 'final_line_native', 'payoff_native']) {
    if (outline[key] && leaksDirection(outline[key])) problems.push(`${key} has a stage direction or bracket: spoken words only.`);
  }
  // Names and spoken lines in the station script: Latin here airs as English, and the part writer copies it
  // (a Latin "Aditya" in the setting came back inside Hindi lines). Only short all-caps acronyms (FM, ATM) may stay.
  for (const key of Object.keys(outline).filter((k) => k.endsWith('_native'))) {
    const v = outline[key];
    if (!v || /^none$/i.test(v)) continue;
    if (latinShare(v) > 0.5) problems.push(`${key} is in English ("${v.slice(0, 40)}"): write it in the station language and script.`);
    else if (latinWords(v).length) problems.push(`${key} has Latin text ("${latinWords(v).slice(0, 3).join(', ')}"): write every word in the station script.`);
  }
  return problems;
}

async function writeOutline(sarvam: Sarvam, station: Station, req: SegmentRequest, plan: StoryPlan, timings: Timings): Promise<SerialOutline | undefined> {
  const deadline = Date.now() + OUTLINE_BUDGET_MS;
  const messages: ChatMessage[] = [
    { role: 'system', content: outlineSystem(station) },
    { role: 'user', content: outlinePrompt(station, req, plan) },
  ];
  const absent = (['char_a', 'char_b', 'char_kid'] as const).filter((r) => !plan.cast[r]);
  const tidy = (raw: Record<string, string | undefined>): SerialOutline => {
    const out: SerialOutline = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v !== 'string') continue;
      // The model sometimes tags a line with its speaker, "(*char_a*)": the role has its own field
      const value = k.endsWith('_native') ? v.replace(/\s*[([][^)\]]{0,30}[)\]]\s*$/u, '') : v;
      out[k] = value.trim().slice(0, OUTLINE_VALUE_MAX);
    }
    for (const role of absent) for (const f of ['name_native', 'who_en', 'want_en', 'habit_native']) out[`${role}_${f}`] = 'none';
    return out;
  };
  const check = (raw: Record<string, string | undefined>): CheckResult => ({ hard: outlineProblems(tidy(raw), plan.cast, plan.airedTitles), soft: [] });
  try {
    const { draft } = await writeChecked(sarvam, timings, {
      name: 'tarang_kahani_outline',
      messages,
      schema: outlineJsonSchema(plan.cast),
      zod: OutlineSchema,
      plan: OUTLINE_PLAN,
      afterError: { ...OUTLINE_PLAN, timeoutMs: 25_000 },
      subtitles: false,
      check,
      deadline,
    });
    if (!draft) return undefined;
    const outline = tidy(draft.raw);
    // The parts can be written from an outline with small flaws, never from one without names or endings
    // Latin anywhere in a native field is critical too: the parts copy it and the safe close would air it
    const critical = outlineProblems(outline, plan.cast).filter((p) => /has no name|_last_line_native is|final_line_native is|payoff_native is|_native is in English|_native has Latin text|is a question/.test(p));
    return critical.length ? undefined : outline;
  } catch {
    return undefined;
  }
}

/** Memory and session lists the new story must differ from, and the brief that avoids their ingredients. */
export async function planStory(station: Station, req: SegmentRequest, memory?: ShowMemory): Promise<StoryPlan & { openingsUsed: string[] }> {
  const records = memory ? await memory.recentStories(station.id).catch(() => []) : [];
  const recent = records.slice(-AVOID_STORIES);
  const brief = storyBrief(station.id, req.listener.daypart, Math.random, {
    settings: recent.map((r) => r.setting),
    hooks: recent.map((r) => r.hook),
    twists: recent.map((r) => r.twist),
    openings: records.slice(-3).map((r) => r.opening),
  });
  const { cast } = castSerial(station, { listener: req.listener, spooky: isSpooky(brief.genre) });
  return {
    brief,
    cast,
    aired: records.slice(-AIRED_LIST).map((r) => `${r.title}${r.summary ? `: ${r.summary}` : ''}`),
    airedTitles: new Set(records.map((r) => normalizeTitle(r.title))),
    openingsUsed: records.slice(-3).map((r) => r.opening),
  };
}

/**
 * The safety net (bible §4.4): when the last part (or a one-shot) still ends on a question or misses its ending
 * after the rewrite, the narrator plays the planned payoff and the character says the planned last line.
 */
export function withSafetyNet<T extends { role: string; text: string; delivery?: string }>(
  lines: T[],
  ending: { payoff?: string; last?: string; lastRole?: string },
  make: (role: string, text: string, delivery: string) => T,
): { lines: T[]; appended: boolean } {
  const lastText = lines[lines.length - 1]?.text ?? '';
  const question = endsWithQuestion(lastText);
  const last = ending.last && !endsWithQuestion(ending.last) ? ending.last : undefined;
  const missesLast = Boolean(last) && !lines.slice(-3).some((l) => lineOverlap(l.text, last!) >= 0.3);
  if (!question && !missesLast) return { lines, appended: false };
  const tail = lines.slice(-6).map((l) => l.text).join(' ');
  const needPayoff = Boolean(ending.payoff) && (question || lineOverlap(tail, ending.payoff!) < 0.2);
  const out = [...lines];
  if (needPayoff) out.push(make('narrator', ending.payoff!, 'warm'));
  if (last) out.push(make(ending.lastRole && ending.lastRole !== 'narrator' ? ending.lastRole : 'narrator', last, 'warm'));
  return { lines: out, appended: out.length > lines.length };
}

function storyMessages(station: Station, cast: SerialCast, names: Partial<Record<CharacterRole, string>>, user: string, subtitles: boolean): ChatMessage[] {
  const system = storySystem(station, cast, names);
  return [
    { role: 'system', content: subtitles ? `${system}\n\n${subtitleRule('kahani')}` : system },
    { role: 'user', content: user },
  ];
}

const clipOutline = (o: SerialOutline): SerialOutline =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k.slice(0, 40), String(v).slice(0, OUTLINE_VALUE_MAX)]));

/**
 * The model names each line's speaker by the character's name; code maps names back to roles. A role id or
 * "narrator" passes through; a name spelt loosely (nukta, vowel length) still finds its role.
 */
export function speakersToRoles<S extends { lines: { role?: string; speaker?: string }[] } & Record<string, unknown>>(
  raw: S,
  names: Partial<Record<string, string>>,
): S {
  const byName = new Map<string, string>();
  for (const [role, name] of Object.entries(names)) if (name && !/^none$/i.test(name)) byName.set(fold(name).trim(), role);
  const byFirst = new Map([...byName].map(([n, role]) => [words(n)[0] ?? n, role]));
  const map = (v: string | undefined): string => {
    const t = (v ?? '').trim();
    if (!t || t === 'narrator' || /^char_(a|b|kid)$/u.test(t)) return t || 'narrator';
    return byName.get(fold(t)) ?? byFirst.get(words(t)[0] ?? '') ?? t;
  };
  const lines = raw.lines.map((l) => ({ ...l, role: map(l.speaker ?? l.role) }));
  const out: Record<string, unknown> = { ...raw, lines };
  if (typeof raw.last_line_role === 'string') out.last_line_role = map(raw.last_line_role);
  return out as S;
}

/**
 * Gives a line that was spoken to its own speaker to the right voice: talk about oneself by name is the
 * narrator's; a line calling out the speaker's name (or the kinship word for them) goes to the other character
 * (with three, the one nearest in the scene).
 */
export function reassignSlips<L extends { role: string }>(lines: L[], slips: AddressSlip[], characters: string[]): L[] {
  if (!slips.length) return lines;
  const out = lines.map((l) => ({ ...l }));
  for (const slip of slips) {
    const i = slip.line;
    const from = out[i].role;
    let to: string | undefined;
    if (slip.kind === 'self_mention') to = 'narrator';
    else {
      const others = characters.filter((c) => c !== from);
      if (others.length === 1) to = others[0];
      for (let j = i - 1; j >= 0 && !to; j--) if (out[j].role !== 'narrator' && out[j].role !== from) to = out[j].role;
      for (let j = i + 1; j < out.length && !to; j++) if (out[j].role !== 'narrator' && out[j].role !== from) to = out[j].role;
    }
    if (to) out[i].role = to;
  }
  return out;
}

/** Code's repair of a story draft: wrong speakers reassigned, then lines that must never air dropped (at most 2). */
function storyRepair(names: Partial<Record<string, string>>, kin: Record<string, string>, characters: string[], check: (raw: ModelScript) => CheckResult) {
  return (raw: ModelScript): ModelScript => {
    const slips = addressSlips(raw.lines, names, kin);
    const moved = slips.length ? { ...raw, lines: reassignSlips(raw.lines, slips, characters) } : raw;
    const recheck = moved === raw ? undefined : check(moved);
    const blocks = recheck ?? check(raw);
    const kept = dropBlocked(moved.lines, blocks, STORY_DROPS);
    return kept === moved.lines && moved === raw ? raw : { ...moved, lines: kept };
  };
}

/** The draft that may air, after the judge (when there is one) and the must-never-air rule. */
async function gate(written: Written<ModelScript>, judge: FictionJudge | undefined, input: (raw: ModelScript) => JudgeInput): Promise<ModelScript | undefined> {
  const draft = written.draft;
  if (!draft) return undefined;
  const verdict = await verdictFor(judge, draft.check, () => input(draft.raw));
  if (mayAir(draft.check, verdict)) return draft.raw;
  console.error(`[fiction] draft held back: ${draft.check.hard.slice(0, 3).join(' | ')}`);
  return undefined;
}

/** Outline or plan text that may be read on air as it is: in the station script, nothing that must never air. */
const nativeOk = (station: Station, text: string | undefined): text is string =>
  Boolean(text && text.trim() && !/^none$/i.test(text.trim()) && latinShare(text) <= (station.language === "en-IN" ? 1 : 0.5) && !leaksDirection(text) && !copiesFictionExample(text));

/**
 * The outline-based safe close, when a part could not be written: the serial ends here, on the outline's own
 * payoff and last line (part 1 opens on its tease and setting first). Every line is outline text already checked.
 */
function safeCloseLines(station: Station, outline: SerialOutline, part: 1 | 2 | 3): { role: string; text: string; delivery: string }[] {
  const lines: { role: string; text: string; delivery: string }[] = [];
  if (part === 1) {
    if (nativeOk(station, outline.tease_native)) lines.push({ role: 'narrator', text: outline.tease_native, delivery: 'dramatic' });
    if (nativeOk(station, outline.setting_native)) lines.push({ role: 'narrator', text: outline.setting_native, delivery: 'normal' });
  }
  if (nativeOk(station, outline.payoff_native)) lines.push({ role: 'narrator', text: outline.payoff_native, delivery: 'warm' });
  if (nativeOk(station, outline.final_line_native) && !endsWithQuestion(outline.final_line_native)) {
    lines.push({ role: outline.final_line_role && outline.final_line_role !== 'narrator' ? outline.final_line_role : 'narrator', text: outline.final_line_native, delivery: 'warm' });
  }
  return lines.length >= 2 ? lines : [];
}

/** A one-shot's safe close: the narrator tells its planned beats and the planned last line closes it. */
function oneShotCloseLines(station: Station, raw: ModelScript | undefined): { role: string; text: string; delivery: string }[] {
  if (!raw) return [];
  const beats = ONE_SHOT_BEATS.map((b) => str(raw[`plan_${b}_native`]));
  if (!beats.every((b) => nativeOk(station, b))) return [];
  const last = str(raw.last_line_native);
  const lines = beats.map((text, i) => ({ role: 'narrator', text, delivery: i === 0 ? 'dramatic' : 'normal' }));
  if (nativeOk(station, last) && !endsWithQuestion(last)) lines.push({ role: str(raw.last_line_role) || 'narrator', text: last, delivery: 'warm' });
  return lines;
}

const judgeLines = (lines: { role: string; text: string; delivery?: string }[]) => reviewLines(lines);

async function buildOneShot(sarvam: Sarvam, station: Station, req: SegmentRequest, timings: Timings, memory?: ShowMemory, judge?: FictionJudge): Promise<Segment> {
  const subtitles = subtitlesOn(station, req.subtitles);
  const base = await timings.measure('memory', () => planStory(station, req, memory));
  const people = castPeople(station, base.cast, base.brief);
  const plan: StoryPlan & { openingsUsed: string[] } = { ...base, people };
  const roles = storyRoles(plan.cast) as Role[];
  const characters = castCharacters(plan.cast);
  const names = people.names as Partial<Record<string, string>>;
  const fields = [...ONE_SHOT_FIELDS];
  const check = (raw: ModelScript): CheckResult => {
    const result = serialShape(station, raw.lines, {
      part: 0,
      characters,
      names,
      defined: [people.relations, ...Object.values(names)].map(str).join(' | '),
      expectedLast: undefined,
      min: ONE_SHOT_LINES.min,
      max: ONE_SHOT_LINES.max,
      kin: people.kin,
      beats: ONE_SHOT_BEATS.map((key) => ({ key, text: str(raw[`plan_${key}_native`]) })),
    });
    if (plan.airedTitles?.has(normalizeTitle(str(raw.title)))) result.hard.push(`The title "${str(raw.title)}" already aired: pick another.`);
    const last = str(raw.last_line_native);
    if (last && lineOverlap(raw.lines[raw.lines.length - 1]?.text ?? '', last) < 0.3) result.soft.push(`End on your planned last line: "${last}".`);
    return result;
  };
  let written: Written<ModelScript>;
  try {
    written = await writeChecked(sarvam, timings, {
      name: 'tarang_kahani_story',
      messages: storyMessages(station, plan.cast, people.names, oneShotPrompt(station, req, plan), subtitles),
      schema: oneShotJsonSchema(plan.cast, subtitles, people),
      zod: scriptSchema(fields) as unknown as z.ZodType<ModelScript>,
      plan: ONE_SHOT_PLAN,
      subtitles,
      check,
      normalize: (raw) => speakersToRoles(raw, names),
      repair: storyRepair(names, people.kin, characters, check),
      deadline: Date.now() + STORY_BUDGET_MS,
      rescue: { user: oneShotPrompt(station, req, plan, { short: true }), graceMs: RESCUE_GRACE_MS.story, timeoutMs: RESCUE_TIMEOUT_MS.story },
    });
  } catch {
    return fallbackSegment(station, 'kahani', subtitles);
  }
  const raw = await gate(written, judge, (r) => ({ type: 'kahani', oneShot: true, station: station.id, lines: judgeLines(r.lines), context: { names, relations: people.relations } }));
  let modelLines: { role: string; text: string; delivery?: string; en?: string }[];
  let summary = str(raw?.summary_en);
  let title = cleanTitle(str(raw?.title ?? written.first?.raw.title), station.nativeName, station);
  if (raw) {
    modelLines = withSafetyNet(raw.lines, { last: str(raw.last_line_native), lastRole: str(raw.last_line_role) }, (role, text, delivery) => ({ role, text, delivery })).lines;
  } else {
    // Never air a draft that failed: the narrator tells the planned beats instead (or the station fills the gap)
    const planned = oneShotCloseLines(station, written.first?.raw);
    modelLines = reassignSlips(planned, addressSlips(planned, names, people.kin), characters);
    console.log(`[fiction] tarang_kahani_story safe close (${modelLines.length} lines)`);
    if (modelLines.length < 4) return fallbackSegment(station, 'kahani', subtitles);
    summary = str(written.first?.raw.plan_story_en);
    if (airedTitle(plan, title)) title = station.nativeName;
  }
  const lines = toAir(station, 'kahani', modelLines, roles, subtitles, plan.cast);
  if (lines.length < 4) return fallbackSegment(station, 'kahani', subtitles);
  const segment: Segment = { id: crypto.randomUUID(), station: station.id, type: 'kahani', title, lines, summary: `Kahani "${title}": ${summary}`.slice(0, 200) };
  memory?.rememberStory(station.id, {
    at: new Date().toISOString(),
    title,
    summary: summary.slice(0, 200),
    setting: plan.brief.setting,
    hook: plan.brief.hook,
    twist: plan.brief.twist,
    opening: plan.brief.opening.id,
  });
  return segment;
}

const airedTitle = (plan: Pick<StoryPlan, 'airedTitles'>, title: string) => Boolean(plan.airedTitles?.has(normalizeTitle(title)));

async function buildPart(
  sarvam: Sarvam,
  station: Station,
  req: SegmentRequest,
  timings: Timings,
  part: 1 | 2 | 3,
  memory?: ShowMemory,
  given?: SerialState,
  judge?: FictionJudge,
): Promise<Segment> {
  const subtitles = subtitlesOn(station, req.subtitles);
  let outline: SerialOutline | undefined = given?.outline;
  let cast = castFromRecord(station, given?.cast);
  let serialId = given?.id;
  if (!outline) {
    const plan = await timings.measure('memory', () => planStory(station, req, memory));
    outline = await timings.measure('outline', () => writeOutline(sarvam, station, req, plan, timings));
    // No usable outline: a complete story instead of a serial that can't continue
    if (!outline) return buildOneShot(sarvam, station, req, timings, memory, judge);
    outline.opening = pickOpening(plan.openingsUsed);
    cast = plan.cast;
    serialId = crypto.randomUUID();
    memory?.rememberStory(station.id, {
      at: new Date().toISOString(),
      title: outline.title_native,
      summary: (outline.logline_en ?? '').slice(0, 200),
      setting: plan.brief.setting,
      hook: plan.brief.hook,
      twist: plan.brief.twist,
      opening: outline.opening,
    });
  }
  // A cast that doesn't belong to this station is recast; the outline's roles stay
  if (!cast) cast = castSerial(station, { listener: req.listener }).cast;
  const roles = storyRoles(cast) as Role[];
  const characters = castCharacters(cast);
  const names = castNames(outline, cast);
  const kin = kinTargets(outline.relations_en ?? '', Object.fromEntries(characters.map((r) => [r, [names[r] ?? '', ...latinSpellings(station, names[r])]])));
  const end = expectedLast(outline, part);
  const ask = subtitles ? PART_ASK.subtitled : PART_ASK.plain;
  const recap: RecapSource | undefined =
    part > 1
      ? (req.recapSource ?? {
          heard: outline.aired_heard_en ?? '',
          cliffhanger: outline.aired_cliffhanger_en || outline[`part${part - 1}_last_line_native`] || '',
          lastLines: [],
        })
      : undefined;
  const check = (raw: ModelScript): CheckResult =>
    serialShape(station, raw.lines, {
      part,
      characters,
      names,
      defined: definedPeople(outline!),
      expectedLast: end.text || undefined,
      min: PART_LINES.min,
      max: PART_LINES.max,
      recapLines: recap?.lastLines.map((l) => l.text),
      kin,
    });
  let written: Written<ModelScript>;
  try {
    written = await writeChecked(sarvam, timings, {
      name: `tarang_kahani_part${part}`,
      messages: storyMessages(station, cast, names, partPrompt(station, outline, cast, part, recap, { lines: ask }), subtitles),
      schema: partJsonSchema(cast, subtitles, outline),
      zod: scriptSchema(['plan_scene', 'plan_names', 'plan_turn', 'lines', 'summary_en', 'cliffhanger_en']) as unknown as z.ZodType<ModelScript>,
      plan: SEGMENT_PLAN.kahani,
      subtitles,
      check,
      normalize: (raw) => speakersToRoles(raw, names),
      repair: storyRepair(names, kin, characters, check),
      deadline: Date.now() + STORY_BUDGET_MS,
      rescue: { user: partPrompt(station, outline, cast, part, recap, { short: true, lines: ask }), graceMs: RESCUE_GRACE_MS.story, timeoutMs: RESCUE_TIMEOUT_MS.story },
    });
  } catch {
    written = { path: 'none' };
  }
  const raw = await gate(written, judge, (r) => ({
    type: 'kahani',
    part,
    station: station.id,
    lines: judgeLines(r.lines),
    context: { outline: outline!, names, relations: outline!.relations_en, expectedLastLine: end.text, ...(recap ? { recap } : {}) },
  }));
  const title = partTitle(station.id, cleanTitle(outline.title_native, station.nativeName, station), part);
  if (!raw) {
    // Never air a part that failed: the serial closes here, on the outline's payoff and last line
    // The outline's own ending lines get the wrong-speaker check too: narration in a character's voice ("Aditya
    // said, smiling: …") goes to the narrator, a line calling out its own speaker to the other character
    const planned = safeCloseLines(station, outline, part);
    const close = reassignSlips(planned, addressSlips(planned, names, kin), characters);
    console.log(`[fiction] tarang_kahani_part${part} safe close (${close.length} lines)`);
    if (!close.length) return fallbackSegment(station, 'kahani', subtitles);
    const lines = toAir(station, 'kahani', close, roles, subtitles, cast);
    const summary = outline.payoff_en ? `The serial closed early: ${outline.payoff_en}` : 'The serial closed early.';
    return {
      id: crypto.randomUUID(),
      station: station.id,
      type: 'kahani',
      title,
      lines,
      summary: `Kahani part ${part} of 3: ${summary}`.slice(0, 200),
      serial: { id: serialId!, part: 3, outline: clipOutline({ ...outline, aired_heard_en: summary, aired_cliffhanger_en: 'resolved' }), cast: castRecord(cast) },
    };
  }
  let modelLines = raw.lines;
  let summary = str(raw.summary_en);
  if (part === 3) {
    const net = withSafetyNet(modelLines, { payoff: outline.payoff_native, last: outline.final_line_native, lastRole: outline.final_line_role }, (role, text, delivery) => ({ role, text, delivery }));
    modelLines = net.lines;
    if (net.appended && outline.payoff_en) summary = `${summary} In the end: ${outline.payoff_en}`;
  }
  const lines = toAir(station, 'kahani', modelLines, roles, subtitles, cast);
  if (lines.length < 6) return fallbackSegment(station, 'kahani', subtitles);
  const cliffhanger = part === 3 ? 'resolved' : str(raw.cliffhanger_en) || end.text;
  const serial: SerialState = {
    id: serialId!,
    part,
    outline: clipOutline({ ...outline, aired_heard_en: summary, aired_cliffhanger_en: cliffhanger }),
    cast: castRecord(cast),
  };
  return {
    id: crypto.randomUUID(),
    station: station.id,
    type: 'kahani',
    title,
    lines,
    summary: `Kahani part ${part} of 3: ${summary}`.slice(0, 200),
    serial,
  };
}

/** The Latin spellings of a native name (RELATIONS is English and may spell names in Latin). */
function latinSpellings(station: Station, native: string | undefined): string[] {
  if (!native) return [];
  return Object.entries(STORY_NAMES_NATIVE[station.id] ?? {})
    .filter(([, n]) => fold(n) === fold(native))
    .map(([latin]) => latin);
}

export async function buildKahani(sarvam: Sarvam, station: Station, req: SegmentRequest, timings: Timings, memory?: ShowMemory, judge?: FictionJudge): Promise<Segment> {
  const mode = kahaniMode(req);
  if (mode.kind === 'one_shot') return buildOneShot(sarvam, station, req, timings, memory, judge);
  return buildPart(sarvam, station, req, timings, mode.part, memory, mode.serial, judge);
}

// ---- Ads ----------------------------------------------------------------------------------------------------------

/** The station-ID sting in place of an ad that failed twice: better a jingle than a bad joke. */
function stingSegment(station: Station, subtitles: boolean): Segment {
  const line = toLine(station, 'station_id', station.stationIdText, 'ad_break');
  if (subtitles && station.stationIdEn && station.language !== 'en-IN') line.en = station.stationIdEn;
  return { id: crypto.randomUUID(), station: station.id, type: 'ad_break', title: station.nativeName, lines: [line], fallback: true };
}

/** One ad's format and problem, in season, steering clear of what this station aired lately (show memory). */
export async function planAd(station: Station, req: SegmentRequest, memory?: ShowMemory): Promise<AdPlan> {
  const records = memory ? await memory.recentAds(station.id).catch(() => []) : [];
  const pick = pickAd(station.id, {
    localDate: req.listener.localDate,
    region: req.listener.region,
    avoid: memory ? { formats: records.map((r) => r.format), problems: records.map((r) => r.category) } : undefined,
  });
  const airedTitles = new Set(records.map((r) => normalizeTitle(r.title)));
  return {
    ...pick,
    aired: records.slice(-8).map((r) => `${r.title}${r.summary ? `: ${r.summary}` : ''}`),
    airedTitles,
    puns: punChoices(station.id, pick.card.id, pick.problem.id, { avoid: airedTitles, normalize: normalizeTitle }),
  };
}

export async function buildAd(sarvam: Sarvam, station: Station, req: SegmentRequest, timings: Timings, memory?: ShowMemory, judge?: FictionJudge): Promise<Segment> {
  const subtitles = subtitlesOn(station, req.subtitles);
  const plan = await timings.measure('memory', () => planAd(station, req, memory));
  const pick = plan;
  const system = systemPreamble(station, ['ad_announcer', 'ad_customer'], req.listener);
  const fields = ['plan_punchline', 'plan_product', 'plan_brand_pun', 'plan_signature', 'title', 'lines', 'summary_en'];
  const check = (raw: ModelScript): CheckResult => {
    const result = adShape(station.id, raw.lines, { card: pick.card, brand: str(raw.title), punchline: str(raw.plan_punchline), month: pick.month, festive: Boolean(pick.festival) });
    if (plan.airedTitles?.has(normalizeTitle(str(raw.title)))) result.hard.push(`The brand "${str(raw.title)}" already aired: invent another.`);
    if (raw.lines.some((l) => /\{\s*(name|nickname)\s*\}/iu.test(l.text))) result.hard.push('No {name} in an ad.');
    return result;
  };
  const messages: ChatMessage[] = [
    { role: 'system', content: subtitles ? `${system}\n\n${subtitleRule('ad_break')}` : system },
    { role: 'user', content: adPrompt(station, req, plan) },
  ];
  let written: Written<ModelScript>;
  try {
    written = await writeChecked(sarvam, timings, {
      name: 'tarang_ad_break',
      messages,
      schema: adJsonSchema(subtitles),
      zod: scriptSchema(fields) as unknown as z.ZodType<ModelScript>,
      plan: SEGMENT_PLAN.ad_break,
      subtitles,
      check,
      // A line that reads a direction aloud (or copies an example) is dropped; the check then runs again
      repair: (raw, result) => {
        const kept = dropBlocked(raw.lines, result, AD_DROPS);
        return kept === raw.lines ? raw : { ...raw, lines: kept };
      },
      deadline: Date.now() + AD_BUDGET_MS,
      rescue: { user: adPrompt(station, req, plan, { short: true }), graceMs: RESCUE_GRACE_MS.ad, timeoutMs: RESCUE_TIMEOUT_MS.ad },
    });
  } catch {
    return stingSegment(station, subtitles);
  }
  const raw = await gate(written, judge, (r) => ({ type: 'ad_break', station: station.id, lines: judgeLines(r.lines), context: { ad: { format: pick.card.id, signature: pick.card.signature, ...(pick.card.tnc === 'none' ? {} : { tnc: pick.card.tnc }) } } }));
  if (!raw) return stingSegment(station, subtitles);
  const lines = toAir(station, 'ad_break', raw.lines.filter((l) => !leaksDirection(l.text)), ['ad_announcer', 'ad_customer'], subtitles);
  if (lines.length < 3) return stingSegment(station, subtitles);
  const title = cleanTitle(str(raw.title), station.nativeName, station);
  const summary = str(raw.summary_en).slice(0, 200) || undefined;
  memory?.rememberAd(station.id, { at: new Date().toISOString(), title, summary, category: pick.problem.id, format: pick.card.id });
  return { id: crypto.randomUUID(), station: station.id, type: 'ad_break', title, lines, ...(summary ? { summary } : {}) };
}

/** The kahani and ad_break paths of buildSegment. */
export async function buildFiction(
  sarvam: Sarvam,
  station: Station,
  req: SegmentRequest,
  timings: Timings,
  opts: { memory?: ShowMemory; judge?: FictionJudge } = {},
): Promise<Segment> {
  if (req.type === 'ad_break') return buildAd(sarvam, station, req, timings, opts.memory, opts.judge);
  return buildKahani(sarvam, station, req, timings, opts.memory, opts.judge);
}
