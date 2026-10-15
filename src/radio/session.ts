/**
 * Show state the server hands back and the client echoes on the next request (clock v2): the RJ link rotation,
 * the Kahani serial and its recap, and the news already aired. Pure functions, no I/O.
 */
import type { LinkState, RecapSource, Segment, SerialState } from '../../shared/types';

/** SegmentRequest.airedNews limit */
export const AIRED_NEWS_MAX = 40;

const clip = (s: unknown, max: number): string => (typeof s === 'string' ? s.trim().slice(0, max) : '');

/**
 * What part n+1's recap may draw on, from what part n aired: the heard summary (the producer's when there is
 * one), the cliffhanger it ended on and its last 3 lines verbatim. Mirrors `recapSourceFrom()` in worker/story.ts.
 */
export function recapSourceFrom(segment: Pick<Segment, 'heardSummary' | 'summary' | 'serial' | 'lines'>): RecapSource {
  return {
    heard: clip(segment.heardSummary?.trim() || segment.summary, 400),
    cliffhanger: clip(segment.serial?.outline.aired_cliffhanger_en, 300),
    lastLines: segment.lines.slice(-3).map((l) => ({ role: l.role.slice(0, 20), text: l.text.slice(0, 300) })),
  };
}

/** The session's aired newsroom ids plus a bulletin's, oldest dropped first, each once. */
export function addAiredNews(aired: readonly string[], ids: readonly string[] | undefined, max = AIRED_NEWS_MAX): string[] {
  const fresh = (ids ?? []).filter((id): id is string => typeof id === 'string' && !!id && id.length <= 64);
  if (!fresh.length) return [...aired];
  const out = aired.filter((id) => !fresh.includes(id));
  for (const id of fresh) if (!out.includes(id)) out.push(id);
  return out.slice(-max);
}

const strings = (list: unknown, max: number, chars: number): string[] =>
  Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string' && s.length <= chars).slice(-max) : [];

/** A link state the server returned, fit to echo (the request schema's limits), or undefined. */
export function cleanLinkState(state: LinkState | undefined): LinkState | undefined {
  if (!state || typeof state !== 'object') return undefined;
  const out: LinkState = {
    lastTypes: strings(state.lastTypes, 8, 24),
    usedFactIds: strings(state.usedFactIds, 60, 64),
    bitEpisodes: {},
  };
  for (const [bit, n] of Object.entries(state.bitEpisodes ?? {})) {
    if (bit.length <= 24 && Number.isInteger(n) && n >= 0 && n <= 99) out.bitEpisodes[bit] = n;
  }
  const question = clip(state.openQuestion, 240);
  if (question) out.openQuestion = question;
  if (Number.isFinite(state.lastWeatherAt)) out.lastWeatherAt = state.lastWeatherAt;
  if (Number.isFinite(state.lastFestivalAt)) out.lastFestivalAt = state.lastFestivalAt;
  if (typeof state.onThisDayDone === 'boolean') out.onThisDayDone = state.onThisDayDone;
  return out;
}

const SERIAL_ROLES = ['narrator', 'char_a', 'char_b', 'char_kid'] as const;

/** A serial a Kahani part returned, fit to echo, or undefined (then the next part is written without it). */
export function cleanSerial(serial: SerialState | undefined): SerialState | undefined {
  if (!serial || typeof serial !== 'object') return undefined;
  const id = clip(serial.id, 64);
  if (!id || ![1, 2, 3].includes(serial.part) || !serial.outline || typeof serial.outline !== 'object') return undefined;
  const outline: Record<string, string> = {};
  for (const [key, value] of Object.entries(serial.outline)) {
    if (key.length <= 40 && typeof value === 'string') outline[key] = value.slice(0, 600);
  }
  const cast: SerialState['cast'] = {};
  for (const role of SERIAL_ROLES) {
    const speaker = serial.cast?.[role];
    if (typeof speaker === 'string' && speaker.length >= 3 && speaker.length <= 64) cast[role] = speaker;
  }
  return { id, part: serial.part, outline, cast };
}
