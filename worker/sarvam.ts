/** Thin fetch client for the Sarvam REST APIs. See docs/TECH-SPEC.md §6. */
import type { z } from 'zod';
import { LLM_MODEL, STT_MODEL, TTS_MODEL, TTS_SAMPLE_RATE } from '../shared/constants';
import type { TtsLanguage } from '../shared/types';

const API = 'https://api.sarvam.ai';

export class SarvamError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'SarvamError';
  }

  get retryable(): boolean {
    return this.status === 429 || this.status >= 500 || this.status === 0;
  }
}

export interface TtsBody {
  text: string;
  language_code: TtsLanguage;
  speaker: string;
  pace: number;
  temperature: number;
  loudness?: number;
  pitch?: number;
}

export interface TtsStream {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  ttfbMs: number;
}

export interface Transcript {
  transcript: string;
  languageCode?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatJsonOptions {
  name: string;
  temperature: number;
  maxTokens: number;
  reasoningEffort: 'low' | 'medium' | 'high' | null;
  timeoutMs: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const backoff = (attempt: number) => 300 * 2 ** attempt * (0.5 + Math.random());

function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
}

/** Builds a SarvamError from a non-2xx response and logs its request_id. */
async function upstreamError(label: string, res: Response): Promise<SarvamError> {
  const raw = await res.text().catch(() => '');
  let message = raw.slice(0, 300) || res.statusText;
  let code = 'upstream_error';
  let requestId = res.headers.get('x-request-id') ?? undefined;
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string; code?: string; request_id?: string } };
    if (parsed.error) {
      message = parsed.error.message?.slice(0, 300) ?? message;
      code = parsed.error.code ?? code;
      requestId = parsed.error.request_id ?? requestId;
    }
  } catch {
    // Non-JSON error body; keep the raw text.
  }
  console.error(`[sarvam] ${label} ${res.status} code=${code} request_id=${requestId ?? '-'} ${message}`);
  return new SarvamError(message, res.status, code, requestId);
}

function networkError(label: string, err: unknown): SarvamError {
  if (isAbort(err)) {
    console.error(`[sarvam] ${label} timed out`);
    return new SarvamError(`${label} timed out`, 504, 'timeout');
  }
  console.error(`[sarvam] ${label} network error: ${String(err)}`);
  return new SarvamError(`${label} network error`, 0, 'network_error');
}

/** Runs `fn` and retries retryable SarvamErrors with jittered exponential backoff. */
async function withRetry<T>(retries: number, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof SarvamError) || !err.retryable || err.code === 'timeout' || attempt >= retries) throw err;
      await sleep(backoff(attempt));
    }
  }
}

/** Pulls the first JSON object out of a model reply that may be wrapped in prose or code fences. */
export function extractJson(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall through to block extraction.
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object in model output');
  return JSON.parse(trimmed.slice(start, end + 1));
}

export function createSarvam(apiKey: string) {
  const auth = { 'api-subscription-key': apiKey };

  /**
   * Streams Bulbul audio as raw 16-bit PCM. Retries 429/5xx (and empty bodies) up to twice,
   * only before the first audio byte reaches the caller.
   */
  async function ttsStream(input: TtsBody, opts: { signal?: AbortSignal; firstByteTimeoutMs?: number } = {}): Promise<TtsStream> {
    const t0 = Date.now();
    const payload = JSON.stringify({
      model: TTS_MODEL,
      ...input,
      speech_sample_rate: TTS_SAMPLE_RATE,
      output_audio_codec: 'linear16',
      enable_preprocessing: true,
    });

    return withRetry(2, async () => {
      const ctrl = new AbortController();
      const onAbort = () => ctrl.abort(opts.signal?.reason);
      opts.signal?.addEventListener('abort', onAbort);
      const timer = setTimeout(() => ctrl.abort(new DOMException('first byte timeout', 'TimeoutError')), opts.firstByteTimeoutMs ?? 10_000);
      const cleanup = () => {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onAbort);
      };

      let res: Response;
      try {
        res = await fetch(`${API}/text-to-speech/stream`, {
          method: 'POST',
          headers: { ...auth, 'Content-Type': 'application/json' },
          body: payload,
          signal: ctrl.signal,
        });
      } catch (err) {
        cleanup();
        throw networkError('tts', err);
      }
      if (!res.ok || !res.body) {
        cleanup();
        throw await upstreamError('tts', res);
      }

      const reader = res.body.getReader();
      let first: ReadableStreamReadResult<Uint8Array>;
      try {
        first = await reader.read();
      } catch (err) {
        cleanup();
        throw networkError('tts', err);
      }
      clearTimeout(timer);
      if (first.done || !first.value?.byteLength) {
        cleanup();
        console.error('[sarvam] tts returned an empty body');
        throw new SarvamError('empty audio stream', 502, 'empty_audio');
      }

      const head = first.value;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(head);
        },
        async pull(controller) {
          try {
            const { done, value } = await reader.read();
            if (done) {
              cleanup();
              controller.close();
            } else {
              controller.enqueue(value);
            }
          } catch (err) {
            cleanup();
            controller.error(err);
          }
        },
        cancel(reason) {
          cleanup();
          return reader.cancel(reason);
        },
      });
      return { body, contentType: res.headers.get('content-type') ?? 'audio/pcm', ttfbMs: Date.now() - t0 };
    });
  }

  /** Saaras speech-to-text (REST, ≤ 30 s of audio). */
  async function transcribe(
    file: Blob,
    opts: { languageCode: string; mode: string; filename?: string; keyterms?: string[]; timeoutMs?: number },
  ): Promise<Transcript> {
    return withRetry(1, async () => {
      const form = new FormData();
      form.append('file', file, opts.filename ?? 'call.webm');
      form.append('model', STT_MODEL);
      form.append('language_code', opts.languageCode);
      form.append('mode', opts.mode);
      if (opts.keyterms?.length) form.append('keyterms', JSON.stringify(opts.keyterms));

      let res: Response;
      try {
        res = await fetch(`${API}/speech-to-text`, {
          method: 'POST',
          headers: auth,
          body: form,
          signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
        });
      } catch (err) {
        throw networkError('stt', err);
      }
      if (!res.ok) throw await upstreamError('stt', res);
      const data = (await res.json()) as { transcript?: string; language_code?: string | null };
      return { transcript: (data.transcript ?? '').trim(), languageCode: data.language_code ?? undefined };
    });
  }

  /** Chat completion with structured output, validated against a zod schema. */
  async function chatJson<T>(
    messages: ChatMessage[],
    jsonSchema: Record<string, unknown>,
    zodSchema: z.ZodType<T>,
    opts: ChatJsonOptions,
  ): Promise<T> {
    const payload = JSON.stringify({
      model: LLM_MODEL,
      messages,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      reasoning_effort: opts.reasoningEffort,
      response_format: {
        type: 'json_schema',
        json_schema: { name: opts.name, schema: jsonSchema, strict: true },
      },
    });
    const signal = AbortSignal.timeout(opts.timeoutMs);

    const data = await withRetry(1, async () => {
      let res: Response;
      try {
        res = await fetch(`${API}/v1/chat/completions`, {
          method: 'POST',
          headers: { ...auth, 'Content-Type': 'application/json' },
          body: payload,
          signal,
        });
      } catch (err) {
        throw networkError('chat', err);
      }
      if (!res.ok) throw await upstreamError('chat', res);
      try {
        return (await res.json()) as {
          id?: string;
          choices?: { finish_reason?: string; message?: { content?: string | null } }[];
        };
      } catch (err) {
        throw networkError('chat', err);
      }
    });

    const choice = data.choices?.[0];
    const content = choice?.message?.content ?? '';
    if (!content.trim()) {
      console.error(`[sarvam] chat ${opts.name} empty content finish=${choice?.finish_reason ?? '-'} id=${data.id ?? '-'}`);
      throw new SarvamError('empty model output', 502, 'empty_output', data.id);
    }
    // finish=length: the model wrote until max_tokens (a loop, or a list with no end). The tail of the output
    // (model text only) shows where it ran on. A complete JSON object before the cap (trailing whitespace) still counts.
    const runaway = choice?.finish_reason === 'length';
    if (runaway) {
      // A whitespace loop leaves only blanks at the very end, so the tail is taken before the trailing whitespace
      const body = content.trimEnd();
      const tail = body.slice(-300).replace(/\s+/g, ' ');
      console.error(
        `[sarvam] chat ${opts.name} hit max_tokens=${opts.maxTokens} finish=length chars=${content.length} trailing_ws=${content.length - body.length} id=${data.id ?? '-'} tail: …${tail}`,
      );
    }
    let parsed: unknown;
    try {
      parsed = extractJson(content);
    } catch (err) {
      if (runaway) throw new SarvamError(`model output hit the ${opts.maxTokens}-token cap`, 502, 'output_truncated', data.id);
      console.error(`[sarvam] chat ${opts.name} bad JSON finish=${choice?.finish_reason ?? '-'} id=${data.id ?? '-'}: ${String(err)}`);
      throw new SarvamError('model output was not JSON', 502, 'invalid_output', data.id);
    }
    const result = zodSchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      console.error(`[sarvam] chat ${opts.name} schema mismatch id=${data.id ?? '-'}: ${issues}`);
      throw new SarvamError(`model output failed validation: ${issues}`, 502, 'invalid_output', data.id);
    }
    return result.data;
  }

  /** Script conversion (e.g. a Latin listener name into Devanagari) via Sarvam Transliterate. */
  async function transliterate(text: string, source: string, target: string, timeoutMs = 3000): Promise<string> {
    const payload = JSON.stringify({ input: text.slice(0, 200), source_language_code: source, target_language_code: target });
    const signal = AbortSignal.timeout(timeoutMs);
    return withRetry(1, async () => {
      let res: Response;
      try {
        res = await fetch(`${API}/transliterate`, {
          method: 'POST',
          headers: { ...auth, 'Content-Type': 'application/json' },
          body: payload,
          signal,
        });
      } catch (err) {
        throw networkError('transliterate', err);
      }
      if (!res.ok) throw await upstreamError('transliterate', res);
      const data = (await res.json()) as { transliterated_text?: string };
      const out = data.transliterated_text?.trim();
      if (!out) throw new SarvamError('empty transliteration', 502, 'empty_output');
      return out;
    });
  }

  return { ttsStream, transcribe, chatJson, transliterate };
}

export type Sarvam = ReturnType<typeof createSarvam>;
