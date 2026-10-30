// Secrets and settings that are not bindings (so `wrangler types` does not list them). All optional here; worker/guard.ts and
// worker/ledger.ts say what happens when one is missing. Documented in docs/SECURITY.md.
interface Env {
  /** HMAC key for session tokens (secret, 16+ characters). Required on any non-loopback host. */
  SESSION_SECRET?: string;
  /** Extra comma-separated allowed browser origins, e.g. a workers.dev preview. */
  ALLOWED_ORIGINS?: string;
  SESSION_TTL_SECONDS?: string;
  /** Opt-in Cloudflare Turnstile on POST /api/session. */
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  /** "1": GET /api/phone/headlines also needs ?token=<PHONE_WEBHOOK_TOKEN>. */
  PHONE_HEADLINES_REQUIRE_TOKEN?: string;
  [budget: `BUDGET_${string}`]: string | undefined;
}
