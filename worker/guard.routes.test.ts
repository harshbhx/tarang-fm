/** The Worker's own entry, end to end in Node: what a browser on the site, a script, and another website each get from the paid routes. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAST_SPEAKERS } from '../shared/stations';
import worker from './index';
import { limitsFrom, SpendLedger, type Counters } from './ledger';

const SITE = 'https://tarang-fm.dualmindlab.tech';
const BROWSER = { 'cf-connecting-ip': '203.0.113.7', 'user-agent': 'Mozilla/5.0 Chrome/130.0.1' };
const SPEAKER = [...CAST_SPEAKERS][0]!;
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

function counters(): Counters {
  const n = new Map<string, number>();
  const flags = new Set<string>();
  return {
    get: (k) => n.get(k) ?? 0,
    add: (k, by) => n.set(k, (n.get(k) ?? 0) + by).get(k)!,
    sweep: () => {},
    getFlag: (f) => flags.has(f),
    setFlag: (f, on) => void (on ? flags.add(f) : flags.delete(f)),
  };
}

interface Setup {
  env: Record<string, unknown>;
  ledger: SpendLedger;
  limit: ReturnType<typeof vi.fn>;
  saved: unknown[];
}

function setup(extra: Record<string, unknown> = {}): Setup {
  const ledger = new SpendLedger(counters(), limitsFrom({ ...extra }));
  const open = () => ({ limit: vi.fn(async () => ({ success: true })) });
  const limit = vi.fn(async () => ({ success: true }));
  const saved: unknown[] = [];
  const env = {
    SARVAM_API_KEY: 'test-key',
    SESSION_SECRET: 'a-test-secret-that-is-long-enough',
    PHONE_WEBHOOK_TOKEN: 'phone-token-123',
    LIVE_ADMIN_TOKEN: 'admin-token-123',
    RL_SEGMENT: open(),
    RL_TTS: open(),
    RL_CALL: open(),
    RL_MINT: open(),
    RL_ADMIN: open(),
    RL_SESSION: { limit },
    SPEND: {
      idFromName: () => 'spend',
      get: () => ({
        charge: async (kind: never, units: number, ip: string) => ledger.charge(kind, units, ip),
        status: async () => ledger.status(),
        setPaused: async (p: boolean) => ledger.setPaused(p),
      }),
    },
    STUDIO: { idFromName: () => 'studio', get: () => ({ save: async (call: unknown) => void saved.push(call) }) },
    LIVE: { idFromName: () => 'live', get: () => ({ fetch: async () => new Response('{"state":"sleeping"}') }) },
    ...extra,
  };
  return { env, ledger, limit, saved };
}

function call(env: Record<string, unknown>, path: string, init: RequestInit & { headers?: Record<string, string> } = {}): Promise<Response> {
  return worker.fetch(new Request(`${SITE}${path}`, init), env as unknown as Env, ctx) as Promise<Response>;
}

async function mint(env: Record<string, unknown>): Promise<string> {
  const res = await call(env, '/api/session', { method: 'POST', headers: { ...BROWSER, origin: SITE } });
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

function ttsInit(token: string | undefined, text = 'नमस्ते दोस्तों', origin: string | undefined = SITE): RequestInit {
  return {
    method: 'POST',
    headers: {
      ...BROWSER,
      'content-type': 'application/json',
      ...(origin ? { origin } : {}),
      ...(token ? { 'x-tarang-session': token } : {}),
    },
    body: JSON.stringify({ station: 'hi', speaker: SPEAKER, text, pace: 1, temperature: 0.6 }),
  };
}

let upstream: ReturnType<typeof vi.fn>;
beforeEach(() => {
  upstream = vi.fn(async () => new Response(new Uint8Array(4000), { status: 200 }));
  vi.stubGlobal('fetch', upstream);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('paid routes refuse anything but the site with a live session', () => {
  const paid: [string, string, RequestInit?][] = [
    ['POST', '/api/tts'],
    ['POST', '/api/segment'],
    ['POST', '/api/call'],
    ['GET', '/api/context?station=hi'],
    ['GET', '/api/live/hi/ws'],
    ['GET', '/api/live/hi/now'],
    ['GET', '/api/live/hi/audio/line-1'],
    ['GET', '/api/phone/recent'],
    ['POST', '/api/phone/aired'],
  ];

  it.each(paid)('%s %s: no Origin (a bare script) gets 403 and spends nothing', async (method, path) => {
    const { env } = setup();
    const res = await call(env, path, { method, headers: BROWSER, body: method === 'POST' ? '{}' : undefined });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('forbidden_origin');
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each(paid)('%s %s: a foreign website gets 403 and no CORS grant', async (method, path) => {
    const { env } = setup();
    const res = await call(env, path, { method, headers: { ...BROWSER, origin: 'https://evil.example' }, body: method === 'POST' ? '{}' : undefined });
    expect(res.status).toBe(403);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it.each(paid)('%s %s: the right Origin without a session gets 401', async (method, path) => {
    const { env } = setup();
    const res = await call(env, path, { method, headers: { ...BROWSER, origin: SITE }, body: method === 'POST' ? '{}' : undefined });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('session_missing');
  });

  it('a forged or foreign-network session gets 401, and never reaches Sarvam', async () => {
    const { env } = setup();
    expect((await call(env, '/api/tts', ttsInit('abc.def'))).status).toBe(401);
    const token = await mint(env);
    const elsewhere = ttsInit(token) as { headers: Record<string, string> };
    elsewhere.headers['cf-connecting-ip'] = '198.51.100.9';
    const res = await call(env, '/api/tts', elsewhere);
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('session_mismatch');
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe('the real user flow keeps working', () => {
  it('mints a session and speaks through /api/tts', async () => {
    const { env } = setup();
    const token = await mint(env);
    const res = await call(env, '/api/tts', ttsInit(token));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-audio-format')).toBe('pcm');
    expect(res.headers.get('access-control-allow-origin')).toBe(SITE);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('accepts a same-origin browser GET that carries only fetch metadata', async () => {
    const { env } = setup();
    const token = await mint(env);
    const res = await call(env, '/api/live/hi/now', { headers: { ...BROWSER, 'sec-fetch-site': 'same-origin', 'x-tarang-session': token } });
    expect(res.status).toBe(200);
  });

  it('takes the session as ?t= for the WebSocket route (it still needs an upgrade)', async () => {
    const { env } = setup();
    const token = await mint(env);
    const res = await call(env, `/api/live/hi/ws?t=${encodeURIComponent(token)}`, { headers: { ...BROWSER, origin: SITE } });
    expect(res.status).toBe(426);
  });

  it('keeps health and the CORS preflight for the site', async () => {
    const { env } = setup();
    expect((await call(env, '/api/health')).status).toBe(200);
    const ok = await call(env, '/api/tts', { method: 'OPTIONS', headers: { origin: SITE, 'access-control-request-method': 'POST' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe(SITE);
    const evil = await call(env, '/api/tts', { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('input caps', () => {
  it('rejects over-long speech and oversized bodies before any spend', async () => {
    const { env, ledger } = setup();
    const token = await mint(env);
    expect((await call(env, '/api/tts', ttsInit(token, 'x'.repeat(301)))).status).toBe(400);
    const huge = { ...ttsInit(token), body: JSON.stringify({ junk: 'x'.repeat(200_000) }) };
    expect((await call(env, '/api/tts', huge)).status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
    expect(ledger.status().used.tts_chars).toBe(0);
  });

  it('requires a declared length for call-in audio and caps it', async () => {
    const { env } = setup();
    const token = await mint(env);
    const headers = { ...BROWSER, origin: SITE, 'x-tarang-session': token, 'content-length': String(5 * 1024 * 1024) };
    expect((await call(env, '/api/call', { method: 'POST', headers, body: 'x' })).status).toBe(413);
  });
});

describe('rate limits and the daily budget', () => {
  it('a per-session limit answers 429', async () => {
    const { env, limit } = setup();
    const token = await mint(env);
    limit.mockResolvedValueOnce({ success: false });
    const res = await call(env, '/api/tts', ttsInit(token));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
    expect(upstream).not.toHaveBeenCalled();
  });

  it('a per-IP limit answers 429 on minting too', async () => {
    const { env } = setup();
    (env.RL_MINT as { limit: ReturnType<typeof vi.fn> }).limit.mockResolvedValueOnce({ success: false });
    const res = await call(env, '/api/session', { method: 'POST', headers: { ...BROWSER, origin: SITE } });
    expect(res.status).toBe(429);
  });

  it('degrades to a friendly message when the site-wide budget is gone', async () => {
    const { env } = setup({ BUDGET_TTS_CHARS_DAY: '10' });
    const token = await mint(env);
    const res = await call(env, '/api/tts', ttsInit(token, 'this line is longer than ten characters'));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('budget_exhausted');
    expect(body.error.message).toMatch(/back at midnight/);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('a single visitor hits their own allowance first (429), others still get through', async () => {
    const { env } = setup({ BUDGET_TTS_CHARS_IP_DAY: '30' });
    const token = await mint(env);
    expect((await call(env, '/api/tts', ttsInit(token, 'a'.repeat(25)))).status).toBe(200);
    const second = await call(env, '/api/tts', ttsInit(token, 'a'.repeat(25)));
    expect(second.status).toBe(429);
    expect(((await second.json()) as { error: { code: string } }).error.code).toBe('budget_exhausted');
    const other = ttsInit(token, 'a'.repeat(25)) as { headers: Record<string, string> };
    other.headers['cf-connecting-ip'] = '203.0.113.99'; // same /24, so the same session, but a different caller address
    expect((await call(env, '/api/tts', other)).status).toBe(200);
  });

  it('the kill switch stops paid calls at once, and the owner can lift it', async () => {
    const { env } = setup();
    const token = await mint(env);
    const admin = { authorization: 'Bearer admin-token-123', 'content-type': 'application/json' };
    expect((await call(env, '/api/admin/spend', { method: 'POST', headers: admin, body: '{"paused":true}' })).status).toBe(200);
    const paused = await call(env, '/api/tts', ttsInit(token));
    expect(paused.status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
    await call(env, '/api/admin/spend', { method: 'POST', headers: admin, body: '{"paused":false}' });
    expect((await call(env, '/api/tts', ttsInit(token))).status).toBe(200);
  });

  it('joining the live show spends a budget unit too', async () => {
    const { env } = setup({ BUDGET_LIVE_JOINS_DAY: '0' });
    const token = await mint(env);
    const res = await call(env, '/api/live/hi/ws', { headers: { ...BROWSER, origin: SITE, upgrade: 'websocket', 'x-tarang-session': token } });
    expect(res.status).toBe(503);
  });
});

describe('admin routes and the phone line', () => {
  it('admin routes need the bearer key', async () => {
    const { env } = setup();
    for (const [method, path] of [['POST', '/api/live/hi/control'], ['POST', '/api/news/refresh'], ['GET', '/api/news/status'], ['GET', '/api/admin/spend'], ['POST', '/api/admin/spend']] as const) {
      expect((await call(env, path, { method })).status, path).toBe(401);
      expect((await call(env, path, { method, headers: { authorization: 'Bearer wrong' } })).status, path).toBe(401);
    }
    expect((await call(env, '/api/admin/spend', { headers: { authorization: 'Bearer admin-token-123' } })).status).toBe(200);
  });

  it('the call-end webhook keeps working with its token, from a server with no browser headers', async () => {
    const { env, saved } = setup();
    const payload = JSON.stringify({ interaction_id: 'call-1', user_phone_number: '+917000011111', output_agent_variables: { on_air_message: 'Play a song for Asha', request_type: 'dedication' } });
    const bad = await call(env, '/api/phone/call-end?token=nope', { method: 'POST', body: payload });
    expect(bad.status).toBe(401);
    const good = await call(env, '/api/phone/call-end?token=phone-token-123', { method: 'POST', body: payload });
    expect(good.status).toBe(200);
    expect(saved).toHaveLength(1);
    const huge = await call(env, '/api/phone/call-end?token=phone-token-123', { method: 'POST', body: 'x'.repeat(200_000) });
    expect(huge.status).toBe(413);
  });

  it('phone headlines stay open for the voice agent, and can be locked with PHONE_HEADLINES_REQUIRE_TOKEN', async () => {
    upstream.mockResolvedValue(new Response('<rss></rss>', { status: 200 }));
    const open = setup();
    expect((await call(open.env, '/api/phone/headlines?station=hi')).status).toBe(200);
    const locked = setup({ PHONE_HEADLINES_REQUIRE_TOKEN: '1' });
    expect((await call(locked.env, '/api/phone/headlines?station=hi')).status).toBe(401);
    expect((await call(locked.env, '/api/phone/headlines?station=hi&token=phone-token-123')).status).toBe(200);
  });
});

describe('session issue', () => {
  it('fails closed (503) when SESSION_SECRET is not set on a deployed host', async () => {
    const { env } = setup({ SESSION_SECRET: undefined });
    const res = await call(env, '/api/session', { method: 'POST', headers: { ...BROWSER, origin: SITE } });
    expect(res.status).toBe(503);
  });

  it('is refused from other origins', async () => {
    const { env } = setup();
    expect((await call(env, '/api/session', { method: 'POST', headers: { ...BROWSER, origin: 'https://evil.example' } })).status).toBe(403);
    expect((await call(env, '/api/session', { method: 'POST', headers: BROWSER })).status).toBe(403);
  });

  it('asks for Turnstile when it is switched on, and issues the token once it is solved', async () => {
    const { env } = setup({ TURNSTILE_SECRET_KEY: 'ts-secret', TURNSTILE_SITE_KEY: 'site-key' });
    const headers = { ...BROWSER, origin: SITE, 'content-type': 'application/json' };
    const first = await call(env, '/api/session', { method: 'POST', headers, body: '{}' });
    expect(first.status).toBe(403);
    expect(await first.json()).toMatchObject({ error: { code: 'challenge_required' }, siteKey: 'site-key' });
    upstream.mockResolvedValueOnce(Response.json({ success: true }));
    const solved = await call(env, '/api/session', { method: 'POST', headers, body: JSON.stringify({ turnstile: 'solved-token' }) });
    expect(solved.status).toBe(200);
    expect(upstream).toHaveBeenCalledWith('https://challenges.cloudflare.com/turnstile/v0/siteverify', expect.objectContaining({ method: 'POST' }));
    upstream.mockResolvedValueOnce(Response.json({ success: false }));
    const failed = await call(env, '/api/session', { method: 'POST', headers, body: JSON.stringify({ turnstile: 'bad' }) });
    expect(failed.status).toBe(403);
  });
});
