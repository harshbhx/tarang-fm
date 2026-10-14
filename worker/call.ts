/** Call-in pipeline: Saaras STT → Sarvam-105B reply → English subtitles. See docs/TECH-SPEC.md §5. */
import { z } from 'zod';
import { MAX_LINE_CHARS } from '../shared/constants';
import { LlmCallSchema, type CallMeta, type LlmCall } from '../shared/schemas';
import type { CallResponse, Station, TtsLanguage } from '../shared/types';
import { fallbacksFor } from './fallbacks';
import { CALL_JSON_SCHEMA, CALL_PLAN, callMessages, rjOnAir } from './prompts';
import type { Sarvam } from './sarvam';
import { annotate, fillName, latinBrand, nativeListenerName, toLine } from './segment';
import { careReply, careReplyEn, soundsLikeCrisis } from './care';
import { isDelivery } from './show';
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

const TRANSLATABLE: ReadonlySet<string> = new Set(['bn-IN', 'en-IN', 'gu-IN', 'hi-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'od-IN', 'pa-IN', 'ta-IN', 'te-IN']);

/** Accepts over-long lines or fields; the reply is trimmed to one caption line afterwards. */
const LenientCallSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object') return value;
  const v = value as { lines?: unknown; nickname?: unknown; story_theme?: unknown };
  return {
    ...v,
    lines: Array.isArray(v.lines)
      ? v.lines.slice(0, 4).map((l: unknown) => {
          const line = l as { text?: unknown };
          return typeof line?.text === 'string' ? { ...line, text: line.text.slice(0, 600) } : l;
        })
      : v.lines,
    nickname: typeof v.nickname === 'string' ? v.nickname.slice(0, 60) : v.nickname,
    story_theme: typeof v.story_theme === 'string' ? v.story_theme.slice(0, 120) : v.story_theme,
  };
}, LlmCallSchema);

const EMPTY = /^(null|none|n\/a|-)?$/i;

/** Normalizes MediaRecorder MIME types (with codec params) to a plain type and file name. */
export function audioFile(mime: string, filename?: string): { type: string; name: string } {
  const probe = `${mime} ${filename ?? ''}`.toLowerCase();
  for (const [re, type, name] of AUDIO_TYPES) if (re.test(probe)) return { type, name };
  return { type: 'audio/webm', name: 'call.webm' };
}

function replyText(raw: string, station: Station): string {
  const text = cleanText(raw, station.language);
  return text ? splitLine(text, MAX_LINE_CHARS)[0] : '';
}

export async function handleCall(
  sarvam: Sarvam,
  station: Station,
  meta: CallMeta,
  audio: Blob,
  filename: string,
  timings: Timings,
): Promise<CallResponse> {
  const fallback = fallbacksFor(station.id);
  const rjVoice = rjOnAir(station, meta.listener).voice;
  // No keyterms: on near-silent clips they bias Saaras into "hearing" them.
  const [stt, listenerName] = await Promise.all([
    timings.measure('stt', () => sarvam.transcribe(audio, { languageCode: station.language, mode: station.sttMode, filename })),
    nativeListenerName(sarvam, meta.listener.name, station.language),
  ]);
  const transcript = stt.transcript;
  const language = stt.languageCode ?? station.language;

  if (!/[\p{L}\p{N}]/u.test(transcript)) {
    const reply = toLine(station, 'rj', fallback.lineNotClear, 'rj_link', { voice: rjVoice, delivery: 'normal' });
    await annotate(sarvam, [reply], station.language, timings, { cache: true });
    return { transcript, language, intent: 'retry', reply };
  }

  if (soundsLikeCrisis(transcript)) {
    // Never left to the model: a caller in distress always hears the same warm reply and the helpline.
    const reply = toLine(station, 'rj', careReply(station.id), 'rj_link', { voice: rjVoice, delivery: 'warm' });
    reply.en = careReplyEn();
    return { transcript, language, intent: 'care', reply };
  }

  let llm: LlmCall;
  try {
    llm = await timings.measure('llm', () =>
      sarvam.chatJson(
        callMessages(station, { transcript, listener: meta.listener, nowPlaying: meta.nowPlaying, showLog: meta.showLog }),
        CALL_JSON_SCHEMA,
        LenientCallSchema,
        {
          name: 'tarang_call',
          temperature: CALL_PLAN.temperature,
          maxTokens: CALL_PLAN.maxTokens,
          reasoningEffort: CALL_PLAN.reasoningEffort,
          timeoutMs: CALL_PLAN.timeoutMs,
        },
      ),
    );
  } catch {
    llm = { intent: 'chat', lines: [{ text: fallback.callThanks, delivery: 'warm' }], nickname: null, story_theme: null };
  }

  if (llm.intent === 'care') {
    const reply = toLine(station, 'rj', careReply(station.id), 'rj_link', { voice: rjVoice, delivery: 'warm' });
    reply.en = careReplyEn();
    return { transcript, language, intent: 'care', reply };
  }

  const nickname = llm.nickname?.trim() && !EMPTY.test(llm.nickname.trim()) ? llm.nickname.trim().slice(0, 40) : meta.listener.nickname;
  const joined = llm.lines.map((l) => l.text.trim()).filter(Boolean).join(' ');
  const withNames = fillName(joined, listenerName).replace(/\{\s*nickname\s*\}/giu, nickname ?? listenerName ?? '');
  const spoken = replyText(withNames, station);
  const first = llm.lines[0]?.delivery;
  const delivery = isDelivery(first) ? first : 'normal';
  const reply = toLine(station, 'rj', spoken || cleanText(fallback.callThanks, station.language), 'rj_link', { voice: rjVoice, delivery });
  const source = (TRANSLATABLE.has(language) ? language : station.language) as TtsLanguage;
  const [transcriptEn] = await Promise.all([
    source === 'en-IN'
      ? Promise.resolve(undefined)
      : timings.measure('translate_caller', () => sarvam.translate(latinBrand(transcript), source).catch(() => undefined)),
    annotate(sarvam, [reply], station.language, timings),
  ]);

  const rawTheme = llm.story_theme?.trim() ?? '';
  const theme = llm.intent === 'story_request' && !EMPTY.test(rawTheme) ? rawTheme : undefined;
  return { transcript, transcriptEn, language, intent: llm.intent, theme, reply, nickname };
}
