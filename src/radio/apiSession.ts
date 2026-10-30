/**
 * The page's API session. On load the page asks POST /api/session for a short-lived signed token and sends it with every
 * API call (header `x-tarang-session`; `?t=` for the Listen-together WebSocket, which cannot set headers).
 * A 401 `session_*` answer means the token ended: it is replaced once and the call retried.
 * See docs/SECURITY.md.
 */
import { solveChallenge } from './turnstile';

export const SESSION_HEADER = 'x-tarang-session';

interface Session {
  token: string;
  expiresAt: number;
}

/** Renew when this close to expiry, so a call never carries a token that dies in flight. */
const RENEW_BEFORE_MS = 2 * 60 * 1000;
const RETRY_CODES = new Set(['session_missing', 'session_invalid', 'session_expired', 'session_mismatch']);

let current: Session | null = null;
let inflight: Promise<Session> | null = null;

function fresh(s: Session | null, now = Date.now()): s is Session {
  return !!s && s.expiresAt - now > RENEW_BEFORE_MS;
}

async function mint(challenge?: string): Promise<Response> {
  return fetch('/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(challenge ? { turnstile: challenge } : {}),
    cache: 'no-store',
  });
}

async function requestSession(): Promise<Session> {
  let res = await mint();
  if (res.status === 403) {
    // Turnstile is on for this site: solve the check, then ask again
    const body = (await res.json().catch(() => null)) as { error?: { code?: string }; siteKey?: string | null } | null;
    if (body?.error?.code === 'challenge_required' && body.siteKey) res = await mint(await solveChallenge(body.siteKey));
  }
  if (!res.ok) throw new Error(`session ${res.status}`);
  const body = (await res.json()) as { token?: unknown; expiresAt?: unknown };
  if (typeof body.token !== 'string' || typeof body.expiresAt !== 'number') throw new Error('bad session response');
  return { token: body.token, expiresAt: body.expiresAt };
}

/** A valid token, fetching a new one when there is none or it is about to end. */
export function ensureSession(force = false): Promise<Session> {
  if (!force && fresh(current)) return Promise.resolve(current);
  inflight ??= requestSession()
    .then((s) => (current = s))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** The token if one is ready (for the WebSocket URL); never starts a request. */
export function sessionToken(): string | undefined {
  return fresh(current) ? current.token : undefined;
}

export function resetSession(): void {
  current = null;
  inflight = null;
}

/** fetch() with the session token attached; one retry with a new token when the server says the session ended. */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const attempt = async (force: boolean) => {
    const session = await ensureSession(force);
    const headers = new Headers(init.headers);
    headers.set(SESSION_HEADER, session.token);
    return fetch(input, { ...init, headers });
  };
  const res = await attempt(false);
  if (res.status !== 401) return res;
  const code = (await res.clone().json().catch(() => null)) as { error?: { code?: string } } | null;
  if (!code?.error?.code || !RETRY_CODES.has(code.error.code)) return res;
  return attempt(true);
}

/** The Listen-together socket: the token rides in the query string. */
export function withSessionQuery(url: string, token: string | undefined): string {
  return token ? `${url}${url.includes('?') ? '&' : '?'}t=${encodeURIComponent(token)}` : url;
}
