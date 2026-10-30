import { describe, expect, it, vi } from 'vitest';
import { checkOrigin, ipPrefix, issueSession, rateKey, readLimitedText, uaFamily, verifySession, verifyTurnstile } from './guard';

const SECRET = 'a-test-secret-that-is-long-enough';
const SITE = 'https://tarang-fm.dualmindlab.tech';
const env = { SESSION_SECRET: SECRET };

function req(path: string, headers: Record<string, string> = {}, base = SITE): Request {
  return new Request(`${base}${path}`, { method: 'POST', headers });
}

describe('checkOrigin', () => {
  it('accepts the site by Origin', () => {
    expect(checkOrigin(req('/api/tts', { origin: SITE }), env).ok).toBe(true);
    expect(checkOrigin(req('/api/tts', { origin: SITE, 'sec-fetch-site': 'same-origin' }), env).ok).toBe(true);
  });
  it('refuses other origins, the literal "null" origin and bad Origin values', () => {
    for (const origin of ['https://evil.example', 'null', 'not a url', 'https://tarang-fm.dualmindlab.tech.evil.example', 'http://tarang-fm.dualmindlab.tech']) {
      expect(checkOrigin(req('/api/tts', { origin }), env).ok, origin).toBe(false);
    }
  });
  it('refuses cross-site fetch metadata even with the right Origin', () => {
    expect(checkOrigin(req('/api/tts', { origin: SITE, 'sec-fetch-site': 'cross-site' }), env).ok).toBe(false);
    expect(checkOrigin(req('/api/tts', { origin: SITE, 'sec-fetch-site': 'same-site' }), env).ok).toBe(false);
  });
  it('falls back to Referer, then to same-origin fetch metadata, and otherwise refuses', () => {
    expect(checkOrigin(req('/api/context', { referer: `${SITE}/listen` }), env).ok).toBe(true);
    expect(checkOrigin(req('/api/context', { referer: 'https://evil.example/x' }), env).ok).toBe(false);
    expect(checkOrigin(req('/api/context', { 'sec-fetch-site': 'same-origin' }), env).ok).toBe(true);
    expect(checkOrigin(req('/api/context'), env).ok).toBe(false);
  });
  it('allows loopback only when the Worker itself runs on loopback, and extra origins from ALLOWED_ORIGINS', () => {
    const local = 'http://localhost:5173';
    expect(checkOrigin(req('/api/tts', { origin: local }, local), env).ok).toBe(true);
    expect(checkOrigin(req('/api/tts', { origin: local }), env).ok).toBe(false);
    const preview = 'https://tarang-fm.me.workers.dev';
    expect(checkOrigin(req('/api/tts', { origin: preview }), env).ok).toBe(false);
    expect(checkOrigin(req('/api/tts', { origin: preview }), { ...env, ALLOWED_ORIGINS: `${preview}, https://x.example` }).ok).toBe(true);
  });
});

describe('client identity', () => {
  it('binds IPv4 to the /24 and IPv6 to the /48, and rate-limits IPv6 by /64', () => {
    expect(ipPrefix('203.0.113.77')).toBe(ipPrefix('203.0.113.9'));
    expect(ipPrefix('203.0.113.77')).not.toBe(ipPrefix('203.0.114.77'));
    expect(ipPrefix('2001:db8:1:2::1')).toBe(ipPrefix('2001:db8:1:ffff:aaaa::2'));
    expect(ipPrefix('2001:db8:1::1')).not.toBe(ipPrefix('2001:db8:2::1'));
    expect(rateKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe(rateKey('2001:db8:1:2::9'));
    expect(rateKey('2001:db8:1:3::9')).not.toBe(rateKey('2001:db8:1:2::9'));
    expect(rateKey('203.0.113.7')).toBe('203.0.113.7');
  });
  it('ignores browser version numbers', () => {
    expect(uaFamily('Mozilla/5.0 Chrome/130.0.1 Safari/537.36')).toBe(uaFamily('Mozilla/5.0 Chrome/131.2.9 Safari/537.36'));
    expect(uaFamily('Mozilla/5.0 Chrome/130.0.1')).not.toBe(uaFamily('Mozilla/5.0 Firefox/130.0.1'));
  });
});

describe('session tokens', () => {
  const headers = { 'cf-connecting-ip': '203.0.113.7', 'user-agent': 'Mozilla/5.0 Chrome/130.0.1', origin: SITE };

  it('round-trips for the same network and browser', async () => {
    const session = await issueSession(req('/api/session', headers), env);
    expect(session).toBeDefined();
    const same = { ...headers, 'cf-connecting-ip': '203.0.113.200', 'user-agent': 'Mozilla/5.0 Chrome/131.0.0' };
    const verdict = await verifySession(session!.token, req('/api/tts', same), env);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.claims.sid).toBe(session!.claims.sid);
  });
  it('gives every session its own id', async () => {
    const a = await issueSession(req('/api/session', headers), env);
    const b = await issueSession(req('/api/session', headers), env);
    expect(a!.claims.sid).not.toBe(b!.claims.sid);
  });
  it('expires', async () => {
    const t0 = Date.now();
    const session = await issueSession(req('/api/session', headers), { ...env, SESSION_TTL_SECONDS: '120' }, t0);
    expect((await verifySession(session!.token, req('/api/tts', headers), env, t0 + 100_000)).ok).toBe(true);
    expect(await verifySession(session!.token, req('/api/tts', headers), env, t0 + 121_000)).toEqual({ ok: false, code: 'session_expired' });
  });
  it('is bound to the network and the browser', async () => {
    const session = await issueSession(req('/api/session', headers), env);
    const otherNet = await verifySession(session!.token, req('/api/tts', { ...headers, 'cf-connecting-ip': '198.51.100.7' }), env);
    expect(otherNet).toEqual({ ok: false, code: 'session_mismatch' });
    const otherBrowser = await verifySession(session!.token, req('/api/tts', { ...headers, 'user-agent': 'curl/8.5.0' }), env);
    expect(otherBrowser).toEqual({ ok: false, code: 'session_mismatch' });
  });
  it('rejects missing, tampered, truncated and differently-signed tokens', async () => {
    const session = await issueSession(req('/api/session', headers), env);
    const [payload, sig] = session!.token.split('.');
    const forgedClaims = btoa(JSON.stringify({ ...session!.claims, exp: session!.claims.exp + 99999 })).replace(/=+$/, '');
    expect((await verifySession(undefined, req('/api/tts', headers), env)).ok).toBe(false);
    for (const token of ['', 'abc', `${payload}.`, `${forgedClaims}.${sig}`, `${payload}.${sig}x`, `${payload}.${sig}.extra`, 'a'.repeat(2000)]) {
      const verdict = await verifySession(token, req('/api/tts', headers), env);
      expect(verdict.ok, token.slice(0, 20)).toBe(false);
    }
    const other = await verifySession(session!.token, req('/api/tts', headers), { SESSION_SECRET: 'a-different-secret-entirely-xx' });
    expect(other).toEqual({ ok: false, code: 'session_invalid' });
  });
  it('fails closed on a deployed host without a secret, but works on loopback for local dev', async () => {
    expect(await issueSession(req('/api/session', headers), {})).toBeUndefined();
    expect(await verifySession('x.y', req('/api/tts', headers), {})).toEqual({ ok: false, code: 'not_configured' });
    expect(await issueSession(req('/api/session', headers, 'http://localhost:8787'), {})).toBeDefined();
    // a short secret does not count as configured
    expect(await issueSession(req('/api/session', headers), { SESSION_SECRET: 'short' })).toBeUndefined();
  });
});

describe('verifyTurnstile', () => {
  it('is a no-op when Turnstile is not configured', async () => {
    expect(await verifyTurnstile(undefined, '1.2.3.4', {})).toBe(true);
  });
  it('needs a token and Cloudflare saying success', async () => {
    const ok = vi.fn(async () => Response.json({ success: true }));
    const no = vi.fn(async () => Response.json({ success: false }));
    const env = { TURNSTILE_SECRET_KEY: 'secret' };
    expect(await verifyTurnstile(undefined, '1.2.3.4', env, ok as unknown as typeof fetch)).toBe(false);
    expect(ok).not.toHaveBeenCalled();
    expect(await verifyTurnstile('tok', '1.2.3.4', env, ok as unknown as typeof fetch)).toBe(true);
    expect(await verifyTurnstile('tok', '1.2.3.4', env, no as unknown as typeof fetch)).toBe(false);
    const boom = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await verifyTurnstile('tok', '1.2.3.4', env, boom as unknown as typeof fetch)).toBe(false);
  });
});

describe('readLimitedText', () => {
  it('reads a small body', async () => {
    const r = new Request(SITE, { method: 'POST', body: '{"a":1}' });
    expect(await readLimitedText(r, 100)).toEqual({ ok: true, text: '{"a":1}' });
  });
  it('refuses a body over the cap, declared or streamed', async () => {
    const big = 'x'.repeat(500);
    expect(await readLimitedText(new Request(SITE, { method: 'POST', body: big }), 100)).toEqual({ ok: false, status: 413 });
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(big));
        c.close();
      },
    });
    const undeclared = new Request(SITE, { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
    undeclared.headers.delete('content-length');
    expect(await readLimitedText(undeclared, 100)).toEqual({ ok: false, status: 413 });
  });
});
