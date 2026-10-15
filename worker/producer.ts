/**
 * The producer check (bible §5): free checks first, then one calibrated scoring call.
 *
 *   const review = await reviewScript({ type, mode, lines, context, plan, station }, { backend: producerBackend(env) });
 *   if (!review.pass) rewrite with rewriteNote(review, lines) appended to the writer's user message.
 *
 * - A hard free-check failure fails the script without a model call.
 * - Lines the free checks may cut (`dropLines`: an invented news line, a catchphrase that was not allowed) are cut
 *   before the judge hears the script; line numbers in the review always refer to the original lines.
 * - The judge is time-boxed (3 s by default) and failure-tolerant: an error or a timeout passes the script on
 *   the free checks alone (`judged: false`).
 * - `heardSummaryEn` is what actually aired: it replaces the writer's summary in the show log and the recap.
 */
import type { StationId } from '../shared/types';
import { freeChecks, type FreeContext, type FreeResult } from './checks/free';
import { runJudge, sarvamBackend, workersAiBackend, DEFAULT_JUDGE_MODEL, type AiRunner, type JudgeBackend } from './judge/backends';
import { applicableDims, meanScore } from './judge/rubric';
import type { Dim, JudgeInput, JudgeVerdict, ReviewContext, ReviewLine, ReviewPlan, ReviewType, Scores } from './judge/types';

export type { ReviewContext, ReviewLine, ReviewPlan, ReviewType } from './judge/types';

export interface Thresholds {
  /** Every applicable score must be at least this (bible: none ≤ 2) */
  minEach: number;
  /** Mean of the applicable scores */
  minMean: number;
  /** point_landed */
  minPoint: number;
  /** fidelity for news and for RJ links that hand over */
  fidelityFactual: number;
  /** fidelity for ads and stories */
  fidelityOther: number;
  /** story_resolved on a final part, cliffhanger on parts 1-2 */
  minEnding: number;
}

/**
 * Bible §5.3, confirmed on the 2026-10-15 calibration set (scripts/calibrate-judge.mjs, rubric producer-v5.2):
 * with the default judge (Gemma 4) these thresholds pass all 8 good scripts and fail all 9 old ones and all 6
 * subtly broken variants. Looser grids also scored 0 errors there; the bible's stricter bar is kept.
 */
export const DEFAULT_THRESHOLDS: Thresholds = {
  minEach: 3,
  minMean: 3.6,
  minPoint: 4,
  fidelityFactual: 5,
  fidelityOther: 4,
  minEnding: 4,
};

/** The judge's time box: the scorer is skipped (free checks only) past this. */
export const JUDGE_TIME_BOX_MS = 3000;
/**
 * A longer box for a segment written well ahead of air (a Kahani part prefetched 60 s or more early): the default
 * judge's p90 was 6.5 s on the calibration set, so 8 s lets it finish nearly every time.
 */
export const PREFETCH_TIME_BOX_MS = 8000;

export interface ReviewRequest {
  type: ReviewType;
  mode?: string;
  part?: 1 | 2 | 3;
  oneShot?: boolean;
  lines: ReviewLine[];
  context: ReviewContext;
  /** The writer's plan fields: used by the free checks only (brand, punchline), never shown to the judge */
  plan?: ReviewPlan;
  station: StationId | { id: StationId; frequency?: string; name?: string };
}

export interface ProducerConfig {
  /** null or undefined: free checks only */
  backend?: JudgeBackend | null;
  thresholds?: Partial<Thresholds>;
  /** The judge's time box (default JUDGE_TIME_BOX_MS) */
  timeoutMs?: number;
}

export interface Review {
  pass: boolean;
  /** 1-5 per dimension; null where it doesn't apply or the judge didn't run */
  scores: Scores;
  mean: number | null;
  /** What actually aired, for the show log and the next recap */
  heardSummaryEn: string;
  /** Real-world claims not in the context ("L5: ..."), from the free checks and the judge */
  invented: string[];
  /** Problems the judge heard ("L3: ..."), listed before it scored */
  faults: string[];
  /** 1-based, in the original lines */
  worstLine: number | null;
  /** One sentence the writer must act on */
  fixNote: string;
  hardFailures: string[];
  softNotes: string[];
  /** Why the scores failed the thresholds */
  scoreFailures: string[];
  /** 0-based lines the caller should cut before airing (the judge heard the script without them) */
  dropLines: number[];
  /** True when the judge's verdict was used */
  judged: boolean;
  judgeError?: string;
  backend?: string;
  ms: number;
}

const EMPTY_SCORES = (): Scores => ({ hook: null, coherence: null, point_landed: null, specificity: null, fidelity: null, story_resolved: null, cliffhanger: null });

function stationId(s: ReviewRequest['station']): StationId {
  return typeof s === 'string' ? s : s.id;
}

function onAirName(s: ReviewRequest['station']): string | undefined {
  if (typeof s === 'string') return undefined;
  return s.frequency ? `Tarang FM ${s.frequency}` : s.name;
}

/** The free checks' view of the review context. */
export function freeContextOf(req: Pick<ReviewRequest, 'context' | 'station' | 'mode' | 'part' | 'oneShot' | 'plan' | 'type'>): FreeContext {
  const c = req.context;
  const blocks = (c.blocks ?? []).map((b) => b.text).join('\n');
  const slate = (c.slate ?? []).map((h) => `${h.title} ${h.detail ?? ''} ${h.source ?? ''}`).join('\n');
  const outline = c.outline ? Object.values(c.outline).join('\n') : '';
  return {
    station: stationId(req.station),
    mode: req.mode,
    part: req.part,
    oneShot: req.oneShot,
    payloadType: c.payloadType,
    factText: [blocks, slate, outline, c.recap?.heard].filter(Boolean).join('\n'),
    keptTokens: c.keptTokens,
    showLog: c.showLog,
    nextAllowed: c.next?.allowed,
    nextType: c.next?.type,
    calls: c.calls,
    items: req.type === 'news' && c.slate?.length ? c.slate.length : undefined,
    frame: c.frame,
    timePhrase: c.timePhrase,
    catchphrase: c.catchphrase,
    listenerName: c.listenerName,
    knownPlaces: c.knownPlaces,
    airedLines: c.airedLines,
    extraFragments: c.extraFragments,
    names: c.names,
    relations: c.relations ?? c.outline?.relations_en,
    expectedLastLine: c.expectedLastLine,
    brand: req.plan?.title,
    punchline: req.plan?.plan_punchline,
    tnc: c.ad?.tnc,
  };
}

/** Handover links carry real facts about what comes next: they need full fidelity. */
function factual(req: Pick<ReviewRequest, 'type' | 'mode'>): boolean {
  return req.type === 'news' || (req.type === 'rj_link' && req.mode !== 'kahani_in');
}

/** Which thresholds the scores miss (empty: pass). */
export function scoreFailures(req: Pick<ReviewRequest, 'type' | 'mode' | 'part' | 'oneShot'>, v: Pick<JudgeVerdict, 'scores' | 'invented'>, t: Thresholds = DEFAULT_THRESHOLDS): string[] {
  const dims = applicableDims(req);
  const out: string[] = [];
  const s = v.scores;
  for (const d of dims) if (s[d] != null && s[d]! < t.minEach) out.push(`${d} ${s[d]} < ${t.minEach}`);
  const mean = meanScore(s, dims);
  if (mean != null && mean < t.minMean) out.push(`mean ${mean.toFixed(2)} < ${t.minMean}`);
  if (s.point_landed != null && s.point_landed < t.minPoint) out.push(`point_landed ${s.point_landed} < ${t.minPoint}`);
  const fid = factual(req) ? t.fidelityFactual : t.fidelityOther;
  if (s.fidelity != null && s.fidelity < fid) out.push(`fidelity ${s.fidelity} < ${fid}`);
  const ending: Dim | undefined = dims.includes('story_resolved') ? 'story_resolved' : dims.includes('cliffhanger') ? 'cliffhanger' : undefined;
  if (ending && s[ending] != null && s[ending]! < t.minEnding) out.push(`${ending} ${s[ending]} < ${t.minEnding}`);
  if (factual(req) && v.invented.length) out.push(`invented: ${v.invented.length}`);
  return [...new Set(out)];
}

/** What aired, when the judge didn't say: the writer's summary, else the first and last line. */
function fallbackHeard(req: ReviewRequest, lines: ReviewLine[]): string {
  if (req.plan?.summary_en) return req.plan.summary_en;
  const first = lines[0]?.en ?? lines[0]?.text ?? '';
  const last = lines.length > 1 ? (lines[lines.length - 1]?.en ?? lines[lines.length - 1]?.text ?? '') : '';
  return `${first}${last ? ` … ${last}` : ''}`.slice(0, 240);
}

function firstLineOf(messages: string[]): number | null {
  for (const m of messages) {
    const hit = m.match(/^Lines? (\d+)/);
    if (hit) return Number(hit[1]);
  }
  return null;
}

function inventedFromFree(free: FreeResult): string[] {
  return [...free.hard, ...free.soft].filter((m) => /not in the context|which no item gives|which no item says|which you were not given/.test(m));
}

/** Maps the judge's line numbers (in the kept lines) back to the original lines: "L3: x" → "L4: x". */
function remapRefs(text: string, kept: number[]): string {
  return text.replace(/\b(L|Line |Lines? )(\d+)\b/g, (m, p: string, n: string) => {
    const orig = kept[Number(n) - 1];
    return orig == null ? m : `${p}${orig + 1}`;
  });
}

/**
 * Reviews one script. Never throws: a judge failure passes on the free checks alone. The judge sees the lines
 * (without the ones the free checks cut) and the context, never the plan.
 */
export async function reviewScript(req: ReviewRequest, config: ProducerConfig = {}): Promise<Review> {
  const t0 = Date.now();
  const thresholds = { ...DEFAULT_THRESHOLDS, ...config.thresholds };
  const free = freeChecks(req.type, req.lines, freeContextOf(req));
  const dropLines = free.dropLines ?? [];
  const kept = req.lines.map((_, i) => i).filter((i) => !dropLines.includes(i));
  const heardLines = kept.map((i) => req.lines[i]);
  const base: Review = {
    pass: free.pass,
    scores: EMPTY_SCORES(),
    mean: null,
    heardSummaryEn: fallbackHeard(req, heardLines),
    invented: inventedFromFree(free),
    faults: [],
    worstLine: firstLineOf(free.hard),
    fixNote: free.hard[0] ?? '',
    hardFailures: free.hard,
    softNotes: free.soft,
    scoreFailures: [],
    dropLines,
    judged: false,
    ms: 0,
  };
  // A hard failure goes back without a model call
  if (!free.pass || !config.backend || !heardLines.length) return { ...base, ms: Date.now() - t0 };

  const input: JudgeInput = {
    type: req.type,
    mode: req.mode,
    part: req.part,
    oneShot: req.oneShot,
    station: stationId(req.station),
    onAir: onAirName(req.station),
    lines: heardLines,
    context: req.context,
  };
  const result = await runJudge(config.backend, input, { timeoutMs: config.timeoutMs ?? JUDGE_TIME_BOX_MS });
  if (!result.verdict) {
    console.warn(`[producer] judge ${config.backend.id} skipped: ${result.error ?? 'no verdict'} (${result.ms} ms)`);
    return { ...base, judgeError: result.error ?? 'no verdict', backend: config.backend.id, ms: Date.now() - t0 };
  }
  const v = result.verdict;
  const judgeInvented = v.invented.map((c) => remapRefs(c, kept));
  const failures = scoreFailures(req, { scores: v.scores, invented: judgeInvented }, thresholds);
  const worst = v.worstLine != null ? (kept[v.worstLine - 1] ?? v.worstLine - 1) + 1 : base.worstLine;
  return {
    ...base,
    pass: failures.length === 0,
    scores: v.scores,
    mean: meanScore(v.scores, applicableDims(req)),
    heardSummaryEn: v.heardSummaryEn || base.heardSummaryEn,
    invented: [...new Set([...base.invented, ...judgeInvented])],
    faults: v.faults.map((f) => remapRefs(f, kept)),
    worstLine: worst,
    fixNote: v.fix ? remapRefs(v.fix, kept) : base.fixNote,
    scoreFailures: failures,
    judged: true,
    backend: config.backend.id,
    ms: Date.now() - t0,
  };
}

/**
 * The PRODUCER NOTE for one rewrite (prompt pack §8.4): the worst line quoted, the fix, the free-check problems,
 * the faults the judge heard and the invented claims. Appended to the writer's user message; the rewrite runs at
 * the same temperature.
 */
export function rewriteNote(
  review: Pick<Review, 'worstLine' | 'fixNote' | 'hardFailures' | 'softNotes' | 'invented' | 'scoreFailures'> & Partial<Pick<Review, 'faults'>>,
  lines: ReviewLine[],
): string {
  const out = ['PRODUCER NOTE (the last draft was sent back; fix this and keep what worked):'];
  const wl = review.worstLine;
  if (wl && lines[wl - 1]) out.push(`- Line ${wl}: "${lines[wl - 1].text}"`);
  if (review.fixNote) out.push(`- ${review.fixNote}`);
  for (const h of review.hardFailures) if (h !== review.fixNote) out.push(`- ${h}`);
  for (const f of (review.faults ?? []).slice(0, 3)) out.push(`- ${f.replace(/^L(\d+)\s*[:：-]\s*/, 'Line $1: ')}`);
  const said = out.join('\n');
  for (const claim of review.invented) {
    const text = claim.replace(/^L(\d+)\s*[:：-]\s*/, 'Line $1: ');
    if (!said.includes(text)) out.push(`- Invented: ${text}. It is not in the context; cut it.`);
  }
  for (const s of review.softNotes.slice(0, 4)) out.push(`- ${s}`);
  return [...new Set(out)].join('\n');
}

/** Which of two attempts to keep (bible §5.3): passing first, then fewer hard failures, then fidelity, then the mean. */
export function betterReview(a: Review, b: Review): 'a' | 'b' {
  if (a.pass !== b.pass) return a.pass ? 'a' : 'b';
  if (a.hardFailures.length !== b.hardFailures.length) return a.hardFailures.length < b.hardFailures.length ? 'a' : 'b';
  const fa = a.scores.fidelity ?? 0;
  const fb = b.scores.fidelity ?? 0;
  if (fa !== fb) return fa > fb ? 'a' : 'b';
  return (a.mean ?? 0) >= (b.mean ?? 0) ? 'a' : 'b';
}

export interface ProducerEnv {
  AI?: AiRunner | unknown;
  SARVAM_API_KEY?: string;
  /** "workers-ai" (the default when the AI binding exists), "sarvam", or "off" */
  PRODUCER_JUDGE?: string;
  /** Workers AI model override */
  PRODUCER_MODEL?: string;
}

/**
 * The configured judge backend. Workers AI Gemma 4 by default (free on the Cloudflare credits and the most accurate
 * on the calibration set), Sarvam-105B when asked or when there is no AI binding. Gemma 4's p50 is 5.5 s, so under
 * the 3 s box it mostly falls back to the free checks; Sarvam answers inside 3 s about two times in three but
 * sends back about one good script in four. Pass PREFETCH_TIME_BOX_MS for segments written well ahead.
 */
export function producerBackend(env: ProducerEnv): JudgeBackend | null {
  const choice = (env.PRODUCER_JUDGE ?? '').toLowerCase();
  if (choice === 'off') return null;
  const ai = env.AI as AiRunner | undefined;
  const hasAi = Boolean(ai && typeof ai.run === 'function');
  if (choice === 'sarvam' && env.SARVAM_API_KEY) return sarvamBackend(env.SARVAM_API_KEY);
  if (hasAi) return workersAiBackend(ai!, env.PRODUCER_MODEL || DEFAULT_JUDGE_MODEL);
  if (env.SARVAM_API_KEY) return sarvamBackend(env.SARVAM_API_KEY);
  return null;
}
