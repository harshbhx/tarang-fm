/** Builds programme segments: model script → clean lines → cast voices → English subtitles. */
import { z } from 'zod';
import { PAUSE_AFTER_MS } from '../shared/constants';
import { LlmSegmentSchema, type Dedication, type SegmentRequest } from '../shared/schemas';
import type { Delivery, Line, Mood, Role, Segment, SegmentType, Source, Station, TtsLanguage, Voice } from '../shared/types';
import { randomFiller, someoneFor, studioCallLine } from './fallbacks';
import { callerPlaceholder, MAX_LINES, NEWS_HEADLINES, rjOnAir, SEGMENT_PLAN, SEGMENT_ROLES, segmentJsonSchema, segmentMessages, type LlmSegmentType } from './prompts';
import type { Sarvam } from './sarvam';
import { gapAfter, isDelivery, timePhrase, voiceFor } from './show';
import { cleanSubtitle } from './subtitle';
import { cleanText, processLines, type RawLine } from './text';
import type { Timings } from './timing';
import { copiesExample, dropInventedNumbers, validateScript } from './validate';

/** Total budget for one segment request, including the retry. */
const SEGMENT_BUDGET_MS = 19_000;
const MIN_ATTEMPT_MS = 4000;
const CONVERT_CONCURRENCY = 6;

const MIN_LINES: Record<LlmSegmentType, number> = { rj_link: 2, news: 3, ad_break: 3, kahani: 6 };

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
          const line = l as { role?: unknown; text?: unknown };
          return typeof line?.text === 'string' ? { ...line, text: line.text.slice(0, 600) } : l;
        })
      : v.lines,
  };
}, LlmSegmentSchema);

const annotationCache = new Map<string, string>();

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

/** Drops a kicker intro ("…एक अच्छी खबर।") that is not followed by a story before the sign-off. */
export function dropOrphanKicker<T extends { text: string }>(lines: T[]): T[] {
  return lines.filter((line, i) => !(KICKER.test(line.text) && i >= lines.length - 2));
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
    const out = await sarvam.transliterate(who, 'en-IN', language);
    if (nameCache.size < 500) nameCache.set(key, out);
    return out;
  } catch {
    return who;
  }
}

/** Writes the station brand in Latin script so Translate keeps it as "Tarang". */
export function latinBrand(text: string): string {
  return text.replace(/[^\s\x00-\x7F]+(?=\s*FM\b)/gu, 'Tarang');
}

/** Runs a best-effort text conversion over many lines with bounded concurrency; failures stay undefined. */
async function convertAll(
  texts: string[],
  kind: string,
  convert: (text: string) => Promise<string>,
  cache: boolean,
): Promise<(string | undefined)[]> {
  const out: (string | undefined)[] = new Array(texts.length).fill(undefined);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < texts.length; i = next++) {
      const key = `${kind}:${texts[i]}`;
      const hit = cache ? annotationCache.get(key) : undefined;
      if (hit) {
        out[i] = hit;
        continue;
      }
      try {
        const value = await convert(latinBrand(texts[i]));
        out[i] = value;
        if (cache && annotationCache.size < 300) annotationCache.set(key, value);
      } catch {
        out[i] = undefined;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONVERT_CONCURRENCY, texts.length) }, worker));
  return out;
}

/** Fills each line's `en` subtitle via Sarvam Translate, in parallel and best-effort. Profane translations are dropped. */
export async function annotate(
  sarvam: Sarvam,
  lines: Line[],
  language: TtsLanguage,
  timings: Timings,
  opts: { cache?: boolean } = {},
): Promise<void> {
  if (language === 'en-IN' || !lines.length) return;
  const texts = lines.map((l) => l.text);
  const en = await timings.measure('translate', () =>
    convertAll(texts, `en:${language}`, (t) => sarvam.translate(t, language), opts.cache ?? false),
  );
  lines.forEach((line, i) => {
    const subtitle = cleanSubtitle(en[i]);
    if (subtitle) line.en = subtitle;
  });
}

function cleanTitle(raw: string, fallback: string, language: TtsLanguage): string {
  const title = cleanText(raw, language).replace(/[।.]+$/u, '').trim();
  return (title || fallback).slice(0, 80);
}

async function withSubtitles(sarvam: Sarvam, segment: Segment, language: TtsLanguage, timings: Timings, cache = false): Promise<Segment> {
  await annotate(sarvam, segment.lines, language, timings, { cache });
  return segment;
}

export function fallbackSegment(station: Station, type: SegmentType): Segment {
  return {
    id: crypto.randomUUID(),
    station: station.id,
    type,
    title: station.nativeName,
    lines: [toLine(station, 'rj', randomFiller(station.id), type)],
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
 * placed before the closing tease. Then each {callerN} placeholder becomes the caller's name.
 */
export function withStudioCalls<T extends RawLine>(station: Station, lines: T[], calls: Dedication[], callers: Caller[]): RawLine[] {
  if (!calls.length) return lines;
  const read = callersRead(lines);
  const missing: RawLine[] = calls.flatMap((call, i) =>
    read.has(i + 1)
      ? []
      : [{ role: 'rj' as Role, text: studioCallLine(station.id, callerPlaceholder(i + 1), callers[i]?.city, call.message), delivery: 'warm' }],
  );
  const all: RawLine[] = missing.length && lines.length > 1 ? [...lines.slice(0, -1), ...missing, lines[lines.length - 1]] : [...lines, ...missing];
  const someone = someoneFor(station.id);
  return all.map((l) => ({
    ...l,
    text: l.text.replace(CALLER_SLOT, (_m, n: string) => callers[Number(n) - 1]?.name || someone),
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
): Promise<Script> {
  const deadline = Date.now() + SEGMENT_BUDGET_MS;
  const plan = SEGMENT_PLAN[type];
  const roles = SEGMENT_ROLES[type];
  const schema = segmentJsonSchema(type);
  const headlinesText = headlines.map((h) => h.title).join(' ');
  const time = timePhrase(station, req.listener);
  const greet = type === 'rj_link' && Boolean(req.producer?.greetListener || req.producer?.firstLink || !req.showLog?.some((e) => e.type === 'rj_link'));
  const calls = type === 'rj_link' ? (req.dedications ?? []) : [];
  const callers = calls.length ? await timings.measure('name', () => nativeCallers(sarvam, calls, station.language)) : [];
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) break;
    try {
      const raw = await timings.measure('llm', () =>
        sarvam.chatJson(segmentMessages(station, type, req, headlines), schema, LenientSegmentSchema, {
          name: `tarang_${type}`,
          // The pack's retry: one more try at a slightly lower temperature.
          temperature: Math.max(0.1, plan.temperature - attempt * 0.1),
          maxTokens: plan.maxTokens,
          reasoningEffort: plan.reasoningEffort,
          timeoutMs: Math.min(plan.timeoutMs + attempt * 3000, remaining),
        }),
      );
      const problems = validateScript(station, type, raw.lines, { greet, listenerName: req.listener.name, headlinesText, timePhrase: time });
      const read = callersRead(raw.lines);
      calls.forEach((_c, i) => {
        if (!read.has(i + 1)) problems.push(`studio call ${i + 1} not read (no ${callerPlaceholder(i + 1)})`);
      });
      if (problems.length && attempt === 0) throw new Error(`validation: ${problems.slice(0, 3).join(' | ')}`);
      // After the retry, drop any line that still copies a prompt example (the Kahani may echo its own scene line).
      let scriptLines = type === 'kahani' ? raw.lines : raw.lines.filter((l) => !copiesExample(l.text));
      if (type === 'news') scriptLines = dropOrphanKicker(dropInventedNumbers(scriptLines, headlinesText, `${time} ${station.frequency}`));
      const named = withStudioCalls(station, scriptLines as RawLine[], calls, callers).map((l) => ({ ...l, text: fillName(l.text, listenerName) }));
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
  opts: { fetchHeadlines?: () => Promise<Source[]> } = {},
): Promise<Segment> {
  const type = req.type;

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

  let headlines: Source[] = [];
  if (type === 'news') {
    headlines = (req.headlines ?? []).slice(0, NEWS_HEADLINES);
    if (!headlines.length && opts.fetchHeadlines) {
      headlines = await timings.measure('news', () => opts.fetchHeadlines!().catch(() => [] as Source[]));
      headlines = headlines.slice(0, NEWS_HEADLINES);
    }
    if (!headlines.length) return withSubtitles(sarvam, fallbackSegment(station, type), station.language, timings, true);
  }

  const listenerName = await timings.measure('name', () => nativeListenerName(sarvam, req.listener.name, station.language));
  let script: Script;
  try {
    script = await writeScript(sarvam, station, type, req, headlines, timings, listenerName);
  } catch {
    return withSubtitles(sarvam, fallbackSegment(station, type), station.language, timings, true);
  }

  const rjVoice = rjOnAir(station, req.listener).voice;
  const lines = script.lines.map((l) =>
    toLine(station, l.role, l.text, type, {
      delivery: isDelivery(l.delivery) ? l.delivery : 'normal',
      voice: l.role === 'rj' ? rjVoice : undefined,
    }),
  );
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
  if (type === 'news') segment.sources = headlines;
  return withSubtitles(sarvam, segment, station.language, timings);
}
