/** Call-in pipeline: Saaras STT → Sarvam-105B reply → English subtitles. See docs/TECH-SPEC.md §5. */
import { z } from 'zod';
import { MAX_LINE_CHARS } from '../shared/constants';
import { LlmCallSchema, type CallMeta, type LlmCall } from '../shared/schemas';
import type { CallResponse, Station, TtsLanguage } from '../shared/types';
import { fallbacksFor } from './fallbacks';
import { CALL_JSON_SCHEMA, CALL_PLAN, callMessages } from './prompts';
import type { Sarvam } from './sarvam';
import { annotate, fillName, latinBrand, toLine } from './segment';
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

/** Accepts an over-long reply or theme; the reply is trimmed to one caption line afterwards. */
const LenientCallSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object') return value;
  const v = value as { reply?: unknown; theme?: unknown };
  return {
    ...v,
    reply: typeof v.reply === 'string' ? v.reply.slice(0, 400) : v.reply,
    theme: typeof v.theme === 'string' ? v.theme.slice(0, 120) : v.theme,
  };
}, LlmCallSchema);

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
  // No keyterms: on near-silent clips they bias Saaras into "hearing" them.
  const stt = await timings.measure('stt', () =>
    sarvam.transcribe(audio, { languageCode: station.language, mode: station.sttMode, filename }),
  );
  const transcript = stt.transcript;
  const language = stt.languageCode ?? station.language;

  if (!/[\p{L}\p{N}]/u.test(transcript)) {
    const reply = toLine(station, 'rj', fallback.lineNotClear, 'rj_link');
    await annotate(sarvam, [reply], station.language, timings, { cache: true });
    return { transcript, language, intent: 'other', reply };
  }

  let llm: LlmCall;
  try {
    llm = await timings.measure('llm', () =>
      sarvam.chatJson(
        callMessages(station, { transcript, listener: meta.listener, nowPlaying: meta.nowPlaying }),
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
    llm = { intent: 'chat', reply: fallback.callThanks, theme: null };
  }

  const spoken = replyText(fillName(llm.reply, meta.listener.name), station);
  const reply = toLine(station, 'rj', spoken || cleanText(fallback.callThanks, station.language), 'rj_link');
  const source = (TRANSLATABLE.has(language) ? language : station.language) as TtsLanguage;
  const [transcriptEn] = await Promise.all([
    source === 'en-IN'
      ? Promise.resolve(undefined)
      : timings.measure('translate_caller', () => sarvam.translate(latinBrand(transcript), source).catch(() => undefined)),
    annotate(sarvam, [reply], station.language, timings),
  ]);

  const rawTheme = llm.theme?.trim() ?? '';
  const theme = llm.intent === 'story_request' && !/^(null|none|n\/a)?$/i.test(rawTheme) ? rawTheme : undefined;
  return { transcript, transcriptEn, language, intent: llm.intent, theme, reply };
}
