/**
 * The RJ link's point, chosen in code (bible §4.1): one payload per link from a rotation, never picked by the
 * writer. `chooseLinkPayload` is pure; `planRjLink` builds the fact packet first and works out the mode, the
 * next segment and what the handover may say about it.
 */
import type { SegmentRequest } from '../shared/schemas';
import type { LinkState, Mood, SegmentType, Station, StationId } from '../shared/types';
import { buildFactPacket, type Fact, type FactPacket, type FactType } from './facts';
import { factLang } from './facts/util';
import { BITS, type RunningBit } from './pools/bits';
import { HOT_TAKES } from './pools/hotTakes';
import { QUESTIONS, type PoolItem } from './pools/questions';

export type LinkMode = 'opener' | 'payload' | 'kahani_in' | 'kahani_out';

const LINK_MODES: ReadonlySet<string> = new Set(['opener', 'payload', 'kahani_in', 'kahani_out']);

interface PayloadBase {
  /** calm after heavy news: no joke, no bit, no catchphrase */
  tone: 'light' | 'calm';
  /** The link may close on the catchphrase */
  catchphrase: boolean;
  /** {name} may be used once (opener greeting or shout-out) */
  greet: boolean;
}

export type LinkPayload = PayloadBase &
  (
    | { type: 'opener'; weather?: Fact; festival?: Fact; calls: number }
    | { type: 'kahani_tease' }
    | { type: 'studio_calls'; calls: number }
    | { type: 'question_answer'; question: string }
    | { type: 'question'; item: PoolItem }
    | { type: 'hot_take'; item: PoolItem }
    | { type: 'fact'; fact: Fact }
    | { type: 'running_bit'; bit: RunningBit; episode: number; previous?: string }
    | { type: 'shoutout'; fact?: Fact }
  );

export type PayloadType = LinkPayload['type'];

export interface ChooseInput {
  mode: LinkMode;
  station: StationId;
  /** The RJ persona key (show.ts), for the running bits */
  rjKey?: string;
  linkState?: LinkState;
  packet?: FactPacket;
  /** Studio calls this link must read */
  calls?: number;
  /** Mood of the segment that just aired */
  mood?: Mood;
  /** Local hour (0-23) */
  hour?: number;
  /** A listener name is known (a shout-out needs one) */
  hasName?: boolean;
  now?: number;
  random?: () => number;
}

export interface ChooseResult {
  payload: LinkPayload;
  nextLinkState: LinkState;
}

const MINUTE = 60_000;
const WEATHER_GAP = 30 * MINUTE;
const FESTIVAL_GAP = 30 * MINUTE;
const CATCHPHRASE_GAP = 10 * MINUTE;
const LAST_TYPES_MAX = 8;
const USED_IDS_MAX = 60;

/** Bible §4.1 weights. Cricket rides with the facts. */
const WEIGHTS: Record<string, number> = { question: 3, hot_take: 3, running_bit: 2, city_fact: 2, festival: 2, cricket: 2, on_this_day: 1, shoutout: 1 };

/** After heavy news only these, delivered warm (bible §4.1), plus an official alert. */
const CALM_FACTS: FactType[] = ['city_fact', 'on_this_day', 'weather_notable', 'air_bad', 'alert'];

export function emptyLinkState(): LinkState {
  return { lastTypes: [], usedFactIds: [], bitEpisodes: {} };
}

/** The rotation label a payload leaves in lastTypes (facts by kind, weather and air as one). */
export function payloadKind(p: LinkPayload): string {
  if (p.type === 'fact') return p.fact.type === 'weather_notable' || p.fact.type === 'air_bad' ? 'weather' : p.fact.type;
  if (p.type === 'kahani_tease') return 'tease';
  return p.type;
}

const isWeather = (f: Fact) => f.type === 'weather_notable' || f.type === 'air_bad';

/** The catchphrase markers live in usedFactIds as "cp:<epoch ms>" (LinkState has no field for them). */
function lastCatchphraseAt(state: LinkState): number | undefined {
  const times = state.usedFactIds.filter((id) => id.startsWith('cp:')).map((id) => Number(id.slice(3))).filter(Number.isFinite);
  return times.length ? Math.max(...times) : undefined;
}

function weightedPick<T extends { weight: number }>(items: T[], random: () => number): T | undefined {
  const total = items.reduce((s, i) => s + i.weight, 0);
  if (total <= 0) return undefined;
  let r = random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r < 0) return item;
  }
  return items[items.length - 1];
}

function unusedFrom(pool: PoolItem[] | undefined, used: Set<string>, prefix: string, random: () => number): PoolItem | undefined {
  const fresh = (pool ?? []).filter((i) => !used.has(`${prefix}:${i.id}`));
  return fresh.length ? fresh[Math.floor(random() * fresh.length)] : undefined;
}

/** The bit with the next episode to tell (the least-told first), in season. */
function nextBit(rjKey: string | undefined, state: LinkState, packet: FactPacket | undefined): { bit: RunningBit; episode: number } | undefined {
  const festivals = (packet?.facts ?? []).filter((f) => f.type === 'festival').map((f) => f.id);
  const open = (BITS[rjKey ?? ''] ?? [])
    .filter((b) => !b.season || festivals.some((id) => id.includes(b.season!)))
    .map((bit) => ({ bit, episode: state.bitEpisodes[bit.id] ?? 0 }))
    .filter((b) => b.episode < b.bit.episodes.length);
  open.sort((a, b) => a.episode - b.episode);
  return open[0];
}

/** A festival fact that may be greeted in the opener: today or ongoing, never "this week" or a countdown. */
function greetableFestival(packet: FactPacket | undefined): Fact | undefined {
  return packet?.facts.find((f) => f.type === 'festival' && /:(today|ongoing):/.test(f.id));
}

export function chooseLinkPayload(input: ChooseInput): ChooseResult {
  const now = input.now ?? Date.now();
  const random = input.random ?? Math.random;
  const prev = input.linkState ?? emptyLinkState();
  const state: LinkState = {
    lastTypes: [...prev.lastTypes],
    usedFactIds: [...prev.usedFactIds],
    bitEpisodes: { ...prev.bitEpisodes },
    ...(prev.openQuestion ? { openQuestion: prev.openQuestion } : {}),
    ...(prev.lastWeatherAt !== undefined ? { lastWeatherAt: prev.lastWeatherAt } : {}),
    ...(prev.lastFestivalAt !== undefined ? { lastFestivalAt: prev.lastFestivalAt } : {}),
    ...(prev.onThisDayDone ? { onThisDayDone: true } : {}),
  };
  const used = new Set(state.usedFactIds);
  const calls = input.calls ?? 0;
  const calm = input.mood === 'heavy';
  const tone: PayloadBase['tone'] = calm ? 'calm' : 'light';
  const cpAt = lastCatchphraseAt(state);
  const cpFree = !calm && (cpAt === undefined || now - cpAt >= CATCHPHRASE_GAP);
  const facts = (input.packet?.facts ?? []).filter((f) => !used.has(f.id) && f.expiresAt > now);

  let payload: LinkPayload;
  if (input.mode === 'opener') {
    const festival = greetableFestival(input.packet);
    payload = { type: 'opener', weather: input.packet?.opener.facts[0], ...(festival ? { festival } : {}), calls, tone, catchphrase: cpFree, greet: true };
    state.lastWeatherAt = now;
    if (festival) state.lastFestivalAt = now;
  } else if (input.mode === 'kahani_in') {
    payload = { type: 'kahani_tease', tone, catchphrase: false, greet: false };
  } else if (calls > 0) {
    payload = { type: 'studio_calls', calls, tone, catchphrase: false, greet: false };
  } else {
    payload = pickPayload({ ...input, now, random, calm, facts, state, used, tone });
    // A laugh or a warm moment may close on the catchphrase, now and then
    const light = ['question_answer', 'running_bit', 'hot_take', 'shoutout'].includes(payload.type) || (payload.type === 'fact' && payload.fact.type === 'festival');
    payload.catchphrase = cpFree && light && random() < 0.4;
  }

  // The rotation state after this link
  const kind = payloadKind(payload);
  state.lastTypes = [...state.lastTypes, kind].slice(-LAST_TYPES_MAX);
  const addId = (id: string) => {
    if (!state.usedFactIds.includes(id)) state.usedFactIds.push(id);
  };
  switch (payload.type) {
    case 'question':
      addId(`q:${payload.item.id}`);
      state.openQuestion = payload.item.text.slice(0, 240);
      break;
    case 'question_answer':
      delete state.openQuestion;
      break;
    case 'hot_take':
      addId(`ht:${payload.item.id}`);
      break;
    case 'running_bit':
      state.bitEpisodes[payload.bit.id] = payload.episode + 1;
      break;
    case 'fact':
      addId(payload.fact.id);
      if (isWeather(payload.fact) || payload.fact.type === 'alert') state.lastWeatherAt = now;
      if (payload.fact.type === 'festival') state.lastFestivalAt = now;
      if (payload.fact.type === 'on_this_day') state.onThisDayDone = true;
      break;
    default:
      break;
  }
  if (payload.catchphrase) {
    state.usedFactIds = state.usedFactIds.filter((id) => !id.startsWith('cp:'));
    addId(`cp:${now}`);
  }
  state.usedFactIds = state.usedFactIds.slice(-USED_IDS_MAX);
  return { payload, nextLinkState: state };
}

interface PickContext extends ChooseInput {
  now: number;
  random: () => number;
  calm: boolean;
  facts: Fact[];
  state: LinkState;
  used: Set<string>;
  tone: PayloadBase['tone'];
}

function pickPayload(ctx: PickContext): LinkPayload {
  const { facts, state, used, random, now, tone } = ctx;
  const base = { tone, catchphrase: false, greet: false };
  const lang = factLang(ctx.station);
  const recent = state.lastTypes;
  const last = recent[recent.length - 1];
  const weatherFree = state.lastWeatherAt === undefined || now - state.lastWeatherAt >= WEATHER_GAP;
  const festivalFree = state.lastFestivalAt === undefined || now - state.lastFestivalAt >= FESTIVAL_GAP;
  // Never the same kind twice in a row, and no kind more than twice in any 5 links
  const allowedKind = (kind: string) => kind !== last && recent.slice(-4).filter((k) => k === kind).length < 2;

  if (ctx.calm) {
    // After heavy news: a calm, useful or gentle fact, warm, no joke. The open question waits.
    const calmFact = facts.find((f) => CALM_FACTS.includes(f.type) && (!isWeather(f) || weatherFree) && !(f.type === 'on_this_day' && state.onThisDayDone) && allowedKind(f.type));
    if (calmFact) return { ...base, type: 'fact', fact: calmFact };
    const item = lang ? unusedFrom(QUESTIONS[lang], used, 'q', random) : undefined;
    // Nothing calm to say: a gentle question, never a joke
    if (item && !state.openQuestion) return { ...base, type: 'question', item };
    const anyCity = facts.find((f) => f.type === 'city_fact');
    if (anyCity) return { ...base, type: 'fact', fact: anyCity };
  }

  // The question of the day gets its answer in the next link that can carry one
  if (!ctx.calm && state.openQuestion) return { ...base, type: 'question_answer', question: state.openQuestion };

  // Timely and useful first: an official alert, rain, bad air
  const urgent = facts.find((f) => f.type === 'alert' || (isWeather(f) && f.priority >= 80 && weatherFree));
  if (urgent && !ctx.calm) return { ...base, type: 'fact', fact: urgent };

  const options: { weight: number; make: () => LinkPayload | undefined; kind: string }[] = [];
  const add = (kind: string, make: () => LinkPayload | undefined, weight = WEIGHTS[kind] ?? 1) => {
    if (allowedKind(kind)) options.push({ kind, weight, make });
  };
  if (lang) {
    const q = unusedFrom(QUESTIONS[lang], used, 'q', random);
    if (q) add('question', () => ({ ...base, type: 'question', item: q }));
    const t = unusedFrom(HOT_TAKES[lang], used, 'ht', random);
    if (t) add('hot_take', () => ({ ...base, type: 'hot_take', item: t }));
  }
  const bit = recent.slice(-2).includes('running_bit') ? undefined : nextBit(ctx.rjKey, state, ctx.packet);
  if (bit) {
    add('running_bit', () => ({ ...base, type: 'running_bit', bit: bit.bit, episode: bit.episode, ...(bit.episode > 0 ? { previous: bit.bit.episodes[bit.episode - 1] } : {}) }));
  }
  const firstOf = (type: FactType) => facts.find((f) => f.type === type);
  const city = firstOf('city_fact');
  if (city) add('city_fact', () => ({ ...base, type: 'fact', fact: city }));
  const festival = festivalFree ? firstOf('festival') : undefined;
  if (festival) add('festival', () => ({ ...base, type: 'fact', fact: festival }));
  const cricket = firstOf('cricket');
  if (cricket) add('cricket', () => ({ ...base, type: 'fact', fact: cricket }));
  const otd = state.onThisDayDone ? undefined : firstOf('on_this_day');
  if (otd) add('on_this_day', () => ({ ...base, type: 'fact', fact: otd }));
  const weather = weatherFree ? facts.find(isWeather) : undefined;
  if (weather) add('weather', () => ({ ...base, type: 'fact', fact: weather }), 2);
  const greetedLately = recent.slice(-3).some((k) => k === 'opener' || k === 'shoutout');
  if (ctx.hasName && !greetedLately) add('shoutout', () => ({ ...base, type: 'shoutout', greet: true, ...(festival ? { fact: festival } : {}) }));

  const chosen = weightedPick(options, random)?.make();
  if (chosen) return chosen;
  // Every kind is resting: a hot take is always possible
  const t = lang ? unusedFrom(HOT_TAKES[lang], used, 'ht', random) ?? HOT_TAKES[lang][0] : undefined;
  if (t) return { ...base, type: 'hot_take', item: t };
  return { ...base, type: 'kahani_tease' };
}

// ---- The whole plan for one link ----------------------------------------------------------------------------

export interface NextInfo {
  type: SegmentType;
  /** kahani: the part that airs next */
  part?: 1 | 2 | 3;
  /** kahani part 1: the outline's spoiler-free tease */
  tease?: string;
  /** kahani parts 2-3: what aired last part, and what it ended on */
  heard?: string;
  cliffhanger?: string;
}

export interface RjLinkPlan extends ChooseResult {
  mode: LinkMode;
  next: NextInfo;
  /** kahani_out: what the part that just aired was (heard summary from the show log) */
  aired?: string;
  packet?: FactPacket;
}

/** The clock mode of an RJ link: the request's own, else worked out from the show so far (clients on the v1 clock). */
export function linkModeOf(req: SegmentRequest): LinkMode {
  if (req.mode && LINK_MODES.has(req.mode)) return req.mode as LinkMode;
  const linked = req.showLog?.some((e) => e.type === 'rj_link') || Boolean(req.linkState?.lastTypes.length);
  if (!linked) return 'opener';
  if ((req.next?.type ?? req.upNext) === 'kahani') return 'kahani_in';
  if (req.showLog?.[req.showLog.length - 1]?.type === 'kahani') return 'kahani_out';
  return 'payload';
}

function nextOf(req: SegmentRequest, mode: LinkMode): NextInfo {
  const type = req.next?.type ?? req.upNext ?? (mode === 'kahani_in' ? 'kahani' : mode === 'opener' ? 'news' : 'ad_break');
  if (type !== 'kahani') return { type };
  const serial = req.serial;
  const part = (req.part ?? (serial ? Math.min(3, serial.part + (mode === 'kahani_in' && req.recapSource ? 1 : 0)) : 1)) as 1 | 2 | 3;
  const tease = serial?.outline.tease_native?.trim();
  if (part > 1 && req.recapSource?.heard) return { type, part, heard: req.recapSource.heard, ...(req.recapSource.cliffhanger ? { cliffhanger: req.recapSource.cliffhanger } : {}) };
  return { type, part, ...(tease ? { tease } : {}) };
}

const norm = (s?: string) => s?.trim().toLowerCase().replace(/[^a-z]/g, '') ?? '';

/** Where the listener is, from the edge (request.cf). */
export interface EdgeGeo {
  city?: string;
  region?: string;
  lat?: number | string;
  lon?: number | string;
}

/**
 * The link's plan: its mode, its payload (with the fact packet for the opener and payload links), the next
 * segment and what may be said about it, and the rotation state to echo next time. Never throws: without a
 * packet the rotation still has questions, hot takes and bits.
 */
export async function planRjLink(station: Station, req: SegmentRequest, opts: { geo?: EdgeGeo; rjKey?: string; now?: number; random?: () => number } = {}): Promise<RjLinkPlan> {
  const now = opts.now ?? Date.now();
  const mode = linkModeOf(req);
  const geo = opts.geo ?? {};
  const city = req.listener.city || geo.city;
  // The edge's coordinates only when they belong to the listener's city (else the curated city's centre)
  const sameCity = !req.listener.city || !geo.city || norm(geo.city) === norm(req.listener.city);
  let packet: FactPacket | undefined;
  if (mode !== 'kahani_in') {
    packet = await buildFactPacket({
      station: { id: station.id },
      city,
      region: req.listener.region || geo.region,
      ...(sameCity ? { lat: geo.lat as number | undefined, lon: geo.lon as number | undefined } : {}),
      now,
      usedFactIds: req.linkState?.usedFactIds,
    }).catch(() => undefined);
  }
  const hour = Number(req.listener.localTime.split(':')[0]) || 0;
  const calls = mode === 'kahani_in' ? 0 : (req.dedications?.length ?? 0);
  const result = chooseLinkPayload({
    mode,
    station: station.id,
    rjKey: opts.rjKey,
    linkState: req.linkState,
    packet,
    calls,
    mood: req.moodAfterPrevious,
    hour,
    hasName: Boolean(req.listener.name?.trim()),
    now,
    random: opts.random,
  });
  // An old client that sends its own producer settings can still turn the catchphrase off
  if (req.producer && !req.producer.useCatchphrase && mode !== 'opener') result.payload.catchphrase = false;
  const last = req.showLog?.[req.showLog.length - 1];
  return {
    ...result,
    mode,
    next: nextOf(req, mode),
    ...(mode === 'kahani_out' && last?.type === 'kahani' ? { aired: last.summary } : {}),
    ...(packet ? { packet } : {}),
  };
}
