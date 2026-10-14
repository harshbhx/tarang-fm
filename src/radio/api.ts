/** Typed client for the Worker API (docs/TECH-SPEC.md §5). */
import type { CallMeta, SegmentRequest, TtsRequest } from '../../shared/schemas';
import { STUDIO_NUMBER } from '../../shared/constants';
import type {
  ApiError,
  CallResponse,
  ContextResponse,
  Line,
  PhoneRecentResponse,
  Segment,
  StationId,
} from '../../shared/types';

export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

async function errorFrom(res: Response): Promise<ApiRequestError> {
  let code = `http_${res.status}`;
  let message = `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as Partial<ApiError> | null;
    if (body?.error?.message) message = body.error.message;
    if (body?.error?.code) code = body.error.code;
  } catch {
    /* not a JSON error body */
  }
  return new ApiRequestError(message, code, res.status);
}

async function send(url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) throw await errorFrom(res);
  return res;
}

async function json<T>(url: string, init: RequestInit): Promise<T> {
  const res = await send(url, init);
  return (await res.json()) as T;
}

export async function getContext(station: StationId, signal?: AbortSignal): Promise<ContextResponse> {
  const ctx = await json<ContextResponse>(`/api/context?station=${encodeURIComponent(station)}`, { signal });
  return { ...ctx, headlines: Array.isArray(ctx.headlines) ? ctx.headlines : [] };
}

export async function getSegment(req: SegmentRequest, signal?: AbortSignal): Promise<Segment> {
  const segment = await json<Segment>('/api/segment', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });
  if (!segment || !Array.isArray(segment.lines)) {
    throw new ApiRequestError('Malformed segment response', 'bad_response', 200);
  }
  return segment;
}

/** Recent calls to the studio phone line (numbers arrive masked). */
export async function getPhoneRecent(signal?: AbortSignal): Promise<PhoneRecentResponse> {
  const res = await json<Partial<PhoneRecentResponse> | null>('/api/phone/recent', { signal });
  return {
    number: typeof res?.number === 'string' && res.number ? res.number : STUDIO_NUMBER,
    calls: Array.isArray(res?.calls) ? res.calls : [],
  };
}

/** Starts a streamed TTS request. The body is raw PCM (or WAV) for AudioEngine.playStream. */
export function ttsFetch(
  line: Pick<Line, 'speaker' | 'text' | 'pace' | 'temperature'>,
  station: StationId,
  signal?: AbortSignal,
): Promise<Response> {
  const body: TtsRequest = {
    station,
    speaker: line.speaker,
    text: line.text,
    pace: line.pace,
    temperature: line.temperature,
  };
  return send('/api/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}

export function audioFilename(mime: string): string {
  const type = mime.toLowerCase();
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) return 'call.mp4';
  if (type.includes('wav')) return 'call.wav';
  if (type.includes('ogg')) return 'call.ogg';
  return 'call.webm';
}

export function postCall(blob: Blob, meta: CallMeta, signal?: AbortSignal): Promise<CallResponse> {
  const form = new FormData();
  form.append('audio', blob, audioFilename(blob.type));
  form.append('station', meta.station);
  form.append('listener', JSON.stringify(meta.listener));
  if (meta.nowPlaying) form.append('nowPlaying', meta.nowPlaying);
  return json<CallResponse>('/api/call', { method: 'POST', body: form, signal });
}

/**
 * Drains the body as soon as the response arrives, so a prefetched line is fully buffered by
 * the time it plays, and reports when the first audio bytes landed (true TTS latency).
 */
export function readAhead(res: Response, onFirstChunk?: () => void): Response {
  const source = res.body;
  if (!source) return res;
  const reader = source.getReader();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        let first = true;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (cancelled) return;
            if (done) break;
            if (first) {
              first = false;
              onFirstChunk?.();
            }
            controller.enqueue(value);
          }
          controller.close();
        } catch (err) {
          if (!cancelled) controller.error(err);
        }
      })();
    },
    cancel(reason) {
      cancelled = true;
      return reader.cancel(reason);
    },
  });
  return new Response(stream, { status: res.status, statusText: res.statusText, headers: res.headers });
}
