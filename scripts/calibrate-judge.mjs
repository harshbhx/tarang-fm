#!/usr/bin/env node
/**
 * Calibrates the producer's judge: runs every candidate backend over the calibration set
 * (worker/judge/calibration: the 9 "before" scripts, hand-written good scripts, subtly broken variants) and
 * prints mean score per set, separation, false passes and false fails, known-failure recall, noise, latency
 * and cost.
 *
 *   npx tsx scripts/calibrate-judge.mjs [--backends wai:@cf/meta/llama-3.3-70b-instruct-fp8-fast,sarvam]
 *                                       [--repeat 2] [--cases id,id] [--out dir] [--yes]
 *
 * Backends
 *   wai:<model>   Workers AI over the REST API, authenticated with Wrangler's login (read here, never printed).
 *                 The account is CLOUDFLARE_ACCOUNT_ID, else the one `wrangler whoami` reports.
 *   wai-free:<model>  the same without constrained JSON decoding (prompt-only JSON, lenient parse).
 *   sarvam        sarvam-105b, reasoning off.   sarvam-low   the same with reasoning_effort "low".
 *                 SARVAM_API_KEY from .dev.vars. At most 30 Sarvam calls per run (cached calls are free);
 *                 more needs --yes.
 * Results are cached by prompt hash in tmp/calibrate/cache.json, so a rerun costs nothing.
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CALIBRATION } from '../worker/judge/calibration/index.ts';
import { judgePrompt, parseVerdict, applicableDims, meanScore, RUBRIC_VERSION } from '../worker/judge/rubric.ts';
import { workersAiBody, responseContent, JUDGE_MAX_TOKENS, JUDGE_TEMPERATURE } from '../worker/judge/backends.ts';
import { freeChecks } from '../worker/checks/free.ts';
import { freeContextOf, scoreFailures, DEFAULT_THRESHOLDS } from '../worker/producer.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SARVAM_BUDGET = 30;
const CALL_TIMEOUT_MS = 60_000;
const DEFAULT_BACKENDS = ['wai:@cf/meta/llama-3.3-70b-instruct-fp8-fast', 'wai:@cf/openai/gpt-oss-120b', 'sarvam'];
/** ₹ per 1M tokens (in, out) for sarvam-105b */
const SARVAM_PRICE = [15, 60];

function args(argv) {
  const o = { backends: DEFAULT_BACKENDS, repeat: 1, cases: null, out: join(ROOT, 'tmp', 'calibrate'), yes: false, concurrency: 4 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--backends') o.backends = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--repeat') o.repeat = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--cases') o.cases = new Set(argv[++i].split(','));
    else if (a === '--out') o.out = resolve(argv[++i]);
    else if (a === '--concurrency') o.concurrency = Math.max(1, Number(argv[++i]) || 4);
    else if (a === '--yes') o.yes = true;
    else if (a === '-h' || a === '--help') {
      console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
      process.exit(0);
    } else throw new Error(`unknown option ${a}`);
  }
  return o;
}

// ---- credentials (read, never printed) ---------------------------------------------------------------------

function sarvamKey() {
  const file = join(ROOT, '.dev.vars');
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*SARVAM_API_KEY\s*=\s*(.*?)\s*$/);
      if (m && m[1]) return m[1].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  if (process.env.SARVAM_API_KEY) return process.env.SARVAM_API_KEY;
  throw new Error('SARVAM_API_KEY is not in .dev.vars');
}

function wranglerToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const home = process.env.APPDATA ? join(process.env.APPDATA, 'xdg.config') : join(process.env.HOME ?? '', '.config');
  for (const file of [join(home, '.wrangler', 'config', 'default.toml'), join(process.env.HOME ?? process.env.USERPROFILE ?? '', '.wrangler', 'config', 'default.toml')]) {
    if (!existsSync(file)) continue;
    const cfg = readFileSync(file, 'utf8');
    const exp = cfg.match(/expiration_time\s*=\s*"([^"]+)"/)?.[1];
    if (exp && Date.parse(exp) < Date.now() + 120_000) {
      // Refresh the OAuth token (wrangler does it on any authenticated command)
      execSync('npx wrangler whoami', { cwd: ROOT, stdio: 'ignore' });
      return wranglerToken();
    }
    const tok = cfg.match(/oauth_token\s*=\s*"([^"]+)"/)?.[1];
    if (tok) return tok;
  }
  throw new Error('no Wrangler login found: run `npx wrangler login`');
}

let accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
function account() {
  if (accountId) return accountId;
  const out = execSync('npx wrangler whoami', { cwd: ROOT, encoding: 'utf8' });
  accountId = out.match(/\b[0-9a-f]{32}\b/)?.[0];
  if (!accountId) throw new Error('could not find the Cloudflare account id (set CLOUDFLARE_ACCOUNT_ID)');
  return accountId;
}

// ---- backends --------------------------------------------------------------------------------------------------

const sarvamCalls = { made: 0 };

async function callBackend(backend, prompt) {
  const t0 = Date.now();
  if (backend.startsWith('wai:') || backend.startsWith('wai-free:')) {
    const free = backend.startsWith('wai-free:');
    const model = backend.slice(free ? 9 : 4);
    const body = workersAiBody(model, prompt, { temperature: JUDGE_TEMPERATURE, maxTokens: JUDGE_MAX_TOKENS, schema: !free });
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account()}/ai/run/${model}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${wranglerToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) throw new Error(`HTTP ${res.status} ${JSON.stringify(data?.errors ?? '').slice(0, 200)}`);
    const usage = data.result?.usage ?? {};
    return { raw: responseContent(data.result), ms: Date.now() - t0, usage: { in: usage.prompt_tokens ?? 0, out: usage.completion_tokens ?? 0, neurons: usage.neurons ?? null } };
  }
  if (backend === 'sarvam' || backend === 'sarvam-low') {
    if (sarvamCalls.made >= SARVAM_BUDGET && !opts.yes) throw new Error(`Sarvam budget of ${SARVAM_BUDGET} calls reached`);
    sarvamCalls.made += 1;
    const { VERDICT_SCHEMA } = await import('../worker/judge/rubric.ts');
    const low = backend === 'sarvam-low';
    const res = await fetch('https://api.sarvam.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'api-subscription-key': sarvamKey(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'sarvam-105b',
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        temperature: JUDGE_TEMPERATURE,
        max_tokens: low ? 3000 : 1400,
        reasoning_effort: low ? 'low' : null,
        response_format: { type: 'json_schema', json_schema: { name: 'producer_check', schema: VERDICT_SCHEMA, strict: true } },
      }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${JSON.stringify(data?.error ?? '').slice(0, 200)}`);
    const usage = data?.usage ?? {};
    return { raw: data?.choices?.[0]?.message?.content ?? '', ms: Date.now() - t0, usage: { in: usage.prompt_tokens ?? 0, out: usage.completion_tokens ?? 0, neurons: null } };
  }
  throw new Error(`unknown backend ${backend}`);
}

// ---- run ----------------------------------------------------------------------------------------------------------

const opts = args(process.argv.slice(2));
mkdirSync(opts.out, { recursive: true });
const cacheFile = join(opts.out, 'cache.json');
const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
const saveCache = () => writeFileSync(cacheFile, JSON.stringify(cache, null, 1));

const cases = CALIBRATION.filter((c) => !opts.cases || opts.cases.has(c.id));
const jobs = [];
for (const backend of opts.backends) for (let r = 0; r < opts.repeat; r++) for (const c of cases) jobs.push({ backend, run: r, c });

const plannedSarvam = jobs.filter((j) => j.backend.startsWith('sarvam') && !cache[hashOf(j)]).length;
console.log(`calibration ${RUBRIC_VERSION}: ${cases.length} cases × ${opts.backends.length} backends × ${opts.repeat} runs = ${jobs.length} judge calls (${plannedSarvam} new Sarvam calls)`);
if (plannedSarvam > SARVAM_BUDGET && !opts.yes) {
  console.error(`over the Sarvam budget (${plannedSarvam} > ${SARVAM_BUDGET}): narrow --cases/--repeat or pass --yes`);
  process.exit(2);
}

function hashOf(j) {
  const p = judgePrompt(j.c.input);
  return createHash('sha256').update(JSON.stringify([RUBRIC_VERSION, j.backend, j.run, p.system, p.user])).digest('hex').slice(0, 24);
}

const results = [];
let next = 0;
async function worker() {
  while (next < jobs.length) {
    const j = jobs[next++];
    const key = hashOf(j);
    let entry = cache[key];
    if (!entry) {
      try {
        const out = await callBackend(j.backend, judgePrompt(j.c.input));
        entry = { ...out, at: new Date().toISOString() };
        cache[key] = entry;
        saveCache();
      } catch (err) {
        entry = { error: String(err?.message ?? err) };
      }
    }
    const verdict = entry.error ? null : parseVerdict(entry.raw, j.c.input);
    results.push({ ...j, entry, verdict });
    process.stdout.write(verdict ? '.' : 'x');
  }
}
const lanes = Math.min(opts.concurrency, jobs.length);
await Promise.all(Array.from({ length: lanes }, worker));
process.stdout.write('\n');

// ---- metrics --------------------------------------------------------------------------------------------------

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (xs, p) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const f2 = (x) => (x == null ? '-' : x.toFixed(2));

function judgePass(c, v, t = DEFAULT_THRESHOLDS) {
  return scoreFailures(c.input, v, t).length === 0;
}

function freeOf(c) {
  return freeChecks(c.input.type, c.input.lines, freeContextOf({ ...c.input, plan: c.plan }));
}

function knownHit(c, v) {
  const inv = v.invented.join(' ').toLowerCase();
  const inventOk = !c.mustInvent || c.mustInvent.some((t) => inv.includes(t.toLowerCase()));
  const lowOk = !c.lowDims || c.lowDims.every((d) => v.scores[d] != null && v.scores[d] <= 2);
  return { inventOk, lowOk };
}

const rows = [];
const detail = [];
for (const backend of opts.backends) {
  const rs = results.filter((r) => r.backend === backend);
  const ok = rs.filter((r) => r.verdict);
  const meanOf = (set) => avg(ok.filter((r) => r.c.set === set).map((r) => meanScore(r.verdict.scores, applicableDims(r.c.input))).filter((x) => x != null));
  const mBase = meanOf('baseline');
  const mGood = meanOf('good');
  const mBroken = meanOf('broken');
  const badMeans = ok.filter((r) => r.c.expect === 'fail').map((r) => meanScore(r.verdict.scores, applicableDims(r.c.input)));
  const judgeFalsePass = ok.filter((r) => r.c.expect === 'fail' && judgePass(r.c, r.verdict)).length;
  const judgeFalseFail = ok.filter((r) => r.c.expect === 'pass' && !judgePass(r.c, r.verdict)).length;
  const combinedFalsePass = ok.filter((r) => r.c.expect === 'fail' && freeOf(r.c).pass && judgePass(r.c, r.verdict)).length;
  const combinedFalseFail = ok.filter((r) => r.c.expect === 'pass' && (!freeOf(r.c).pass || !judgePass(r.c, r.verdict))).length;
  const withInvent = ok.filter((r) => r.c.mustInvent);
  const withLow = ok.filter((r) => r.c.lowDims);
  const inventRecall = withInvent.length ? withInvent.filter((r) => knownHit(r.c, r.verdict).inventOk).length / withInvent.length : null;
  const lowRecall = withLow.length ? withLow.filter((r) => knownHit(r.c, r.verdict).lowOk).length / withLow.length : null;
  // Noise: per case, spread of the mean across repeated runs
  let noise = null;
  if (opts.repeat > 1) {
    const spreads = [];
    for (const c of cases) {
      const ms = ok.filter((r) => r.c.id === c.id).map((r) => meanScore(r.verdict.scores, applicableDims(r.c.input)));
      if (ms.length > 1) spreads.push(Math.max(...ms) - Math.min(...ms));
    }
    noise = avg(spreads);
  }
  const lat = ok.map((r) => r.entry.ms).filter(Boolean);
  const tokIn = avg(ok.map((r) => r.entry.usage?.in ?? 0));
  const tokOut = avg(ok.map((r) => r.entry.usage?.out ?? 0));
  const neurons = avg(ok.map((r) => r.entry.usage?.neurons).filter((x) => x != null));
  const cost = backend.startsWith('sarvam') ? `₹${((tokIn * SARVAM_PRICE[0] + tokOut * SARVAM_PRICE[1]) / 1e6).toFixed(3)}/call` : neurons != null ? `${neurons.toFixed(0)} neurons/call (credits)` : 'credits';
  // Best minMean on this backend (other thresholds fixed)
  let best = null;
  for (const minMean of [3.0, 3.2, 3.4, 3.6, 3.8, 4.0, 4.2]) {
    const t = { ...DEFAULT_THRESHOLDS, minMean };
    const errors = ok.filter((r) => (r.c.expect === 'pass') !== judgePass(r.c, r.verdict, t)).length;
    if (!best || errors < best.errors) best = { minMean, errors };
  }
  rows.push({
    backend, n: rs.length, errors: rs.length - ok.length, mBase, mGood, mBroken,
    separation: mGood != null && badMeans.length ? mGood - avg(badMeans) : null,
    judgeFalsePass, judgeFalseFail, combinedFalsePass, combinedFalseFail, inventRecall, lowRecall, noise,
    p50: pct(lat, 0.5), p90: pct(lat, 0.9), over3s: lat.filter((x) => x > 3000).length, tokIn, tokOut, cost, best,
  });
  for (const r of rs) {
    const v = r.verdict;
    detail.push({
      backend, run: r.run, id: r.c.id, set: r.c.set, expect: r.c.expect, ms: r.entry.ms, error: r.entry.error ?? (v ? undefined : 'unparseable'),
      mean: v ? meanScore(v.scores, applicableDims(r.c.input)) : null,
      scores: v?.scores, invented: v?.invented, capped: v?.capped, judgePass: v ? judgePass(r.c, v) : null,
      known: v ? knownHit(r.c, v) : null, heard: v?.heardSummaryEn, fix: v?.fix, worst: v?.worstLine,
    });
  }
}

const header = '| backend | baseline mean | good mean | broken mean | separation | judge false-pass | judge false-fail | free+judge false-pass | free+judge false-fail | invented recall | low-dim recall | noise (±) | p50 / p90 ms | > 3 s | tokens in/out | cost | best minMean (errors) | parse errors |';
const lines = [header, '|' + '---|'.repeat(header.split('|').length - 2)];
for (const r of rows) {
  lines.push(`| ${r.backend} | ${f2(r.mBase)} | ${f2(r.mGood)} | ${f2(r.mBroken)} | ${f2(r.separation)} | ${r.judgeFalsePass} | ${r.judgeFalseFail} | ${r.combinedFalsePass} | ${r.combinedFalseFail} | ${r.inventRecall == null ? '-' : `${Math.round(r.inventRecall * 100)}%`} | ${r.lowRecall == null ? '-' : `${Math.round(r.lowRecall * 100)}%`} | ${f2(r.noise)} | ${r.p50 ?? '-'} / ${r.p90 ?? '-'} | ${r.over3s} | ${Math.round(r.tokIn ?? 0)}/${Math.round(r.tokOut ?? 0)} | ${r.cost} | ${r.best ? `${r.best.minMean} (${r.best.errors})` : '-'} | ${r.errors} |`);
}
console.log(`\n${lines.join('\n')}\n`);
for (const backend of opts.backends) {
  console.log(`## ${backend}`);
  for (const d of detail.filter((x) => x.backend === backend && x.run === 0)) {
    const s = d.scores ? Object.entries(d.scores).filter(([, v]) => v != null).map(([k, v]) => `${k.slice(0, 5)}=${v}`).join(' ') : d.error;
    const flag = d.judgePass == null ? 'ERR' : d.judgePass === (d.expect === 'pass') ? 'ok ' : 'BAD';
    console.log(`${flag} ${d.id.padEnd(34)} mean=${f2(d.mean)} ${d.ms ?? '-'}ms ${s}${d.invented?.length ? ` | inv: ${d.invented.join(' / ').slice(0, 140)}` : ''}${d.capped?.length ? ` | caps: ${d.capped.join('; ')}` : ''}`);
  }
}
writeFileSync(join(opts.out, 'results.json'), JSON.stringify({ rubric: RUBRIC_VERSION, at: new Date().toISOString(), rows, detail }, null, 1));
writeFileSync(join(opts.out, 'table.md'), lines.join('\n') + '\n');
console.log(`\nSarvam calls made this run: ${sarvamCalls.made}. Results: ${join(opts.out, 'results.json')}`);
