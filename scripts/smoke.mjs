#!/usr/bin/env node
/**
 * Smoke test for a running Tarang FM (production after a deploy, or `npm run dev` locally).
 * Checks the pages, the API's health and its input validation without spending Sarvam credits.
 *
 *   node scripts/smoke.mjs https://tarang-fm.dualmindlab.tech
 *   node scripts/smoke.mjs http://localhost:5173 --allow-missing-key
 */
const [base = 'http://localhost:5173', ...flags] = process.argv.slice(2);
const allowMissingKey = flags.includes('--allow-missing-key');
const attempts = Number(process.env.SMOKE_ATTEMPTS ?? 5);
const origin = base.replace(/\/+$/, '');

/** The site's own session: POST /api/session as the page does (null when Turnstile is on, which a script cannot pass). */
let sessionToken;
async function session() {
  if (sessionToken !== undefined) return sessionToken;
  let res;
  for (let i = 0; i < 3; i++) {
    res = await fetch(`${origin}/api/session`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{}' });
    // The mint limit is per IP and a CI run shares one: wait out its window
    if (res.status !== 429) break;
    await sleep(Number(res.headers.get('retry-after') ?? 60) * 1000 + 1000);
  }
  if (res.status === 403) return (sessionToken = null);
  expect(res.status === 200, `POST /api/session returned ${res.status}`);
  const body = await res.json();
  expect(typeof body.token === 'string' && body.token.length > 20, 'POST /api/session returned no token');
  return (sessionToken = body.token);
}

/** A call the way the page makes it: its own Origin and the session token. */
async function page(path, init = {}) {
  const token = await session();
  expect(token, 'no session (Turnstile is on)');
  return fetch(`${origin}${path}`, { ...init, headers: { origin, 'x-tarang-session': token, ...(init.headers ?? {}) } });
}

const checks = [
  {
    name: 'paid API refuses callers outside the site',
    run: async () => {
      const body = JSON.stringify({ station: 'hi', speaker: 'not_a_cast_voice', text: 'x', pace: 1, temperature: 0.5 });
      const headers = { 'content-type': 'application/json' };
      const none = await fetch(`${origin}/api/tts`, { method: 'POST', headers, body });
      expect(none.status === 403, `POST /api/tts with no Origin returned ${none.status}, expected 403`);
      const foreign = await fetch(`${origin}/api/tts`, { method: 'POST', headers: { ...headers, origin: 'https://evil.example' }, body });
      expect(foreign.status === 403, `POST /api/tts from a foreign Origin returned ${foreign.status}, expected 403`);
      const noToken = await fetch(`${origin}/api/tts`, { method: 'POST', headers: { ...headers, origin }, body });
      expect(noToken.status === 401, `POST /api/tts with no session returned ${noToken.status}, expected 401`);
      const forged = await fetch(`${origin}/api/tts`, { method: 'POST', headers: { ...headers, origin, 'x-tarang-session': 'abc.def' }, body });
      expect(forged.status === 401, `POST /api/tts with a forged session returned ${forged.status}, expected 401`);
    },
  },
  {
    name: 'landing page',
    run: async () => {
      const res = await get('/');
      expect(res.status === 200, `GET / returned ${res.status}`);
      expect((await res.text()).includes('<div id="root">'), 'GET / is not the app shell');
    },
  },
  {
    name: 'radio page (SPA fallback)',
    run: async () => {
      const res = await get('/listen');
      expect(res.status === 200, `GET /listen returned ${res.status}`);
    },
  },
  {
    name: 'API health',
    run: async () => {
      const res = await get('/api/health');
      expect(res.status === 200, `GET /api/health returned ${res.status}`);
      const body = await res.json();
      expect(body.ok === true, 'health is not ok');
      expect(body.sarvamKey === true || allowMissingKey, 'SARVAM_API_KEY is not set on the Worker');
    },
  },
  {
    name: 'listener context',
    run: async () => {
      if (!(await session())) return; // Turnstile on: a script cannot get a session
      const res = await page('/api/context?station=hi');
      expect(res.status === 200, `GET /api/context returned ${res.status}`);
      const body = await res.json();
      expect(Array.isArray(body.headlines), 'context has no headlines array');
    },
  },
  {
    name: 'TTS only speaks cast voices',
    run: async () => {
      if (!(await session())) return;
      const res = await page('/api/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ station: 'hi', speaker: 'not_a_cast_voice', text: 'नमस्ते', pace: 1, temperature: 0.5 }),
      });
      const body = await res.json();
      // Without a key (local dev) the key check answers first; with one, the voice allowlist must refuse.
      if (allowMissingKey && body?.error?.code === 'not_configured') return;
      expect(res.status === 400, `POST /api/tts with a foreign voice returned ${res.status}, expected 400`);
      expect(body?.error?.code === 'speaker_not_allowed', `unexpected error code ${body?.error?.code}`);
    },
  },
  {
    name: 'studio line call table answers',
    run: async () => {
      if (!(await session())) return;
      const recent = await page('/api/phone/recent');
      expect(recent.status === 200, `GET /api/phone/recent returned ${recent.status}`);
      expect(Array.isArray((await recent.json())?.calls), 'GET /api/phone/recent has no calls list');
      // Reaches the StudioLine Durable Object: an unclaimed call can never be marked aired
      const res = await page('/api/phone/aired', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ station: 'hi', holder: 'smoke-test-holder', ids: ['smoke-test-no-such-call'] }),
      });
      expect(res.status === 200, `POST /api/phone/aired returned ${res.status}`);
      const body = await res.json();
      expect(Array.isArray(body?.aired) && body.aired.length === 0, 'POST /api/phone/aired marked a call it should not have');
    },
  },
  {
    name: 'unknown API routes are JSON 404s',
    run: async () => {
      const res = await get('/api/nope');
      expect(res.status === 404, `GET /api/nope returned ${res.status}`);
      expect((await res.json())?.error?.code === 'not_found', '404 body is not the API error shape');
    },
  },
];

function get(path) {
  return fetch(`${origin}${path}`, { redirect: 'follow', headers: { 'cache-control': 'no-cache' } });
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
console.log(`Smoke testing ${origin}`);
for (const check of checks) {
  let error;
  // A fresh deploy can take a few seconds to reach every edge location
  for (let i = 1; i <= attempts; i++) {
    try {
      await check.run();
      error = undefined;
      break;
    } catch (err) {
      error = err;
      if (i < attempts) await sleep(2000 * i);
    }
  }
  if (error) {
    failed += 1;
    console.log(`  ✗ ${check.name}: ${error.message}`);
  } else {
    console.log(`  ✓ ${check.name}`);
  }
}

if (failed) {
  console.log(`${failed} of ${checks.length} checks failed`);
  process.exit(1);
}
console.log(`All ${checks.length} checks passed`);
