import { Hono, type Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';
import { CALL_MAX_BYTES, STUDIO_NUMBER, TTS_SAMPLE_RATE } from '../shared/constants';
import { CallMetaSchema, PhoneAiredSchema, SegmentRequestSchema, StationIdSchema, TtsRequestSchema } from '../shared/schemas';
import { CAST_SPEAKERS, STATION_BY_ID } from '../shared/stations';
import type { CallResponse, PhoneCall, PhoneRecentResponse, Station } from '../shared/types';
import { audioFile, handleCall, startCall, type CallSubtitles } from './call';
import { getContext, getHeadlines, localNewsCity } from './context';
import { phoneHeadlines, toPhoneCall, tokenMatches } from './phone';
import { studioLine } from './studio';
import { createSarvam, SarvamError } from './sarvam';
import { capStream, maxPcmBytes } from './show';
import { kvShowMemory } from './memory';
import { buildSegment } from './segment';
import { Timings } from './timing';

type AppEnv = { Bindings: Env; Variables: { timings: Timings } };
type Ctx = Context<AppEnv>;

const app = new Hono<AppEnv>().basePath('/api');

function apiError(c: Ctx, status: ContentfulStatusCode, code: string, message: string) {
  return c.json({ error: { code, message } }, status, { 'Cache-Control': 'no-store' });
}

function issues(error: z.ZodError): string {
  return error.issues
    .slice(0, 4)
    .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
    .join('; ');
}

function upstreamFailure(c: Ctx, err: unknown, what: string) {
  if (err instanceof SarvamError) {
    if (err.status === 429) return apiError(c, 503, 'upstream_busy', `${what} is busy, try again shortly.`);
    if (err.code === 'timeout') return apiError(c, 504, 'upstream_timeout', `${what} timed out.`);
    return apiError(c, 502, 'upstream_error', `${what} failed (${err.status} ${err.code}).`);
  }
  console.error(`[api] ${what} failed: ${String(err)}`);
  return apiError(c, 500, 'internal_error', `${what} failed.`);
}

const NDJSON = 'application/x-ndjson';

/** Line 1: the call response. Line 2: {"subtitles": {...}} (empty if Translate failed). */
function ndjsonCall(response: CallResponse, subtitles: Promise<CallSubtitles>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(`${JSON.stringify(response)}\n`));
      const subs = await subtitles.catch(() => ({}));
      controller.enqueue(encoder.encode(`${JSON.stringify({ subtitles: subs })}\n`));
      controller.close();
    },
  });
}

/** The listener's country code from Cloudflare's edge, when known. */
function edgeCountry(request: Request): string | undefined {
  return (request as Request & { cf?: IncomingRequestCfProperties }).cf?.country || undefined;
}

function waitUntil(c: Ctx): ((p: Promise<unknown>) => void) | undefined {
  try {
    const ctx = c.executionCtx;
    return (p) => ctx.waitUntil(p);
  } catch {
    return undefined;
  }
}

app.use('*', async (c, next) => {
  const timings = new Timings();
  c.set('timings', timings);
  const t0 = Date.now();
  await next();
  timings.add('total', Date.now() - t0);
  try {
    c.res.headers.set('Server-Timing', timings.header());
  } catch {
    // Immutable headers (should not happen for our own responses).
  }
});

const rateLimit = (pick: (env: Partial<Env>) => RateLimit | undefined) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const binding = pick(c.env);
    if (binding) {
      const key = c.req.header('cf-connecting-ip') ?? 'local';
      try {
        const { success } = await binding.limit({ key });
        if (!success) {
          c.header('Retry-After', '60');
          return apiError(c, 429, 'rate_limited', 'Too many requests. Take a breath and try again in a minute.');
        }
      } catch (err) {
        console.error(`[api] rate limiter failed: ${String(err)}`);
      }
    }
    await next();
  });

const requireKey = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.env.SARVAM_API_KEY) return apiError(c, 500, 'not_configured', 'SARVAM_API_KEY is not set.');
  await next();
});

async function readJson(c: Ctx): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await c.req.json() };
  } catch {
    return { ok: false };
  }
}

function stationFor(id: string): Station | undefined {
  return STATION_BY_ID[id as Station['id']];
}

app.get('/health', (c) => c.json({ ok: true, sarvamKey: Boolean(c.env.SARVAM_API_KEY) }));

app.get('/context', async (c) => {
  const parsed = StationIdSchema.safeParse(c.req.query('station') ?? 'hi');
  const station = parsed.success ? stationFor(parsed.data) : undefined;
  if (!station) return apiError(c, 400, 'unknown_station', 'Unknown station.');
  const context = await c.var.timings.measure('news', () => getContext(c.req.raw, station, waitUntil(c)));
  return c.json(context, 200, { 'Cache-Control': 'private, no-store' });
});

app.post('/segment', rateLimit((e) => e.RL_SEGMENT), requireKey, async (c) => {
  const body = await readJson(c);
  if (!body.ok) return apiError(c, 400, 'invalid_json', 'Request body must be JSON.');
  const parsed = SegmentRequestSchema.safeParse(body.value);
  if (!parsed.success) return apiError(c, 400, 'invalid_request', issues(parsed.error));
  const station = stationFor(parsed.data.station);
  if (!station) return apiError(c, 400, 'unknown_station', 'That station is not on the dial yet.');

  // Studio calls are read once, ever: this RJ link gets only the calls nobody else has aired or is reading
  const holder = parsed.data.holder;
  let claimed: string[] = [];
  if (parsed.data.dedications?.length) {
    const wanted = parsed.data.dedications.map((d) => d.id);
    if (parsed.data.type === 'rj_link' && holder) claimed = await studioLine(c.env).claim(wanted, holder).catch(() => []);
    parsed.data.dedications = parsed.data.dedications.filter((d) => claimed.includes(d.id));
  }

  const sarvam = createSarvam(c.env.SARVAM_API_KEY);
  const origin = new URL(c.req.url).origin;
  const segment = await buildSegment(sarvam, station, parsed.data, c.var.timings, {
    fetchHeadlines: () => getHeadlines(station, origin, waitUntil(c), localNewsCity(parsed.data.listener.city, edgeCountry(c.req.raw))),
    // What this station already aired, for every listener, so stories and ads don't repeat
    memory: kvShowMemory(c.env.PHONE, waitUntil(c)),
  });
  // Calls the script left out go straight back in the queue
  const read = new Set(segment.fallback ? [] : (segment.dedicated ?? []));
  const unread = claimed.filter((id) => !read.has(id));
  if (holder && unread.length) waitUntil(c)?.(studioLine(c.env).release(unread, holder).catch(() => {}));
  return c.json(segment, 200, { 'Cache-Control': 'no-store' });
});

app.post('/tts', rateLimit((e) => e.RL_TTS), requireKey, async (c) => {
  const body = await readJson(c);
  if (!body.ok) return apiError(c, 400, 'invalid_json', 'Request body must be JSON.');
  const parsed = TtsRequestSchema.safeParse(body.value);
  if (!parsed.success) return apiError(c, 400, 'invalid_request', issues(parsed.error));
  const { speaker, text, pace, temperature, loudness, pitch } = parsed.data;
  const station = stationFor(parsed.data.station);
  if (!station) return apiError(c, 400, 'unknown_station', 'That station is not on the dial yet.');
  if (!CAST_SPEAKERS.has(speaker)) return apiError(c, 400, 'speaker_not_allowed', `Speaker ${speaker} is not in any station cast.`);

  try {
    const sarvam = createSarvam(c.env.SARVAM_API_KEY);
    const audio = await sarvam.ttsStream(
      { text, language_code: station.language, speaker, pace, temperature, ...(loudness !== undefined ? { loudness } : {}), ...(pitch !== undefined ? { pitch } : {}) },
      { signal: c.req.raw.signal },
    );
    c.var.timings.add('tts_ttfb', audio.ttfbMs);
    return new Response(capStream(audio.body, maxPcmBytes(text, pace)), {
      status: 200,
      headers: {
        'Content-Type': `audio/pcm;rate=${TTS_SAMPLE_RATE};bits=16;channels=1`,
        'X-Audio-Format': 'pcm',
        'X-Speaker': speaker,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return upstreamFailure(c, err, 'Speech synthesis');
  }
});

app.post('/call', rateLimit((e) => e.RL_CALL), requireKey, async (c) => {
  const length = Number(c.req.header('content-length') ?? 0);
  if (length > CALL_MAX_BYTES + 64 * 1024) return apiError(c, 413, 'audio_too_large', 'Recording is too large (max 2 MB).');

  let form: FormData;
  try {
    form = await c.req.raw.formData();
  } catch {
    return apiError(c, 400, 'invalid_form', 'Request body must be multipart/form-data.');
  }
  const audio = form.get('audio');
  if (!audio || typeof audio === 'string') return apiError(c, 400, 'missing_audio', 'Field "audio" must be a file.');
  if (audio.size === 0) return apiError(c, 400, 'empty_audio', 'The recording is empty.');
  if (audio.size > CALL_MAX_BYTES) return apiError(c, 413, 'audio_too_large', 'Recording is too large (max 2 MB).');

  let listener: unknown;
  try {
    listener = JSON.parse(String(form.get('listener') ?? ''));
  } catch {
    return apiError(c, 400, 'invalid_request', 'listener: must be a JSON string.');
  }
  const nowPlaying = form.get('nowPlaying');
  let showLog: unknown;
  try {
    const raw = form.get('showLog');
    showLog = typeof raw === 'string' && raw ? JSON.parse(raw) : undefined;
  } catch {
    showLog = undefined;
  }
  const parsed = CallMetaSchema.safeParse({
    station: form.get('station'),
    listener,
    nowPlaying: typeof nowPlaying === 'string' && nowPlaying.trim() ? nowPlaying.trim() : undefined,
    showLog,
  });
  if (!parsed.success) return apiError(c, 400, 'invalid_request', issues(parsed.error));
  const station = stationFor(parsed.data.station);
  if (!station) return apiError(c, 400, 'unknown_station', 'That station is not on the dial yet.');

  try {
    const sarvam = createSarvam(c.env.SARVAM_API_KEY);
    const file = audioFile(audio.type, audio.name);
    const blob = new Blob([await audio.arrayBuffer()], { type: file.type });
    // A streaming client gets the reply the moment it's written (one NDJSON line), and the subtitles as a second line.
    if (c.req.header('accept')?.includes(NDJSON)) {
      const { response, subtitles } = await startCall(sarvam, station, parsed.data, blob, file.name, c.var.timings);
      return new Response(ndjsonCall(response, subtitles), {
        status: 200,
        headers: { 'Content-Type': `${NDJSON}; charset=utf-8`, 'Cache-Control': 'no-store' },
      });
    }
    const result = await handleCall(sarvam, station, parsed.data, blob, file.name, c.var.timings);
    return c.json(result, 200, { 'Cache-Control': 'no-store' });
  } catch (err) {
    return upstreamFailure(c, err, 'Call-in');
  }
});

// ---- Studio phone line (Sarvam Voice Agents) ----------------------------------

/** Headlines for the phone RJ's news tool. */
app.get('/phone/headlines', rateLimit((e) => e.RL_SEGMENT), async (c) => {
  const parsed = StationIdSchema.safeParse(c.req.query('station') ?? 'hi');
  const station = parsed.success ? stationFor(parsed.data) : undefined;
  if (!station) return apiError(c, 400, 'unknown_station', 'Unknown station.');
  const city = c.req.query('city')?.trim().slice(0, 60) || undefined;
  const body = await phoneHeadlines(station, new URL(c.req.url).origin, city, waitUntil(c));
  return c.json(body, 200, { 'Cache-Control': 'no-store' });
});

/** Call-end webhook from the Sarvam deployment: keeps what the caller wants read on air. */
app.post('/phone/call-end', async (c) => {
  if (!tokenMatches(c.req.query('token'), c.env.PHONE_WEBHOOK_TOKEN)) return apiError(c, 401, 'unauthorized', 'Bad token.');
  const body = await readJson(c);
  if (!body.ok) return apiError(c, 400, 'invalid_json', 'Request body must be JSON.');
  const call = toPhoneCall(body.value);
  if (call) await studioLine(c.env).save(call);
  return c.json({ ok: true, stored: Boolean(call) }, 200);
});

/** Recent studio calls for the web show (numbers masked), each with when it was read on air. */
app.get('/phone/recent', async (c) => {
  const calls = await studioLine(c.env)
    .recent()
    .catch(() => [] as PhoneCall[]);
  return c.json({ number: STUDIO_NUMBER, calls } satisfies PhoneRecentResponse, 200, { 'Cache-Control': 'no-store' });
});

/** An RJ link has started reading these calls: they are marked as aired for every listener. */
app.post('/phone/aired', rateLimit((e) => e.RL_SEGMENT), async (c) => {
  const body = await readJson(c);
  if (!body.ok) return apiError(c, 400, 'invalid_json', 'Request body must be JSON.');
  const parsed = PhoneAiredSchema.safeParse(body.value);
  if (!parsed.success) return apiError(c, 400, 'invalid_request', issues(parsed.error));
  const { ids, holder, station } = parsed.data;
  const aired = await studioLine(c.env).markAired(ids, holder, station);
  return c.json({ aired }, 200, { 'Cache-Control': 'no-store' });
});

app.notFound((c) => apiError(c, 404, 'not_found', `No route for ${c.req.method} ${c.req.path}.`));

app.onError((err, c) => {
  console.error(`[api] unhandled: ${String(err)}`);
  return apiError(c, 500, 'internal_error', 'Something went wrong on our side.');
});

export default app;

/** Durable Object classes must be exported by the Worker's entry module. */
export { StudioLine } from './studio';
