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

const checks = [
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
      const res = await get('/api/context?station=hi');
      expect(res.status === 200, `GET /api/context returned ${res.status}`);
      const body = await res.json();
      expect(Array.isArray(body.headlines), 'context has no headlines array');
    },
  },
  {
    name: 'TTS only speaks cast voices',
    run: async () => {
      const res = await fetch(`${origin}/api/tts`, {
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
