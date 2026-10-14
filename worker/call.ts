/** Call-in pipeline: Saaras STT → Sarvam-105B reply, with its English subtitles written alongside when asked. See docs/TECH-SPEC.md §5. */
import { z } from 'zod';
import { MAX_LINE_CHARS } from '../shared/constants';
import { LlmCallSchema, type CallMeta, type LlmCall } from '../shared/schemas';
import type { CallResponse, Station } from '../shared/types';
import { fallbacksFor } from './fallbacks';
import { CALL_PLAN, callJsonSchema, callMessages, maxTokensFor, rjOnAir, subtitlesOn } from './prompts';
import type { Sarvam } from './sarvam';
import { fillName, limitNameTokens, nativeListenerName, toLine } from './segment';
import { careReply, careReplyEn, soundsLikeCrisis } from './care';
import { isDelivery } from './show';
import { modelSubtitle } from './subtitle';
import { cleanText, splitLine } from './text';
import type { Timings } from './timing';

const AUDIO_TYPES: [RegExp, string, string][] = [
  [/webm/, 'audio/webm', 'call.webm'],
  [/ogg|opus/, 'audio/ogg', 'call.ogg'],
  [/mp4|m4a|aac/, 'audio/mp4', 'call.m4a'],
  [/wav|wave/, 'audio/wav', 'call.wav'],
  [/mpeg|mp3/, 'audio/mpeg', 'call.mp3'],
  [/flac/, 'audio/flac', 'call.flac'],
];

/** Accepts over-long lines or fields; the reply is trimmed to one caption line afterwards. */
const LenientCallSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object') return value;
  const v = value as { lines?: unknown; nickname?: unknown; story_theme?: unknown; caller_en?: unknown };
  return {
    ...v,
    lines: Array.isArray(v.lines)
      ? v.lines.slice(0, 4).map((l: unknown) => {
          const line = l as { text?: unknown; en?: unknown };
          if (typeof line?.text !== 'string') return l;
          const { en, ...rest } = line;
          return { ...rest, text: line.text.slice(0, 600), ...(typeof en === 'string' ? { en: en.slice(0, 600) } : {}) };
        })
      : v.lines,
    nickname: typeof v.nickname === 'string' ? v.nickname.slice(0, 60) : v.nickname,
    story_theme: typeof v.story_theme === 'string' ? v.story_theme.slice(0, 120) : v.story_theme,
    caller_en: typeof v.caller_en === 'string' ? v.caller_en.slice(0, 600) : undefined,
  };
}, LlmCallSchema);

const EMPTY = /^(null|none|n\/a|-)?$/i;

/** Normalizes MediaRecorder MIME types (with codec params) to a plain type and file name. */
export function audioFile(mime: string, filename?: string): { type: string; name: string } {
  const probe = `${mime} ${filename ?? ''}`.toLowerCase();
  for (const [re, type, name] of AUDIO_TYPES) if (re.test(probe)) return { type, name };
  return { type: 'audio/webm', name: 'call.webm' };
}

/** One spoken reply line and its English subtitle ('' when there is none). */
export interface ReplyPart {
  text: string;
  en: string;
}

/**
 * The reply is one caption line: the model's lines, whole, while they fit, so the subtitle matches what is said.
 * A first line too long on its own is cut at a sentence boundary instead.
 */
export function fitReply(parts: ReplyPart[], max = MAX_LINE_CHARS): ReplyPart {
  const used: ReplyPart[] = [];
  let length = 0;
  for (const part of parts) {
    const next = used.length ? length + 1 + part.text.length : part.text.length;
    if (next > max) break;
    used.push(part);
    length = next;
  }
  if (!used.length) return parts.length ? { text: splitLine(parts[0].text, max)[0], en: parts[0].en } : { text: '', en: '' };
  return { text: used.map((p) => p.text).join(' '), en: used.map((p) => p.en).filter(Boolean).join(' ') };
}

/** English subtitles for a call: line 2 of a streamed response. */
export interface CallSubtitles {
  transcriptEn?: string;
  replyEn?: string;
}

/** The reply, and its subtitles (empty unless the listener turned subtitles on). */
export interface CallResult {
  response: CallResponse;
  subtitles: CallSubtitles;
}

/** The whole call in one object (subtitles included), for clients that don't stream. */
export async function handleCall(
  sarvam: Sarvam,
  station: Station,
  meta: CallMeta,
  audio: Blob,
  filename: string,
  timings: Timings,
): Promise<CallResponse> {
  const { response, subtitles } = await startCall(sarvam, station, meta, audio, filename, timings);
  const full: CallResponse = { ...response, reply: { ...response.reply } };
  if (subtitles.transcriptEn) full.transcriptEn = subtitles.transcriptEn;
  if (subtitles.replyEn) full.reply.en = subtitles.replyEn;
  return full;
}

/**
 * Call-in pipeline. With subtitles on, the model writes the English of the caller's words and of its reply in the
 * same response, so both are ready the moment the reply is.
 */
export async function startCall(
  sarvam: Sarvam,
  station: Station,
  meta: CallMeta,
  audio: Blob,
  filename: string,
  timings: Timings,
): Promise<CallResult> {
  const fallback = fallbacksFor(station.id);
  const rjVoice = rjOnAir(station, meta.listener).voice;
  const subtitles = subtitlesOn(station, meta.subtitles);
  // No keyterms: on near-silent clips they bias Saaras into "hearing" them.
  const [stt, listenerName] = await Promise.all([
    timings.measure('stt', () => sarvam.transcribe(audio, { languageCode: station.language, mode: station.sttMode, filename })),
    nativeListenerName(sarvam, meta.listener.name, station.language),
  ]);
  const transcript = stt.transcript;
  const language = stt.languageCode ?? station.language;

  if (!/[\p{L}\p{N}]/u.test(transcript)) {
    const reply = toLine(station, 'rj', fallback.lineNotClear, 'rj_link', { voice: rjVoice, delivery: 'normal' });
    const replyEn = subtitles ? fallback.lineNotClearEn : undefined;
    return { response: { transcript, language, intent: 'retry', reply }, subtitles: replyEn ? { replyEn } : {} };
  }

  if (soundsLikeCrisis(transcript)) {
    // Never left to the model: a caller in distress always hears the same warm reply and the helpline.
    const reply = toLine(station, 'rj', careReply(station.id), 'rj_link', { voice: rjVoice, delivery: 'warm' });
    reply.en = careReplyEn();
    return { response: { transcript, language, intent: 'care', reply }, subtitles: {} };
  }

  let llm: LlmCall;
  try {
    llm = await timings.measure('llm', () =>
      sarvam.chatJson(
        callMessages(station, { transcript, listener: meta.listener, nowPlaying: meta.nowPlaying, showLog: meta.showLog, subtitles }),
        callJsonSchema(subtitles),
        LenientCallSchema,
        {
          name: 'tarang_call',
          temperature: CALL_PLAN.temperature,
          maxTokens: maxTokensFor(CALL_PLAN, subtitles),
          reasoningEffort: CALL_PLAN.reasoningEffort,
          timeoutMs: CALL_PLAN.timeoutMs,
        },
      ),
    );
  } catch {
    llm = {
      intent: 'chat',
      lines: [{ text: fallback.callThanks, delivery: 'warm', ...(fallback.callThanksEn ? { en: fallback.callThanksEn } : {}) }],
      nickname: null,
      story_theme: null,
    };
  }

  if (llm.intent === 'care') {
    const reply = toLine(station, 'rj', careReply(station.id), 'rj_link', { voice: rjVoice, delivery: 'warm' });
    reply.en = careReplyEn();
    return { response: { transcript, language, intent: 'care', reply }, subtitles: {} };
  }

  const nickname = llm.nickname?.trim() && !EMPTY.test(llm.nickname.trim()) ? llm.nickname.trim().slice(0, 40) : meta.listener.nickname;
  const withNames = (name: string | undefined) => (text: string) =>
    fillName(text, name).replace(/\{\s*nickname\s*\}/giu, nickname ?? name ?? '');
  // Name or nickname once per reply at most; the subtitle gets the name as the caller typed it
  const texts = limitNameTokens(llm.lines.map((l) => l.text.trim()), 1).map(withNames(listenerName));
  const ens = subtitles ? limitNameTokens(llm.lines.map((l) => l.en?.trim() ?? ''), 1).map(withNames(meta.listener.name?.trim() || undefined)) : [];
  const parts = texts.map((t, i) => ({ text: cleanText(t, station.language), en: ens[i] ?? '' })).filter((p) => p.text);
  const fitted = fitReply(parts);
  const first = llm.lines[0]?.delivery;
  const delivery = isDelivery(first) ? first : 'normal';
  const reply = toLine(station, 'rj', fitted.text || cleanText(fallback.callThanks, station.language), 'rj_link', { voice: rjVoice, delivery });
  const rawTheme = llm.story_theme?.trim() ?? '';
  const theme = llm.intent === 'story_request' && !EMPTY.test(rawTheme) ? rawTheme : undefined;

  const subs: CallSubtitles = {};
  if (subtitles) {
    // A caller who spoke English needs no subtitle
    const transcriptEn = language === 'en-IN' ? undefined : modelSubtitle(llm.caller_en);
    const replyEn = modelSubtitle(fitted.text ? fitted.en : fallback.callThanksEn);
    if (transcriptEn) subs.transcriptEn = transcriptEn;
    if (replyEn) subs.replyEn = replyEn;
  }
  return { response: { transcript, language, intent: llm.intent, theme, reply, nickname }, subtitles: subs };
}
