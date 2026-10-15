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
import type { LiveStation } from './live/station';
import { kvShowMemory } from './memory';
import { STATE_NAMES, stateCodeOf } from './news/catalog';
import { newsroomHeadlines, scheduledNews, startRefresh } from './news/newsroom';
import type { NewsRefreshParams } from './news/workflow';
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

/** Line 1: the call response. Line 2: {"subtitles": {...}}, sent right after it (empty when subtitles are off). */
function ndjsonCall(response: CallResponse, subtitles: CallSubtitles): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`${JSON.stringify(response)}\n`));
      controller.enqueue(encoder.encode(`${JSON.stringify({ subtitles })}\n`));
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

/** A bulletin's mode from the clock; anything else is a full bulletin. */
function newsMode(mode: string | undefined): 'full' | 'update' {
  return mode === 'update' ? 'update' : 'full';
}

/** The listener's city and state for local news: the client's (from the edge at tune-in), else this request's edge. India only. */
function newsPlace(request: Request, listener: { city?: string; region?: string }): { city?: string; regionCode?: string; regionName?: string } {
  const cf = (request as Request & { cf?: IncomingRequestCfProperties }).cf;
  const country = cf?.country;
  if (country && country.toUpperCase() !== 'IN') return {};
  return {
    city: listener.city || cf?.city || undefined,
    regionName: listener.region || undefined,
    regionCode: listener.region ? undefined : (cf?.regionCode as string | undefined) || undefined,
  };
}

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
  // The bulletin's state cue needs a state name: take it from the edge when the client sent none
  if (parsed.data.type === 'news' && !parsed.data.listener.region) {
    const code = stateCodeOf(newsPlace(c.req.raw, parsed.data.listener).regionCode);
    const name = code ? STATE_NAMES[code]?.en : undefined;
    if (name) parsed.data.listener.region = name;
  }
  const segment = await buildSegment(sarvam, station, parsed.data, c.var.timings, {
    // The newsroom's slate for this listener (never a story this session heard); live headlines while its pool fills
    fetchHeadlines: async () => {
      const slate = await newsroomHeadlines(c.env, { station, mode: newsMode(parsed.data.mode), ...newsPlace(c.req.raw, parsed.data.listener), airedNews: parsed.data.airedNews, waitUntil: waitUntil(c) });
      return slate.length ? slate : getHeadlines(station, origin, waitUntil(c), localNewsCity(parsed.data.listener.city, edgeCountry(c.req.raw)));
    },
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
  const subtitles = form.get('subtitles');
  const parsed = CallMetaSchema.safeParse({
    station: form.get('station'),
    listener,
    nowPlaying: typeof nowPlaying === 'string' && nowPlaying.trim() ? nowPlaying.trim() : undefined,
    showLog,
    subtitles: subtitles === 'true' || subtitles === '1',
  });
  if (!parsed.success) return apiError(c, 400, 'invalid_request', issues(parsed.error));
  const station = stationFor(parsed.data.station);
  if (!station) return apiError(c, 400, 'unknown_station', 'That station is not on the dial yet.');

  try {
    const sarvam = createSarvam(c.env.SARVAM_API_KEY);
    const file = audioFile(audio.type, audio.name);
    const blob = new Blob([await audio.arrayBuffer()], { type: file.type });
    // A streaming client gets the reply as one NDJSON line, then its subtitles (written with it) as a second line.
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

// ---- Listen together (one shared show per station, see shared/live.ts) ----------------------------

const LINE_ID = /^[A-Za-z0-9-]{1,64}$/;

/** The station's Durable Object, or undefined for a station not on the dial. */
function liveStation(c: Ctx): DurableObjectStub<LiveStation> | undefined {
  const station = stationFor(c.req.param('station') ?? '');
  return station ? c.env.LIVE.get(c.env.LIVE.idFromName(station.id)) : undefined;
}

app.get('/live/:station/ws', async (c) => {
  const stub = liveStation(c);
  if (!stub) return apiError(c, 404, 'unknown_station', 'That station is not on the dial yet.');
  if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') return apiError(c, 426, 'upgrade_required', 'Expected a WebSocket upgrade.');
  return stub.fetch(c.req.raw);
});

/** A line's speech (immutable): the edge cache first, then the station. */
app.get('/live/:station/audio/:lineId', async (c) => {
  const stub = liveStation(c);
  if (!stub) return apiError(c, 404, 'unknown_station', 'That station is not on the dial yet.');
  if (!LINE_ID.test(c.req.param('lineId'))) return apiError(c, 404, 'not_found', 'No audio for that line.');
  const url = new URL(c.req.url);
  const key = new Request(`${url.origin}${url.pathname}`);
  const cache = typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default : undefined;
  const hit = await cache?.match(key).catch(() => undefined);
  if (hit) return new Response(hit.body, hit);
  const res = await stub.fetch(c.req.raw);
  if (!res.ok) return new Response(res.body, res);
  const out = new Response(res.body, res);
  if (cache) {
    const put = cache.put(key, out.clone()).catch((err: unknown) => console.error(`[api] live audio cache write failed: ${String(err)}`));
    const wait = waitUntil(c);
    if (wait) wait(put);
  }
  return out;
});

/** Studio switch: start or stop a station's shared show (owner only, bearer admin key). */
app.post('/live/:station/control', async (c) => {
  const stub = liveStation(c);
  if (!stub) return apiError(c, 404, 'unknown_station', 'That station is not on the dial yet.');
  const auth = c.req.header('authorization') ?? '';
  const given = auth.startsWith('Bearer ') ? auth.slice(7).trim() : undefined;
  if (!tokenMatches(given, c.env.LIVE_ADMIN_TOKEN)) return apiError(c, 401, 'unauthorized', 'Wrong admin key.');
  const res = await stub.fetch(c.req.raw);
  return new Response(res.body, res);
});

app.get('/live/:station/now', async (c) => {
  const stub = liveStation(c);
  if (!stub) return apiError(c, 404, 'unknown_station', 'That station is not on the dial yet.');
  const res = await stub.fetch(c.req.raw);
  return new Response(res.body, res);
});

// ---- Newsroom admin (owner only, bearer admin key) ----------------------------------------------

function isAdmin(c: Ctx): boolean {
  const auth = c.req.header('authorization') ?? '';
  return tokenMatches(auth.startsWith('Bearer ') ? auth.slice(7).trim() : undefined, c.env.LIVE_ADMIN_TOKEN);
}

/** Starts a newsroom refresh now: {station, kind: refresh|topup|local|process, state?, city?}. */
app.post('/news/refresh', async (c) => {
  if (!isAdmin(c)) return apiError(c, 401, 'unauthorized', 'Wrong admin key.');
  const body = await readJson(c);
  const v = (body.ok ? body.value : {}) as Partial<NewsRefreshParams>;
  if (!v.station || !['hi', 'mr', 'ta', 'bn', 'gu'].includes(v.station) || !['refresh', 'topup', 'local', 'process'].includes(v.kind ?? '')) {
    return apiError(c, 400, 'invalid_request', 'station (hi|mr|ta|bn|gu) and kind (refresh|topup|local|process) are required.');
  }
  const id = await startRefresh(c.env, { station: v.station, kind: v.kind!, state: v.state?.slice(0, 2), city: v.city?.slice(0, 40) });
  return id ? c.json({ id }, 202) : apiError(c, 502, 'workflow_failed', 'Could not start the refresh.');
});

/** Pool health: refresh rows, feed results from the edge, and unaired stories per bucket. */
app.get('/news/status', async (c) => {
  if (!isAdmin(c)) return apiError(c, 401, 'unauthorized', 'Wrong admin key.');
  const db = c.env.NEWS_DB;
  const [refresh, feeds, pool] = await Promise.all([
    db.prepare('SELECT * FROM news_refresh ORDER BY scope').all(),
    db.prepare('SELECT feed_id, pool, ok, status, items, kept, ms, error, checked_at FROM news_feed ORDER BY pool, feed_id').all(),
    db.prepare('SELECT pool, bucket, COUNT(*) AS items, COUNT(DISTINCT cluster_id) AS stories, SUM(tagged) AS tagged, SUM(embedded) AS embedded FROM news_item WHERE expires_at > ? GROUP BY pool, bucket').bind(Date.now()).all(),
  ]);
  return c.json({ refresh: refresh.results, feeds: feeds.results, pool: pool.results }, 200, { 'Cache-Control': 'no-store' });
});

app.notFound((c) => apiError(c, 404, 'not_found', `No route for ${c.req.method} ${c.req.path}.`));

app.onError((err, c) => {
  console.error(`[api] unhandled: ${String(err)}`);
  return apiError(c, 500, 'internal_error', 'Something went wrong on our side.');
});

export { LiveStation } from './live/station';
export { NewsRefresh } from './news/workflow';

export default {
  fetch: app.fetch,
  /** Every 3 hours: refresh a station's news pool only if it was consumed (see worker/news/policy.ts). */
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(scheduledNews(env).then((ids) => console.log(`[news] cron started ${ids.length} refresh(es)`)));
  },
} satisfies ExportedHandler<Env>;

/** Durable Object classes must be exported by the Worker's entry module. */
export { StudioLine } from './studio';
