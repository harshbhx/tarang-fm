/**
 * "Listen together": one shared live show per station, run by this Durable Object (one instance per station).
 * Listeners connect over hibernatable WebSockets. The first join wakes the station; a producer driven by storage
 * alarms writes segments along the show clock, voices every line, stores the PCM and places it on one shared
 * timeline; every join gets a live on-air welcome. A join wakes a sleeping station by itself; it switches off a minute
 * after the last listener leaves, and each show ends after six minutes ("Tune in again" starts a fresh one). The
 * studio's Stop keeps a station off air until it presses Start again.
 */
import { DurableObject } from 'cloudflare:workers';
import { SHOW_CLOCK, TTS_SAMPLE_RATE } from '../../shared/constants';
import {
  LIVE_AUTO_OFF_MS,
  LIVE_BUFFER_AHEAD_MS,
  LIVE_ENDED_NOTE,
  LIVE_IDLE_SLEEP_MS,
  LIVE_MAX_LISTENERS,
  LIVE_OFF_AIR_NOTE,
  LIVE_WELCOME_BATCH_MS,
  LIVE_WELCOME_MIN_GAP_MS,
  type LiveClientMessage,
  type LiveControlResponse,
  type LiveLine,
  type LiveListener,
  type LiveServerMessage,
  type LiveSnapshot,
  type LiveState,
} from '../../shared/live';
import type { Dedication, SegmentRequest } from '../../shared/schemas';
import { rjVoiceAt, STATION_BY_ID } from '../../shared/stations';
import type { Line, LinkState, ListenerContext, Mood, PhoneCall, Segment, SegmentType, Station, StationId } from '../../shared/types';
import { getHeadlines, getWeather, localNewsCity } from '../context';
import { markNewsAired, newsroomHeadlines } from '../news/newsroom';
import { createSarvam, type Sarvam } from '../sarvam';
import { buildSegment, nativeListenerName, producerFor, toLine } from '../segment';
import { capStream, maxPcmBytes } from '../show';
import { studioLine } from '../studio';
import { Timings } from '../timing';
import {
  appendLine,
  awakeAlarm,
  bufferedAheadMs,
  endedLines,
  estimateMs,
  Gate,
  insertLine,
  istClock,
  joinWakes,
  lineEnd,
  mostCommon,
  nextClockIndex,
  pcmDurationMs,
  producerPlan,
  restartAllowed,
  upcomingLines,
  WELCOME_GAP_MS,
  welcomeNotBefore,
} from './timeline';
import { sanitizeLiveName, welcomeLine } from './welcome';

const STATE_KEY = 'state';
/** Producer tick while listeners are tuned in */
const TICK_MS = 1500;
/** Sarvam allows ~60 TTS requests a minute account-wide, so each station keeps a few in flight */
const MAX_TTS_IN_FLIGHT = 3;
/** Segments built but not yet on the timeline */
const MAX_UNPLACED = 2;
/** Cost guardrail per station per IST day */
const DAILY_SEGMENT_LIMIT = 600;
/** Audio stays fetchable this long after its line ended */
const AUDIO_KEEP_MS = 5 * 60_000;
const AUDIO_CHUNK_BYTES = 1 << 20;
const SHOW_LOG_MAX = 4;
const STORY_LOG_MAX = 8;
const SUMMARY_CHARS = 200;
const PHONE_CALLS_PER_LINK = 2;
const WELCOME_NAMES_MAX = 4;
const MESSAGE_MAX_CHARS = 512;
/** Extra sockets allowed past the listener cap (people still on the name screen) */
const SOCKET_SLACK = 50;
const WELCOME_TITLE = 'Live shout-out';
const DAILY_LIMIT_NOTE = 'This station has aired its full show for today. Back tomorrow.';
const NO_KEY_NOTE = 'The station is off air (SARVAM_API_KEY is not set).';
const TOO_SOON = 'The show is starting again. Try once more in a few seconds.';

/** What the RJ calls someone whose name was empty or rejected. */
const DEFAULT_NAMES: Partial<Record<StationId, string>> = {
  hi: 'दोस्त',
  mr: 'मित्रा',
  gu: 'દોસ્ત',
  ta: 'நண்பா',
  bn: 'বন্ধু',
  en: 'friend',
};

interface Aired {
  type: SegmentType;
  summary?: string;
  mood?: Mood;
}

interface PendingWelcome {
  id: string;
  at: number;
}

/** Everything that must survive hibernation and eviction. */
interface StationState {
  station?: StationId;
  /** Origin of the site (news cache keys) */
  origin?: string;
  state: LiveState;
  /** The studio pressed Stop: off air, no auto-start until it presses Start */
  blocked?: boolean;
  /** When the show on air ends (LIVE_AUTO_OFF_MS after it woke) */
  enabledUntil?: number;
  /** When the current (or last) show woke ("Tune in again" rate limit) */
  startedAt?: number;
  /** Random id of the show since the station last woke; work from an earlier show is dropped */
  showId?: string;
  note?: string;
  /** Placed lines that have not ended yet, in air order */
  lines: LiveLine[];
  clockIndex: number;
  /** RJ links written since waking */
  links: number;
  lastCatchphrase: boolean;
  aired: Aired[];
  storyLog: string[];
  /** The RJ links' rotation state, echoed on the next link (this show only) */
  linkState?: LinkState;
  /** Newsroom story ids this show's bulletins read (≤ 40): never read twice in one show */
  airedNews?: string[];
  /** Bulletins written this show: full first, then update, alternating */
  bulletins?: number;
  /** A studio caller's story request for the next Kahani */
  storyTheme?: string;
  /** Studio calls this show's RJ links will read: claimed in the shared call table, marked aired when the link starts */
  pendingCalls?: PendingCalls[];
  /** IST date and the segments written on it (guardrail) */
  day?: string;
  segmentsToday: number;
  pendingWelcomes: PendingWelcome[];
  /** startAt of the last welcome line */
  lastWelcomeAt?: number;
  /** When the last listener left */
  emptySince?: number;
  /** Stored audio by line id: chunk count, and when the line left the timeline */
  audio: Record<string, { chunks: number; endedAt?: number }>;
}

/** Studio calls held for one written RJ link. */
interface PendingCalls {
  segmentId: string;
  ids: string[];
  holder: string;
  /** When the link's first line was placed on the timeline */
  startAt?: number;
}

/** Per-socket data, kept with the socket across hibernation. */
interface Attachment {
  id: string;
  listener?: LiveListener;
  city?: string;
  region?: string;
  country?: string;
  latitude?: string;
  longitude?: string;
}

/** In-memory work for one show; a new show starts with a fresh one. */
interface Work {
  showId: string;
  writing: boolean;
  unplaced: number;
  /** Estimated audio of lines written but not yet placed */
  pendingMs: number;
  /** Placement runs one segment at a time, in clock order */
  placing: Promise<void>;
}

function freshState(): StationState {
  return {
    state: 'sleeping',
    lines: [],
    clockIndex: 0,
    links: 0,
    lastCatchphrase: false,
    aired: [],
    storyLog: [],
    pendingCalls: [],
    segmentsToday: 0,
    pendingWelcomes: [],
    audio: {},
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function notFound(message: string): Response {
  return json({ error: { code: 'not_found', message } }, 404);
}

function attachmentOf(ws: WebSocket): Attachment | undefined {
  try {
    return (ws.deserializeAttachment() as Attachment | null) ?? undefined;
  } catch {
    return undefined;
  }
}

/** A listener's edge coordinates in this city (the RJ link's weather and air quality). */
function geoOf(sockets: WebSocket[], city: string | undefined): Attachment | undefined {
  return city ? sockets.map(attachmentOf).find((a) => a?.city === city && a.latitude) : undefined;
}

function send(ws: WebSocket, message: LiveServerMessage): void {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    /* the socket is closing; its close handler cleans up */
  }
}

function text(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
}

function toDedication(call: PhoneCall): Dedication {
  const d: Dedication = { id: call.id, type: call.type, message: call.message.trim().slice(0, 220) };
  const name = text(call.name, 40);
  const city = text(call.city, 60);
  const theme = text(call.theme, 120);
  if (name) d.name = name;
  if (city) d.city = city;
  if (theme) d.theme = theme;
  return d;
}

function audioKeys(id: string, chunks: number): string[] {
  return Array.from({ length: chunks }, (_, i) => `audio:${id}:${i}`);
}

export class LiveStation extends DurableObject<Env> {
  private s: StationState = freshState();
  private readonly tts = new Gate(MAX_TTS_IN_FLIGHT);
  private work?: Work;
  private welcoming = false;
  private client?: Sarvam;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<StationState>(STATE_KEY);
      if (saved) this.s = { ...freshState(), ...saved };
    });
  }

  // ---- HTTP ----------------------------------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const match = /^\/api\/live\/([a-z]{2})\/(ws|now|control|audio\/([A-Za-z0-9-]{1,64}))$/.exec(url.pathname);
    const station = match ? STATION_BY_ID[match[1] as StationId] : undefined;
    if (!match || !station) return notFound(`No route for ${request.method} ${url.pathname}.`);
    if (this.s.station !== station.id || this.s.origin !== url.origin) {
      this.s.station = station.id;
      this.s.origin = url.origin;
      await this.save();
    }
    if (match[2] === 'ws') return this.upgrade(request);
    if (match[2] === 'now') return json(this.snapshot(Date.now()));
    if (match[2] === 'control') {
      try {
        return await this.control(request);
      } catch (err) {
        console.error(`[live] control failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
        return json({ error: { code: 'internal_error', message: 'Control failed.' } }, 500);
      }
    }
    return this.audio(match[3]);
  }

  /** Studio override (the Worker checks the admin key before forwarding). Stop is a kill switch; start lifts it and wakes the show for anyone waiting. */
  private async control(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json({ error: { code: 'method_not_allowed', message: 'POST only.' } }, 405);
    let action: unknown;
    try {
      action = ((await request.json()) as { action?: unknown } | null)?.action;
    } catch {
      action = undefined;
    }
    const now = Date.now();
    if (action === 'start') {
      this.s.blocked = false;
      if (this.s.state === 'sleeping') {
        this.s.note = undefined;
        const waiting = this.listeners();
        if (waiting.length) {
          // The owner's start skips the restart gap
          this.wake(now);
          // Everyone who was waiting gets one live hello
          if (this.s.state !== 'sleeping') for (const l of waiting) this.s.pendingWelcomes.push({ id: l.id, at: now });
        }
      }
      this.broadcast(this.status(now));
      await this.save();
      this.produce(now);
      await this.schedule(now);
    } else if (action === 'stop') {
      this.s.blocked = true;
      if (this.s.state === 'sleeping') {
        this.s.note = LIVE_OFF_AIR_NOTE;
        await this.save();
        this.broadcast(this.status(now));
      } else {
        await this.sleep(now, LIVE_OFF_AIR_NOTE);
      }
    } else {
      return json({ error: { code: 'invalid_request', message: 'action must be "start" or "stop".' } }, 400);
    }
    const reply: LiveControlResponse = {
      station: this.s.station ?? 'hi',
      enabled: !this.s.blocked,
      state: this.s.state,
      listeners: this.listeners().length,
    };
    const until = this.showEndsAt();
    if (until) reply.enabledUntil = until;
    return json(reply);
  }

  /** When the show on air ends; undefined while asleep. */
  private showEndsAt(): number | undefined {
    return this.s.state !== 'sleeping' ? this.s.enabledUntil : undefined;
  }

  /** The station's switch state as a status message. */
  private status(now: number): LiveServerMessage {
    const until = this.showEndsAt();
    return {
      type: 'status',
      now,
      state: this.s.state,
      enabled: !this.s.blocked,
      ...(until ? { enabledUntil: until } : {}),
      ...(this.s.state === 'sleeping' && this.s.note ? { note: this.s.note } : {}),
    };
  }

  private upgrade(request: Request): Response {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return json({ error: { code: 'upgrade_required', message: 'Expected a WebSocket upgrade.' } }, 426);
    }
    if (this.ctx.getWebSockets().length >= LIVE_MAX_LISTENERS + SOCKET_SLACK) {
      return json({ error: { code: 'station_full', message: 'This station is full right now.' } }, 503);
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    const cf = (request as Request & { cf?: IncomingRequestCfProperties }).cf;
    const attachment: Attachment = { id: crypto.randomUUID() };
    const city = text(cf?.city, 80);
    const region = text(cf?.region, 60);
    const country = text(cf?.country, 8);
    if (city) attachment.city = city;
    if (region) attachment.region = region;
    if (country) attachment.country = country;
    if (cf?.latitude && cf.longitude) {
      attachment.latitude = String(cf.latitude);
      attachment.longitude = String(cf.longitude);
    }
    server.serializeAttachment(attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  private async audio(id: string): Promise<Response> {
    const entry = this.s.audio[id];
    if (!entry) return notFound('No audio for that line.');
    const keys = audioKeys(id, entry.chunks);
    const parts = await this.ctx.storage.get<Uint8Array>(keys);
    const chunks = keys.map((k) => parts.get(k));
    if (chunks.some((c) => !c)) return notFound('No audio for that line.');
    const size = chunks.reduce((n, c) => n + c!.byteLength, 0);
    const body = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      body.set(c!, offset);
      offset += c!.byteLength;
    }
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': `audio/pcm;rate=${TTS_SAMPLE_RATE};bits=16;channels=1`,
        'X-Audio-Format': 'pcm',
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  }

  // ---- WebSocket ---------------------------------------------------------------------------

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string' || message.length > MESSAGE_MAX_CHARS) {
      send(ws, { type: 'error', code: 'bad_message', message: 'Send short JSON text messages.' });
      return;
    }
    let msg: Partial<LiveClientMessage> | null;
    try {
      msg = JSON.parse(message) as Partial<LiveClientMessage> | null;
    } catch {
      msg = null;
    }
    if (msg?.type === 'ping' && typeof msg.t0 === 'number' && Number.isFinite(msg.t0)) {
      send(ws, { type: 'pong', now: Date.now(), t0: msg.t0 });
      return;
    }
    if (msg?.type === 'join' && typeof msg.name === 'string') {
      await this.join(ws, msg.name);
      return;
    }
    if (msg?.type === 'restart') {
      await this.restart(ws);
      return;
    }
    send(ws, { type: 'error', code: 'bad_message', message: 'Unknown message.' });
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.left(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.left(ws);
  }

  private async join(ws: WebSocket, rawName: string): Promise<void> {
    const station = this.station();
    const attachment = attachmentOf(ws);
    if (!station || !attachment) return;
    const now = Date.now();
    if (attachment.listener) {
      send(ws, { type: 'joined', you: attachment.listener, snapshot: this.snapshot(now) });
      return;
    }
    if (this.listeners().length >= LIVE_MAX_LISTENERS) {
      send(ws, { type: 'error', code: 'station_full', message: 'This station is full right now. Try another one.' });
      ws.close(1013, 'Station full');
      return;
    }

    const listener: LiveListener = {
      id: attachment.id,
      name: sanitizeLiveName(rawName) ?? DEFAULT_NAMES[station.id] ?? 'friend',
      joinedAt: now,
    };
    if (attachment.city) listener.city = attachment.city;

    // Waking tells everyone already here; the newcomer hears the state in its snapshot. A stopped station, or a show
    // that just ended for the people still here, only waits.
    if (this.s.state === 'sleeping') {
      if (joinWakes(this.s, now)) this.wake(now);
      else if (this.s.blocked) this.s.note = LIVE_OFF_AIR_NOTE;
    }
    this.s.emptySince = undefined;
    if (this.s.state !== 'sleeping') this.s.pendingWelcomes.push({ id: listener.id, at: now });

    // 'joined' is the socket's first message: it only counts as a listener (and gets broadcasts) from here on
    ws.serializeAttachment({ ...attachment, listener } satisfies Attachment);
    send(ws, { type: 'joined', you: listener, snapshot: this.snapshot(now) });
    if (this.s.state === 'sleeping' && this.s.note) send(ws, { type: 'status', now, state: 'sleeping', note: this.s.note });
    this.broadcast({ type: 'presence', now, listeners: this.listeners() }, ws);
    await this.save();
    this.produce(now);
    await this.schedule(now);
  }

  /** "Tune in again" after a show ended: a fresh show for everyone here, at most once per LIVE_RESTART_GAP_MS. */
  private async restart(ws: WebSocket): Promise<void> {
    if (!attachmentOf(ws)?.listener) return;
    const now = Date.now();
    if (this.s.state !== 'sleeping' || this.s.blocked) {
      // Already back on air (someone else tuned in again), or stopped by the studio
      send(ws, this.status(now));
      return;
    }
    if (!restartAllowed(this.s, now)) {
      send(ws, { type: 'error', code: 'too_soon', message: TOO_SOON });
      return;
    }
    this.wake(now);
    if (this.s.state === 'sleeping') {
      // No key or the daily limit: tell everyone why it stays off
      this.broadcast(this.status(now));
    } else {
      for (const l of this.listeners()) this.s.pendingWelcomes.push({ id: l.id, at: now });
    }
    await this.save();
    this.produce(now);
    await this.schedule(now);
  }

  private async left(ws: WebSocket): Promise<void> {
    try {
      ws.close(1000, 'Bye');
    } catch {
      /* already closed */
    }
    const now = Date.now();
    const attachment = attachmentOf(ws);
    if (!attachment?.listener) return;
    this.s.pendingWelcomes = this.s.pendingWelcomes.filter((p) => p.id !== attachment.id);
    const listeners = this.listeners(ws);
    this.broadcast({ type: 'presence', now, listeners }, ws);
    if (!listeners.length) this.s.emptySince = now;
    await this.save();
    await this.schedule(now);
  }

  // ---- Alarm: the producer's clock -----------------------------------------------------------

  async alarm(): Promise<void> {
    const now = Date.now();
    try {
      // Nothing runs while asleep: the next join (or "Tune in again") wakes the station
      if (this.s.state === 'sleeping') return;
      const listeners = this.listeners();
      if (!listeners.length) this.s.emptySince ??= now;
      else this.s.emptySince = undefined;
      const next = awakeAlarm(this.s, listeners.length, now);
      if (next !== 'run') {
        // The show's limit (everyone still here hears it ended), or nobody listening for the idle window
        await this.sleep(now, next === 'ended' ? LIVE_ENDED_NOTE : undefined);
        return;
      }
      await this.retire(now);
      await this.airCalls(now);
      if (listeners.length) {
        this.produce(now);
        const due = this.welcomeDueAt();
        if (due !== undefined && due <= now) void this.welcome();
      }
      await this.save();
    } catch (err) {
      console.error(`[live] alarm failed: ${String(err)}`);
    } finally {
      await this.schedule(Date.now()).catch((err: unknown) => console.error(`[live] schedule failed: ${String(err)}`));
    }
  }

  /** One alarm, multiplexed: the next producer tick or the welcome due time while listeners are here, else the idle switch-off; never past the show's end. */
  private async schedule(now: number): Promise<void> {
    if (this.s.state === 'sleeping') {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    let at: number;
    if (!this.listeners().length) {
      at = (this.s.emptySince ?? now) + LIVE_IDLE_SLEEP_MS;
    } else {
      at = now + TICK_MS;
      const due = this.welcomeDueAt();
      if (due !== undefined) at = Math.min(at, Math.max(now + 50, due));
    }
    if (this.s.enabledUntil) at = Math.min(at, Math.max(now + 50, this.s.enabledUntil));
    await this.ctx.storage.setAlarm(at);
  }

  private wake(now: number): void {
    const day = istClock(now).localDate;
    if (!this.env.SARVAM_API_KEY) {
      this.s.note = NO_KEY_NOTE;
      return;
    }
    if (this.s.day === day && this.s.segmentsToday >= DAILY_SEGMENT_LIMIT) {
      this.s.note = DAILY_LIMIT_NOTE;
      return;
    }
    Object.assign(this.s, {
      state: 'warming_up',
      showId: crypto.randomUUID(),
      startedAt: now,
      enabledUntil: now + LIVE_AUTO_OFF_MS,
      note: undefined,
      lines: [],
      clockIndex: 0,
      links: 0,
      lastCatchphrase: false,
      aired: [],
      linkState: undefined,
      airedNews: [],
      bulletins: 0,
      pendingWelcomes: [],
      lastWelcomeAt: undefined,
      emptySince: undefined,
    } satisfies Partial<StationState>);
    this.work = undefined;
    this.broadcast(this.status(now));
  }

  private async sleep(now: number, note?: string): Promise<void> {
    await this.airCalls(now);
    this.releasePendingCalls();
    const keys = Object.entries(this.s.audio).flatMap(([id, a]) => audioKeys(id, a.chunks));
    Object.assign(this.s, {
      state: 'sleeping',
      showId: undefined,
      enabledUntil: undefined,
      note,
      lines: [],
      pendingWelcomes: [],
      lastWelcomeAt: undefined,
      emptySince: undefined,
      audio: {},
    } satisfies Partial<StationState>);
    this.work = undefined;
    await this.ctx.storage.deleteAlarm();
    for (let i = 0; i < keys.length; i += 128) await this.ctx.storage.delete(keys.slice(i, i + 128));
    await this.save();
    this.broadcast(this.status(now));
    this.broadcast({ type: 'timeline', now, lines: [] });
  }

  /** Drops finished lines from the timeline and deletes audio that ended more than AUDIO_KEEP_MS ago. */
  private async retire(now: number): Promise<void> {
    const ended = endedLines(this.s.lines, now);
    if (ended.length) {
      for (const line of ended) {
        const entry = this.s.audio[line.id];
        if (entry) entry.endedAt = lineEnd(line);
      }
      this.s.lines = upcomingLines(this.s.lines, now);
    }
    const stale = Object.entries(this.s.audio).filter(([, a]) => a.endedAt !== undefined && a.endedAt < now - AUDIO_KEEP_MS);
    if (!stale.length) return;
    for (const [id] of stale) delete this.s.audio[id];
    const keys = stale.flatMap(([id, a]) => audioKeys(id, a.chunks));
    for (let i = 0; i < keys.length; i += 128) await this.ctx.storage.delete(keys.slice(i, i + 128));
  }

  // ---- Producer --------------------------------------------------------------------------------

  private workFor(showId: string): Work {
    if (this.work?.showId !== showId) this.work = { showId, writing: false, unplaced: 0, pendingMs: 0, placing: Promise.resolve() };
    return this.work;
  }

  /** True while the show `showId` is still the one on air. */
  private onAir(showId: string): boolean {
    return this.s.state !== 'sleeping' && this.s.showId === showId;
  }

  private isCurrent(work: Work): boolean {
    return this.onAir(work.showId);
  }

  /** Starts writing the next clock entry when the buffer ahead (placed plus being voiced) runs short. */
  private produce(now = Date.now()): void {
    const showId = this.s.showId;
    if (this.s.state === 'sleeping' || !showId || !this.listeners().length) return;
    const work = this.workFor(showId);
    if (work.writing || work.unplaced >= MAX_UNPLACED) return;
    if (bufferedAheadMs(this.s.lines, now) + work.pendingMs >= LIVE_BUFFER_AHEAD_MS) return;
    work.writing = true;
    void this.writeNext(work)
      .catch((err: unknown) => {
        console.error(`[live] writing failed: ${String(err)}`);
        return false;
      })
      .then((ok) => {
        work.writing = false;
        // A failure waits for the next tick instead of retrying in a tight loop
        if (ok) this.produce();
      });
  }

  private async writeNext(work: Work): Promise<boolean> {
    const station = this.station();
    if (!station) return false;
    const now = Date.now();
    const day = istClock(now).localDate;
    if (this.s.day !== day) {
      this.s.day = day;
      this.s.segmentsToday = 0;
    }
    if (this.s.segmentsToday >= DAILY_SEGMENT_LIMIT) {
      await this.sleep(now, DAILY_LIMIT_NOTE);
      return false;
    }

    const type = SHOW_CLOCK[this.s.clockIndex] ?? 'rj_link';
    this.s.clockIndex = nextClockIndex(this.s.clockIndex);
    const following = SHOW_CLOCK[this.s.clockIndex];
    this.s.segmentsToday += 1;
    const { req, calls, city, country } = await this.segmentRequest(station, type, following, now);
    await this.save();

    const sarvam = this.sarvam();
    const origin = this.s.origin ?? 'https://tarang-fm.local';
    let segment: Segment | undefined;
    const local = localNewsCity(city, country);
    const bulletin = { station, mode: req.mode === 'update' ? ('update' as const) : ('full' as const), city: local, regionName: local ? req.listener.region : undefined, airedNews: req.airedNews, waitUntil: (p: Promise<unknown>) => this.ctx.waitUntil(p) };
    let fromNewsroom = false;
    const producer = producerFor(this.env);
    // One retry, then the clock moves on to the next entry
    for (let attempt = 0; attempt < 2 && !segment; attempt++) {
      try {
        segment = await buildSegment(sarvam, station, req, new Timings(), {
          // The newsroom's slate (the station never airs a story twice); live headlines while its pool fills
          fetchHeadlines: async () => {
            const slate = await newsroomHeadlines(this.env, bulletin);
            fromNewsroom = slate.length > 0;
            return slate.length ? slate : getHeadlines(station, origin, undefined, local);
          },
          // The producer check: free checks, then the judge (Workers AI); free checks only without the AI binding
          producer,
          // The RJ link's fact packet: the audience's most common city and its edge coordinates
          geo: { city, region: req.listener.region, lat: geoOf(this.ctx.getWebSockets(), city)?.latitude, lon: geoOf(this.ctx.getWebSockets(), city)?.longitude },
        });
      } catch (err) {
        console.error(`[live] ${station.id} ${type} failed (attempt ${attempt + 1}): ${String(err)}`);
      }
      if (!this.isCurrent(work)) return false;
    }
    if (!segment) return false;

    // A written bulletin's stories are aired for the station (a fallback bulletin read none)
    if (segment.type === 'news' && fromNewsroom && !segment.fallback && segment.newsIds?.length) this.ctx.waitUntil(markNewsAired(this.env, bulletin, segment.newsIds));
    this.recordWritten(segment, calls);
    await this.save();
    this.enqueue(work, station, segment);
    return true;
  }

  /** The shared listener context: no personal name, the most common city, India time. */
  private async segmentRequest(
    station: Station,
    type: SegmentType,
    following: SegmentType | undefined,
    now: number,
  ): Promise<{ req: SegmentRequest; calls: PhoneCall[]; city?: string; country?: string }> {
    const ist = istClock(now);
    const audience = this.ctx.getWebSockets().map(attachmentOf).filter((a): a is Attachment => Boolean(a?.listener));
    const city = mostCommon(audience.map((a) => a.city));
    const local = audience.find((a) => a.city === city);
    const listener: ListenerContext = { localTime: ist.localTime, daypart: ist.daypart, localDate: ist.localDate, weekday: ist.weekday };
    if (city) listener.city = city;
    if (local?.region) listener.region = local.region;

    // Always with subtitles: one script serves everyone listening, and each listener chooses whether to show them
    const req: SegmentRequest = { station: station.id, type, listener, subtitles: true };
    if (following) req.upNext = following;
    let calls: PhoneCall[] = [];
    if (type === 'rj_link') {
      // The first link of a show opens it (time, weather, greeting); every later one delivers a payload
      req.mode = this.s.links === 0 ? 'opener' : 'payload';
      if (this.s.linkState) req.linkState = this.s.linkState;
      const producer = producerPlan(this.s.links, this.s.lastCatchphrase);
      this.s.links += 1;
      this.s.lastCatchphrase = producer.useCatchphrase;
      req.producer = producer;
      const studio = studioLine(this.env);
      const [weather, recent] = await Promise.all([
        getWeather(local?.latitude, local?.longitude),
        studio.recent().catch((): PhoneCall[] => []),
      ]);
      if (weather) req.weather = weather;
      // Up to two studio calls nobody has read yet, oldest first (the list is newest first). Claiming them in the
      // shared call table means no other show, live or personal, reads them meanwhile.
      const wanted = recent.filter((c) => !c.airedAt).slice(-PHONE_CALLS_PER_LINK).reverse();
      if (wanted.length) {
        const granted = new Set(await studio.claim(wanted.map((c) => c.id), this.callHolder()).catch((): string[] => []));
        calls = wanted.filter((c) => granted.has(c.id));
      }
      if (calls.length) req.dedications = calls.map(toDedication);
    }
    const showLog = this.s.aired
      .filter((a) => a.summary)
      .slice(-SHOW_LOG_MAX)
      .map((a) => ({ type: a.type, summary: (a.summary ?? '').slice(0, SUMMARY_CHARS) }));
    if (showLog.length) req.showLog = showLog;
    const previous = this.s.aired[this.s.aired.length - 1];
    if (previous?.mood) req.moodAfterPrevious = previous.mood;
    if (type === 'news') {
      // A full bulletin first, then a short update, alternating; never a story this show already read
      req.mode = (this.s.bulletins ?? 0) % 2 === 0 ? 'full' : 'update';
      this.s.bulletins = (this.s.bulletins ?? 0) + 1;
      if (this.s.airedNews?.length) req.airedNews = this.s.airedNews.slice(-40);
    }
    if (type === 'kahani') {
      // Listen together airs one complete story (owner decision); the 3-part serial is for /listen only
      req.oneShot = true;
      if (this.s.storyLog.length) req.recentStories = this.s.storyLog.slice(-STORY_LOG_MAX);
      if (this.s.storyTheme) {
        req.theme = this.s.storyTheme;
        this.s.storyTheme = undefined;
      }
    }
    return { req, calls, city, country: local?.country };
  }

  /** Show log, story log and studio calls, once a segment is written. */
  private recordWritten(segment: Segment, calls: PhoneCall[]): void {
    // What the producer heard air, else the writer's own summary
    const summary = (segment.heardSummary ?? segment.summary)?.trim().slice(0, SUMMARY_CHARS);
    if (segment.linkState) this.s.linkState = segment.linkState;
    if (segment.type === 'news' && !segment.fallback && segment.newsIds?.length) {
      this.s.airedNews = [...new Set([...(this.s.airedNews ?? []), ...segment.newsIds])].slice(-40);
    }
    const aired: Aired = { type: segment.type };
    if (summary) aired.summary = summary;
    if (segment.mood) aired.mood = segment.mood;
    this.s.aired = [...this.s.aired, aired].slice(-SHOW_LOG_MAX * 2);
    if (segment.type === 'kahani' && !segment.fallback && summary) this.s.storyLog = [...this.s.storyLog, summary].slice(-STORY_LOG_MAX);

    const read = new Set(segment.fallback ? [] : (segment.dedicated ?? []));
    const readCalls = calls.filter((c) => read.has(c.id));
    // Calls the script left out go straight back to the queue
    const unread = calls.filter((c) => !read.has(c.id)).map((c) => c.id);
    if (unread.length) void studioLine(this.env).release(unread, this.callHolder()).catch(() => {});
    if (!readCalls.length) return;
    this.s.pendingCalls = [...(this.s.pendingCalls ?? []), { segmentId: segment.id, ids: readCalls.map((c) => c.id), holder: this.callHolder() }];
    const theme = readCalls.find((c) => c.type === 'story_request' && c.theme?.trim())?.theme;
    if (theme) this.s.storyTheme = theme.trim().slice(0, 120);
  }

  /** Voices every line (a few at a time, station-wide) and places them in order as soon as each is ready. */
  private enqueue(work: Work, station: Station, segment: Segment): void {
    const estimates = segment.lines.map(estimateMs);
    work.unplaced += 1;
    work.pendingMs += estimates.reduce((a, b) => a + b, 0);
    const voiced = segment.lines.map((line) =>
      this.tts
        .run(() => (this.isCurrent(work) ? this.voice(station, line) : Promise.resolve(null)))
        .catch((err: unknown) => {
          console.error(`[live] ${station.id} line skipped, TTS failed: ${String(err)}`);
          return null;
        }),
    );
    work.placing = work.placing
      .then(async () => {
        for (let i = 0; i < segment.lines.length; i++) {
          const pcm = await voiced[i];
          work.pendingMs = Math.max(0, work.pendingMs - estimates[i]);
          if (!pcm?.byteLength || !this.isCurrent(work)) continue;
          await this.place(work, segment, segment.lines[i], pcm).catch((err: unknown) =>
            console.error(`[live] placing a line failed: ${String(err)}`),
          );
        }
      })
      .finally(() => {
        work.unplaced -= 1;
        this.produce();
      });
  }

  private async voice(station: Station, line: Line): Promise<Uint8Array> {
    const { text: words, speaker, pace, temperature, loudness, pitch } = line;
    const audio = await this.sarvam().ttsStream({
      text: words,
      language_code: station.language,
      speaker,
      pace,
      temperature,
      ...(loudness !== undefined ? { loudness } : {}),
      ...(pitch !== undefined ? { pitch } : {}),
    });
    const bytes = new Uint8Array(await new Response(capStream(audio.body, maxPcmBytes(words, pace))).arrayBuffer());
    return bytes.byteLength % 2 ? bytes.subarray(0, bytes.byteLength - 1) : bytes;
  }

  private async putAudio(id: string, pcm: Uint8Array): Promise<void> {
    const chunks = Math.max(1, Math.ceil(pcm.byteLength / AUDIO_CHUNK_BYTES));
    const keys = audioKeys(id, chunks);
    await Promise.all(keys.map((key, i) => this.ctx.storage.put(key, pcm.slice(i * AUDIO_CHUNK_BYTES, (i + 1) * AUDIO_CHUNK_BYTES))));
    this.s.audio[id] = { chunks };
  }

  private async place(work: Work, segment: Segment, line: Line, pcm: Uint8Array): Promise<void> {
    const id = crypto.randomUUID();
    await this.putAudio(id, pcm);
    if (!this.isCurrent(work)) return;
    const now = Date.now();
    this.s.lines = appendLine(
      this.s.lines,
      { id, segmentId: segment.id, type: segment.type, title: segment.title, line, durationMs: pcmDurationMs(pcm.byteLength) },
      now,
    );
    const pending = this.s.pendingCalls?.find((p) => p.segmentId === segment.id && p.startAt === undefined);
    if (pending) pending.startAt = this.s.lines.find((l) => l.id === id)?.startAt;
    await this.published(now);
  }

  /** Who holds this show's claims in the shared call table. */
  private callHolder(): string {
    return `live:${this.s.station ?? 'hi'}:${this.s.showId ?? 'idle'}`;
  }

  /** Marks studio calls aired once the RJ link that reads them has started playing: read once, ever, everywhere. */
  private async airCalls(now: number): Promise<void> {
    const pending = this.s.pendingCalls ?? [];
    const due = pending.filter((p) => p.startAt !== undefined && p.startAt <= now);
    if (!due.length) return;
    this.s.pendingCalls = pending.filter((p) => !due.includes(p));
    const studio = studioLine(this.env);
    for (const p of due) await studio.markAired(p.ids, p.holder, this.s.station ?? 'hi').catch(() => []);
  }

  /** Hands back calls a stopped show had claimed but never aired. */
  private releasePendingCalls(): void {
    const pending = this.s.pendingCalls ?? [];
    this.s.pendingCalls = [];
    const studio = studioLine(this.env);
    for (const p of pending) void studio.release(p.ids, p.holder).catch(() => {});
  }

  /** After a line lands on the timeline: on air, saved, and the new timeline sent to everyone. */
  private async published(now: number): Promise<void> {
    if (this.s.state === 'warming_up') {
      this.s.state = 'on_air';
      this.broadcast({ type: 'status', now, state: 'on_air' });
    }
    await this.save();
    this.broadcast({ type: 'timeline', now, lines: upcomingLines(this.s.lines, now) });
  }

  // ---- Live welcome ----------------------------------------------------------------------------

  private welcomeDueAt(): number | undefined {
    const first = this.s.pendingWelcomes[0];
    return first && !this.welcoming ? first.at + LIVE_WELCOME_BATCH_MS : undefined;
  }

  /** Everyone who joined in the batch window gets one welcome, voiced by the RJ on air, slotted in after the current line. */
  private async welcome(): Promise<void> {
    const station = this.station();
    const showId = this.s.showId;
    if (!station || !showId || this.welcoming || !this.s.pendingWelcomes.length) return;
    this.welcoming = true;
    try {
      const listeners = this.listeners();
      const here = new Map(listeners.map((l) => [l.id, l]));
      const batch = this.s.pendingWelcomes.splice(0).flatMap((p) => here.get(p.id) ?? []);
      await this.save();
      if (!batch.length) return;

      const sarvam = this.sarvam();
      // Listeners on the default name are greeted by the line's own "friend" wording
      const typed = [...new Set(batch.map((l) => l.name))].filter((name) => name !== DEFAULT_NAMES[station.id]).slice(0, WELCOME_NAMES_MAX);
      const names = await Promise.all(typed.map(async (name) => (await nativeListenerName(sarvam, name, station.language)) ?? name));
      const words = welcomeLine(station, names, listeners.length, Math.random, typed);
      const line = toLine(station, 'rj', words.text, 'rj_link', { delivery: 'excited', voice: rjVoiceAt(station, istClock(Date.now()).hour) });
      line.pauseAfterMs = WELCOME_GAP_MS;
      if (words.en && station.language !== 'en-IN') line.en = words.en;

      const pcm = await this.tts.run(() => this.voice(station, line), true);
      if (!this.onAir(showId)) return;
      const id = crypto.randomUUID();
      await this.putAudio(id, pcm);
      if (!this.onAir(showId)) return;

      const now = Date.now();
      const placed = insertLine(
        this.s.lines,
        { id, segmentId: id, type: 'rj_link', title: WELCOME_TITLE, line, durationMs: pcmDurationMs(pcm.byteLength), welcome: batch.map((l) => l.id) },
        welcomeNotBefore(now, this.s.lastWelcomeAt, LIVE_WELCOME_MIN_GAP_MS),
      );
      this.s.lines = placed.lines;
      this.s.lastWelcomeAt = placed.startAt;
      await this.published(now);
    } catch (err) {
      console.error(`[live] welcome failed: ${String(err)}`);
    } finally {
      this.welcoming = false;
      // Joins that arrived while this welcome was being voiced get the next one
      if (this.s.pendingWelcomes.length && this.s.state !== 'sleeping') await this.schedule(Date.now()).catch(() => {});
    }
  }

  // ---- Helpers ---------------------------------------------------------------------------------

  private station(): Station | undefined {
    return this.s.station ? STATION_BY_ID[this.s.station] : undefined;
  }

  private sarvam(): Sarvam {
    this.client ??= createSarvam(this.env.SARVAM_API_KEY);
    return this.client;
  }

  /** Joined listeners on open sockets, oldest first. */
  private listeners(except?: WebSocket): LiveListener[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws !== except && ws.readyState === WebSocket.READY_STATE_OPEN)
      .flatMap((ws) => attachmentOf(ws)?.listener ?? [])
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }

  private snapshot(now: number): LiveSnapshot {
    const until = this.showEndsAt();
    return {
      station: this.s.station ?? 'hi',
      state: this.s.state,
      enabled: !this.s.blocked,
      ...(until ? { enabledUntil: until } : {}),
      ...(this.s.state === 'sleeping' && this.s.note ? { note: this.s.note } : {}),
      now,
      listeners: this.listeners(),
      lines: upcomingLines(this.s.lines, now),
    };
  }

  /** Sends to every joined listener (a socket hears nothing before its 'joined'). */
  private broadcast(message: LiveServerMessage, except?: WebSocket): void {
    const data = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || !attachmentOf(ws)?.listener) continue;
      try {
        ws.send(data);
      } catch {
        /* closing socket */
      }
    }
  }

  private async save(): Promise<void> {
    await this.ctx.storage.put(STATE_KEY, this.s);
  }
}
