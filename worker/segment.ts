/** Builds programme segments: model script (with English subtitles when asked) → clean lines → cast voices. */
import { z } from 'zod';
import { PAUSE_AFTER_MS } from '../shared/constants';
import { LlmSegmentSchema, type Dedication, type SegmentRequest } from '../shared/schemas';
import type { Delivery, Line, Mood, Role, Segment, SegmentType, Source, Station, TtsLanguage, Voice } from '../shared/types';
import { randomFiller, SOMEONE_EN, someoneFor, studioCallLine, studioCallLineEn } from './fallbacks';
import { callerPlaceholder, MAX_LINES, NEWS_HEADLINES, newsFrameText, rjOnAir, maxTokensFor, subtitlesOn, type SegmentPlans, type StoryPlan, SEGMENT_PLAN, SEGMENT_ROLES, segmentJsonSchema, segmentMessages, type LlmSegmentType } from './prompts';
import type { Sarvam } from './sarvam';
import { gapAfter, isDelivery, rjBibleFor, timePhrase, voiceFor } from './show';
import { normalizeTitle, type ShowMemory } from './memory';
import { buildFiction } from './fiction';
import { modelSubtitle } from './subtitle';
import { cleanText, processLines, type RawLine } from './text';
import type { Timings } from './timing';
import { copiesExample, validateScript } from './validate';
import { newsFidelity } from './checks/news';
import { rjLinkChecks } from './checks/rj';
import { planRjLink, type EdgeGeo, type RjLinkPlan } from './linkPlan';
import { rjCheckContext, rjLinkJsonSchema, rjLinkMessages, templateLinkLines } from './prompts/rj';

/** Total budget for one segment request, including the retry. */
const SEGMENT_BUDGET_MS = 19_000;
const MIN_ATTEMPT_MS = 4000;

const MIN_LINES: Record<LlmSegmentType, number> = { rj_link: 2, news: 3, ad_break: 3, kahani: 8 };

/** Accepts slightly oversized model output and leaves the trimming to post-processing. */
const LenientSegmentSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object') return value;
  const v = value as { title?: unknown; lines?: unknown; summary_en?: unknown; mood?: unknown };
  return {
    title: typeof v.title === 'string' ? v.title.slice(0, 120) : v.title,
    summary_en: typeof v.summary_en === 'string' ? v.summary_en.slice(0, 400) : undefined,
    mood: typeof v.mood === 'string' ? v.mood.slice(0, 10) : undefined,
    lines: Array.isArray(v.lines)
      ? v.lines.slice(0, 16).map((l: unknown) => {
          const line = l as { role?: unknown; text?: unknown; en?: unknown };
          if (typeof line?.text !== 'string') return l;
          const { en, ...rest } = line;
          return { ...rest, text: line.text.slice(0, 600), ...(typeof en === 'string' ? { en: en.slice(0, 600) } : {}) };
        })
      : v.lines,
  };
}, LlmSegmentSchema);

/** One spoken line: the role's voice (or the daypart RJ), shaped by its delivery. */
export function toLine(
  station: Station,
  role: Role,
  text: string,
  type: SegmentType,
  opts: { delivery?: Delivery; voice?: Voice } = {},
): Line {
  const voice = opts.voice ?? station.cast[role];
  const delivery = opts.delivery ?? 'normal';
  const params = voiceFor(voice, delivery);
  return {
    role,
    speaker: voice.speaker,
    text,
    delivery,
    pace: params.pace,
    temperature: params.temperature,
    loudness: params.loudness,
    pitch: params.pitch,
    pauseAfterMs: PAUSE_AFTER_MS[type],
  };
}

/** Applies the pack's gap rules once the whole script is known; `continues[i]` marks a line split from line i. */
export function applyGaps(lines: Line[], type: SegmentType, random = Math.random, continues: boolean[] = []): Line[] {
  return lines.map((line, i) => ({
    ...line,
    pauseAfterMs: gapAfter(type, line.delivery ?? 'normal', Boolean(continues[i + 1]) && lines[i + 1]?.speaker === line.speaker, random),
  }));
}

const KICKER = /(आखिर में|आख़िर में)[^।]*अच्छी ख़?बर/u;

/**
 * Drops a kicker intro ("…एक अच्छी खबर।") that is not followed by a story before the sign-off. A line that carries
 * the story after its cue ("और आख़िर में, एक अच्छी खबर: इसरो ने…") is the kicker itself and stays.
 */
export function dropOrphanKicker<T extends { text: string }>(lines: T[]): T[] {
  return lines.filter((line, i) => {
    const m = KICKER.exec(line.text);
    if (!m || i < lines.length - 2) return true;
    return line.text.slice(m.index + m[0].length).replace(/[\s:,।.!–-]+/gu, '').length >= 12;
  });
}

const nameCache = new Map<string, string>();

/** The listener's name in the station script (Sarvam Transliterate), cached; the Latin spelling on failure. */
export async function nativeListenerName(sarvam: Sarvam, name: string | undefined, language: TtsLanguage): Promise<string | undefined> {
  const who = name?.trim();
  if (!who || language === 'en-IN' || !/^[\p{Script=Latin}\s.'-]+$/u.test(who)) return who;
  const key = `${language}:${who.toLowerCase()}`;
  const hit = nameCache.get(key);
  if (hit) return hit;
  try {
    // A bare name loses its final vowel ("Priya" → "प्रिय", "Rahul" → "राहु"); inside a sentence it comes out right.
    const words = who.split(/\s+/).length;
    const tail = (await sarvam.transliterate(`My name is ${who}`, 'en-IN', language)).split(/\s+/).slice(-words);
    const out = tail.length === words && tail.every(Boolean) ? tail.join(' ') : await sarvam.transliterate(who, 'en-IN', language);
    if (nameCache.size < 500) nameCache.set(key, out);
    return out;
  } catch {
    return who;
  }
}

function cleanTitle(raw: string, fallback: string, language: TtsLanguage): string {
  const title = cleanText(raw, language).replace(/[।.]+$/u, '').trim();
  return (title || fallback).slice(0, 80);
}

/** A template filler in place of a failed segment; with subtitles, its hand-written English. */
export function fallbackSegment(station: Station, type: SegmentType, subtitles = false): Segment {
  const filler = randomFiller(station.id);
  const line = toLine(station, 'rj', filler.text, type);
  if (subtitles && filler.en) line.en = filler.en;
  return {
    id: crypto.randomUUID(),
    station: station.id,
    type,
    title: station.nativeName,
    lines: [line],
    fallback: true,
  };
}

/**
 * The RJ link's last resort (bible §5.3): the honest handover plus a station-ID line, no payload. The rotation
 * state stays as it was, so the payload goes back in the rotation.
 */
function templateLink(station: Station, link: RjLinkPlan, subtitles: boolean): Segment {
  const texts = templateLinkLines(station, link);
  if (!texts.length) return fallbackSegment(station, 'rj_link', subtitles);
  return {
    id: crypto.randomUUID(),
    station: station.id,
    type: 'rj_link',
    title: station.nativeName,
    lines: applyGaps(
      texts.map((t) => ({ ...toLine(station, 'rj', t.text, 'rj_link', { delivery: 'warm' }), ...(subtitles ? { en: t.en } : {}) })),
      'rj_link',
    ),
    fallback: true,
  };
}

/** Replaces the {name} placeholder with the listener's name as typed (or drops it). */
export function fillName(text: string, name?: string): string {
  const who = name?.trim() || '';
  const isWordChar = (c: string) => /[\p{L}\p{M}\p{N}]/u.test(c);
  return text
    .replace(/(\S?)\{\s*name\s*\}(\S?)/giu, (_match, before: string, after: string) => {
      if (!who) return `${before}${after}`;
      // The model sometimes glues the placeholder to a neighbouring word ("இதோ{name}").
      const pre = before && isWordChar(before) ? `${before} ` : before;
      const post = after && isWordChar(after) ? ` ${after}` : after;
      return `${pre}${who}${post}`;
    })
    .replace(/\s+([,!?।])/gu, '$1');
}

const NAME_TOKEN = /\{\s*(name|nickname)\s*\}/giu;
const KEPT = '\u0000KEEP\u0000';

/** How many {name}/{nickname} placeholders the texts hold. */
export function countNameTokens(texts: string[]): number {
  return texts.reduce((n, t) => n + (t.match(NAME_TOKEN)?.length ?? 0), 0);
}

/**
 * Real RJs use a listener's name sparingly: keeps the first `allowed` name placeholders across the texts and
 * removes the rest (with the same tidy-up as an unknown name), so a script can never say it twice.
 */
export function limitNameTokens(texts: string[], allowed: number): string[] {
  let kept = 0;
  return texts.map((text) => {
    const marked = text.replace(NAME_TOKEN, (token) => (kept++ < allowed ? `${KEPT}${token.replace(/[{}\s]/g, '')}${KEPT}` : '{name}'));
    return fillName(marked, undefined)
      .replace(new RegExp(`${KEPT}(name|nickname)${KEPT}`, 'g'), '{$1}')
      .replace(/^[\s,]+/u, '')
      .replace(/\s{2,}/gu, ' ')
      .trim();
  });
}

/**
 * Plans for the segment being written. The Kahani and the ad break are planned, written and remembered in
 * ./fiction (buildSegment hands them over before this runs); the RJ link and the news need no plan.
 */
export async function planSegment(_station: Station, _type: SegmentType, _req: SegmentRequest, _memory?: ShowMemory): Promise<SegmentPlans> {
  return {};
}

/** Keeps the opening lines and the closing line (tease, tagline or sign-off) when the model overruns. */
export function capLines<T>(lines: T[], max: number): T[] {
  if (lines.length <= max || max < 2) return lines;
  return [...lines.slice(0, max - 1), lines[lines.length - 1]];
}

interface Script {
  title: string;
  lines: RawLine[];
  summary?: string;
  mood?: Mood;
  /** Ids of the studio calls the script reads on air */
  dedicated?: string[];
}

/** A studio caller's name and city in the station's script (best-effort transliteration). */
interface Caller {
  name?: string;
  city?: string;
}

export async function nativeCallers(sarvam: Sarvam, calls: Dedication[], language: TtsLanguage): Promise<Caller[]> {
  return Promise.all(
    calls.map(async (c) => {
      const [name, city] = await Promise.all([nativeListenerName(sarvam, c.name, language), nativeListenerName(sarvam, c.city, language)]);
      return { name, city };
    }),
  );
}

const CALLER_SLOT = /\{\s*caller\s*(\d)\s*\}/giu;

/** Numbers (1-based) of the studio calls whose placeholder appears in the script. */
export function callersRead(lines: { text: string }[]): Set<number> {
  const read = new Set<number>();
  for (const line of lines) for (const m of line.text.matchAll(CALLER_SLOT)) read.add(Number(m[1]));
  return read;
}

/**
 * Makes sure every studio call is on air: a call the script left out gets the station's fixed studio-call line,
 * placed before the closing tease. Then each {callerN} placeholder becomes the caller's name: in the station
 * script in the line, and as the caller gave it in the English subtitle.
 */
export function withStudioCalls<T extends RawLine>(station: Station, lines: T[], calls: Dedication[], callers: Caller[], subtitles = false): RawLine[] {
  if (!calls.length) return lines;
  const read = callersRead(lines);
  const missing: RawLine[] = calls.flatMap((call, i) =>
    read.has(i + 1)
      ? []
      : [
          {
            role: 'rj' as Role,
            text: studioCallLine(station.id, callerPlaceholder(i + 1), callers[i]?.city, call.message),
            delivery: 'warm',
            ...(subtitles ? { en: studioCallLineEn(callerPlaceholder(i + 1), call.city, call.message) } : {}),
          },
        ],
  );
  const all: RawLine[] = missing.length && lines.length > 1 ? [...lines.slice(0, -1), ...missing, lines[lines.length - 1]] : [...lines, ...missing];
  const someone = someoneFor(station.id);
  return all.map((l) => ({
    ...l,
    text: l.text.replace(CALLER_SLOT, (_m, n: string) => callers[Number(n) - 1]?.name || someone),
    ...(l.en ? { en: l.en.replace(CALLER_SLOT, (_m, n: string) => calls[Number(n) - 1]?.name?.trim() || SOMEONE_EN) } : {}),
  }));
}

async function writeScript(
  sarvam: Sarvam,
  station: Station,
  type: LlmSegmentType,
  req: SegmentRequest,
  headlines: Source[],
  timings: Timings,
  listenerName: string | undefined,
  plans: SegmentPlans = {},
  link?: RjLinkPlan,
): Promise<Script> {
  const deadline = Date.now() + SEGMENT_BUDGET_MS;
  const plan = SEGMENT_PLAN[type];
  const roles = SEGMENT_ROLES[type];
  const subtitles = subtitlesOn(station, req.subtitles);
  const schema = link ? rjLinkJsonSchema(subtitles) : segmentJsonSchema(type, subtitles);
  // News may draw on each item's title, detail and publisher, and nothing else
  const headlinesText = headlines.map((h) => [h.title, h.detail, h.source].filter(Boolean).join(' ')).join(' ');
  const newsFrame = type === 'news' ? newsFrameText(station, req) : '';
  const time = timePhrase(station, req.listener);
  const greet = type === 'rj_link' && (link ? link.payload.greet : Boolean(req.producer?.greetListener || req.producer?.firstLink || !req.showLog?.some((e) => e.type === 'rj_link')));
  // The RJ link's own checks: what it was given, what the handover may say, the payload it must deliver
  const rjCtx = link ? rjCheckContext(station, req, link) : undefined;
  let note: string | undefined;
  const calls = type === 'rj_link' ? (req.dedications ?? []) : [];
  const callers = calls.length ? await timings.measure('name', () => nativeCallers(sarvam, calls, station.language)) : [];
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) break;
    try {
      const raw = await timings.measure('llm', () =>
        sarvam.chatJson(link ? rjLinkMessages(station, req, link, note) : segmentMessages(station, type, req, headlines, plans), schema, LenientSegmentSchema, {
          name: `tarang_${type}`,
          // The pack's retry: one more try at a slightly lower temperature.
          // (the RJ link rewrites at the same temperature, with a producer note instead)
          temperature: Math.max(0.1, plan.temperature - (link ? 0 : attempt * 0.1)),
          // (the RJ link's plan fields need room; a cut-off draft is wasted)
          maxTokens: maxTokensFor(link ? { ...plan, maxTokens: Math.max(plan.maxTokens, 2000) } : plan, subtitles),
          reasoningEffort: plan.reasoningEffort,
          timeoutMs: Math.min(plan.timeoutMs + attempt * 3000, remaining),
        }),
      );
      const problems = validateScript(station, type, raw.lines, { greet, listenerName: req.listener.name, headlinesText, timePhrase: type === 'news' ? newsFrame : time });
      // A bulletin that would lose 3+ lines to the fidelity check is rewritten once
      const fidelity = type === 'news' ? newsFidelity(raw.lines, headlinesText, newsFrame) : undefined;
      if (fidelity && fidelity.dropped.length >= 3) problems.push(`news fidelity: ${fidelity.dropped.map((d) => d.reason).join(', ')}`);
      // The name belongs only in an RJ greeting, once.
      const namesAllowed = type === 'rj_link' && greet && req.listener.name ? 1 : 0;
      const names = countNameTokens(raw.lines.map((l) => l.text));
      if (names > namesAllowed) problems.push(`listener name used ${names}× (allowed ${namesAllowed})`);
      // A story or ad whose title already aired on this station is rewritten
      const airedTitles = type === 'kahani' ? plans.story?.airedTitles : type === 'ad_break' ? plans.ad?.airedTitles : undefined;
      if (airedTitles?.has(normalizeTitle(raw.title))) problems.push(`title already aired: ${raw.title}`);
      const read = callersRead(raw.lines);
      calls.forEach((_c, i) => {
        if (!read.has(i + 1)) problems.push(`studio call ${i + 1} not read (no ${callerPlaceholder(i + 1)})`);
      });
      const rjCheck = rjCtx ? rjLinkChecks(raw.lines, rjCtx) : undefined;
      if (rjCheck) problems.push(...rjCheck.hard);
      if (problems.length && attempt === 0) {
        if (rjCheck) note = [...problems, ...rjCheck.soft].map((p) => `- ${p}`).join('\n');
        throw new Error(`validation: ${problems.slice(0, 3).join(' | ')}`);
      }
      // After the retry, drop any line that still copies a prompt example (the Kahani may echo its own scene line).
      let scriptLines = type === 'kahani' ? raw.lines : raw.lines.filter((l, i) => !copiesExample(l.text) && !rjCheck?.dropLines.includes(i));
      if (type === 'news') {
        const checked = newsFidelity(scriptLines, headlinesText, newsFrame);
        for (const d of checked.dropped) console.warn(`[segment] ${station.id}/news dropped a line (${d.reason}): ${d.text.slice(0, 80)}`);
        scriptLines = dropOrphanKicker(checked.lines);
      }
      const limited = limitNameTokens(scriptLines.map((l) => l.text), namesAllowed);
      // The subtitle follows the same name rule, and gets the name as the listener typed it
      const limitedEn = subtitles ? limitNameTokens(scriptLines.map((l) => l.en ?? ''), namesAllowed) : [];
      scriptLines = scriptLines.map((l, i) => ({ ...l, text: limited[i], en: limitedEn[i] || undefined }));
      const enName = req.listener.name?.trim() || undefined;
      const named = withStudioCalls(station, scriptLines as RawLine[], calls, callers, subtitles).map((l) => ({
        ...l,
        text: fillName(l.text, listenerName),
        ...(l.en ? { en: fillName(l.en, enName) } : {}),
      }));
      const lines = processLines(capLines(named, MAX_LINES[type] + calls.length), roles, type, station.language);
      const min = type === 'news' ? Math.min(MIN_LINES.news, headlines.length + 1) : MIN_LINES[type];
      if (lines.length < min) throw new Error(`only ${lines.length} usable lines for ${type}`);
      const mood: Mood | undefined = raw.mood === 'heavy' ? 'heavy' : raw.mood === 'light' ? 'light' : undefined;
      const summary = raw.summary_en?.replace(/\{name\}/g, 'the listener').replace(CALLER_SLOT, 'a studio caller').trim() || undefined;
      return { title: raw.title, lines, summary, mood, dedicated: calls.length ? calls.map((c) => c.id) : undefined };
    } catch (err) {
      lastError = err;
      console.error(`[segment] ${station.id}/${type} attempt ${attempt + 1} failed: ${String(err)}`);
    }
  }
  throw lastError ?? new Error('segment budget exhausted');
}

export async function buildSegment(
  sarvam: Sarvam,
  station: Station,
  req: SegmentRequest,
  timings: Timings,
  opts: { fetchHeadlines?: () => Promise<Source[]>; storyPlan?: StoryPlan; memory?: ShowMemory; geo?: EdgeGeo } = {},
): Promise<Segment> {
  const type = req.type;
  const subtitles = subtitlesOn(station, req.subtitles);

  if (type === 'station_id') {
    const line = toLine(station, 'station_id', station.stationIdText, type);
    if (station.stationIdEn && station.language !== 'en-IN') line.en = station.stationIdEn;
    return {
      id: crypto.randomUUID(),
      station: station.id,
      type,
      title: `${station.nativeName} · FM ${station.frequency}`,
      lines: [line],
      summary: 'the station jingle',
    };
  }

  // The Kahani (serial part or one complete story) and the ad break are written in ./fiction
  if (type === 'kahani' || type === 'ad_break') return buildFiction(sarvam, station, req, timings, { memory: opts.memory });

  let headlines: Source[] = [];
  if (type === 'news') {
    // The newsroom's fresh slate first; the client's tune-in headlines only when the server has none
    if (opts.fetchHeadlines) headlines = await timings.measure('news', () => opts.fetchHeadlines!().catch(() => [] as Source[]));
    if (!headlines.length) headlines = req.headlines ?? [];
    headlines = headlines.slice(0, NEWS_HEADLINES);
    if (!headlines.length) return fallbackSegment(station, type, subtitles);
  }

  const listenerName = await timings.measure('name', () => nativeListenerName(sarvam, req.listener.name, station.language));
  // A Kahani gets a fresh premise and its own cast, and an ad its own shape, before a word is written,
  // steering clear of what this station already aired (show memory)
  const plans = await timings.measure('memory', () => planSegment(station, type, req, opts.memory));
  if (opts.storyPlan) plans.story = opts.storyPlan;
  const story = plans.story;
  // The RJ link's point is chosen in code first (./linkPlan), with the fact packet for this listener's city
  let link: RjLinkPlan | undefined;
  let writeReq = req;
  if (type === 'rj_link') {
    const bible = rjBibleFor(station, rjOnAir(station, req.listener).name);
    link = await timings.measure('facts', () => planRjLink(station, req, { geo: opts.geo, rjKey: bible?.key }));
    // A tease into the story reads no studio calls: they go back in the queue for the next link
    if (link.mode === 'kahani_in' && req.dedications?.length) writeReq = { ...req, dedications: undefined };
  }
  let script: Script;
  try {
    script = await writeScript(sarvam, station, type, writeReq, headlines, timings, listenerName, plans, link);
  } catch {
    return link ? templateLink(station, link, subtitles) : fallbackSegment(station, type, subtitles);
  }

  const rjVoice = rjOnAir(station, req.listener).voice;
  const lines = script.lines.map((l) => {
    const line = toLine(station, l.role, l.text, type, {
      delivery: isDelivery(l.delivery) ? l.delivery : 'normal',
      voice: l.role === 'rj' ? rjVoice : story ? story.cast[l.role as keyof StoryPlan['cast']] : undefined,
    });
    // The subtitle the script writer wrote with the line, through the profanity guard
    const en = modelSubtitle(l.en);
    if (en) line.en = en;
    return line;
  });
  const segment: Segment = {
    id: crypto.randomUUID(),
    station: station.id,
    type,
    title: cleanTitle(fillName(script.title, listenerName).replace(CALLER_SLOT, someoneFor(station.id)), station.nativeName, station.language),
    lines: applyGaps(lines, type, Math.random, script.lines.map((l) => Boolean(l.continuation))),
  };
  if (script.summary) segment.summary = script.summary.slice(0, 200);
  if (script.mood) segment.mood = script.mood;
  if (script.dedicated?.length) segment.dedicated = script.dedicated;
  if (link) segment.linkState = link.nextLinkState;
  if (type === 'news') {
    segment.sources = headlines;
    const ids = headlines.map((h) => h.id).filter((id): id is string => Boolean(id));
    if (ids.length) segment.newsIds = ids;
  }
  return segment;
}
