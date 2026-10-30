/**
 * Abuse protection for every route that spends money (Sarvam TTS / STT / LLM, Workers AI, the live show).
 *
 * Layers, cheapest first (see docs/SECURITY.md for the threat model):
 *   1. Browser origin check: Origin / Referer / Sec-Fetch-Site must be this site's own. A browser cannot lie
 *      about these, but curl can, so this only stops other websites and casual use, not a determined script.
 *   2. A short-lived signed session token (HMAC-SHA256) issued by POST /api/session and required on every paid route.
 *      It is loosely bound to the caller's network (IPv4 /24, IPv6 /48) and browser family, and every token
 *      carries a session id so rate limits and budgets can follow the session.
 *   3. Per-IP and per-session rate limits (Workers rate limiting bindings) in index.ts.
 *   4. A daily budget with a kill switch (worker/spend.ts) that makes the site degrade with a friendly message.
 *   5. Input size caps (schemas, body limits).
 *   6. Optional Cloudflare Turnstile on token issue (opt in with TURNSTILE_SECRET_KEY).
 */

export const SESSION_HEADER = 'x-tarang-session';
/** The site itself. Local dev and previews are allowed through ALLOWED_ORIGINS or the loopback rule below. */
export const DEFAULT_ORIGINS = ['https://tarang-fm.dualmindlab.tech'];
export const DEFAULT_SESSION_TTL_S = 60 * 60;

export interface GuardEnv {
  SESSION_SECRET?: string;
  /** Extra comma-separated origins, e.g. a workers.dev preview: https://tarang-fm.me.workers.dev */
  ALLOWED_ORIGINS?: string;
  SESSION_TTL_SECONDS?: string;
}

// ---- Origin ---------------------------------------------------------------------------------------

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isLoopbackUrl(url: URL): boolean {
  return LOOPBACK.has(url.hostname);
}

function originOf(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const u = new URL(value);
    return u.protocol === 'null:' ? undefined : u.origin;
  } catch {
    return undefined;
  }
}

/** The origins allowed to call the API for a request to `requestUrl`. */
export function allowedOrigins(env: GuardEnv, requestUrl: URL): Set<string> {
  const set = new Set(DEFAULT_ORIGINS);
  for (const extra of (env.ALLOWED_ORIGINS ?? '').split(',')) {
    const origin = originOf(extra.trim());
    if (origin) set.add(origin);
  }
  // A Worker running on loopback (wrangler dev, vite preview, CI) accepts its own origin; no deployed host does.
  if (isLoopbackUrl(requestUrl)) set.add(requestUrl.origin);
  return set;
}

export type OriginVerdict = { ok: true } | { ok: false; reason: string };

/**
 * Strict browser-origin check. Origin wins, then Referer; with neither, only a browser's own
 * `Sec-Fetch-Site: same-origin` passes (same-origin GETs carry no Origin). A present `Sec-Fetch-Site`
 * that is not same-origin is always refused. Spoofable from curl by design, see the module header.
 */
export function checkOrigin(request: Request, env: GuardEnv): OriginVerdict {
  const url = new URL(request.url);
  const allowed = allowedOrigins(env, url);
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return { ok: false, reason: `sec-fetch-site ${site}` };
  const origin = request.headers.get('origin');
  if (origin !== null) {
    const o = originOf(origin);
    return o && allowed.has(o) ? { ok: true } : { ok: false, reason: 'origin not allowed' };
  }
  const referer = request.headers.get('referer');
  if (referer) {
    const o = originOf(referer);
    return o && allowed.has(o) ? { ok: true } : { ok: false, reason: 'referer not allowed' };
  }
  return site === 'same-origin' ? { ok: true } : { ok: false, reason: 'no origin, referer or fetch metadata' };
}

// ---- Client identity -------------------------------------------------------------------------------

export function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip')?.trim() || 'local';
}

/** The key rate limits and budgets count a caller under: the IPv4 address, or the IPv6 /64 (one home, however many addresses it rotates through). */
export function rateKey(ip: string): string {
  if (!ip.includes(':')) return ip;
  const [head = '', tail = ''] = ip.toLowerCase().split('::');
  const a = head ? head.split(':') : [];
  const b = tail ? tail.split(':') : [];
  const groups = ip.includes('::') ? [...a, ...Array<string>(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b] : a;
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':');
}

/** The network a token is bound to: IPv4 /24, IPv6 /48. Loose on purpose, so a phone moving between towers keeps its session. */
export function ipPrefix(ip: string): string {
  if (ip.includes(':')) {
    const [head = '', tail = ''] = ip.toLowerCase().split('::');
    const a = head ? head.split(':') : [];
    const b = tail ? tail.split(':') : [];
    const groups = ip.includes('::') ? [...a, ...Array<string>(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b] : a;
    return `v6:${groups.slice(0, 3).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}`;
  }
  const parts = ip.split('.');
  return parts.length === 4 ? `v4:${parts.slice(0, 3).join('.')}` : `raw:${ip}`;
}

/** The browser family: the user agent without version numbers, so an auto-update mid-session does not log anyone out. */
export function uaFamily(ua: string | null): string {
  return (ua ?? '').replace(/[\d._]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

// ---- Session token ---------------------------------------------------------------------------------

export interface SessionClaims {
  /** random session id: the key for per-session rate limits */
  sid: string;
  /** issued at / expires at, epoch seconds */
  iat: number;
  exp: number;
  /** hash of the IP prefix and the browser family */
  bind: string;
}

const encoder = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(text: string): Uint8Array | undefined {
  try {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  } catch {
    return undefined;
  }
}

async function hmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

async function bindingOf(request: Request): Promise<string> {
  const material = `${ipPrefix(clientIp(request))}|${uaFamily(request.headers.get('user-agent'))}`;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(material)));
  return b64url(digest.slice(0, 9));
}

export function sessionTtl(env: GuardEnv): number {
  const n = Number(env.SESSION_TTL_SECONDS);
  return Number.isFinite(n) && n >= 60 && n <= 24 * 3600 ? Math.floor(n) : DEFAULT_SESSION_TTL_S;
}

/** The signing secret. Deployed Workers must set SESSION_SECRET; on loopback a fixed dev secret keeps `npm run dev` working. */
export function sessionSecret(env: GuardEnv, requestUrl: URL): string | undefined {
  if (env.SESSION_SECRET && env.SESSION_SECRET.length >= 16) return env.SESSION_SECRET;
  return isLoopbackUrl(requestUrl) ? 'tarang-local-dev-secret-not-for-production' : undefined;
}

export async function issueSession(request: Request, env: GuardEnv, now = Date.now()): Promise<{ token: string; claims: SessionClaims } | undefined> {
  const secret = sessionSecret(env, new URL(request.url));
  if (!secret) return undefined;
  const iat = Math.floor(now / 1000);
  const claims: SessionClaims = {
    sid: b64url(crypto.getRandomValues(new Uint8Array(12))),
    iat,
    exp: iat + sessionTtl(env),
    bind: await bindingOf(request),
  };
  const payload = b64url(encoder.encode(JSON.stringify(claims)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), encoder.encode(payload)));
  return { token: `${payload}.${b64url(sig)}`, claims };
}

export type SessionVerdict =
  | { ok: true; claims: SessionClaims }
  | { ok: false; code: 'session_missing' | 'session_invalid' | 'session_expired' | 'session_mismatch' | 'not_configured' };

export async function verifySession(token: string | null | undefined, request: Request, env: GuardEnv, now = Date.now()): Promise<SessionVerdict> {
  const secret = sessionSecret(env, new URL(request.url));
  if (!secret) return { ok: false, code: 'not_configured' };
  if (!token) return { ok: false, code: 'session_missing' };
  const [payload, sig, extra] = token.split('.');
  if (!payload || !sig || extra !== undefined || token.length > 1024) return { ok: false, code: 'session_invalid' };
  const sigBytes = unb64url(sig);
  if (!sigBytes) return { ok: false, code: 'session_invalid' };
  const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), sigBytes, encoder.encode(payload));
  if (!valid) return { ok: false, code: 'session_invalid' };
  let claims: SessionClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(unb64url(payload))) as SessionClaims;
  } catch {
    return { ok: false, code: 'session_invalid' };
  }
  if (typeof claims.sid !== 'string' || typeof claims.exp !== 'number' || typeof claims.bind !== 'string') return { ok: false, code: 'session_invalid' };
  if (Math.floor(now / 1000) >= claims.exp) return { ok: false, code: 'session_expired' };
  if (claims.bind !== (await bindingOf(request))) return { ok: false, code: 'session_mismatch' };
  return { ok: true, claims };
}

// ---- Turnstile (opt in) ----------------------------------------------------------------------------

export interface TurnstileEnv {
  /** Setting this turns the challenge on: POST /api/session then needs a solved Turnstile token. */
  TURNSTILE_SECRET_KEY?: string;
  /** The public site key the page renders the widget with (not a secret). */
  TURNSTILE_SITE_KEY?: string;
}

export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(token: unknown, ip: string, env: TurnstileEnv, fetchFn: typeof fetch = fetch): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return true;
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  try {
    const res = await fetchFn(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(5000),
    });
    const body = (await res.json()) as { success?: boolean };
    return body.success === true;
  } catch {
    return false;
  }
}

// ---- Body limits -----------------------------------------------------------------------------------

/** Reads a JSON body of at most `maxBytes`; a body with no declared length is read through a counting cap. */
export async function readLimitedText(request: Request, maxBytes: number): Promise<{ ok: true; text: string } | { ok: false; status: 400 | 413 }> {
  const declared = Number(request.headers.get('content-length') ?? NaN);
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, status: 413 };
  if (!request.body) return { ok: true, text: '' };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, status: 413 };
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(all) };
}
