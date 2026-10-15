#!/usr/bin/env node
/**
 * Writing eval: plays a show clock against a running Tarang FM server the way a listener's client does,
 * saves every script, and (with --score) grades each segment with the producer rubric.
 *
 *   node scripts/eval-show.mjs --base <url> [--plan sample9|serial|smoke] [--station hi] [--seeds 1]
 *                              [--score] [--out <dir>] [--compare <before-*.json ...>|none] [--yes]
 *   node scripts/eval-show.mjs --from <run dir> [--score] [--compare ...]
 *
 * Plans
 *   sample9  the 9 segments of the "before" sample: hi rj_link, news, ad_break, kahani, rj_link, ad_break,
 *            kahani + ta rj_link, kahani (as v2 entries: opener, news full, ad, part 1, kahani_out, ad, part 2;
 *            ta opener, part 1)
 *   serial   one full v2 clock loop on one station (default hi): station_id, opener, news full, ad, kahani_in,
 *            part 1, kahani_out, news update, ad, kahani_in, part 2, kahani_out, ad, kahani_in, part 3, kahani_out
 *   smoke    rj_link opener + news update + ad_break + kahani part 1 on mr, bn and gu
 *   --station picks the serial's station, or filters sample9/smoke to the listed stations (comma list).
 *
 * Client behaviour: GET /api/context per station (tune-in), then POST /api/segment per entry in clock order,
 * with subtitles on, showLog (heardSummary over summary), the producer plan for RJ links, and the v2 fields
 * (mode, part, serial, recapSource, linkState, airedNews). An old server ignores the v2 fields; on a v2 server
 * the news headlines are left to the newsroom. Kahani part n is written before the kahani_in link that
 * introduces it (the client prefetches it), so that link can carry the serial's tease.
 * The listener is the frozen fixture from the test plan: Harsh, Vadodara, 20:15, Thu 15 Oct 2026, 27 °C clear
 * (--live-weather sends the weather /api/context returns instead).
 *
 * Output (<out>, default tmp/eval/<plan>-<stamp>): after-<station>-<NN>-<type>.json raw responses,
 * after.md (role, native text, English subtitle) and, with --score, scores.json.
 *
 * --score  one sarvam-105b call per segment (flat JSON, reasoning off, temperature 0.1) with the producer
 *          prompt. The baseline given with --compare (the before-*.json files of the "before" sample; a glob
 *          is expanded here, so it works unquoted or quoted) is scored the same way, then a before/after table per segment type and the hard-gate counts are printed. Scores are
 *          cached by prompt hash (--cache, default tmp/eval/score-cache.json), so an unchanged script is never
 *          scored twice. SARVAM_API_KEY is read from the repo's .dev.vars.
 * --from <dir>  score a saved run again (its after-*.json) instead of generating: no segment requests, and
 *          with the cache usually no scoring calls either (use it after changing the gates or the tables).
 * Budget   the Sarvam call count (server-side generation estimate + scoring calls made here) is printed before
 *          anything runs; more than 30 needs --yes. --dry-run prints the plan and the budget, then stops
 *          (with --score it also runs the free checks on the baseline and writes its scoring prompts to
 *          <out>/scoring-prompts.txt, still without a Sarvam call).
 * Exit     0 done, 1 a request or scoring call failed, 2 bad options or over budget without --yes.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHAT_URL = 'https://api.sarvam.ai/v1/chat/completions';
const SCORER_MODEL = 'sarvam-105b';
const BUDGET_LIMIT = 30;
const SCORE_CONCURRENCY = 2;
const SEGMENT_TIMEOUT_MS = 90_000;
const SCORE_TIMEOUT_MS = 45_000;
/** Bump when the scoring prompt changes, so cached scores are not reused across versions. */
const SCORER_VERSION = 'producer-v3.1';

// ---------------------------------------------------------------- fixture and stations

const FIXTURE = {
  name: 'Harsh',
  city: 'Vadodara',
  localTime: '20:15',
  daypart: 'evening',
  localDate: '2026-10-15',
  weekday: 4,
  region: 'Gujarat',
};
const FIXTURE_WEATHER = { tempC: 27, description: 'clear sky', notable: 'none' };

const STATIONS = {
  hi: { lang: 'Hindi', freq: '91.1' },
  ta: { lang: 'Tamil', freq: '98.3' },
  bn: { lang: 'Bangla', freq: '102.7' },
  mr: { lang: 'Marathi', freq: '94.3' },
  gu: { lang: 'Gujarati', freq: '106.1' },
  en: { lang: 'English', freq: '' },
  te: { lang: 'Telugu', freq: '' },
  kn: { lang: 'Kannada', freq: '' },
  pa: { lang: 'Punjabi', freq: '' },
};
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ---------------------------------------------------------------- plans

const SAMPLE9 = {
  hi: [
    { type: 'rj_link', mode: 'opener', upNext: 'news' },
    { type: 'news', mode: 'full', upNext: 'ad_break' },
    { type: 'ad_break', upNext: 'kahani' },
    { type: 'kahani', part: 1, upNext: 'rj_link' },
    { type: 'rj_link', mode: 'kahani_out', forPart: 1, upNext: 'ad_break' },
    { type: 'ad_break', upNext: 'kahani' },
    { type: 'kahani', part: 2, upNext: 'rj_link' },
  ],
  ta: [
    { type: 'rj_link', mode: 'opener', upNext: 'news' },
    { type: 'kahani', part: 1, upNext: 'rj_link' },
  ],
};

/** Show clock v2 (shared/constants.ts SHOW_CLOCK_V2); the loop starts again at index 2. */
const CLOCK_V2 = [
  { type: 'station_id' },
  { type: 'rj_link', mode: 'opener' },
  { type: 'news', mode: 'full' },
  { type: 'ad_break' },
  { type: 'rj_link', mode: 'kahani_in', forPart: 1 },
  { type: 'kahani', part: 1 },
  { type: 'rj_link', mode: 'kahani_out', forPart: 1 },
  { type: 'news', mode: 'update' },
  { type: 'ad_break' },
  { type: 'rj_link', mode: 'kahani_in', forPart: 2 },
  { type: 'kahani', part: 2 },
  { type: 'rj_link', mode: 'kahani_out', forPart: 2 },
  { type: 'ad_break' },
  { type: 'rj_link', mode: 'kahani_in', forPart: 3 },
  { type: 'kahani', part: 3 },
  { type: 'rj_link', mode: 'kahani_out', forPart: 3 },
];
const CLOCK_LOOP_FROM = 2;

const SMOKE = [
  { type: 'rj_link', mode: 'opener', upNext: 'news' },
  { type: 'news', mode: 'update', upNext: 'ad_break' },
  { type: 'ad_break', upNext: 'kahani' },
  { type: 'kahani', part: 1, upNext: 'rj_link' },
];

function buildPlan(plan, stationOpt) {
  const only = stationOpt ? stationOpt.split(',').map((s) => s.trim()).filter(Boolean) : [];
  for (const s of only) if (!STATIONS[s]) fail(`unknown station "${s}"`);
  if (plan === 'sample9') {
    const stations = only.length ? only : ['hi', 'ta'];
    return stations.map((station) => {
      if (!SAMPLE9[station]) fail(`sample9 has no "${station}" sequence (hi, ta)`);
      return { station, entries: SAMPLE9[station] };
    });
  }
  if (plan === 'serial') {
    const stations = only.length ? only : ['hi'];
    const entries = CLOCK_V2.map((e, i) => ({ ...e, upNext: (CLOCK_V2[i + 1] ?? CLOCK_V2[CLOCK_LOOP_FROM]).type }));
    return stations.map((station) => ({ station, entries }));
  }
  if (plan === 'smoke') {
    const stations = only.length ? only : ['mr', 'bn', 'gu'];
    return stations.map((station) => ({ station, entries: SMOKE }));
  }
  fail(`unknown plan "${plan}" (sample9, serial, smoke)`);
}

// ---------------------------------------------------------------- options

function fail(message, code = 2) {
  console.error(`eval-show: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = argv.flatMap((a) => (a.startsWith('--') && a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a]));
  const o = {
    base: '',
    plan: 'sample9',
    station: '',
    seeds: 1,
    score: false,
    out: '',
    compare: null,
    cache: '',
    yes: false,
    dryRun: false,
    liveWeather: false,
    from: '',
    help: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const val = () => {
      const v = args[++i];
      if (v === undefined || v.startsWith('--')) fail(`${a} needs a value`);
      return v;
    };
    switch (a) {
      case '--base': o.base = val(); break;
      case '--plan': o.plan = val(); break;
      case '--station': o.station = val(); break;
      case '--seeds': o.seeds = Number(val()); break;
      case '--score': o.score = true; break;
      case '--out': o.out = val(); break;
      case '--cache': o.cache = val(); break;
      case '--yes': o.yes = true; break;
      case '--dry-run': o.dryRun = true; break;
      case '--live-weather': o.liveWeather = true; break;
      case '--from': o.from = val(); break;
      case '--compare':
        o.compare = [];
        while (args[i + 1] !== undefined && !args[i + 1].startsWith('--')) o.compare.push(args[++i]);
        if (!o.compare.length) fail('--compare needs files or a glob, e.g. --compare <dir>/before-*.json');
        break;
      case '-h':
      case '--help': o.help = true; break;
      default: fail(`unknown option ${a} (see --help)`);
    }
  }
  if (o.help) return o;
  if (!o.base && !o.from) fail('--base <url> is required, e.g. --base http://localhost:5173');
  if (!Number.isInteger(o.seeds) || o.seeds < 1 || o.seeds > 5) fail('--seeds must be 1-5');
  o.base = o.base.replace(/\/+$/, '');
  o.compare ??= [];
  return o;
}

function usage() {
  const src = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const doc = src.slice(src.indexOf('/**') + 3, src.indexOf('*/'));
  console.log(doc.split('\n').map((l) => l.replace(/^ \* ?/, '')).join('\n').trim());
}

/** Expands paths and simple globs ("*", "?" in the file name), relative to the cwd, then to the repo root. */
function expandGlobs(patterns) {
  const files = [];
  for (const p of patterns) {
    if (p === 'none') continue;
    const name = basename(p);
    const dirCandidates = [resolve(dirname(p)), resolve(ROOT, dirname(p))];
    if (!/[*?]/.test(name)) {
      const hit = [resolve(p), resolve(ROOT, p)].find((f) => existsSync(f));
      if (!hit) fail(`--compare file not found: ${p}`);
      files.push(hit);
      continue;
    }
    const dir = dirCandidates.find((d) => existsSync(d));
    if (!dir) fail(`--compare folder not found: ${dirname(p)}`);
    const re = new RegExp(`^${name.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
    files.push(...readdirSync(dir).filter((f) => re.test(f)).sort().map((f) => join(dir, f)));
  }
  return [...new Set(files)];
}

function readKey() {
  const file = join(ROOT, '.dev.vars');
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*SARVAM_API_KEY\s*=\s*(.*?)\s*$/);
      if (m && m[1]) return m[1].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  if (process.env.SARVAM_API_KEY) return process.env.SARVAM_API_KEY;
  fail('SARVAM_API_KEY is not in .dev.vars (needed for --score)');
}

// ---------------------------------------------------------------- small helpers

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad2 = (n) => String(n).padStart(2, '0');
/** A path for messages: relative to the cwd when it is inside it, else absolute. */
const shown = (p) => {
  const rel = relative(process.cwd(), p);
  return rel && !rel.startsWith('..') ? rel : p;
};
const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;
const clip = (s, n) => (s && s.length > n ? s.slice(0, n) : s);
const isNone = (s) => !s || /^\s*(none|nothing|n\/a|na|-|no invented (facts|claims)\.?)\.?\s*$/i.test(s);

/** NFC text with nukta and joiners removed, so spelling variants compare equal. */
function norm(text) {
  return (text ?? '').normalize('NFD').replace(/[़়઼‌‍]/g, '').normalize('NFC');
}

/** A regex matching any of `words` as a whole word in Indic or Latin script (no \b for Indic). */
function words(list) {
  return new RegExp(`(?<![\\p{L}\\p{M}])(?:${list.map(norm).join('|')})(?![\\p{L}\\p{M}])`, 'iu');
}

function isV2Response(r) {
  return Boolean(r && ('heardSummary' in r || 'linkState' in r || 'newsIds' in r || 'serial' in r));
}

function festivalFor(date) {
  if (!date) return '';
  if (date >= '2026-10-11' && date <= '2026-10-19') return 'Navratri (garba nights in Gujarat); customs and food only, no day numbers';
  if (date === '2026-10-20') return 'Dussehra';
  return '';
}

// ---------------------------------------------------------------- free checks (code, no model call)

const LEAK_RE = /(delivery|role|narrator|char_[a-z]+|ad_(announcer|customer)|hushed|excited|dramatic|whisper\w*)\s*[:：]/i;
const LEAK_EXTRA = [/[()[\]]/, /\bSFX\b/i, new RegExp(norm('आवाज़ में') + '\\s*[:：]')];

/** prompts-draft §10.4 plus the fragments the old validator already guards. */
const EXAMPLE_FRAGMENTS = [
  'lift का सबसे मुश्किल काम', 'पड़ोसी से नज़र बचाना', 'पकौड़ों के बहाने बारिश', 'बाकी बातें एक छोटे से break',
  'शहर के नए food street', 'आज का माहौल तो एकदम मस्त', 'शहर में त्योहार की रौनक देखने लायक',
  'हालात बेहद गंभीर', 'रटंतु', 'Rank 1 का दावा', 'अगर आप ख़ुद उड़ सकें', 'पंख शामिल नहीं',
  'ज़िंदगी बदल देगा, आज ही', 'साइकिल की घंटी बेच दी', 'कुकर की तीसरी सीटी', 'पूरी गली की बत्ती चली गई',
  'race मत जाना', 'सबको सच पता चल गया', 'स्टार्ट नहीं, attention चाहिए', 'garba में सबसे आगे जो नाचता',
  'आख़िरी twist अभी तक दिमाग में घूम',
  'हवेली का दरवाज़ा अभी तक', 'दरवाज़ा है, जो सिर्फ़ रात को खुलता', 'जो सिर्फ़ रात को खुलता है',
  'seat पे बैठना अब adventure sport', 'seat अब adventure sport', 'अब आ रही है कहानी', 'हवेली की पुरानी घड़ी अचानक रुक गई',
];
const fragKey = (t) => norm(t).replace(/\s+/g, '').toLowerCase();
const FRAGMENT_KEYS = [...new Set(EXAMPLE_FRAGMENTS.map(fragKey))];

/** Clock time or temperature in a line (per station script). */
const TIME_WEATHER = {
  common: /\d{1,2}\s?[:.]\s?\d{2}(?!\d)|°|\bdegrees?\b/iu,
  hi: words(['सवा', 'साढ़े', 'पौने', 'बजे', 'बजकर', 'डिग्री', 'तापमान']),
  mr: words(['वाजले', 'वाजता', 'वाजून', 'सव्वा', 'साडे', 'पावणे', 'अंश', 'डिग्री', 'तापमान']),
  bn: words(['টা বাজে', 'সাড়ে', 'সোয়া', 'পৌনে', 'ডিগ্রি', 'তাপমাত্রা']),
  gu: words(['વાગ્યે', 'વાગ્યા', 'સવા', 'સાડા', 'પોણા', 'ડિગ્રી', 'તાપમાન']),
  ta: /மணி|டிகிரி|வெப்பநிலை/u,
};

function slateText(seg) {
  const items = newsItems(seg);
  return items.map((h) => `${h.title ?? ''} ${h.detail ?? ''} ${h.source ?? ''}`).join(' ');
}

/** Latin proper nouns and numbers in a bulletin that appear nowhere in its slate. */
function newsUnsupported(seg) {
  const L = seg.request?.listener ?? FIXTURE;
  const [hh = '', mm = ''] = (L.localTime ?? '').split(':');
  const h12 = String(((Number(hh) + 11) % 12) + 1);
  const allowed = `${slateText(seg)} ${STATIONS[seg.station]?.freq ?? ''} ${L.localTime} ${hh} ${Number(hh)} ${h12} ${mm} Tarang FM RJ`
    .toLowerCase()
    .replace(/,/g, '');
  const found = new Set();
  for (const line of seg.response?.lines ?? []) {
    for (const tok of line.text.match(/[A-Z][A-Za-z]{2,}|\d+(?:[.:]\d+)*/g) ?? []) {
      if (!allowed.includes(tok.toLowerCase())) found.add(tok);
    }
  }
  return [...found];
}

function freeChecks(seg, eff) {
  const lines = seg.response?.lines ?? [];
  const leaks = [];
  const copies = [];
  const timeWeather = [];
  const tw = [TIME_WEATHER.common, TIME_WEATHER[seg.station]].filter(Boolean);
  const timeRule = seg.type === 'rj_link' && eff.mode !== 'opener' && eff.payload !== 'weather';
  lines.forEach((l, i) => {
    const text = norm(l.text);
    if (LEAK_RE.test(text) || LEAK_EXTRA.some((re) => re.test(text))) leaks.push(i + 1);
    const key = fragKey(l.text);
    if (FRAGMENT_KEYS.some((f) => key.includes(f))) copies.push(i + 1);
    if (timeRule && tw.some((re) => re.test(text))) timeWeather.push(i + 1);
  });
  const last = lines[lines.length - 1]?.text?.trim() ?? '';
  return {
    lineCount: lines.length,
    leaks,
    copies,
    timeWeather,
    endsOnQuestion: seg.type === 'kahani' && eff.shouldEnd && /[?？]["'”’)]*$/.test(last),
    newsUnsupported: seg.type === 'news' ? newsUnsupported(seg) : [],
  };
}

// ---------------------------------------------------------------- what each segment was for

/** The segment's job as the server understood it: old servers ignore mode/part, so judge them as old scripts. */
function effective(seg) {
  const req = seg.request ?? {};
  const e = seg.entry ?? {};
  if (!seg.v2) {
    if (seg.type === 'rj_link') return { mode: req.producer?.firstLink === false ? 'payload' : req.producer ? 'opener' : 'payload', legacy: true };
    if (seg.type === 'news') return { mode: 'full', legacy: true };
    if (seg.type === 'kahani') return { shouldEnd: true, oneShot: true, legacy: true };
    return { legacy: true };
  }
  const mode = e.mode ?? req.mode ?? (seg.type === 'rj_link' ? 'payload' : seg.type === 'news' ? 'full' : undefined);
  const part = seg.type === 'kahani' ? (e.part ?? req.part) : (e.forPart ?? req.serial?.part);
  const oneShot = Boolean(req.oneShot) || (seg.type === 'kahani' && !part);
  const lastTypes = seg.response?.linkState?.lastTypes;
  const payload = seg.type === 'rj_link' && Array.isArray(lastTypes) ? lastTypes[lastTypes.length - 1] : undefined;
  return { mode, part, oneShot, payload, shouldEnd: seg.type === 'kahani' && (oneShot || part === 3) };
}

function pointFor(type, eff) {
  switch (type) {
    case 'rj_link':
      if (eff.mode === 'opener')
        return 'a warm, live welcome: the greeting, the time and weather as a feeling (the only link where they belong), one light line, then an honest handover to what comes next';
      if (eff.mode === 'kahani_in')
        return eff.part > 1
          ? 'one line on where the story left off (only what aired), then the handover into the next part; no payload, no spoilers'
          : 'one true, spoiler-free tease of the story, then the handover; no payload';
      if (eff.mode === 'kahani_out')
        return 'one line reacting to what actually aired in the story part, then one real thing (a laugh, a fact, a question or a warm moment), then an honest handover';
      return 'one real thing (a laugh, a fact, a question or a warm moment) plus an honest reason to stay';
    case 'news':
      return eff.mode === 'update'
        ? 'in about 30 seconds, 3 real stories the listener has not heard yet, one line each, and nothing made up'
        : 'in about 75 seconds the listener knows 5-6 real things that happened, city first, and nothing is made up';
    case 'ad_break':
      return 'a 15-20 second spoof of an ad format every Indian listener has heard, ending on one laugh, for a fictional product that solves a real everyday problem';
    case 'kahani':
      if (eff.oneShot)
        return 'one complete short radio play: 2-3 people the listener can tell apart, someone who wants something against a clock, a twist that pays off a clue, and an ending that lands';
      if (eff.part === 1) return 'the listener meets 2-3 named people they can tell apart, one wants something against a clock, and the part ends on a concrete cliffhanger';
      if (eff.part === 2) return 'a one-line recap, then a complication that makes things worse, and a worse cliffhanger';
      return 'a one-line recap, then the twist pays off the clue heard earlier, the want is resolved, and the last line lands with a smile or a shiver';
    default:
      return 'the station jingle';
  }
}

// ---------------------------------------------------------------- the producer check (prompts-draft §8)

const SCORE_ENUM = { type: 'string', enum: ['1', '2', '3', '4', '5', 'na'] };
const PRODUCER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['heard_summary_en', 'invented_en', 'hook', 'coherence', 'point_landed', 'specificity', 'fidelity', 'story_resolved', 'cliffhanger', 'worst_line', 'fix'],
  properties: {
    heard_summary_en: { type: 'string' },
    invented_en: { type: 'string' },
    hook: SCORE_ENUM,
    coherence: SCORE_ENUM,
    point_landed: SCORE_ENUM,
    specificity: SCORE_ENUM,
    fidelity: SCORE_ENUM,
    story_resolved: SCORE_ENUM,
    cliffhanger: SCORE_ENUM,
    worst_line: { type: 'string' },
    fix: { type: 'string' },
  },
};
const DIMS = ['hook', 'coherence', 'point_landed', 'specificity', 'fidelity', 'story_resolved', 'cliffhanger'];
const DIM_LABEL = { hook: 'hook', coherence: 'coh', point_landed: 'point', specificity: 'spec', fidelity: 'fid', story_resolved: 'resolved', cliffhanger: 'cliff' };

function applicableDims(seg, eff) {
  const dims = ['hook', 'coherence', 'point_landed', 'specificity', 'fidelity'];
  if (seg.type === 'kahani') dims.push(eff.shouldEnd ? 'story_resolved' : 'cliffhanger');
  return dims;
}

function newsItems(seg) {
  const fromResponse = seg.response?.sources;
  if (Array.isArray(fromResponse) && fromResponse.length) return fromResponse;
  if (Array.isArray(seg.request?.headlines) && seg.request.headlines.length) return seg.request.headlines;
  return seg.ctxHeadlines ?? [];
}

function headlinesBlock(items) {
  if (!items.length) return '(no headlines)';
  return items
    .map((h, i) => {
      const meta = [`slot=${h.slot ?? (h.local ? 'city' : 'national')}`, `source=${h.source ?? 'unknown'}`, `light=${h.light ? 'yes' : 'no'}`].join(' · ');
      return `[N${i + 1}] ${meta}\n     title: ${h.title}\n     detail: ${h.detail ? clip(h.detail, 250) : 'none'}`;
    })
    .join('\n');
}

function outlineOf(seg) {
  return seg.response?.serial?.outline ?? seg.request?.serial?.outline ?? null;
}

function recapBlock(rs) {
  if (!rs) return '';
  const last = (rs.lastLines ?? []).map((l) => `  ${l.role}: ${l.text}`).join('\n');
  return `RECAP_SOURCE (what aired last part):\n  heard: ${rs.heard}\n  ended on: ${rs.cliffhanger}${last ? `\n  last lines:\n${last}` : ''}`;
}

function nextLine(seg) {
  const req = seg.request ?? {};
  const next = req.upNext;
  if (next === 'news') {
    const titles = (seg.ctxHeadlines ?? []).slice(0, 6).map((h) => `"${h.title}"`);
    return `news (label only: the news is next and the newsreader may be named${titles.length ? `; it may name one of these real headlines as written: ${titles.join(', ')}` : ''})`;
  }
  if (next === 'ad_break') return 'a short ad break (label only: never say what is in it)';
  if (next === 'kahani') {
    const outline = req.serial?.outline;
    const part = req.serial?.part;
    if (outline && part === 1 && outline.tease_native) return `the story, part 1 (true, spoiler-free tease allowed: "${outline.tease_native}")`;
    if (outline && part > 1 && req.recapSource) return `the story, part ${part} (last part heard: ${req.recapSource.heard}; it ended on: ${req.recapSource.cliffhanger})`;
    return 'a story (label only: never say what is in it)';
  }
  return `${next ?? 'unknown'} (label only)`;
}

function contextFacts(seg, eff) {
  const req = seg.request ?? {};
  const L = req.listener ?? FIXTURE;
  const out = [];
  if (seg.type === 'rj_link') {
    const day = Number.isInteger(L.weekday) ? WEEKDAYS[L.weekday] : '';
    out.push(`LISTENER: ${L.name ?? '(no name)'} in ${L.city ?? 'an unknown city'}${L.region ? `, ${L.region}` : ''}`);
    out.push(`TIME: ${L.localTime}, ${day} ${L.localDate ?? ''}`.trim());
    if (req.weather) out.push(`WEATHER: ${req.weather.tempC} °C, ${req.weather.description}${req.weather.notable ? ` (notable: ${req.weather.notable})` : ''}`);
    const fest = festivalFor(L.localDate);
    if (fest) out.push(`FESTIVAL: ${fest}`);
    out.push('(TIME, WEATHER and FESTIVAL belong in the opener only; the listener name only in a greeting or shout-out.)');
    if (eff.legacy) {
      const p = req.producer;
      out.push(`PAYLOAD: none given (the writer chose freely)${p ? `; producer plan: catchphrase ${p.useCatchphrase ? 'yes' : 'no'}, running bit ${p.bit}` : ''}`);
    } else {
      const open = req.linkState?.openQuestion;
      const asked = seg.response?.linkState?.openQuestion;
      let payload = eff.payload ? `decided by the station's rotation: ${eff.payload}` : 'decided by the station (type not reported)';
      if (eff.payload === 'question_answer' && open) payload += `; the open question to answer: "${open}"`;
      if (eff.payload === 'question' && asked) payload += `; the question it should ask: "${asked}"`;
      out.push(`PAYLOAD: ${payload}`);
    }
    out.push(`NEXT: ${nextLine(seg)}`);
    const log = req.showLog ?? [];
    out.push(`SHOW_LOG (what aired before, oldest first):${log.length ? log.map((l) => `\n- [${l.type}] ${l.summary}`).join('') : ' nothing yet (start of the show)'}`);
    if (req.dedications?.length) out.push(`STUDIO CALLS: ${req.dedications.map((d) => `${d.name ?? 'a caller'}: ${d.message}`).join(' | ')}`);
    out.push(`CITY COLOUR: well-known places of ${L.city ?? 'the city'} may appear as colour, never as news or an event.`);
  } else if (seg.type === 'news') {
    out.push(`TIME: ${L.localTime} · station Tarang FM ${STATIONS[seg.station]?.freq ?? ''} (the open and sign-off may name the time, the station and the newsreader)`);
    out.push(`HEADLINES:\n${headlinesBlock(newsItems(seg))}`);
  } else if (seg.type === 'ad_break') {
    out.push('All of it is fiction; there are no real-world facts. Format: not given (judge it from line 1).');
  } else if (seg.type === 'kahani') {
    const outline = outlineOf(seg);
    if (outline) {
      out.push('OUTLINE:');
      for (const [k, v] of Object.entries(outline)) out.push(`  ${k}: ${v}`);
    } else {
      out.push(eff.oneShot ? 'No outline was given: this is one complete short radio play. Everything in it is fiction.' : 'No outline was returned. Everything in it is fiction.');
    }
    const rb = recapBlock(seg.request?.recapSource);
    if (rb && !eff.oneShot) out.push(rb);
  }
  return out.join('\n');
}

function checklist(seg, eff) {
  const c = [];
  if (seg.type === 'rj_link') {
    c.push(eff.legacy ? 'Is there one real thing (a laugh, a fact, a question, a warm moment) in lines 1-2?' : 'Is the PAYLOAD in lines 1-2?');
    c.push('Does anything about NEXT go beyond what NEXT allowed?');
    c.push(`Is the time or weather mentioned outside the opener? (This link is ${eff.mode === 'opener' ? 'the opener' : 'not the opener'}.)`);
    c.push('Does the reaction refer only to what SHOW LOG says aired?');
    c.push('Is a promise made when a question was asked?');
  } else if (seg.type === 'news') {
    c.push('Can every line be traced to one item?');
    c.push('Is every roundup item read in detail?');
    c.push('Are any claims unattributed?');
    c.push('Is a kicker placed right after a grim story?');
  } else if (seg.type === 'ad_break') {
    c.push('Is the format obvious from line 1?');
    c.push('Is there exactly one punchline, and would a listener laugh?');
    c.push('Is any spoken text a stage direction?');
  } else if (seg.type === 'kahani') {
    c.push('Can you name every speaker by their second line?');
    c.push('Is there any kinship or gender confusion?');
    const outline = outlineOf(seg) ?? {};
    if (eff.oneShot) {
      c.push('Does the story reach its payoff, or does it stop before anything is resolved? (One complete story: score story_resolved; cliffhanger is "na".)');
    } else {
      const expected = eff.part === 3 ? outline.final_line_native : outline[`part${eff.part}_last_line_native`];
      if (expected) c.push(`Does the part end on this line: "${expected}"?`);
      if (eff.part === 3 && outline.clue_en) c.push(`Does the twist use the clue heard earlier: "${outline.clue_en}"?`);
      c.push(eff.part === 3 ? 'Score story_resolved; cliffhanger is "na".' : 'Score cliffhanger; story_resolved is "na".');
    }
  }
  return c.map((x) => `- ${x}`).join('\n');
}

function numberedLines(lines) {
  return lines
    .map((l, i) => `${i + 1}. ${l.role} · ${l.delivery ?? 'normal'} · ${l.text}${l.en ? `\n   en (machine subtitle, judge the native text): ${l.en}` : ''}`)
    .join('\n');
}

function scorerPrompt(seg, eff) {
  const onAir = `Tarang FM ${STATIONS[seg.station]?.freq ?? ''}`.trim();
  const system = [
    `You are the senior producer of ${onAir}. You did not write this script and you never saw the writer's plan. Read it the way a listener hears it: once, in order. Judge only what the lines say. Be strict: 3 means "airable but forgettable"; 5 means "a top Indian FM producer would keep it as is".`,
    'Return only JSON matching the schema, in field order. Write heard_summary_en and invented_en before any score.',
  ].join('\n');
  let modeInfo = '';
  if (seg.type === 'kahani') modeInfo = eff.oneShot ? '· one complete story' : `· part ${eff.part} of 3`;
  else if (seg.type === 'rj_link' || seg.type === 'news') modeInfo = `· mode ${eff.mode}`;
  const user = [
    `SEGMENT: ${seg.type} ${modeInfo}`.trim(),
    `POINT the script had to deliver: ${pointFor(seg.type, eff)}`,
    'CONTEXT the writer was given (the only real-world facts allowed):',
    contextFacts(seg, eff),
    'SCRIPT (numbered; role · delivery · text):',
    numberedLines(seg.response?.lines ?? []),
    '',
    'Score each dimension "1"–"5", or "na" where it doesn\'t apply:',
    '- hook: 1 = line 1 is filler, a bare greeting or generic · 3 = clear but expected · 5 = the listener leans in within 5 seconds (a surprise, a stake, a concrete image)',
    '- coherence: 1 = unclear who or what; contradictions (wrong kinship or gender, a reference to something that never happened) · 3 = followable with effort · 5 = every line follows from the last; you could retell it',
    '- point_landed: 1 = the POINT isn\'t delivered · 3 = delivered but buried or flat · 5 = delivered early and it lands (the laugh, the fact that sticks, the wait-what moment)',
    '- specificity: 1 = could be from any show · 3 = some concrete details · 5 = names, numbers, objects and places that belong only here',
    '- fidelity: 1 = invents real-world facts, or the content of a segment it never saw · 3 = embellishes a real fact · 5 = every real-world claim is in CONTEXT, and fiction stays inside fiction',
    '- story_resolved (kahani part 3 or a one-shot story only): 1 = ends before the payoff, or on a question · 3 = resolved but the twist ignores the clue · 5 = the twist pays off the clue, the want is resolved, the last line lands',
    '- cliffhanger (kahani parts 1–2 only): 1 = ends on nothing · 3 = ends on a vague question · 5 = ends on a concrete new fact that raises the stakes',
    '',
    'Check especially:',
    checklist(seg, eff),
    '',
    'heard_summary_en: 1–2 sentences, past tense: what a listener heard. Only what the lines say.',
    'invented_en: every real-world name, place, number or event, and every claim about what aired or what comes next, that is NOT in CONTEXT; "none" if there are none. Fiction inside an ad, a Kahani or the RJ\'s own life is not invention.',
    'worst_line: the number of the weakest line.',
    'fix: one sentence the writer must act on, naming the line ("Line 3: …").',
  ].join('\n');
  return { system, user };
}

function promptHash({ system, user }) {
  return createHash('sha256').update(JSON.stringify([SCORER_VERSION, SCORER_MODEL, system, user])).digest('hex').slice(0, 32);
}

function loadCache(file) {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return data && typeof data.entries === 'object' ? data : { version: 1, entries: {} };
  } catch {
    return { version: 1, entries: {} };
  }
}

const counters = { scoreCalls: 0, scoreRetries: 0, segmentRequests: 0 };

async function callScorer(key, prompt) {
  const body = JSON.stringify({
    model: SCORER_MODEL,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    temperature: 0.1,
    max_tokens: 900,
    reasoning_effort: null,
    response_format: { type: 'json_schema', json_schema: { name: 'producer_check', schema: PRODUCER_SCHEMA, strict: true } },
  });
  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) counters.scoreRetries += 1;
    counters.scoreCalls += 1;
    let res;
    try {
      res = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'api-subscription-key': key, 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(SCORE_TIMEOUT_MS),
      });
    } catch (err) {
      lastError = `network: ${err?.name ?? 'error'}`;
      await sleep(3000);
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      lastError = `HTTP ${res.status}`;
      await sleep(5000 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`scorer HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json().catch(() => null);
    const content = data?.choices?.[0]?.message?.content ?? '';
    const parsed = parseScore(content);
    if (parsed) return parsed;
    lastError = `unparseable output (finish ${data?.choices?.[0]?.finish_reason ?? '-'})`;
  }
  throw new Error(`scorer failed: ${lastError}`);
}

function parseScore(content) {
  let obj;
  try {
    obj = JSON.parse(content.trim());
  } catch {
    const a = content.indexOf('{');
    const b = content.lastIndexOf('}');
    if (a === -1 || b <= a) return null;
    try {
      obj = JSON.parse(content.slice(a, b + 1));
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;
  const out = {
    heard_summary_en: String(obj.heard_summary_en ?? ''),
    invented_en: String(obj.invented_en ?? ''),
    worst_line: String(obj.worst_line ?? ''),
    fix: String(obj.fix ?? ''),
  };
  for (const d of DIMS) {
    const v = String(obj[d] ?? 'na').trim();
    out[d] = /^[1-5]$/.test(v) ? Number(v) : null;
  }
  return out;
}

/** Scores every segment (cache first), SCORE_CONCURRENCY at a time. */
async function scoreAll(key, jobs, cache) {
  let next = 0;
  let failed = 0;
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++];
      const hit = cache.entries[job.hash];
      if (hit) {
        job.seg.score = hit.result;
        job.seg.cached = true;
        continue;
      }
      try {
        const result = await callScorer(key, job.prompt);
        cache.entries[job.hash] = { at: new Date().toISOString(), label: job.label, result };
        job.seg.score = result;
      } catch (err) {
        failed += 1;
        job.seg.scoreError = String(err?.message ?? err);
        console.log(`  ! ${job.label}: ${job.seg.scoreError}`);
      }
    }
  }
  await Promise.all(Array.from({ length: SCORE_CONCURRENCY }, worker));
  return failed;
}

// ---------------------------------------------------------------- verdicts

function summarize(seg) {
  const eff = effective(seg);
  const free = freeChecks(seg, eff);
  const sc = seg.score;
  const dims = applicableDims(seg, eff);
  const values = sc ? dims.map((d) => sc[d]).filter((v) => v != null) : [];
  const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  let pass = null;
  if (sc && values.length) {
    const fidNeed = seg.type === 'news' || seg.type === 'rj_link' ? 5 : 4;
    pass =
      values.every((v) => v > 2) &&
      mean >= 3.6 &&
      (sc.point_landed ?? 0) >= 4 &&
      (sc.fidelity ?? 0) >= fidNeed &&
      (!dims.includes('story_resolved') || (sc.story_resolved ?? 0) >= 4) &&
      (!dims.includes('cliffhanger') || (sc.cliffhanger ?? 0) >= 4) &&
      (seg.type !== 'news' || isNone(sc.invented_en));
  }
  const factual = seg.type === 'rj_link' || seg.type === 'news';
  const inventedByScorer = Boolean(sc && factual && !isNone(sc.invented_en));
  const invented = inventedByScorer || free.newsUnsupported.length > 0;
  let unresolved = false;
  if (seg.type === 'kahani') {
    if (eff.shouldEnd) unresolved = free.endsOnQuestion || (sc?.story_resolved != null && sc.story_resolved <= 2);
    else unresolved = sc?.cliffhanger != null && sc.cliffhanger <= 2;
  }
  // The free checks run before the scorer on air (bible §5.1): a script that fails one never passes
  const gateFail = invented || unresolved || free.leaks.length > 0 || free.copies.length > 0 || free.timeWeather.length > 0;
  if (pass !== null && gateFail) pass = false;
  return { eff, free, dims, mean, overall: mean == null ? null : mean * 2, pass, invented, inventedByScorer, unresolved };
}

/** Bulletin items already read earlier in the same session (by newsroom id, else by title). */
function repeatedHeadlines(segments) {
  const seen = new Set();
  let repeats = 0;
  const titleKey = (t) => norm(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  for (const seg of segments) {
    if (seg.type !== 'news' || !seg.response) continue;
    const ids = Array.isArray(seg.response.newsIds) && seg.response.newsIds.length ? seg.response.newsIds.map((id) => `id:${id}`) : newsItems(seg).map((h) => `t:${titleKey(h.title ?? '')}`);
    let hit = 0;
    for (const id of new Set(ids)) {
      if (seen.has(id)) hit += 1;
      seen.add(id);
    }
    seg.repeats = hit;
    repeats += hit;
  }
  return repeats;
}

const GATES = [
  ['invented', 'invented facts (rj_link/news)'],
  ['leaks', 'stage-direction leaks'],
  ['copies', 'copied examples'],
  ['unresolved', 'truncated/unresolved stories'],
  ['timeWeather', 'time/weather outside opener'],
  ['repeats', 'repeated headlines across bulletins'],
];

function gateCounts(sessions) {
  const g = { invented: 0, leaks: 0, copies: 0, unresolved: 0, timeWeather: 0, repeats: 0 };
  for (const sess of sessions) {
    g.repeats += repeatedHeadlines(sess.segments);
    for (const seg of sess.segments) {
      if (!seg.response?.lines || seg.type === 'station_id') continue;
      const v = (seg.verdict ??= summarize(seg));
      if (v.invented) g.invented += 1;
      if (v.free.leaks.length) g.leaks += 1;
      if (v.free.copies.length) g.copies += 1;
      if (v.unresolved) g.unresolved += 1;
      if (v.free.timeWeather.length) g.timeWeather += 1;
    }
  }
  return g;
}

const TYPES = ['rj_link', 'news', 'ad_break', 'kahani'];

function typeTable(sessions) {
  const rows = {};
  for (const t of TYPES) rows[t] = { n: 0, scored: 0, dims: Object.fromEntries(DIMS.map((d) => [d, []])), overall: [], pass: 0 };
  for (const sess of sessions) {
    for (const seg of sess.segments) {
      if (!rows[seg.type] || !seg.response?.lines) continue;
      const r = rows[seg.type];
      const v = (seg.verdict ??= summarize(seg));
      r.n += 1;
      if (!seg.score) continue;
      r.scored += 1;
      for (const d of v.dims) if (seg.score[d] != null) r.dims[d].push(seg.score[d]);
      if (v.overall != null) r.overall.push(v.overall);
      if (v.pass) r.pass += 1;
    }
  }
  return rows;
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const f1 = (x) => (x == null ? '-' : x.toFixed(1));

function tableLines(before, after, markdown) {
  const head = ['type', 'set', 'n', ...DIMS.map((d) => DIM_LABEL[d]), '/10', 'min', 'pass'];
  const body = [];
  for (const t of TYPES) {
    for (const [label, rows] of [['before', before], ['after', after]]) {
      if (!rows) continue;
      const r = rows[t];
      if (!r.n) continue;
      body.push([
        t,
        label,
        String(r.scored === r.n ? r.n : `${r.scored}/${r.n}`),
        ...DIMS.map((d) => f1(avg(r.dims[d]))),
        f1(avg(r.overall)),
        f1(r.overall.length ? Math.min(...r.overall) : null),
        r.scored ? `${r.pass}/${r.scored}` : '-',
      ]);
    }
    if (before && after && before[t].overall.length && after[t].overall.length) {
      const d = avg(after[t].overall) - avg(before[t].overall);
      body.push([t, 'delta', '', ...DIMS.map(() => ''), `${d >= 0 ? '+' : ''}${d.toFixed(1)}`, '', '']);
    }
  }
  if (markdown) {
    return [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...body.map((r) => `| ${r.join(' | ')} |`)];
  }
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((r) => r[i].length)));
  const fmt = (r) => r.map((c, i) => (i < 2 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ');
  return [fmt(head), ...body.map(fmt)];
}

function gateLines(before, after, markdown) {
  const rows = GATES.map(([k, label]) => [label, before ? String(before[k]) : '-', after ? String(after[k]) : '-']);
  if (markdown) return ['| gate | before | after |', '|---|---|---|', ...rows.map((r) => `| ${r.join(' | ')} |`)];
  const w = Math.max(...rows.map((r) => r[0].length));
  return [`${'gate'.padEnd(w)}  before  after`, ...rows.map((r) => `${r[0].padEnd(w)}  ${r[1].padStart(6)}  ${r[2].padStart(5)}`)];
}

// ---------------------------------------------------------------- the client

async function getJson(origin, path) {
  const res = await fetch(`${origin}${path}`, { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`GET ${path} returned ${res.status}`);
  return res.json();
}

async function postSegment(origin, req) {
  let last = { status: 0, body: null };
  for (let attempt = 0; attempt < 2; attempt++) {
    counters.segmentRequests += 1;
    try {
      const res = await fetch(`${origin}/api/segment`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(SEGMENT_TIMEOUT_MS),
      });
      const text = await res.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text.slice(0, 500) };
      }
      last = { status: res.status, body };
      if (res.status !== 429 && res.status < 500) return last;
    } catch (err) {
      last = { status: 0, body: { error: { code: 'network', message: String(err?.message ?? err) } } };
    }
    if (attempt === 0) await sleep(6000);
  }
  return last;
}

/** Producer plan for the session's linkNo-th RJ link, deterministic so runs compare (link 1 = before.md's link 2). */
function producerPlan(linkNo, lastCatchphrase) {
  return {
    firstLink: linkNo === 0,
    greetListener: linkNo % 8 === 0,
    useCatchphrase: linkNo > 0 && !lastCatchphrase,
    bit: linkNo % 2 === 1 ? 'any' : 'none',
  };
}

function recapFrom(seg) {
  if (!seg?.response?.lines?.length) return undefined;
  const lines = seg.response.lines;
  const last = lines[lines.length - 1];
  return {
    heard: clip(seg.response.heardSummary ?? seg.response.summary ?? '', 400),
    cliffhanger: clip(last.en ?? last.text, 300),
    lastLines: lines.slice(-3).map((l) => ({ role: clip(l.role, 20), text: clip(l.text, 300) })),
  };
}

function serialFor(state, part) {
  if (!state.serial?.outline) return undefined;
  const outline = {};
  for (const [k, v] of Object.entries(state.serial.outline)) {
    if (typeof v === 'string') outline[clip(k, 40)] = clip(v, 600);
  }
  return { id: clip(String(state.serial.id ?? 'serial'), 64), part, outline, cast: state.serial.cast ?? {} };
}

class Session {
  constructor(opts, station, entries, seed, ctx) {
    this.opts = opts;
    this.station = station;
    this.entries = entries;
    this.seed = seed;
    this.ctx = ctx;
    this.segments = [];
    this.aired = [];
    this.links = 0;
    this.lastCatchphrase = false;
    this.linkState = undefined;
    this.serial = undefined;
    this.lastKahani = undefined;
    this.lastAiredKahani = undefined;
    this.airedNews = [];
    this.storyLog = [];
    this.v2 = false;
  }

  get ctxHeadlines() {
    return (this.ctx?.headlines ?? []).slice(0, 8);
  }

  request(entry) {
    const req = {
      station: this.station,
      type: entry.type,
      listener: { ...FIXTURE },
      upNext: entry.upNext,
      subtitles: true,
    };
    if (entry.mode) req.mode = entry.mode;
    if (entry.type === 'kahani' && entry.part) req.part = entry.part;
    if (entry.type === 'news') {
      // An old server reads the client's headlines; a v2 newsroom picks its own slate from what hasn't aired
      if (!this.v2 && this.ctxHeadlines.length) req.headlines = this.ctxHeadlines;
      if (this.airedNews.length) req.airedNews = this.airedNews.slice(-40);
    }
    if (entry.type === 'rj_link') {
      req.weather = this.opts.liveWeather && this.ctx?.weather ? this.ctx.weather : { ...FIXTURE_WEATHER };
      const producer = producerPlan(this.links, this.lastCatchphrase);
      this.links += 1;
      this.lastCatchphrase = producer.useCatchphrase;
      req.producer = producer;
      if (this.linkState) req.linkState = this.linkState;
      if (entry.forPart) {
        const serial = serialFor(this, entry.forPart);
        if (serial) req.serial = serial;
        const recap = entry.mode === 'kahani_out' ? recapFrom(this.lastAiredKahani) : entry.forPart > 1 ? recapFrom(this.lastAiredKahani) : undefined;
        if (recap) req.recapSource = recap;
      }
    }
    if (entry.type === 'kahani') {
      if (this.storyLog.length) req.recentStories = this.storyLog.slice(-8);
      if (entry.part > 1) {
        const serial = serialFor(this, entry.part);
        if (serial) req.serial = serial;
        const recap = recapFrom(this.lastKahani);
        if (recap) req.recapSource = recap;
      }
    }
    const log = this.aired
      .filter((a) => a.summary)
      .slice(-4)
      .map((a) => ({ type: a.type, summary: clip(a.summary, 200) }));
    if (log.length) req.showLog = log;
    const prev = this.aired[this.aired.length - 1];
    if (prev?.mood) req.moodAfterPrevious = prev.mood;
    return req;
  }

  async generate(index, entry) {
    const req = this.request(entry);
    const t0 = performance.now();
    const { status, body } = await postSegment(this.opts.base, req);
    const ms = Math.round(performance.now() - t0);
    const ok = status === 200 && Array.isArray(body?.lines);
    const seg = {
      station: this.station,
      seed: this.seed,
      index,
      type: entry.type,
      entry,
      request: req,
      status,
      ms,
      response: ok ? body : null,
      error: ok ? undefined : body,
      ctxHeadlines: this.ctxHeadlines,
    };
    seg.v2 = isV2Response(seg.response);
    if (seg.v2) this.v2 = true;
    seg.file = `after-${this.station}${this.opts.seeds > 1 ? `-s${this.seed}` : ''}-${pad2(index)}-${entry.type}.json`;
    writeFileSync(join(this.opts.outDir, seg.file), JSON.stringify({ entry, request: req, status, ms, response: body }, null, 2));
    if (ok) {
      const r = seg.response;
      if (entry.type === 'rj_link' && r.linkState) this.linkState = r.linkState;
      if (entry.type === 'kahani') {
        if (r.serial) this.serial = r.serial;
        this.lastKahani = seg;
      }
      if (entry.type === 'news' && Array.isArray(r.newsIds)) {
        this.airedNews = [...new Set([...this.airedNews, ...r.newsIds.map((id) => clip(String(id), 64))])].slice(-40);
      }
    }
    const what = [entry.mode, entry.part ? `part ${entry.part}` : '', entry.forPart ? `(part ${entry.forPart})` : ''].filter(Boolean).join(' ');
    const tail = ok
      ? `${body.lines.length} lines  "${body.title ?? ''}"`
      : `ERROR ${body?.error?.code ?? ''} ${clip(body?.error?.message ?? JSON.stringify(body ?? ''), 160)}`;
    console.log(`  ${this.station} ${pad2(index)} ${entry.type.padEnd(10)} ${what.padEnd(20)} ${String(status).padStart(3)} ${secs(ms).padStart(7)}  ${tail}`);
    return seg;
  }

  air(seg) {
    this.segments.push(seg);
    if (!seg.response) return;
    const r = seg.response;
    const summary = (r.heardSummary ?? r.summary ?? '').trim();
    this.aired.push({ type: seg.type, summary, mood: r.mood });
    if (seg.type === 'kahani') {
      this.lastAiredKahani = seg;
      if (summary && !r.fallback) this.storyLog = [...this.storyLog, clip(summary, 200)].slice(-8);
    }
  }

  async run() {
    const prefetched = new Map();
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      const following = this.entries[i + 1];
      // The client writes Kahani part n while the show plays, so it is ready before its kahani_in link
      if (entry.type === 'rj_link' && entry.mode === 'kahani_in' && following?.type === 'kahani' && !prefetched.has(i + 1)) {
        prefetched.set(i + 1, await this.generate(i + 2, following));
      }
      const seg = prefetched.get(i) ?? (await this.generate(i + 1, entry));
      this.air(seg);
    }
  }
}

// ---------------------------------------------------------------- baseline (--compare)

function loadBaseline(files) {
  const contexts = {};
  const byStation = new Map();
  for (const file of files) {
    let data;
    try {
      data = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      console.log(`  ! skipped ${relative(ROOT, file)} (not JSON)`);
      continue;
    }
    const m = basename(file).match(/^[a-z]+-([a-z]{2})(?:-s(\d+))?-(\d{2})-([a-z_]+)\.json$/);
    if (m && m[3] === '00') {
      contexts[m[1]] = data;
      continue;
    }
    if (!data?.request || !Array.isArray(data?.response?.lines)) continue;
    const station = data.request.station ?? m?.[1] ?? 'hi';
    const seed = m?.[2] ? Number(m[2]) : 1;
    const seg = {
      station,
      seed,
      index: m ? Number(m[3]) : 0,
      type: data.request.type,
      entry: data.entry,
      request: data.request,
      status: data.status,
      ms: data.ms,
      response: data.response,
      file: basename(file),
    };
    seg.v2 = isV2Response(seg.response);
    const key = `${station}#${seed}`;
    if (!byStation.has(key)) byStation.set(key, []);
    byStation.get(key).push(seg);
  }
  const sessions = [];
  for (const segments of byStation.values()) {
    const { station, seed } = segments[0];
    segments.sort((a, b) => a.index - b.index);
    for (const s of segments) s.ctxHeadlines = (contexts[station]?.headlines ?? []).slice(0, 8);
    sessions.push({ station, seed, segments, ctx: contexts[station] });
  }
  return sessions;
}

// ---------------------------------------------------------------- after.md

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function castLine(seg) {
  const byRole = new Map();
  for (const l of seg.response?.lines ?? []) if (!byRole.has(l.role)) byRole.set(l.role, l.speaker);
  if (seg.type === 'kahani') return [...byRole].map(([role, sp]) => `${role === 'char_kid' ? 'kid' : role} ${sp}`).join(', ');
  const speakers = [...new Set(byRole.values())];
  return `voice ${speakers.join(', ')}`;
}

function segmentMarkdown(seg, n) {
  const lang = STATIONS[seg.station]?.lang ?? seg.station;
  const out = [];
  const what = [seg.entry?.mode, seg.entry?.part ? `part ${seg.entry.part}` : ''].filter(Boolean).join(' ');
  if (!seg.response) {
    out.push(`### ${n}. ${seg.type}${what ? ` · ${what}` : ''} · FAILED (HTTP ${seg.status})`);
    out.push('', '```', clip(JSON.stringify(seg.error ?? {}), 600), '```', '');
    return out;
  }
  const r = seg.response;
  const extra = [];
  if (seg.type === 'news' && r.mood) extra.push(`mood ${r.mood}`);
  if (r.fallback) extra.push('**fallback**');
  out.push(`### ${n}. ${seg.type}${what ? ` · ${what}` : ''} (${secs(seg.ms)}) · "${esc(r.title)}" · ${castLine(seg)}${extra.length ? ` · ${extra.join(' · ')}` : ''}`);
  const sent = r.heardSummary ?? r.summary;
  if (sent) out.push(`Summary sent onward (${r.heardSummary ? 'heardSummary' : 'summary'}): *${esc(sent)}*`);
  if (seg.type === 'news') {
    const items = newsItems(seg);
    if (items.length) out.push(`Slate: ${items.map((h, i) => `[${i + 1}${h.slot ? ` ${h.slot}` : h.local ? ' local' : ''}] ${esc(h.title)}`).join(' · ')}`);
    if (seg.repeats) out.push(`Repeated from an earlier bulletin: ${seg.repeats}`);
  }
  if (seg.type === 'kahani' && r.serial?.outline?.title_native) out.push(`Serial: ${esc(r.serial.outline.title_native)} (${esc(r.serial.id)})`);
  const v = seg.verdict;
  if (seg.score && v) {
    const s = seg.score;
    const parts = v.dims.map((d) => `${DIM_LABEL[d]} ${s[d] ?? '-'}`);
    out.push(`Producer: ${parts.join(' · ')} → ${f1(v.overall)}/10 ${v.pass ? 'PASS' : 'FAIL'} · worst line ${esc(s.worst_line)}`);
    out.push(`Heard: *${esc(s.heard_summary_en)}*`);
    if (!isNone(s.invented_en)) out.push(`Invented: ${esc(s.invented_en)}`);
    if (s.fix) out.push(`Fix: ${esc(s.fix)}`);
  } else if (seg.scoreError) {
    out.push(`Producer: not scored (${esc(seg.scoreError)})`);
  }
  if (v) {
    const flags = [];
    if (v.free.leaks.length) flags.push(`stage-direction leak L${v.free.leaks.join(', L')}`);
    if (v.free.copies.length) flags.push(`copied example L${v.free.copies.join(', L')}`);
    if (v.free.timeWeather.length) flags.push(`time/weather outside opener L${v.free.timeWeather.join(', L')}`);
    if (v.free.endsOnQuestion) flags.push('story ends on a question');
    if (v.unresolved && !v.free.endsOnQuestion) flags.push(v.eff.shouldEnd ? 'story unresolved' : 'no cliffhanger');
    if (v.free.newsUnsupported.length) flags.push(`not in slate: ${v.free.newsUnsupported.join(', ')}`);
    if (flags.length) out.push(`Checks: ${flags.join(' · ')}`);
  }
  out.push('', `| # | Role / delivery | ${lang} | English subtitle |`, '|---|---|---|---|');
  r.lines.forEach((l, i) => out.push(`| ${i + 1} | ${l.role} / ${l.delivery ?? 'normal'} | ${esc(l.text)} | ${esc(l.en ?? '')} |`));
  out.push('');
  return out;
}

function writeAfterMd(opts, sessions, apiLabel, tables) {
  const out = [];
  out.push(`# Tarang FM: "after" transcript (${opts.from ? 'saved run' : opts.plan}, ${new Date().toISOString().slice(0, 10)})`, '');
  out.push(
    `${opts.base ? `Generated live from \`${opts.base}/api/segment\`` : 'Re-scored from a saved run (`--from`), generated'} by \`scripts/eval-show.mjs${opts.from ? '' : ` --plan ${opts.plan}`}\`${opts.seeds > 1 ? ` (${opts.seeds} seeds)` : ''}. API: ${apiLabel}. The requests follow the client: show-clock order, \`showLog\` = the last 4 aired segments (the server's \`heardSummary\` when it returns one), the producer plan on RJ links, and the v2 fields (\`mode\`, \`part\`, \`serial\`, \`recapSource\`, \`linkState\`, \`airedNews\`). Subtitles were on: the English column is the writer's own subtitle, not a producer gloss.`,
    '',
  );
  const L = FIXTURE;
  const w = opts.liveWeather ? 'the live weather from `/api/context`' : `${FIXTURE_WEATHER.tempC} °C, ${FIXTURE_WEATHER.description}`;
  out.push(`Listener: ${L.name}, ${L.city}, ${L.localTime}, ${WEEKDAYS[L.weekday]} ${L.localDate} (${L.region}). Weather sent: ${w}.`, '');
  const seenCtx = new Set();
  for (const sess of sessions) {
    if (seenCtx.has(sess.station)) continue;
    seenCtx.add(sess.station);
    const hs = sess.ctx?.headlines ?? [];
    out.push(`Headlines from \`/api/context?station=${sess.station}\`:`);
    hs.forEach((h, i) => out.push(`${i + 1}. ${h.local ? '[LOCAL] ' : h.slot ? `[${h.slot}] ` : ''}${esc(h.title)}`));
    if (!hs.length) out.push('(none)');
    out.push('');
  }
  out.push(`Raw responses: \`after-*.json\` next to this file.`, '', '---', '');
  const multiSeed = sessions.some((x) => (x.seed ?? 1) > 1);
  for (const sess of sessions) {
    const lang = STATIONS[sess.station]?.lang ?? sess.station;
    out.push(`## ${lang} sequence${multiSeed ? ` (seed ${sess.seed ?? 1})` : ''}`, '');
    sess.segments.forEach((seg, i) => out.push(...segmentMarkdown(seg, i + 1)));
  }
  if (tables) {
    out.push('---', '', '## Producer scores (1–5 per criterion; /10 = mean of the applicable criteria × 2)', '');
    out.push(...tables.md, '');
    out.push('## Hard gates (segments)', '', ...tables.gatesMd, '');
  }
  writeFileSync(join(opts.outDir, 'after.md'), out.join('\n'));
}

// ---------------------------------------------------------------- budget

function genEstimate(entry, v2) {
  if (entry.type === 'station_id') return 0;
  if (!v2) return 1;
  if (entry.type === 'rj_link') return entry.mode === 'opener' || entry.mode === 'kahani_in' ? 1 : 2;
  if (entry.type === 'kahani') return entry.part === 1 ? 3 : 2;
  return 2;
}

// ---------------------------------------------------------------- main

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return usage();
  const fromDir = opts.from ? resolve(opts.from) : '';
  if (fromDir && !existsSync(fromDir)) fail(`--from folder not found: ${opts.from}`);
  const plan = fromDir ? [] : buildPlan(opts.plan, opts.station);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  opts.outDir = resolve(opts.out || fromDir || join(ROOT, 'tmp', 'eval', `${opts.plan}-${stamp}`));
  const cacheFile = resolve(opts.cache || join(ROOT, 'tmp', 'eval', 'score-cache.json'));
  const key = opts.score ? readKey() : '';

  // Tune in: one context per station (no Sarvam call)
  const contexts = {};
  for (const { station } of plan) {
    try {
      contexts[station] = await getJson(opts.base, `/api/context?station=${station}`);
    } catch (err) {
      fail(`cannot reach ${opts.base}: ${err.message}`, 1);
    }
  }
  // --from: a saved run is scored again (cache first) without a single segment request
  const loaded = fromDir ? loadBaseline(expandGlobs([join(fromDir, 'after-*.json')])) : [];
  if (fromDir && !loaded.length) fail(`no after-*.json segments in ${opts.from}`);
  const hint = fromDir ? loaded.some((s) => s.segments.some((g) => g.v2)) : Object.values(contexts).some((c) => (c.headlines ?? []).some((h) => h.id || h.slot) || c.weather?.notable);

  // Baseline
  let baseline = [];
  if (opts.score) {
    const files = expandGlobs(opts.compare);
    baseline = loadBaseline(files);
    if (opts.compare.some((p) => p !== 'none') && !baseline.length) console.log('  ! --compare matched no segment files');
    if (!opts.compare.length) console.log('  (no --compare: the after run is scored on its own, without a before column)');
  }
  const cache = opts.score ? loadCache(cacheFile) : { entries: {} };
  const baselineJobs = [];
  for (const sess of baseline) {
    for (const seg of sess.segments) {
      if (seg.type === 'station_id') continue;
      const eff = effective(seg);
      const prompt = scorerPrompt(seg, eff);
      baselineJobs.push({ seg, prompt, hash: promptHash(prompt), label: `before ${seg.station} ${pad2(seg.index)} ${seg.type}` });
    }
  }
  const baselineMisses = baselineJobs.filter((j) => !cache.entries[j.hash]).length;

  // Budget
  const entriesAll = plan.flatMap((p) => p.entries);
  const loadedSegs = loaded.flatMap((s) => s.segments).filter((g) => g.type !== 'station_id');
  const segCount = fromDir
    ? loadedSegs.filter((g) => !cache.entries[promptHash(scorerPrompt(g, effective(g)))]).length
    : entriesAll.filter((e) => e.type !== 'station_id').length * opts.seeds;
  const genCalls = fromDir ? 0 : entriesAll.reduce((n, e) => n + genEstimate(e, hint), 0) * opts.seeds;
  const scoreCalls = opts.score ? segCount + baselineMisses : 0;
  const total = genCalls + scoreCalls;
  if (fromDir) {
    console.log(`Tarang FM writing eval · re-scoring ${shown(fromDir)} (${loadedSegs.length} segments, no segment requests)`);
    console.log(`API (from the saved responses): ${hint ? 'v2 fields' : 'old fields'} · out ${shown(opts.outDir) || '.'}`);
    console.log(`Budget: ${opts.score ? `${scoreCalls} scoring calls made here (${segCount} run, ${baselineMisses} baseline; the rest cached)` : 'no Sarvam calls (free checks only)'}`);
  } else {
    console.log(`Tarang FM writing eval · ${opts.base} · plan ${opts.plan} · ${plan.map((p) => p.station).join(', ')} · seeds ${opts.seeds}`);
    console.log(`API (from /api/context): ${hint ? 'v2 fields' : 'old fields'} · out ${shown(opts.outDir) || '.'}`);
    console.log(
      `Budget: ${entriesAll.length * opts.seeds} segment requests ≈ ${genCalls} Sarvam calls on the server (${hint ? 'v2: writer + producer check' : 'old: one writer call each'}; retries extra)` +
        (opts.score ? ` + ${scoreCalls} scoring calls made here (${segCount} new, ${baselineMisses} baseline; ${baselineJobs.length - baselineMisses} baseline cached)` : '') +
        ` = ~${total} Sarvam calls`,
    );
  }
  if (opts.dryRun) {
    for (const p of plan) console.log(`  ${p.station}: ${p.entries.map((e) => [e.type, e.mode, e.part && `p${e.part}`].filter(Boolean).join(':')).join(' → ')}`);
    if (baseline.length) {
      // Free checks on the baseline and the exact scoring prompts, without a single Sarvam call
      const g = gateCounts(baseline);
      console.log('\nBaseline free checks (no scores):');
      for (const l of gateLines(g, null, false)) console.log(`  ${l}`);
      mkdirSync(opts.outDir, { recursive: true });
      const text = baselineJobs.map((j) => `==== ${j.label} (${j.hash})\n---- system\n${j.prompt.system}\n---- user\n${j.prompt.user}\n`).join('\n');
      writeFileSync(join(opts.outDir, 'scoring-prompts.txt'), text);
      console.log(`\nWrote the baseline scoring prompts to ${shown(join(opts.outDir, 'scoring-prompts.txt'))}`);
    }
    return;
  }
  if (total > BUDGET_LIMIT && !opts.yes) fail(`that is over ${BUDGET_LIMIT} Sarvam calls; re-run with --yes to spend them`);

  mkdirSync(opts.outDir, { recursive: true });
  const sessions = [...loaded];
  let failures = 0;
  for (let seed = 1; seed <= (fromDir ? 0 : opts.seeds); seed++) {
    for (const { station, entries } of plan) {
      const ctx = contexts[station];
      if (seed === 1) writeFileSync(join(opts.outDir, `after-${station}-00-context.json`), JSON.stringify(ctx, null, 2));
      const sess = new Session(opts, station, entries, seed, ctx);
      // A v2 hint from the context means the newsroom picks the slate
      sess.v2 = hint;
      console.log(`\n${STATIONS[station]?.lang ?? station}${opts.seeds > 1 ? ` · seed ${seed}` : ''}`);
      await sess.run();
      failures += sess.segments.filter((s) => !s.response).length;
      sessions.push(sess);
    }
  }
  const apiV2 = sessions.some((s) => s.segments.some((g) => g.v2));
  const apiLabel = apiV2 ? 'v2 fields (heardSummary / linkState / newsIds / serial in responses)' : 'old fields (v2 fields ignored)';
  if (!fromDir) console.log(`\nAPI (from responses): ${apiLabel}`);
  writeAfterMd(opts, sessions, apiLabel, null);

  if (!opts.score) {
    const g = gateCounts(sessions);
    console.log('\nHard gates (free checks only; run with --score for invented facts and story endings):');
    for (const l of gateLines(null, g, false)) console.log(`  ${l}`);
    writeAfterMd(opts, sessions, apiLabel, { md: ['(not scored)'], gatesMd: gateLines(null, g, true) });
    console.log(`\nWrote ${shown(join(opts.outDir, 'after.md'))}`);
    process.exitCode = failures ? 1 : 0;
    return;
  }

  // Score
  const jobs = [...baselineJobs];
  for (const sess of sessions) {
    for (const seg of sess.segments) {
      if (!seg.response?.lines || seg.type === 'station_id') continue;
      const prompt = scorerPrompt(seg, effective(seg));
      jobs.push({ seg, prompt, hash: promptHash(prompt), label: `after ${seg.station} ${pad2(seg.index)} ${seg.type}` });
    }
  }
  console.log(`\nScoring ${jobs.length} segments (${jobs.filter((j) => !cache.entries[j.hash]).length} not cached)…`);
  const scoreFailures = await scoreAll(key, jobs, cache);
  mkdirSync(dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(cache, null, 2));

  const beforeGates = baseline.length ? gateCounts(baseline) : null;
  const afterGates = gateCounts(sessions);
  const beforeRows = baseline.length ? typeTable(baseline) : null;
  const afterRows = typeTable(sessions);

  for (const [label, list] of [['before', baseline], ['after', sessions]]) {
    if (!list.length) continue;
    console.log(`\n${label}:`);
    for (const sess of list) {
      for (const seg of sess.segments) {
        if (!seg.response?.lines || seg.type === 'station_id') continue;
        const v = seg.verdict;
        const s = seg.score;
        const what = [v.eff.mode, v.eff.oneShot ? 'one-shot' : v.eff.part ? `part ${v.eff.part}` : ''].filter(Boolean).join(' ');
        const flags = [
          v.invented && 'invented',
          v.free.leaks.length && 'leak',
          v.free.copies.length && 'copy',
          v.unresolved && (v.eff.shouldEnd ? 'unresolved' : 'no-cliff'),
          v.free.timeWeather.length && 'time/weather',
          seg.repeats && 'repeat',
        ].filter(Boolean);
        const scores = s ? v.dims.map((d) => `${DIM_LABEL[d]} ${s[d] ?? '-'}`).join(' ') : 'not scored';
        console.log(
          `  ${seg.station} ${pad2(seg.index)} ${seg.type.padEnd(8)} ${what.padEnd(17)} ${scores.padEnd(48)} ${s ? `${f1(v.overall).padStart(4)}/10 ${v.pass ? 'PASS' : 'FAIL'}` : ''}${flags.length ? `  [${flags.join(', ')}]` : ''}${seg.cached ? '  (cached)' : ''}`,
        );
      }
    }
  }

  console.log('\nProducer scores per segment type (1-5 per criterion; /10 = mean of applicable × 2):');
  for (const l of tableLines(beforeRows, afterRows, false)) console.log(`  ${l}`);
  console.log('\nHard gates (segments; repeats = items):');
  for (const l of gateLines(beforeGates, afterGates, false)) console.log(`  ${l}`);
  console.log(
    `\nSarvam calls made here: ${counters.scoreCalls} scoring (${counters.scoreRetries} retries) · segment requests to the server: ${counters.segmentRequests}`,
  );

  const tables = { md: tableLines(beforeRows, afterRows, true), gatesMd: gateLines(beforeGates, afterGates, true) };
  writeAfterMd(opts, sessions, apiLabel, tables);
  const dump = (list) =>
    list.flatMap((sess) =>
      sess.segments
        .filter((seg) => seg.response?.lines && seg.type !== 'station_id')
        .map((seg) => ({
          file: seg.file,
          station: seg.station,
          seed: seg.seed,
          index: seg.index,
          type: seg.type,
          effective: seg.verdict.eff,
          score: seg.score ?? null,
          scoreError: seg.scoreError,
          overall10: seg.verdict.overall,
          pass: seg.verdict.pass,
          gates: {
            invented: seg.verdict.invented,
            inventedByScorer: seg.verdict.inventedByScorer,
            newsUnsupported: seg.verdict.free.newsUnsupported,
            leaks: seg.verdict.free.leaks,
            copies: seg.verdict.free.copies,
            unresolved: seg.verdict.unresolved,
            timeWeather: seg.verdict.free.timeWeather,
            repeats: seg.repeats ?? 0,
          },
        })),
    );
  writeFileSync(
    join(opts.outDir, 'scores.json'),
    JSON.stringify(
      {
        base: opts.base,
        plan: opts.plan,
        seeds: opts.seeds,
        api: apiV2 ? 'v2' : 'old',
        scorer: { model: SCORER_MODEL, version: SCORER_VERSION, calls: counters.scoreCalls },
        gates: { before: beforeGates, after: afterGates },
        before: dump(baseline),
        after: dump(sessions),
      },
      null,
      2,
    ),
  );
  console.log(`Wrote ${shown(join(opts.outDir, 'after.md'))} and scores.json`);
  process.exitCode = failures || scoreFailures ? 1 : 0;
}

main().catch((err) => {
  console.error(`eval-show: ${err?.stack ?? err}`);
  process.exit(1);
});
