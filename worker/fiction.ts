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
import { castCharacters, castFromRecord, castRecord, castSerial, type SerialCast } from './casting';
import { adShape } from './checks/ad';
import { blockCount, endsWithQuestion, latinShare, leaksDirection, lineOverlap, serialShape, type CheckResult } from './checks/story';
import type { JudgeInput } from './judge/types';
import { normalizeTitle, type ShowMemory } from './memory';
import { pickAd } from './pools/ads';
import { maxTokensFor, SEGMENT_PLAN, subtitlesOn, systemPreamble, type LlmPlan } from './prompts';
import { adJsonSchema, adPrompt, type AdPlan } from './prompts/ad';
import { subtitleRule } from './prompts/common';
import {
  expectedLast,
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
  type SerialOutline,
  type StoryPlan,
} from './prompts/kahani';
import type { ChatMessage, Sarvam } from './sarvam';
import { applyGaps, fallbackSegment, limitNameTokens, toLine } from './segment';
import { isDelivery } from './show';
import { isSpooky, storyBrief } from './story';
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

/** Line counts: a part 12-16 (accept up to 18), a one-shot 16-18 (accept 14-20). Never truncated. */
const PART_LINES = { min: 12, max: 18 };
const ONE_SHOT_LINES = { min: 14, max: 20 };

/** How many recent stories' ingredients a new brief avoids, and how many recent ads' formats/problems. */
const AVOID_STORIES = 24;
const AIRED_LIST = 10;

const OUTLINE_VALUE_MAX = 600;

// ---- Model output (flat, lenient: limits are enforced here, not in the schema) -------------------------------

const ModelLine = z.object({
  role: z.string().max(24),
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

type ModelScript = { lines: z.infer<typeof ModelLine>[] } & Record<string, unknown>;
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
  /** Code's own repairs to an attempt (dropping lines that must never air, the safety net), checked again after */
  repair?: (raw: T, check: CheckResult) => T;
  deadline: number;
  /** The plan for the attempt after a failed call (e.g. reasoning off when reasoning used up the tokens) */
  afterError?: LlmPlan;
}

/** A draft as it would air: after code's repairs, with the problems it still has. */
export interface Draft<T> {
  raw: T;
  check: CheckResult;
}

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
async function writeChecked<T>(sarvam: Sarvam, timings: Timings, spec: WriteSpec<T>): Promise<Draft<T>> {
  let best: Draft<T> | undefined;
  let lastError: unknown;
  let note = '';
  let plan = spec.plan;
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = spec.deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) break;
    const messages = note
      ? spec.messages.map((m, i) => (i === spec.messages.length - 1 ? { ...m, content: `${m.content}\n\n${note}` } : m))
      : spec.messages;
    const now = plan;
    try {
      const raw = await timings.measure('llm', () =>
        sarvam.chatJson(messages, spec.schema, spec.zod, {
          name: spec.name,
          temperature: now.temperature,
          maxTokens: Math.min(MAX_TOKENS_CAP, maxTokensFor(now, spec.subtitles)),
          reasoningEffort: now.reasoningEffort,
          timeoutMs: Math.min(now.timeoutMs, remaining),
        }),
      );
      const check = spec.check(raw);
      const fixed = spec.repair ? spec.repair(raw, check) : raw;
      const draft: Draft<T> = { raw: fixed, check: fixed === raw ? check : spec.check(fixed) };
      if (!best || atLeastAsGood(draft.check, best.check)) best = draft;
      if (!check.hard.length) break;
      console.error(`[fiction] ${spec.name} attempt ${attempt + 1} sent back: ${check.hard.slice(0, 3).join(' | ')}`);
      note = producerNote(check);
    } catch (err) {
      lastError = err;
      if (spec.afterError) plan = spec.afterError;
      console.error(`[fiction] ${spec.name} attempt ${attempt + 1} failed: ${String(err)}`);
    }
  }
  if (!best) throw lastError ?? new Error(`${spec.name}: budget exhausted`);
  return best;
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
    clearTimeout(timer);
  }
}

const reviewLines = (lines: { role: string; text: string; delivery?: string }[]) => lines.map((l) => ({ role: l.role, text: l.text, ...(l.delivery ? { delivery: l.delivery } : {}) }));

// ---- Lines on air ----------------------------------------------------------------------------------------------

/** Cleans the model's lines (no truncation), casts each role's voice and paces the gaps. */
function toAir(
  station: Station,
  type: 'kahani' | 'ad_break',
  raw: z.infer<typeof ModelLine>[],
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

function castNames(outline: SerialOutline, cast: SerialCast): Partial<Record<string, string>> {
  return Object.fromEntries(castCharacters(cast).map((r) => [r, outline[`${r}_name_native`] ?? '']));
}

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
  // Names and spoken lines in the station script: an English line here would air in English
  for (const key of Object.keys(outline).filter((k) => k.endsWith('_native'))) {
    const v = outline[key];
    if (v && !/^none$/i.test(v) && latinShare(v) > 0.5) problems.push(`${key} is in English ("${v.slice(0, 40)}"): write it in the station language and script.`);
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
    const { raw } = await writeChecked(sarvam, timings, {
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
    const outline = tidy(raw);
    // The parts can be written from an outline with small flaws, never from one without names or endings
    const critical = outlineProblems(outline, plan.cast).filter((p) => /has no name|_last_line_native is|final_line_native is|payoff_native is|name_native is in English|is a question/.test(p));
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

function storyMessages(station: Station, req: SegmentRequest, cast: SerialCast, user: string, subtitles: boolean): ChatMessage[] {
  const system = systemPreamble(station, storyRoles(cast) as Role[], req.listener, cast);
  return [
    { role: 'system', content: subtitles ? `${system}\n\n${subtitleRule('kahani')}` : system },
    { role: 'user', content: user },
  ];
}

const clipOutline = (o: SerialOutline): SerialOutline =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k.slice(0, 40), String(v).slice(0, OUTLINE_VALUE_MAX)]));

async function buildOneShot(sarvam: Sarvam, station: Station, req: SegmentRequest, timings: Timings, memory?: ShowMemory): Promise<Segment> {
  const subtitles = subtitlesOn(station, req.subtitles);
  const plan = await timings.measure('memory', () => planStory(station, req, memory));
  const roles = storyRoles(plan.cast) as Role[];
  const characters = castCharacters(plan.cast);
  const fields = ['plan_story_en', 'char_a_name_native', 'char_b_name_native', 'char_kid_name_native', 'relations_en', 'plan_want', 'plan_clue', 'plan_twist', 'plan_payoff', 'last_line_native', 'last_line_role', 'title', 'lines', 'summary_en'];
  const check = (raw: ModelScript): CheckResult => {
    const names = Object.fromEntries(characters.map((r) => [r, str(raw[`${r}_name_native`])]));
    const result = serialShape(station, raw.lines, {
      part: 0,
      characters,
      names,
      defined: [raw.relations_en, ...Object.values(names)].map(str).join(' | '),
      expectedLast: undefined,
      min: ONE_SHOT_LINES.min,
      max: ONE_SHOT_LINES.max,
    });
    if (plan.airedTitles?.has(normalizeTitle(str(raw.title)))) result.hard.push(`The title "${str(raw.title)}" already aired: pick another.`);
    const last = str(raw.last_line_native);
    if (last && lineOverlap(raw.lines[raw.lines.length - 1]?.text ?? '', last) < 0.3) result.soft.push(`End on your planned last line: "${last}".`);
    return result;
  };
  let written: { raw: ModelScript; check: CheckResult };
  try {
    written = await writeChecked(sarvam, timings, {
      name: 'tarang_kahani_story',
      messages: storyMessages(station, req, plan.cast, oneShotPrompt(station, req, plan), subtitles),
      schema: oneShotJsonSchema(plan.cast, subtitles),
      zod: scriptSchema(fields) as unknown as z.ZodType<ModelScript>,
      plan: ONE_SHOT_PLAN,
      subtitles,
      check,
      deadline: Date.now() + STORY_BUDGET_MS,
    });
  } catch {
    return fallbackSegment(station, 'kahani', subtitles);
  }
  const { raw } = written;
  const net = withSafetyNet(raw.lines, { last: str(raw.last_line_native), lastRole: str(raw.last_line_role) }, (role, text, delivery) => ({ role, text, delivery }));
  const lines = toAir(station, 'kahani', net.lines, roles, subtitles, plan.cast);
  if (lines.length < 6) return fallbackSegment(station, 'kahani', subtitles);
  const title = cleanTitle(str(raw.title), station.nativeName, station);
  const summary = `Kahani "${title}": ${str(raw.summary_en)}`.slice(0, 200);
  const segment: Segment = { id: crypto.randomUUID(), station: station.id, type: 'kahani', title, lines, summary };
  memory?.rememberStory(station.id, {
    at: new Date().toISOString(),
    title,
    summary: str(raw.summary_en).slice(0, 200),
    setting: plan.brief.setting,
    hook: plan.brief.hook,
    twist: plan.brief.twist,
    opening: plan.brief.opening.id,
  });
  return segment;
}

async function buildPart(
  sarvam: Sarvam,
  station: Station,
  req: SegmentRequest,
  timings: Timings,
  part: 1 | 2 | 3,
  memory?: ShowMemory,
  given?: SerialState,
): Promise<Segment> {
  const subtitles = subtitlesOn(station, req.subtitles);
  let outline: SerialOutline | undefined = given?.outline;
  let cast = castFromRecord(station, given?.cast);
  let serialId = given?.id;
  if (!outline) {
    const plan = await timings.measure('memory', () => planStory(station, req, memory));
    outline = await timings.measure('outline', () => writeOutline(sarvam, station, req, plan, timings));
    // No usable outline: a complete story instead of a serial that can't continue
    if (!outline) return buildOneShot(sarvam, station, req, timings, memory);
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
  const end = expectedLast(outline, part);
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
    });
  let written: { raw: ModelScript; check: CheckResult };
  try {
    written = await writeChecked(sarvam, timings, {
      name: `tarang_kahani_part${part}`,
      messages: storyMessages(station, req, cast, partPrompt(station, outline, cast, part, recap), subtitles),
      schema: partJsonSchema(cast, subtitles),
      zod: scriptSchema(['plan_scene', 'plan_names', 'plan_turn', 'lines', 'summary_en', 'cliffhanger_en']) as unknown as z.ZodType<ModelScript>,
      plan: SEGMENT_PLAN.kahani,
      subtitles,
      check,
      deadline: Date.now() + STORY_BUDGET_MS,
    });
  } catch {
    return fallbackSegment(station, 'kahani', subtitles);
  }
  const { raw } = written;
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
    title: partTitle(station.id, cleanTitle(outline.title_native, station.nativeName, station), part),
    lines,
    summary: `Kahani part ${part} of 3: ${summary}`.slice(0, 200),
    serial,
  };
}

export async function buildKahani(sarvam: Sarvam, station: Station, req: SegmentRequest, timings: Timings, memory?: ShowMemory): Promise<Segment> {
  const mode = kahaniMode(req);
  if (mode.kind === 'one_shot') return buildOneShot(sarvam, station, req, timings, memory);
  return buildPart(sarvam, station, req, timings, mode.part, memory, mode.serial);
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
  return {
    ...pick,
    aired: records.slice(-8).map((r) => `${r.title}${r.summary ? `: ${r.summary}` : ''}`),
    airedTitles: new Set(records.map((r) => normalizeTitle(r.title))),
  };
}

export async function buildAd(sarvam: Sarvam, station: Station, req: SegmentRequest, timings: Timings, memory?: ShowMemory): Promise<Segment> {
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
  let written: { raw: ModelScript; check: CheckResult };
  try {
    written = await writeChecked(sarvam, timings, {
      name: 'tarang_ad_break',
      messages: [
        { role: 'system', content: subtitles ? `${system}\n\n${subtitleRule('ad_break')}` : system },
        { role: 'user', content: adPrompt(station, req, plan) },
      ],
      schema: adJsonSchema(subtitles),
      zod: scriptSchema(fields) as unknown as z.ZodType<ModelScript>,
      plan: SEGMENT_PLAN.ad_break,
      subtitles,
      check,
      deadline: Date.now() + AD_BUDGET_MS,
    });
  } catch {
    return stingSegment(station, subtitles);
  }
  const { raw } = written;
  // A line that still reads a direction aloud after the rewrite is dropped; too little left means no ad
  const kept = raw.lines.filter((l) => !leaksDirection(l.text));
  const lines = toAir(station, 'ad_break', kept, ['ad_announcer', 'ad_customer'], subtitles);
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
  opts: { memory?: ShowMemory } = {},
): Promise<Segment> {
  if (req.type === 'ad_break') return buildAd(sarvam, station, req, timings, opts.memory);
  return buildKahani(sarvam, station, req, timings, opts.memory);
}
