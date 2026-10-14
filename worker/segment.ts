/** Builds programme segments: model script → clean lines → cast voices → English subtitles. */
import { z } from 'zod';
import { PAUSE_AFTER_MS } from '../shared/constants';
import { LlmSegmentSchema, type SegmentRequest } from '../shared/schemas';
import type { Line, Role, Segment, SegmentType, Source, Station, TtsLanguage } from '../shared/types';
import { randomFiller } from './fallbacks';
import { MAX_LINES, NEWS_HEADLINES, SEGMENT_PLAN, SEGMENT_ROLES, segmentJsonSchema, segmentMessages, type LlmSegmentType } from './prompts';
import type { Sarvam } from './sarvam';
import { cleanText, processLines, type RawLine } from './text';
import type { Timings } from './timing';

/** Total budget for one segment request, including the retry. */
const SEGMENT_BUDGET_MS = 19_000;
const MIN_ATTEMPT_MS = 4000;
const CONVERT_CONCURRENCY = 6;

const MIN_LINES: Record<LlmSegmentType, number> = { rj_link: 2, news: 3, ad_break: 3, kahani: 6 };

/** Accepts slightly oversized model output and leaves the trimming to post-processing. */
const LenientSegmentSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object') return value;
  const v = value as { title?: unknown; lines?: unknown };
  return {
    title: typeof v.title === 'string' ? v.title.slice(0, 120) : v.title,
    lines: Array.isArray(v.lines)
      ? v.lines.slice(0, 16).map((l: unknown) => {
          const line = l as { role?: unknown; text?: unknown };
          return typeof line?.text === 'string' ? { ...line, text: line.text.slice(0, 600) } : l;
        })
      : v.lines,
  };
}, LlmSegmentSchema);

const annotationCache = new Map<string, string>();

export function toLine(station: Station, role: Role, text: string, type: SegmentType): Line {
  const voice = station.cast[role];
  return {
    role,
    speaker: voice.speaker,
    text,
    pace: voice.pace,
    temperature: voice.temperature,
    pauseAfterMs: PAUSE_AFTER_MS[type],
  };
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

/** Fills each line's `en` subtitle via Sarvam Translate, in parallel and best-effort. */
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
    if (en[i]) line.en = en[i];
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

async function writeScript(
  sarvam: Sarvam,
  station: Station,
  type: LlmSegmentType,
  req: SegmentRequest,
  headlines: Source[],
  timings: Timings,
): Promise<{ title: string; lines: RawLine[] }> {
  const deadline = Date.now() + SEGMENT_BUDGET_MS;
  const plan = SEGMENT_PLAN[type];
  const roles = SEGMENT_ROLES[type];
  const schema = segmentJsonSchema(type);
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) break;
    try {
      const raw = await timings.measure('llm', () =>
        sarvam.chatJson(segmentMessages(station, type, req, headlines), schema, LenientSegmentSchema, {
          name: `tarang_${type}`,
          temperature: plan.temperature,
          maxTokens: plan.maxTokens,
          reasoningEffort: plan.reasoningEffort,
          timeoutMs: Math.min(plan.timeoutMs + attempt * 3000, remaining),
        }),
      );
      const max = type === 'news' ? headlines.length + 2 : MAX_LINES[type];
      const named = raw.lines.map((l) => ({ ...l, text: fillName(l.text, req.listener.name) }));
      const lines = processLines(capLines(named, max), roles, type, station.language);
      const min = type === 'news' ? Math.min(MIN_LINES.news, headlines.length + 1) : MIN_LINES[type];
      if (lines.length < min) throw new Error(`only ${lines.length} usable lines for ${type}`);
      return { title: raw.title, lines };
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

  let script: { title: string; lines: RawLine[] };
  try {
    script = await writeScript(sarvam, station, type, req, headlines, timings);
  } catch {
    return withSubtitles(sarvam, fallbackSegment(station, type), station.language, timings, true);
  }

  const segment: Segment = {
    id: crypto.randomUUID(),
    station: station.id,
    type,
    title: cleanTitle(fillName(script.title, req.listener.name), station.nativeName, station.language),
    lines: script.lines.map((l) => toLine(station, l.role, l.text, type)),
  };
  if (type === 'news') segment.sources = headlines;
  return withSubtitles(sarvam, segment, station.language, timings);
}
