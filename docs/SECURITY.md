# Security: keeping the paid APIs behind the site

Tarang FM is a public site backed by paid services (Sarvam Bulbul TTS, Saaras speech-to-text and Sarvam-105B, plus Workers AI). Anyone can read this repo and the page's network calls, so the Worker is built on one assumption: **a visitor will try to call the API directly, and some will script it.** This page says what stops that, and what does not.

## Threat model

| Attacker | Wants | Stopped by |
|---|---|---|
| Another website embedding or calling our API from its visitors' browsers | Free TTS / LLM for their own app | Origin / Referer / `Sec-Fetch-Site` check, no CORS grant |
| A casual script (`curl`, a bot) | Free speech or chat | No session token (the origin headers can be faked, the token needs a handshake and is tied to network and browser) |
| A determined script that mints sessions the way the page does | Burn the owner's credits | Per-IP and per-session rate limits, per-IP daily allowance, the site-wide daily budget and kill switch |
| Many IPs at once (botnet) | Same | The site-wide daily budget: spending stops at the cap, the site shows a friendly "back tomorrow" |
| Someone guessing admin or webhook keys | Control the live show, newsroom or phone line | Constant-time key checks, a per-IP rate limit on every admin route |

**Honest limit:** an `Origin` check alone is spoofable by anyone not using a browser (`curl -H "Origin: https://tarang-fm.dualmindlab.tech"` passes it). It only stops other *websites*. The session token, rate limits and daily budget exist because of that. None of this makes abuse impossible for a patient attacker with many IP addresses; it makes the **worst case a bounded, known daily cost**, and the owner can cut it to zero in one request.

## The layers

1. **Origin check** (`worker/guard.ts`, `checkOrigin`). Allowed: `https://tarang-fm.dualmindlab.tech`, anything in `ALLOWED_ORIGINS`, and the Worker's own origin only when it runs on `localhost` / `127.0.0.1` (dev, `vite preview`, CI). `Origin` wins, then `Referer`; with neither, only `Sec-Fetch-Site: same-origin` passes (same-origin GETs carry no `Origin`). A present `Sec-Fetch-Site` that is not `same-origin` is always refused. CORS answers only for allowed origins.
2. **Session token.** The page calls `POST /api/session` as it loads and sends the result as `x-tarang-session` (or `?t=` on the WebSocket URL) on every API call. The token is `base64url(claims).base64url(HMAC-SHA256)`, signed with `SESSION_SECRET`, valid for one hour (`SESSION_TTL_SECONDS`), and holds a random session id plus a hash of the caller's IPv4 /24 (IPv6 /48) and browser family (user agent without version numbers). A wrong network or browser gets `401 session_mismatch` and the page quietly asks for a new token. Minting is itself rate limited. Without `SESSION_SECRET` a deployed Worker refuses to issue or accept tokens (fails closed); on `localhost` a fixed dev secret is used.
3. **Rate limits** (Workers rate limiting bindings): per IP on every paid route (`RL_SEGMENT`, `RL_TTS`, `RL_CALL`), per session id across all of them (`RL_SESSION`, 90 a minute), per IP on minting (`RL_MINT`, 30 a minute, so a shared office or campus network is not locked out) and on admin routes and the phone webhook (`RL_ADMIN`, 20 a minute). IPv6 callers are counted by their /64.
4. **Daily budget and kill switch** (`worker/ledger.ts`, `worker/spend.ts`). One Durable Object counts paid work per UTC day, site-wide and per IP: speech characters, segments (LLM), call-ins (speech-to-text plus LLM), live-show joins and context lookups. A refused call returns `budget_exhausted` with a friendly message the page shows as is. Defaults (override with the `BUDGET_<KIND>_DAY` and `BUDGET_<KIND>_IP_DAY` variables, `0` switches a kind off):

   | Kind | Variable stem | Site-wide / day | Per IP / day |
   |---|---|---|---|
   | Speech characters | `TTS_CHARS` | 600,000 (about 11 hours of speech) | 60,000 (about an hour) |
   | Segments | `SEGMENTS` | 3,000 | 300 |
   | Call-ins | `CALLS` | 400 | 25 |
   | Live-show joins | `LIVE_JOINS` | 3,000 | 60 |
   | Context lookups | `CONTEXT` | 30,000 | 1,500 |

   **Kill switch:** `curl -X POST https://tarang-fm.dualmindlab.tech/api/admin/spend -H "Authorization: Bearer $LIVE_ADMIN_TOKEN" -d '{"paused":true}'` stops every paid call at once; `{"paused":false}` lifts it; `GET` on the same URL shows today's usage.
5. **Input caps.** JSON bodies are capped (64 KB; 4 KB for small routes) while they are read, call-in audio needs a `Content-Length` of at most 2 MB, TTS text is at most 300 characters, only cast voices are accepted, and every schema bounds its fields.
6. **Turnstile (opt in).** Set `TURNSTILE_SECRET_KEY` (secret) and `TURNSTILE_SITE_KEY` (plain variable) and `POST /api/session` answers `403 challenge_required` until the page solves a Cloudflare Turnstile check, which the page does by itself with a small overlay. Off by default: it needs a Turnstile widget created in the Cloudflare dashboard (free, same account).

## Route table

| Route | Spends | Guard |
|---|---|---|
| `POST /api/session` | nothing | origin, `RL_MINT`, Turnstile if on |
| `POST /api/tts` | Sarvam TTS | origin, session, `RL_TTS`, `RL_SESSION`, budget `tts_chars` |
| `POST /api/segment` | Sarvam LLM, Workers AI judge, news feeds | origin, session, `RL_SEGMENT`, `RL_SESSION`, budget `segment` |
| `POST /api/call` | Sarvam STT, LLM and transliteration | origin, session, `RL_CALL`, `RL_SESSION`, budget `call`, 2 MB cap, length required |
| `GET /api/context` | outbound news and weather fetches | origin, session, `RL_SEGMENT`, `RL_SESSION`, budget `context` |
| `GET /api/live/:station/ws` | starts the shared show (Sarvam LLM and TTS) | origin, session (`?t=`), `RL_SEGMENT`, `RL_SESSION`, budget `live_join` |
| `GET /api/live/:station/audio/:id`, `/now` | none (cached or read-only) | origin, session, per-IP and per-session limits |
| `GET /api/phone/recent`, `POST /api/phone/aired` | none (a Durable Object read or write) | origin, session, per-IP and per-session limits |
| `GET /api/phone/headlines` | free RSS only; called by the Sarvam voice agent, so no browser headers | `RL_SEGMENT`; optional `PHONE_HEADLINES_REQUIRE_TOKEN=1` adds the phone token |
| `POST /api/phone/call-end` | none | `?token=` (`PHONE_WEBHOOK_TOKEN`, constant time), `RL_ADMIN`, 64 KB cap. Unchanged for Sarvam |
| `POST /api/live/:station/control`, `POST /api/news/refresh`, `GET /api/news/status`, `GET/POST /api/admin/spend` | the newsroom workflow (Workers AI) when started | bearer `LIVE_ADMIN_TOKEN` (constant time), `RL_ADMIN` |
| `GET /api/health` | nothing | public (reports only whether the Sarvam key is set) |
| Cron (every 3 hours) and the news Workflow | Workers AI | not reachable from outside |

## Set up (once, before merging)

```sh
openssl rand -base64 32 | npx wrangler secret put SESSION_SECRET
```

Deploying without `SESSION_SECRET` makes the site answer 503 on every paid route until it is set. Optional: `ALLOWED_ORIGINS` (a workers.dev preview), the `BUDGET_*` caps, and Turnstile (`npx wrangler secret put TURNSTILE_SECRET_KEY`, plus `TURNSTILE_SITE_KEY` as a variable).

Also worth doing in the Cloudflare dashboard: a billing alert on Workers AI, a spend or usage cap in the Sarvam dashboard, and a WAF rate-limiting rule on `/api/*`, which acts before the Worker runs and costs nothing in Worker requests.

## Known gaps

- A scripted client on a normal browser user agent can mint a session and use its allowance. It is bounded by the per-IP and per-session limits and the daily budget, not prevented. Turnstile raises the cost of that.
- Rate limiting bindings are counted per Cloudflare location and are eventually consistent, so the real ceiling is a little above the number shown. The daily budget is exact (one Durable Object).
- The budget counts requests when they are accepted. A client that disconnects mid-stream still counts, and a segment that uses a fallback still counts.
- Once the shared live show is running, it keeps producing until it ends (six minutes) or the last listener leaves, even if the budget runs out meanwhile. New joins are refused.
- The phone line itself (Sarvam Voice Agents) is billed by Sarvam per call minute. This Worker cannot cap who dials the number; set a limit in the Sarvam dashboard.
- Tokens are not revocable before they expire (one hour). The kill switch and `SESSION_SECRET` rotation are the emergency stops.
