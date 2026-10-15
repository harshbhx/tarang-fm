#!/usr/bin/env node
/**
 * "Listen together" simulator: several listeners share one live show on a running server.
 *
 *   node scripts/live-sim.mjs [--base http://localhost:5191] [--station hi] [--quick]
 *   Stations are off by default: set LIVE_ADMIN_TOKEN in the environment and the script starts the station
 *   first (and stops it at the end).
 *
 * Scenario (t = when the first listener connects):
 *   t=0     Harsh joins
 *   t=20s   Priya joins
 *   t=35s   Rahul and Ananya join together (one shared welcome expected)
 *   t=50s   GET /now is compared with what the sockets see
 *   t=68s   a few line audio files are fetched and measured
 *   t=75s   everyone leaves (a little later if a welcome is still due), then
 *           GET /now is polled until the station sleeps (skipped with --quick)
 * Every listener pings for clock sync the whole time.
 *
 * Contract: shared/live.ts. Its constants are read from that file when it is present.
 * Exit code: 0 all checks passed, 1 a check failed, 2 the server could not be reached.
 */
import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------- options

const opts = parseArgs(process.argv.slice(2));
const origin = opts.base.replace(/\/+$/, '');
const station = opts.station;
const wsUrl = `${origin.replace(/^http/i, 'ws')}/api/live/${station}/ws`;

/** Mirrors shared/live.ts; refreshed from the file below so the two can't drift. */
const C = {
  LIVE_PCM_BYTES_PER_MS: 48,
  LIVE_BUFFER_AHEAD_MS: 45_000,
  LIVE_IDLE_SLEEP_MS: 60_000,
  LIVE_WELCOME_BATCH_MS: 4_000,
  LIVE_WELCOME_MIN_GAP_MS: 12_000,
  LIVE_NAME_MAX: 24,
  LIVE_MAX_LISTENERS: 200,
};
try {
  const src = readFileSync(new URL('../shared/live.ts', import.meta.url), 'utf8');
  for (const m of src.matchAll(/export const (LIVE_[A-Z_]+)\s*=\s*([\d_]+)\s*;/g)) {
    C[m[1]] = Number(m[2].replaceAll('_', ''));
  }
} catch {
  // Running outside the repo: keep the mirrored values
}

/** Scenario timings (ms after t=0) */
const T = { priya: 20_000, group: 35_000, nowCheck: 50_000, audio: 68_000, leave: 75_000, presenceSettle: 4_000 };
/** A joiner should hear their welcome within this long of joining (or of the show going on air, if later). */
const WELCOME_WINDOW_MS = 15_000;
/** Gaps between lines once on air must stay below this. */
const MAX_GAP_MS = 3_000;
/** First line of a cold station must start within this long of the first join. */
const COLD_FIRST_LINE_MAX_MS = 45_000;
/** Overlap tolerance for rounding (ms). */
const EPS_MS = 2;
const PING_EVERY_MS = 2_000;
const SAMPLE_EVERY_MS = 2_000;
const MAX_OFFSET_MS = 2_000;
const AUDIO_TOLERANCE = 0.05;

// ---------------------------------------------------------------- clock and logging

const localEpoch = () => performance.timeOrigin + performance.now();
let T0 = performance.now();
const elapsed = () => performance.now() - T0;
const fmtT = (ms) => `${ms < 0 ? '-' : '+'}${(Math.abs(ms) / 1000).toFixed(1)}s`;
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const until = (ms) => sleep(ms - elapsed());

function log(who, text) {
  console.log(`[${fmtT(elapsed()).padStart(7)}] ${who.padEnd(7)} ${text}`);
}

/** Median of the listeners' best clock offsets (server epoch − local epoch). */
function globalOffset() {
  const offs = clients.map((c) => c.offset).filter((o) => o !== null).sort((a, b) => a - b);
  return offs.length ? offs[Math.floor(offs.length / 2)] : 0;
}
const serverNow = () => localEpoch() + globalOffset();
/** Server epoch ms → scenario time label */
const rel = (serverMs) => fmtT(serverMs - globalOffset() - (performance.timeOrigin + T0));

const shortId = (id) => (id && id.length > 10 ? `${id.slice(0, 8)}…` : id);
const clip = (s, n = 70) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const lineEnd = (l) => l.startAt + l.durationMs;
const sigOf = (lines) => lines.map((l) => `${l.id}@${l.startAt}+${l.durationMs}`).join('|');
const upcoming = (lines, at) => lines.filter((l) => lineEnd(l) > at);

// ---------------------------------------------------------------- results

/** @type {{name: string, status: 'PASS'|'FAIL'|'SKIP'|'INFO', detail: string}[]} */
const results = [];
function record(name, ok, detail = '') {
  const status = ok === null ? 'SKIP' : ok === 'info' ? 'INFO' : ok ? 'PASS' : 'FAIL';
  results.push({ name, status, detail });
}

// ---------------------------------------------------------------- shared observations

/** Every line ever seen, latest version (from the newest broadcast) */
const lineRegistry = new Map(); // id -> { line, firstSeen: { now, lines }, versions: Set<string> }
let registryNow = -Infinity;
const retimes = []; // { id, from, to, msgNow }
const identityChanges = []; // { id, field, from, to }
const allIntegrityProblems = []; // { at, kind?, problem }
const seenProblems = new Set();
const checkedSigs = new Set();

/** Server ms when the show's first line starts (latest version of every line seen), or null */
function onAirStart() {
  let min = null;
  for (const { line } of lineRegistry.values()) if (min === null || line.startAt < min) min = line.startAt;
  return min;
}

function absorbTimeline(lines, msgNow, state, who) {
  if (!Array.isArray(lines)) return;
  const sig = sigOf(lines);
  if (!checkedSigs.has(sig)) {
    checkedSigs.add(sig);
    checkIntegrity(lines, msgNow, state);
  }
  // Only the newest broadcast moves the registry, so slow sockets can't roll it back
  if (msgNow < registryNow) return;
  registryNow = msgNow;
  const fresh = [];
  for (const l of lines) {
    const known = lineRegistry.get(l.id);
    if (!known) {
      lineRegistry.set(l.id, { line: l, firstSeen: { now: msgNow, lines, state } });
      fresh.push(l);
      continue;
    }
    const prev = known.line;
    if (prev.startAt !== l.startAt) retimes.push({ id: l.id, from: prev.startAt, to: l.startAt, msgNow });
    for (const field of ['durationMs', 'segmentId', 'type']) {
      if (prev[field] !== l[field]) identityChanges.push({ id: l.id, field, from: prev[field], to: l[field] });
    }
    if (prev.line?.text !== l.line?.text) identityChanges.push({ id: l.id, field: 'text', from: prev.line?.text, to: l.line?.text });
    if (prev.line?.speaker !== l.line?.speaker) identityChanges.push({ id: l.id, field: 'speaker', from: prev.line?.speaker, to: l.line?.speaker });
    known.line = l;
  }
  if (fresh.length) {
    log(who, `timeline: ${lines.length} lines, ${fresh.length} new`);
    for (const l of fresh) {
      const welcome = l.welcome?.length ? ` WELCOME(${l.welcome.map(nameOfId).join(', ')})` : '';
      console.log(
        `           + ${shortId(l.id).padEnd(9)} ${rel(l.startAt).padStart(7)} ${secs(l.durationMs).padStart(5)} ` +
          `${String(l.type).padEnd(10)} ${clip(l.line?.speaker, 22).padEnd(22)}${welcome} ${clip(l.line?.text, welcome ? 200 : 60)}`,
      );
    }
  }
}

/** Records a timeline fault once (the same fault repeats in every later update) */
function flag(p) {
  if (seenProblems.has(p.problem)) return;
  seenProblems.add(p.problem);
  allIntegrityProblems.push(p);
}

/** Per-message checks: air order, no overlap, no long gaps, no dead air while on air */
function checkIntegrity(lines, msgNow, state) {
  const at = rel(msgNow);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!(Number.isFinite(l.startAt) && Number.isFinite(l.durationMs) && l.durationMs > 0)) {
      flag({ at, problem: `line ${shortId(l.id)} has bad startAt/durationMs` });
    }
    if (lineEnd(l) < msgNow - 1_000) flag({ at, problem: `finished line ${shortId(l.id)} still listed` });
    if (i === 0) continue;
    const p = lines[i - 1];
    if (l.startAt < p.startAt) flag({ at, problem: `${shortId(l.id)} out of air order` });
    const gap = l.startAt - lineEnd(p);
    if (gap < -EPS_MS) flag({ at, kind: 'overlap', problem: `${shortId(p.id)} overlaps ${shortId(l.id)} by ${-gap} ms` });
    if (gap >= MAX_GAP_MS) flag({ at, kind: 'gap', problem: `${secs(gap)} gap before ${shortId(l.id)}` });
  }
  if (state === 'on_air' && !lines.length) flag({ at, kind: 'gap', problem: 'dead air: on air with an empty timeline' });
  if (state === 'on_air' && lines.length && lines[0].startAt - msgNow >= MAX_GAP_MS) {
    flag({ at, kind: 'gap', problem: `dead air: next line starts ${secs(lines[0].startAt - msgNow)} after now` });
  }
}

const clients = [];
function nameOfId(id) {
  return clients.find((c) => c.you?.id === id)?.name ?? `other:${shortId(id)}`;
}

// ---------------------------------------------------------------- simulated listener

class SimListener {
  constructor(name) {
    this.name = name;
    this.ws = null;
    this.you = null;
    this.snapshot = null;
    this.joinSentAt = null; // elapsed ms
    this.joinedAt = null; // elapsed ms when 'joined' arrived
    this.leftAt = null;
    this.failure = null;
    this.order = []; // message types in arrival order (pongs excluded)
    this.states = []; // { state, now, via }
    this.listeners = [];
    this.lines = [];
    this.seenIds = new Set(); // every line id this listener was sent
    this.timelineMsgs = []; // { now, sig } of 'timeline' messages
    this.pongs = []; // { rtt, offset }
    this.sentT0 = new Set();
    this.badEchoes = 0;
    this.errors = [];
    this.closed = null;
    this.pingTimer = null;
    this.waiters = [];
    clients.push(this);
  }

  get active() {
    return Boolean(this.you) && this.leftAt === null && this.closed === null;
  }

  /** Best clock offset (server epoch − local epoch) from the lowest-RTT pong */
  get offset() {
    if (!this.pongs.length) return null;
    return this.pongs.reduce((a, b) => (b.rtt < a.rtt ? b : a)).offset;
  }

  async start() {
    try {
      await this.connect();
      this.joinSentAt = elapsed();
      this.send({ type: 'join', name: this.name });
      await this.waitFor('joined', 20_000);
      this.joinedAt = elapsed();
      const s = this.snapshot;
      log(
        this.name,
        `joined in ${Math.round(this.joinedAt - this.joinSentAt)} ms as ${shortId(this.you.id)} "${this.you.name}"; ` +
          `state ${s?.state}, ${s?.listeners?.length ?? '?'} listening, ${s?.lines?.length ?? '?'} lines`,
      );
      // A quick burst of pings for a first clock estimate, then a steady beat
      for (let i = 0; i < 4; i++) setTimeout(() => this.ping(), i * 250);
      this.pingTimer = setInterval(() => this.ping(), PING_EVERY_MS);
    } catch (err) {
      this.failure = err.message;
      log(this.name, `FAILED: ${err.message}`);
    }
  }

  connect() {
    return new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(wsUrl);
      } catch (err) {
        reject(new Error(`cannot open ${wsUrl}: ${err.message}`));
        return;
      }
      this.ws = ws;
      const timer = setTimeout(() => reject(new Error(`no WebSocket open within 10 s (${wsUrl})`)), 10_000);
      ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      });
      ws.addEventListener('error', (ev) => {
        clearTimeout(timer);
        const msg = ev?.message || ev?.error?.message || 'WebSocket error';
        if (!this.you) reject(new Error(`${msg} (${wsUrl})`));
        else this.errors.push({ code: 'socket_error', message: msg });
      });
      ws.addEventListener('close', (ev) => {
        clearTimeout(timer);
        clearInterval(this.pingTimer);
        if (this.leftAt === null) {
          this.closed = { at: elapsed(), code: ev.code, reason: ev.reason };
          log(this.name, `socket closed unexpectedly (code ${ev.code}${ev.reason ? `, ${ev.reason}` : ''})`);
          reject(new Error(`socket closed before joining (code ${ev.code})`));
        }
        for (const w of this.waiters.splice(0)) w.reject(new Error(`socket closed (code ${ev.code})`));
      });
      ws.addEventListener('message', (ev) => this.onMessage(ev.data));
    });
  }

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  ping() {
    if (!this.active) return;
    const t0 = performance.now();
    this.sentT0.add(t0);
    this.send({ type: 'ping', t0 });
  }

  waitFor(type, timeoutMs) {
    if (type === 'joined' && this.you) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no '${type}' within ${timeoutMs / 1000} s`)), timeoutMs);
      this.waiters.push({
        type,
        resolve: () => (clearTimeout(timer), resolve()),
        reject: (e) => (clearTimeout(timer), reject(e)),
      });
    });
  }

  onMessage(data) {
    if (typeof data !== 'string') {
      this.errors.push({ code: 'binary_frame', message: 'server sent a binary frame' });
      return;
    }
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      this.errors.push({ code: 'bad_json', message: `non-JSON frame: ${clip(data, 60)}` });
      return;
    }
    if (msg.type !== 'pong') this.order.push(msg.type);
    switch (msg.type) {
      case 'joined': {
        this.you = msg.you;
        this.snapshot = msg.snapshot;
        this.listeners = msg.snapshot?.listeners ?? [];
        this.lines = msg.snapshot?.lines ?? [];
        for (const l of this.lines) this.seenIds.add(l.id);
        this.states.push({ state: msg.snapshot?.state, now: msg.snapshot?.now, via: 'snapshot' });
        absorbTimeline(this.lines, msg.snapshot?.now ?? 0, msg.snapshot?.state, this.name);
        break;
      }
      case 'timeline': {
        this.lines = msg.lines ?? [];
        for (const l of this.lines) this.seenIds.add(l.id);
        this.timelineMsgs.push({ now: msg.now, sig: sigOf(this.lines) });
        absorbTimeline(this.lines, msg.now, this.lastState, this.name);
        break;
      }
      case 'presence': {
        const before = this.listeners.length;
        this.listeners = msg.listeners ?? [];
        if (this === firstActive() && before !== this.listeners.length) {
          log(this.name, `presence: ${this.listeners.length} listening (${this.listeners.map((l) => l.name).join(', ')})`);
        }
        break;
      }
      case 'status': {
        this.states.push({ state: msg.state, now: msg.now, via: 'status' });
        log(this.name, `status ${msg.state}${msg.note ? ` (${msg.note})` : ''}`);
        break;
      }
      case 'pong': {
        const t1 = performance.now();
        // t0 should come back exactly; allow a server that rounds it
        const t0 = this.sentT0.has(msg.t0) ? msg.t0 : [...this.sentT0].find((x) => Math.abs(x - msg.t0) < 1);
        if (t0 === undefined || !Number.isFinite(msg.now)) {
          this.badEchoes += 1;
          break;
        }
        this.sentT0.delete(t0);
        const rtt = t1 - t0;
        const offset = msg.now - (performance.timeOrigin + (t0 + t1) / 2);
        this.pongs.push({ rtt, offset });
        break;
      }
      case 'error': {
        this.errors.push({ code: msg.code, message: msg.message });
        log(this.name, `error ${msg.code}: ${msg.message}`);
        break;
      }
      default:
        this.errors.push({ code: 'unknown_type', message: `unknown message type ${msg.type}` });
    }
    for (const w of this.waiters.filter((x) => x.type === msg.type)) {
      this.waiters.splice(this.waiters.indexOf(w), 1);
      w.resolve();
    }
  }

  get lastState() {
    return this.states.at(-1)?.state;
  }

  leave() {
    if (this.leftAt !== null) return;
    this.leftAt = elapsed();
    clearInterval(this.pingTimer);
    try {
      this.ws?.close(1000, 'bye');
    } catch {
      // already closing
    }
  }
}

function firstActive() {
  return clients.find((c) => c.active);
}

// ---------------------------------------------------------------- HTTP helpers

async function getNow() {
  const t = performance.now();
  const res = await fetch(`${origin}/api/live/${station}/now`, { headers: { 'cache-control': 'no-cache' } });
  const ms = performance.now() - t;
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    // reported by the caller
  }
  return { status: res.status, body, text, ms };
}

function snapshotShapeProblem(b) {
  if (!b || typeof b !== 'object') return 'body is not JSON';
  if (b.station !== station) return `station is ${JSON.stringify(b.station)}, expected "${station}"`;
  if (!['warming_up', 'on_air', 'sleeping'].includes(b.state)) return `unknown state ${JSON.stringify(b.state)}`;
  if (!Number.isFinite(b.now)) return 'now is not a number';
  if (!Array.isArray(b.listeners)) return 'listeners is not an array';
  if (!Array.isArray(b.lines)) return 'lines is not an array';
  return null;
}

// ---------------------------------------------------------------- periodic sampling

const samples = { total: 0, agreed: 0, mismatches: [], ahead: [] };
let sampling = false;

async function sampleLoop() {
  sampling = true;
  while (sampling) {
    await sleep(SAMPLE_EVERY_MS);
    if (!sampling) break;
    await sampleOnce();
  }
}

function viewsDiffer(at) {
  const active = clients.filter((c) => c.active);
  if (active.length < 2) return null;
  const sigs = active.map((c) => ({ c, sig: sigOf(upcoming(c.lines, at)) }));
  const differing = sigs.filter((s) => s.sig !== sigs[0].sig);
  return differing.length ? { first: sigs[0], differing } : false;
}

async function sampleOnce() {
  const obs = firstActive();
  if (!obs) return;
  const now = serverNow();
  // Buffer ahead: how much voiced show is queued past the on-air clock
  if (obs.lastState === 'on_air' && obs.lines.length) {
    samples.ahead.push({ at: elapsed(), ms: lineEnd(obs.lines.at(-1)) - now });
  }
  let diff = viewsDiffer(now);
  if (diff === null) return;
  samples.total += 1;
  if (diff) {
    // A broadcast may be in flight to some sockets; give it a moment
    await sleep(700);
    diff = viewsDiffer(serverNow());
  }
  if (diff) {
    samples.mismatches.push(
      `${fmtT(elapsed())}: ${diff.first.c.name} vs ${diff.differing.map((d) => d.c.name).join(', ')}`,
    );
  } else if (diff === false) {
    samples.agreed += 1;
  }
}

// ---------------------------------------------------------------- scenario steps

const presenceChecks = [];
let baselineOthers = [];

function checkPresence(label) {
  const ours = clients.filter((c) => c.active);
  const expected = ours.length + baselineOthers.length;
  const problems = [];
  const counts = [];
  for (const c of clients.filter((x) => x.failure || x.closed)) problems.push(`${c.name} is not connected`);
  for (const c of ours) {
    const ids = new Map(c.listeners.map((l) => [l.id, l]));
    counts.push(`${c.name}=${c.listeners.length}`);
    if (c.listeners.length !== expected) problems.push(`${c.name} sees ${c.listeners.length}, expected ${expected}`);
    for (const o of ours) {
      const entry = ids.get(o.you.id);
      if (!entry) problems.push(`${c.name} is missing ${o.name}`);
      else if (entry.name !== o.you.name) problems.push(`${c.name} sees ${o.name} as "${entry.name}"`);
    }
    if (ids.size !== c.listeners.length) problems.push(`${c.name} has duplicate listener ids`);
  }
  const note = baselineOthers.length ? ` (incl. ${baselineOthers.length} other listener(s))` : '';
  log('sim', `presence check ${label}: ${counts.join(', ')}${problems.length ? ` -> ${problems.join('; ')}` : ''}`);
  presenceChecks.push({
    name: `presence ${label}: ${expected} listening`,
    ok: problems.length === 0 && ours.length > 0,
    detail: problems.length ? problems.join('; ') : ours.length ? `${counts.join(', ')}${note}` : 'no one connected',
  });
}

async function checkNowEndpoint() {
  const active = clients.filter((c) => c.active);
  let attempt = 0;
  let problem = null;
  let res = null;
  while (attempt++ < 2) {
    problem = null;
    try {
      res = await getNow();
    } catch (err) {
      problem = `GET /now failed: ${err.message}`;
      break;
    }
    const b = res.body;
    problem = res.status !== 200 ? `HTTP ${res.status}` : snapshotShapeProblem(b);
    if (!problem && b.state !== 'on_air') problem = `state is ${b.state}, sockets expect on_air`;
    if (!problem) {
      const ids = new Set(b.listeners.map((l) => l.id));
      const missing = active.filter((c) => !ids.has(c.you.id)).map((c) => c.name);
      if (missing.length) problem = `listeners missing ${missing.join(', ')}`;
    }
    if (!problem && active.length) {
      const httpSig = sigOf(upcoming(b.lines, b.now));
      const wsSig = sigOf(upcoming(active[0].lines, b.now));
      if (httpSig !== wsSig) problem = `lines differ from ${active[0].name}'s timeline`;
    }
    if (!problem) break;
    await sleep(700);
  }
  record(
    'GET /now agrees with the sockets',
    !problem,
    problem ?? `state on_air, ${res.body.listeners.length} listeners, ${res.body.lines.length} lines (${Math.round(res.ms)} ms)`,
  );
}

const audioChecks = [];
async function checkAudio() {
  const obs = firstActive();
  if (!obs) {
    audioChecks.push({ name: 'line audio', ok: false, detail: 'no one connected to pick lines from' });
    return;
  }
  const now = serverNow();
  const all = [...lineRegistry.values()].map((r) => r.line).sort((a, b) => a.startAt - b.startAt);
  const picks = new Map();
  const add = (l, why) => l && !picks.has(l.id) && picks.set(l.id, { line: lineRegistry.get(l.id)?.line ?? l, why });
  add(all[0], 'first line');
  for (const l of all.filter((x) => x.welcome?.length).slice(0, 3)) add(l, 'welcome');
  add(obs.lines.find((l) => l.startAt <= now && lineEnd(l) > now), 'on air now');
  const last = obs.lines.at(-1);
  if (last) add(last, `furthest ahead, ${secs(last.startAt - now)} from now`);
  for (const [id, { line, why }] of [...picks].slice(0, 6)) {
    const name = `audio ${shortId(id)} (${why})`;
    try {
      const t = performance.now();
      const res = await fetch(`${origin}/api/live/${station}/audio/${encodeURIComponent(id)}`);
      const buf = await res.arrayBuffer();
      const ms = Math.round(performance.now() - t);
      const ct = res.headers.get('content-type') ?? '';
      const expected = line.durationMs * C.LIVE_PCM_BYTES_PER_MS;
      const drift = expected ? (buf.byteLength - expected) / expected : Infinity;
      const problems = [];
      if (res.status !== 200) problems.push(`HTTP ${res.status}`);
      if (!ct.toLowerCase().startsWith('audio/pcm')) problems.push(`content-type "${ct}"`);
      if (Math.abs(drift) > AUDIO_TOLERANCE) problems.push(`length off by ${(drift * 100).toFixed(1)}%`);
      if (buf.byteLength % 2) problems.push('odd byte count (not s16)');
      audioChecks.push({
        name,
        ok: problems.length === 0,
        detail:
          `${problems.length ? `${problems.join('; ')}; ` : ''}${buf.byteLength.toLocaleString('en-US')} B vs ` +
          `${expected.toLocaleString('en-US')} expected (${drift >= 0 ? '+' : ''}${(drift * 100).toFixed(1)}%), ` +
          `${secs(line.durationMs)}, ${ms} ms${res.headers.get('cache-control') ? `, cache-control: ${res.headers.get('cache-control')}` : ''}`,
      });
    } catch (err) {
      audioChecks.push({ name, ok: false, detail: err.message });
    }
  }
  try {
    const res = await fetch(`${origin}/api/live/${station}/audio/not-a-real-line`);
    await res.arrayBuffer();
    audioChecks.push({ name: 'audio for an unknown line is a 404', ok: res.status === 404, detail: `HTTP ${res.status}` });
  } catch (err) {
    audioChecks.push({ name: 'audio for an unknown line is a 404', ok: false, detail: err.message });
  }
  log('sim', `fetched ${picks.size + 1} audio files`);
}

/** Server ms by which this listener's welcome is due */
function welcomeDeadline(c) {
  const ref = Math.max(c.you.joinedAt, onAirStart() ?? Infinity);
  return ref + WELCOME_WINDOW_MS;
}
function welcomesFor(id) {
  return [...lineRegistry.values()].map((r) => r.line).filter((l) => l.welcome?.includes(id));
}

// ---------------------------------------------------------------- evaluation

function evaluate(leaveServerMs) {
  const sims = clients;

  // Joining and state per listener
  for (const c of sims) {
    if (!c.you) {
      record(`${c.name}: joined`, false, c.failure ?? 'never joined');
      continue;
    }
    const problems = [];
    const firstType = c.order[0];
    if (firstType !== 'joined') problems.push(`first message was '${firstType}'`);
    if (c.you.name !== c.name) problems.push(`name came back as "${c.you.name}"`);
    if (!Number.isFinite(c.you.joinedAt)) problems.push('you.joinedAt is not a number');
    const shape = snapshotShapeProblem(c.snapshot);
    if (shape) problems.push(`snapshot ${shape}`);
    record(
      `${c.name}: 'joined' first`,
      problems.length === 0,
      problems.length ? problems.join('; ') : `in ${Math.round(c.joinedAt - c.joinSentAt)} ms, id ${shortId(c.you.id)}`,
    );

    // States: (sleeping) -> warming_up -> on_air, never backwards, never asleep while listening
    const rank = { sleeping: 0, warming_up: 1, on_air: 2 };
    const seq = c.states.map((s) => s.state);
    const cold = seq[0] !== 'on_air';
    const stateProblems = [];
    for (let i = 1; i < seq.length; i++) {
      if (rank[seq[i]] === undefined) stateProblems.push(`unknown state ${seq[i]}`);
      else if (rank[seq[i]] < rank[seq[i - 1]]) stateProblems.push(`${seq[i - 1]} -> ${seq[i]}`);
      else if (seq[i] === 'sleeping') stateProblems.push('went to sleep while listening');
    }
    if (cold && !seq.includes('warming_up')) stateProblems.push('never saw warming_up');
    if (!seq.includes('on_air')) stateProblems.push('never reached on_air');
    const firstOnAir = c.states.find((s) => s.state === 'on_air');
    const path = c.states
      .filter((s, i, a) => i === 0 || s.state !== a[i - 1].state)
      .map((s) => `${s.state} ${fmtT(s.now - c.you.joinedAt)}`)
      .join(' -> ');
    record(
      `${c.name}: ${cold ? 'warming_up -> on_air' : 'joins on_air'}`,
      stateProblems.length === 0,
      `${stateProblems.length ? `${stateProblems.join('; ')}; ` : ''}${path} (times after join)`,
    );

    // Time to the first line on air
    const heard = [...c.seenIds]
      .map((id) => lineRegistry.get(id)?.line)
      .filter((l) => l && lineEnd(l) > c.you.joinedAt)
      .sort((a, b) => a.startAt - b.startAt)[0];
    if (!heard) {
      record(`${c.name}: first line on air`, false, 'no line on the timeline while connected');
    } else {
      const delay = heard.startAt - c.you.joinedAt;
      const limit = cold ? COLD_FIRST_LINE_MAX_MS : MAX_GAP_MS;
      const detail =
        delay >= 0
          ? `${secs(delay)} after join${cold ? ' (cold start)' : ''}${firstOnAir ? `; on_air status ${fmtT(firstOnAir.now - c.you.joinedAt)}` : ''}`
          : `immediately: joined ${secs(-delay)} into a ${secs(heard.durationMs)} line`;
      record(`${c.name}: first line on air`, delay <= limit, `${detail}${delay > limit ? ` (limit ${secs(limit)})` : ''}`);
    }
  }

  for (const p of presenceChecks) record(p.name, p.ok, p.detail);

  // Identical broadcasts: every pair, over the time both were listening
  const joined = sims.filter((c) => c.you);
  const pairProblems = [];
  let comparedMsgs = 0;
  for (let i = 0; i < joined.length; i++) {
    for (let j = i + 1; j < joined.length; j++) {
      const a = joined[i];
      const b = joined[j];
      const from = Math.max(a.snapshot.now, b.snapshot.now);
      const to = leaveServerMs - 1_500;
      const pick = (c) => c.timelineMsgs.filter((m) => m.now > from && m.now < to);
      const ma = pick(a);
      const mb = pick(b);
      comparedMsgs += ma.length;
      if (ma.length !== mb.length) {
        pairProblems.push(`${a.name} got ${ma.length} timeline updates, ${b.name} ${mb.length}`);
        continue;
      }
      const k = ma.findIndex((m, x) => m.sig !== mb[x].sig || m.now !== mb[x].now);
      if (k >= 0) pairProblems.push(`${a.name} and ${b.name} differ at update ${rel(ma[k].now)}`);
    }
  }
  record(
    'all listeners get identical timeline updates',
    joined.length > 1 ? pairProblems.length === 0 : null,
    pairProblems.length ? pairProblems.slice(0, 3).join('; ') : `${comparedMsgs} updates compared across ${joined.length} listeners`,
  );
  record(
    'same lines and startAt at the same moments',
    samples.total ? samples.mismatches.length === 0 : null,
    samples.mismatches.length
      ? `${samples.mismatches.length} of ${samples.total} samples disagreed: ${samples.mismatches.slice(0, 3).join('; ')}`
      : `${samples.agreed} of ${samples.total} samples agree (every ${secs(SAMPLE_EVERY_MS)})`,
  );

  // Timeline integrity, per message and over the aired history
  const aired = [...lineRegistry.values()]
    .map((r) => r.line)
    .filter((l) => l.startAt < leaveServerMs)
    .sort((a, b) => a.startAt - b.startAt);
  const overlaps = allIntegrityProblems.filter((p) => p.kind === 'overlap').map((p) => `${p.at} ${p.problem}`);
  const gaps = allIntegrityProblems.filter((p) => p.kind === 'gap').map((p) => `${p.at} ${p.problem}`);
  const other = allIntegrityProblems.filter((p) => !p.kind).map((p) => `${p.at} ${p.problem}`);
  let maxGap = 0;
  for (let i = 1; i < aired.length; i++) {
    const gap = aired[i].startAt - lineEnd(aired[i - 1]);
    if (gap < -EPS_MS) overlaps.push(`aired ${shortId(aired[i - 1].id)} overlaps ${shortId(aired[i].id)} by ${-gap} ms`);
    if (gap >= MAX_GAP_MS) gaps.push(`aired ${secs(gap)} gap before ${shortId(aired[i].id)} at ${rel(aired[i].startAt)}`);
    maxGap = Math.max(maxGap, gap);
  }
  record(
    'lines never overlap',
    aired.length ? overlaps.length === 0 : false,
    overlaps.length ? `${overlaps.length}: ${overlaps.slice(0, 3).join('; ')}` : `${aired.length} aired lines, ${checkedSigs.size} timelines checked`,
  );
  record(
    `gaps stay under ${secs(MAX_GAP_MS)} once on air`,
    aired.length ? gaps.length === 0 : false,
    gaps.length ? `${gaps.length}: ${gaps.slice(0, 3).join('; ')}` : `largest gap ${Math.max(0, maxGap)} ms over ${aired.length} lines`,
  );
  if (other.length) record('timeline messages well formed', false, `${other.length}: ${other.slice(0, 3).join('; ')}`);

  // Re-timing only moves lines that haven't started yet; line identity never changes
  const badRetimes = retimes.filter((r) => r.from <= r.msgNow);
  const shifts = retimes.map((r) => r.to - r.from);
  record(
    'only future lines get re-timed',
    badRetimes.length === 0,
    badRetimes.length
      ? `${badRetimes.length} on-air/past lines moved, e.g. ${shortId(badRetimes[0].id)} ${rel(badRetimes[0].from)} -> ${rel(badRetimes[0].to)}`
      : retimes.length
        ? `${retimes.length} re-timings, shifts ${secs(Math.min(...shifts))}..${secs(Math.max(...shifts))}`
        : 'no re-timings seen',
  );
  record(
    'line text/speaker/duration stable per id',
    identityChanges.length === 0,
    identityChanges.length
      ? identityChanges.slice(0, 3).map((x) => `${shortId(x.id)} ${x.field} changed`).join('; ')
      : `${lineRegistry.size} line ids`,
  );

  // Buffer ahead of the on-air clock (after a 10 s ramp-up)
  const firstStart = onAirStart();
  const ahead = samples.ahead.filter((s) => s.at > 10_000).map((s) => s.ms);
  if (ahead.length) {
    const sorted = [...ahead].sort((a, b) => a - b);
    const dry = sorted[0] <= 0;
    record(
      'show never runs dry',
      !dry,
      `buffer ahead min ${secs(sorted[0])}, median ${secs(sorted[Math.floor(sorted.length / 2)])}, ` +
        `max ${secs(sorted.at(-1))} (target ${secs(C.LIVE_BUFFER_AHEAD_MS)})`,
    );
  } else {
    record('show never runs dry', false, 'never sampled the timeline on air');
  }

  // Welcomes
  for (const c of joined) {
    const ws = welcomesFor(c.you.id).sort((a, b) => a.startAt - b.startAt);
    if (!ws.length) {
      const n = [...lineRegistry.values()].filter((r) => r.line.welcome?.length).length;
      record(`${c.name}: welcomed within ${secs(WELCOME_WINDOW_MS)}`, false, `no welcome line includes ${shortId(c.you.id)} (${n} welcome lines seen)`);
      continue;
    }
    const w = ws[0];
    const ref = Math.max(c.you.joinedAt, firstStart ?? c.you.joinedAt);
    const delay = w.startAt - ref;
    const problems = [];
    if (delay > WELCOME_WINDOW_MS) problems.push(`late by ${secs(delay - WELCOME_WINDOW_MS)}`);
    if (w.startAt < c.you.joinedAt) problems.push('starts before the join');
    if (ws.length > 1) problems.push(`welcomed ${ws.length} times`);
    if (w.type !== 'rj_link') problems.push(`type ${w.type}, expected rj_link`);
    if (w.startAt >= leaveServerMs) problems.push('not on air before everyone left');
    record(
      `${c.name}: welcomed within ${secs(WELCOME_WINDOW_MS)}`,
      problems.length === 0,
      `${problems.length ? `${problems.join('; ')}; ` : ''}${shortId(w.id)} at ${rel(w.startAt)}, ` +
        `${secs(w.startAt - c.you.joinedAt)} after join${ref > c.you.joinedAt ? `, ${secs(delay)} after on air` : ''}`,
    );
  }
  const rahul = clients.find((c) => c.name === 'Rahul');
  const ananya = clients.find((c) => c.name === 'Ananya');
  if (rahul?.you && ananya?.you) {
    const wr = welcomesFor(rahul.you.id);
    const shared = wr.find((l) => l.welcome.includes(ananya.you.id));
    record(
      'Rahul + Ananya share one welcome line',
      Boolean(shared) && wr.length === 1 && welcomesFor(ananya.you.id).length === 1,
      shared
        ? `${shortId(shared.id)} welcomes ${shared.welcome.map(nameOfId).join(', ')}; joins ${Math.abs(rahul.you.joinedAt - ananya.you.joinedAt)} ms apart`
        : `Rahul's welcome lines: ${wr.length ? wr.map((l) => l.welcome.map(nameOfId).join('+')).join(', ') : 'none'}`,
    );
  } else {
    record('Rahul + Ananya share one welcome line', false, 'Rahul or Ananya never joined');
  }
  const welcomeLines = [...lineRegistry.values()]
    .map((r) => r.line)
    .filter((l) => l.welcome?.length)
    .sort((a, b) => a.startAt - b.startAt);
  if (welcomeLines.length > 1) {
    const tooClose = [];
    for (let i = 1; i < welcomeLines.length; i++) {
      const gap = welcomeLines[i].startAt - welcomeLines[i - 1].startAt;
      if (gap < C.LIVE_WELCOME_MIN_GAP_MS - 50) tooClose.push(`${secs(gap)} before ${shortId(welcomeLines[i].id)}`);
    }
    record(
      `welcomes at least ${secs(C.LIVE_WELCOME_MIN_GAP_MS)} apart`,
      tooClose.length === 0,
      tooClose.length ? tooClose.join('; ') : welcomeLines.map((l) => rel(l.startAt)).join(', '),
    );
  }
  // Placement: right after the line that was on air when the welcome appeared (or the first slot the gap rule allows)
  const placement = [];
  let placementBad = false;
  let prevWelcome = null;
  for (const w of welcomeLines) {
    const first = lineRegistry.get(w.id).firstSeen;
    const idx = first.lines.findIndex((l) => l.id === w.id);
    const before = idx > 0 ? first.lines[idx - 1] : null;
    if (firstStart === null || first.now < firstStart || !before) {
      placement.push(`${shortId(w.id)} opener`);
    } else {
      const allowedFrom = Math.max(first.now, prevWelcome ? prevWelcome.startAt + C.LIVE_WELCOME_MIN_GAP_MS : -Infinity);
      const contiguous = Math.abs(w.startAt - lineEnd(before)) <= EPS_MS + 50;
      const ok = before.startAt <= allowedFrom + 50 && contiguous;
      placement.push(
        `${shortId(w.id)} ${ok ? 'ok' : 'LATE'}: after a line that started ${secs(before.startAt - first.now)} vs now, ` +
          `${secs(w.startAt - first.now)} ahead when first seen`,
      );
      if (!ok) placementBad = true;
    }
    prevWelcome = w;
  }
  if (welcomeLines.length) {
    record('welcomes go right after the line on air', !placementBad, placement.join('; '));
  }

  // Clock sync
  const offs = joined.filter((c) => c.offset !== null);
  if (!offs.length) {
    record('clock offset sane', false, 'no pong received');
  } else {
    const bad = offs.filter((c) => Math.abs(c.offset) >= MAX_OFFSET_MS);
    const values = offs.map((c) => c.offset);
    const spread = Math.max(...values) - Math.min(...values);
    const echoes = joined.reduce((n, c) => n + c.badEchoes, 0);
    const missingPongs = joined.filter((c) => c.offset === null).map((c) => c.name);
    record(
      `clock offset sane (|offset| < ${secs(MAX_OFFSET_MS)})`,
      bad.length === 0 && echoes === 0 && missingPongs.length === 0,
      `${offs.map((c) => `${c.name} ${Math.round(c.offset)} ms`).join(', ')}; spread ${Math.round(spread)} ms; ` +
        `min RTT ${Math.round(Math.min(...offs.flatMap((c) => c.pongs.map((p) => p.rtt))))} ms` +
        `${echoes ? `; ${echoes} pongs with an unknown t0` : ''}${missingPongs.length ? `; no pong for ${missingPongs.join(', ')}` : ''}`,
    );
  }

  for (const a of audioChecks) record(a.name, a.ok, a.detail);

  // Errors and stray closes
  const errs = joined.flatMap((c) => c.errors.map((e) => `${c.name}: ${e.code} ${clip(e.message, 50)}`));
  const closes = joined.filter((c) => c.closed).map((c) => `${c.name} closed at ${fmtT(c.closed.at)} (code ${c.closed.code})`);
  record('no error messages or dropped sockets', errs.length + closes.length === 0, [...errs, ...closes].slice(0, 4).join('; ') || 'clean');

  return { aired, welcomeLines };
}

// ---------------------------------------------------------------- report

function printReport({ aired, welcomeLines }) {
  console.log('\nWelcome lines');
  if (!welcomeLines.length) console.log('  (none seen)');
  for (const l of welcomeLines) {
    console.log(`  ${rel(l.startAt).padStart(7)}  ${l.welcome.map(nameOfId).join(' + ')}  [${l.line?.speaker}, ${secs(l.durationMs)}]`);
    console.log(`           ${l.line?.text}`);
    if (l.line?.en) console.log(`           (${l.line.en})`);
  }

  console.log('\nAired run sheet');
  if (!aired.length) console.log('  (nothing aired)');
  const shown = aired.length > 40 ? [...aired.slice(0, 20), null, ...aired.slice(-19)] : aired;
  for (const l of shown) {
    if (!l) {
      console.log(`  … ${aired.length - 39} more …`);
      continue;
    }
    const mark = l.welcome?.length ? ` <- welcome ${l.welcome.map(nameOfId).join('+')}` : '';
    console.log(
      `  ${rel(l.startAt).padStart(7)} ${secs(l.durationMs).padStart(5)}  ${String(l.type).padEnd(10)} ` +
        `${clip(l.title, 18).padEnd(18)} ${clip(l.line?.text, 54)}${mark}`,
    );
  }

  const nameW = Math.min(52, Math.max(10, ...results.map((r) => r.name.length)));
  console.log(`\n${'Check'.padEnd(nameW)}  Result  Detail`);
  console.log(`${'-'.repeat(nameW)}  ------  ${'-'.repeat(40)}`);
  for (const r of results) {
    console.log(`${clip(r.name, nameW).padEnd(nameW)}  ${r.status.padEnd(6)}  ${r.detail}`);
  }
  const count = (s) => results.filter((r) => r.status === s).length;
  console.log(
    `\n${count('PASS')} passed, ${count('FAIL')} failed${count('SKIP') ? `, ${count('SKIP')} skipped` : ''}` +
      `${count('INFO') ? `, ${count('INFO')} info` : ''} (${secs(elapsed())} total)`,
  );
}

// ---------------------------------------------------------------- main

/** POST the studio switch (start/stop) with the admin key from the environment. */
async function control(action) {
  const res = await fetch(`${origin}/api/live/${station}/control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.LIVE_ADMIN_TOKEN}` },
    body: JSON.stringify({ action }),
  });
  return { status: res.status, text: await res.text() };
}

async function main() {
  if (typeof WebSocket !== 'function') {
    console.error('This script needs a global WebSocket (Node 22 or newer).');
    process.exit(2);
  }
  console.log(`Listen-together simulation: station "${station}" at ${origin}${opts.quick ? ' (quick)' : ''}`);
  console.log(`WebSocket ${wsUrl}\n`);

  // Stations are off by default: switch this one on for the run when an admin key is given
  if (process.env.LIVE_ADMIN_TOKEN) {
    const started = await control('start');
    console.log(`Studio switch: start -> HTTP ${started.status} ${clip(started.text, 120)}\n`);
    if (started.status !== 200) process.exit(2);
  } else {
    console.log('No LIVE_ADMIN_TOKEN set: the station must already be started, or joins will wait off air.\n');
  }

  // Pre-flight: the station must answer /now
  let pre;
  try {
    pre = await getNow();
  } catch (err) {
    console.error(`Cannot reach ${origin}: ${err.cause?.code ?? err.message}. Start the dev server and try again.`);
    process.exit(2);
  }
  const preProblem = pre.status !== 200 ? `HTTP ${pre.status}: ${clip(pre.text, 80)}` : snapshotShapeProblem(pre.body);
  record('GET /now before anyone joins', !preProblem, preProblem ?? `state ${pre.body.state}, ${pre.body.listeners.length} listeners (${Math.round(pre.ms)} ms)`);
  if (preProblem) {
    console.error(`GET /api/live/${station}/now is not ready: ${preProblem}`);
    printReport({ aired: [], welcomeLines: [] });
    process.exit(2);
  }
  baselineOthers = pre.body.listeners;
  if (pre.body.state !== 'sleeping') {
    console.log(`Note: the station is already ${pre.body.state} (an earlier run or another listener), so Harsh may not see a cold start.`);
  }
  if (baselineOthers.length) {
    console.log(`Note: ${baselineOthers.length} other listener(s) already connected; presence counts include them.`);
  }

  const harsh = new SimListener('Harsh');
  const priya = new SimListener('Priya');
  const rahul = new SimListener('Rahul');
  const ananya = new SimListener('Ananya');

  T0 = performance.now();
  const sampler = sampleLoop();

  await harsh.start();
  if (!harsh.you) {
    // Nothing else can work without a socket; report what we know and stop
    sampling = false;
    await sampler;
    console.log(`\nThe first listener could not join, so the rest of the scenario was skipped.`);
    const summary = evaluate(serverNow());
    printReport(summary);
    process.exit(1);
  }
  await until(harsh.joinedAt + T.presenceSettle);
  checkPresence('after Harsh joins');

  await until(T.priya);
  await priya.start();
  await until(priya.joinedAt + T.presenceSettle);
  checkPresence('after Priya joins');

  await until(T.group);
  await Promise.all([rahul.start(), ananya.start()]);
  await until(Math.max(rahul.joinedAt ?? 0, ananya.joinedAt ?? 0, elapsed()) + T.presenceSettle);
  checkPresence('after Rahul + Ananya join');

  await until(T.nowCheck);
  await checkNowEndpoint();

  await until(T.audio);
  await checkAudio();

  await until(T.leave);
  // Stay a little longer while someone's welcome is still due or still playing (cap: 45 s)
  const cap = elapsed() + 45_000;
  let waitLogged = false;
  for (;;) {
    const pending = clients.filter((c) => {
      if (!c.active) return false;
      const w = welcomesFor(c.you.id)[0];
      return w ? lineEnd(w) > serverNow() : serverNow() < welcomeDeadline(c);
    });
    if (!pending.length || elapsed() >= cap) break;
    if (!waitLogged) {
      log('sim', `staying for welcomes still due or playing: ${pending.map((c) => c.name).join(', ')}`);
      waitLogged = true;
    }
    await sleep(1_000);
  }
  checkPresence('before leaving');

  const leaveServerMs = serverNow();
  const leavePerf = performance.now();
  sampling = false;
  for (const c of clients) c.leave();
  log('sim', 'everyone left');
  await sampler;

  // Listeners should drop off /now promptly
  await sleep(2_000);
  let leftProblem = null;
  let afterLeave = null;
  try {
    afterLeave = await getNow();
    const ours = new Set(clients.filter((c) => c.you).map((c) => c.you.id));
    const still = (afterLeave.body?.listeners ?? []).filter((l) => ours.has(l.id)).map((l) => l.name);
    leftProblem = afterLeave.status !== 200 ? `HTTP ${afterLeave.status}` : still.length ? `still listed: ${still.join(', ')}` : null;
  } catch (err) {
    leftProblem = err.message;
  }
  record('listeners removed after leaving', !leftProblem, leftProblem ?? `state ${afterLeave.body.state}, ${afterLeave.body.listeners.length} listeners 2 s after leaving`);

  // The station should sleep LIVE_IDLE_SLEEP_MS after the last listener leaves
  const sleepName = `station sleeps ~${secs(C.LIVE_IDLE_SLEEP_MS)} after the last listener`;
  if (opts.quick) {
    record(sleepName, null, 'skipped (--quick)');
  } else if ((afterLeave?.body?.listeners?.length ?? 0) > 0) {
    record(sleepName, null, 'other listeners are still connected');
  } else {
    const deadline = C.LIVE_IDLE_SLEEP_MS + 30_000;
    log('sim', `polling /now every 5 s until the station sleeps (up to ${secs(deadline)} after leaving)`);
    let sleptAfter = null;
    let lastState = afterLeave?.body?.state;
    if (lastState === 'sleeping') sleptAfter = performance.now() - leavePerf;
    while (sleptAfter === null && performance.now() - leavePerf < deadline) {
      await sleep(5_000);
      try {
        const r = await getNow();
        if (r.body?.state !== lastState) log('sim', `/now state ${r.body?.state}`);
        lastState = r.body?.state;
        if (lastState === 'sleeping') sleptAfter = performance.now() - leavePerf;
      } catch (err) {
        log('sim', `/now failed: ${err.message}`);
      }
    }
    if (sleptAfter === null) {
      record(sleepName, false, `still ${lastState} ${secs(performance.now() - leavePerf)} after leaving`);
    } else {
      const early = sleptAfter < C.LIVE_IDLE_SLEEP_MS - 5_000;
      record(sleepName, !early, `sleeping within ${secs(sleptAfter)} of leaving (polled every 5 s)${early ? ', too early' : ''}`);
    }
  }

  const summary = evaluate(leaveServerMs);
  printReport(summary);
  // Never leave a test station spending credits
  if (process.env.LIVE_ADMIN_TOKEN) {
    const stopped = await control('stop').catch((err) => ({ status: 0, text: String(err) }));
    console.log('Studio switch: stop -> HTTP ' + stopped.status);
  }
  process.exit(results.some((r) => r.status === 'FAIL') ? 1 : 0);
}

function parseArgs(argv) {
  const o = { base: 'http://localhost:5191', station: 'hi', quick: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const [flag, inline] = a.startsWith('--') && a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
    const value = () => inline ?? argv[++i];
    if (flag === '--quick') o.quick = true;
    else if (flag === '--base') o.base = value();
    else if (flag === '--station') o.station = value();
    else if (flag === '--help' || flag === '-h') {
      console.log('Usage: node scripts/live-sim.mjs [--base http://localhost:5191] [--station hi] [--quick]');
      process.exit(0);
    } else if (!a.startsWith('-')) o.base = a;
    else {
      console.error(`Unknown option ${a}. Usage: node scripts/live-sim.mjs [--base URL] [--station id] [--quick]`);
      process.exit(2);
    }
  }
  if (!/^https?:\/\//i.test(o.base ?? '')) {
    console.error(`--base must be an http(s) URL, got ${o.base}`);
    process.exit(2);
  }
  if (!/^[a-z]{2}$/.test(o.station ?? '')) {
    console.error(`--station must be a station id like hi, got ${o.station}`);
    process.exit(2);
  }
  return o;
}

main().catch(async (err) => {
  console.error(err);
  if (process.env.LIVE_ADMIN_TOKEN) await control('stop').catch(() => {});
  process.exit(1);
});
