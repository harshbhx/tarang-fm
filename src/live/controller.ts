/**
 * "Listen together" client (shared/live.ts): joins a station's shared show over a WebSocket,
 * keeps a server clock estimate and plays each line at its server start time, so every
 * listener hears the same line at the same moment.
 */
import { TTS_SAMPLE_RATE } from '../../shared/constants';
import {
  LIVE_NAME_MAX,
  LIVE_PCM_BYTES_PER_MS,
  type LiveClientMessage,
  type LiveLine,
  type LiveListener,
  type LiveServerMessage,
  type LiveSnapshot,
  type LiveState,
} from '../../shared/live';
import { getStation, STATION_BY_ID } from '../../shared/stations';
import type { StationId } from '../../shared/types';
import type { AudioEngine } from '../audio/types';
import { loadListenerName, saveListenerName } from '../radio/listener';
import { ServerClock } from './clock';
import type { LiveActions, LiveViewState } from './types';

/** The parts of a WebSocket the controller uses (tests pass a fake). */
export type LiveSocket = Pick<WebSocket, 'readyState' | 'send' | 'close' | 'onopen' | 'onmessage' | 'onclose' | 'onerror'>;

export interface LiveTimings {
  /** Clock-sync ping interval (also keeps the socket alive) */
  pingEveryMs: number;
  /** Pings sent right after connecting, this far apart */
  quickPings: number;
  quickPingGapMs: number;
  /** A socket silent for this long is treated as dead */
  staleSocketMs: number;
  reconnectBaseMs: number;
  reconnectMaxMs: number;
  /** Failed reconnects in a row before giving up */
  maxReconnects: number;
  /** Starting a line later than this plays only the rest of it */
  lateSliceMs: number;
  /** A line more than this fraction over is skipped */
  skipFraction: number;
  stopFadeMs: number;
  staticMs: number;
}

export const DEFAULT_LIVE_TIMINGS: LiveTimings = {
  pingEveryMs: 10_000,
  quickPings: 3,
  quickPingGapMs: 300,
  staleSocketMs: 35_000,
  reconnectBaseMs: 500,
  reconnectMaxMs: 15_000,
  maxReconnects: 12,
  lateSliceMs: 150,
  skipFraction: 0.85,
  stopFadeMs: 150,
  staticMs: 600,
};

export interface LiveControllerOptions {
  engine: AudioEngine;
  station?: StationId;
  /** Page origin the socket URL is built from (default: location.origin) */
  origin?: string;
  createSocket?: (url: string) => LiveSocket;
  fetch?: typeof fetch;
  timings?: Partial<LiveTimings>;
  /** Local epoch clock (default Date.now) */
  now?: () => number;
  /** Monotonic clock for ping round trips (default performance.now) */
  mono?: () => number;
  /** Reconnect jitter source (tests pin it) */
  random?: () => number;
}

/** The line on air and its audio run. */
interface OnAir {
  line: LiveLine;
  /** Bumped each time the line's audio (re)starts; a superseded run must not release the line */
  run: number;
  /** Keeps the line on screen until its server end time when no audio is playing */
  hold: ReturnType<typeof setTimeout> | null;
}

interface PendingAudio {
  promise: Promise<ArrayBuffer | null>;
  abort: AbortController;
}

const SOCKET_OPEN = 1;
/** Lines due within this window start now instead of re-arming a tiny timer */
const START_SLOP_MS = 15;
/** Lines this many ahead (after the one on air) are fetched early */
const PREFETCH_AHEAD = 2;
/** Played and skipped line ids remembered so none plays twice */
const MAX_DONE = 512;
const LIVE_STATES: ReadonlySet<string> = new Set<LiveState>(['warming_up', 'on_air', 'sleeping']);

const LOST = 'Lost the live show. Tap Join to try again.';
const AUDIO_FAILED = 'Audio could not start. Tap Join to try again.';
const JOIN_FAILED = 'Could not join the live show. Try again.';

const noop = () => {};

/** Runs an engine call that may throw or reject without ever breaking the show. */
async function attempt(fn: () => Promise<unknown> | unknown): Promise<void> {
  try {
    await fn();
  } catch {
    /* audio glitches never stop the show */
  }
}

/** Trimmed, single-spaced name capped at LIVE_NAME_MAX. */
export function cleanLiveName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, LIVE_NAME_MAX).trim();
}

/** Byte offset into s16le PCM for `lateMs` of audio, aligned down to a whole sample. */
export function pcmOffset(lateMs: number): number {
  const bytes = Math.round(Math.max(0, lateMs) * LIVE_PCM_BYTES_PER_MS);
  return bytes - (bytes % 2);
}

/** Where the samples start: 0 for raw PCM, past the header for a WAV file. */
export function pcmDataStart(buf: ArrayBuffer): number {
  const bytes = new Uint8Array(buf);
  if (bytes.length < 12 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF') return 0;
  const view = new DataView(buf);
  let at = 12;
  while (at + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.subarray(at, at + 4));
    const size = view.getUint32(at + 4, true);
    if (id === 'data') return at + 8;
    at += 8 + size + (size % 2);
  }
  return 0;
}

export function liveSocketUrl(origin: string, station: StationId): string {
  return `${origin.replace(/^http/, 'ws')}/api/live/${station}/ws`;
}

export function liveAudioUrl(station: StationId, lineId: string): string {
  return `/api/live/${station}/audio/${encodeURIComponent(lineId)}`;
}

function isLine(l: unknown): l is LiveLine {
  const line = l as LiveLine | null;
  return (
    !!line &&
    typeof line.id === 'string' &&
    line.id.length > 0 &&
    Number.isFinite(line.startAt) &&
    Number.isFinite(line.durationMs) &&
    line.durationMs > 0 &&
    !!line.line &&
    typeof line.line.text === 'string'
  );
}

function cleanLines(lines: unknown): LiveLine[] {
  if (!Array.isArray(lines)) return [];
  return lines.filter(isLine).sort((a, b) => a.startAt - b.startAt);
}

function cleanListeners(list: unknown): LiveListener[] {
  if (!Array.isArray(list)) return [];
  return list.filter((l): l is LiveListener => !!l && typeof l.id === 'string' && typeof l.name === 'string');
}

function sameLines(a: readonly LiveLine[], b: readonly LiveLine[]): boolean {
  return a.length === b.length && a.every((line, i) => line === b[i]);
}

function initialState(station: StationId): LiveViewState {
  return {
    station,
    status: 'idle',
    listeners: [],
    upcoming: [],
    welcomedYou: false,
    welcomingYou: false,
    clockOffsetMs: 0,
    muted: false,
    enabled: false,
  };
}

/** The studio switch fields of a snapshot or status message, keeping only the ones present and valid. */
function studioPatch(msg: { state: LiveState; enabled?: unknown; enabledUntil?: unknown; note?: unknown }): Partial<LiveViewState> {
  const patch: Partial<LiveViewState> = {};
  if (typeof msg.enabled === 'boolean') {
    patch.enabled = msg.enabled;
    if (!msg.enabled) patch.enabledUntil = undefined;
  }
  if (typeof msg.enabledUntil === 'number' && Number.isFinite(msg.enabledUntil)) patch.enabledUntil = msg.enabledUntil;
  if (typeof msg.note === 'string' && msg.note) patch.note = msg.note;
  else if (msg.state !== 'sleeping') patch.note = undefined;
  return patch;
}

/** What a new connection starts from: off air until the server says otherwise. */
const STUDIO_RESET: Pick<LiveViewState, 'enabled' | 'enabledUntil' | 'note'> = {
  enabled: false,
  enabledUntil: undefined,
  note: undefined,
};

export class LiveController implements LiveActions {
  private state: LiveViewState;
  private readonly subscribers = new Set<() => void>();
  private readonly engine: AudioEngine;
  private readonly timings: LiveTimings;
  private readonly origin: string;
  private readonly createSocket: (url: string) => LiveSocket;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private readonly mono: () => number;
  private readonly random: () => number;
  private readonly clock = new ServerClock();

  /** Bumped on leave, station switch, rejoin and fatal errors; stale callbacks stop. */
  private gen = 0;
  /** The name to (re)join with; null when not taking part */
  private name: string | null = null;
  private unlocking: Promise<void> | null = null;

  private socket: LiveSocket | null = null;
  /** Got 'joined' on the current socket */
  private socketJoined = false;
  /** Got 'joined' at least once on this station */
  private everJoined = false;
  private attempts = 0;
  private lastHeardAt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimers: ReturnType<typeof setTimeout>[] = [];
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  /** Upcoming lines in air order (replaced by every 'timeline') */
  private timeline: LiveLine[] = [];
  /** Ids already played or skipped */
  private readonly done = new Set<string>();
  private onAir: OnAir | null = null;
  private tickTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly audio = new Map<string, PendingAudio>();
  /** Every listener id this station run has been given (a reconnect gets a new one) */
  private readonly myIds = new Set<string>();

  constructor(options: LiveControllerOptions) {
    this.engine = options.engine;
    this.timings = { ...DEFAULT_LIVE_TIMINGS, ...options.timings };
    this.origin = options.origin ?? (typeof location !== 'undefined' ? location.origin : '');
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url));
    this.fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? (() => Date.now());
    this.mono = options.mono ?? (() => performance.now());
    this.random = options.random ?? Math.random;
    const station = options.station && STATION_BY_ID[options.station] ? options.station : 'hi';
    this.state = initialState(station);
  }

  // ---- store -------------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  };

  getSnapshot = (): LiveViewState => this.state;

  private set(patch: Partial<LiveViewState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of [...this.subscribers]) listener();
  }

  // ---- actions -----------------------------------------------------------

  join = async (name: string): Promise<void> => {
    // unlock() must run synchronously inside the click
    this.unlocking = this.unlockEngine();
    const clean = cleanLiveName(name);
    if (clean) saveListenerName(clean);
    if (this.name !== null) this.engine.stopVoice(this.timings.stopFadeMs);
    const gen = this.teardown();
    this.name = clean;
    this.set({
      status: 'connecting',
      you: undefined,
      listeners: [],
      current: undefined,
      upcoming: [],
      welcomedYou: false,
      welcomingYou: false,
      error: undefined,
      ...STUDIO_RESET,
    });
    this.connect(gen);
    if (!(await this.ready(gen))) return;
    if (!this.state.muted) this.engine.music.start(this.accent());
  };

  setStation = (id: StationId): void => {
    if (!STATION_BY_ID[id] || id === this.state.station) return;
    if (this.name === null) {
      this.set({ station: id });
      return;
    }
    this.unlocking = this.unlockEngine();
    this.engine.stopVoice(this.timings.stopFadeMs);
    const gen = this.teardown();
    this.set({
      station: id,
      status: 'connecting',
      you: undefined,
      listeners: [],
      current: undefined,
      upcoming: [],
      welcomedYou: false,
      welcomingYou: false,
      error: undefined,
      ...STUDIO_RESET,
    });
    this.connect(gen);
    void (async () => {
      if (!(await this.ready(gen)) || this.state.muted) return;
      this.engine.music.start(this.accent());
      void attempt(() => this.engine.sfx.tuneStatic(this.timings.staticMs));
    })();
  };

  toggleMute = (): void => {
    const muted = !this.state.muted;
    this.set({ muted });
    if (this.name === null || this.state.status === 'error') return;
    if (muted) {
      // The clock and timeline keep running; only the sound stops
      this.engine.stopVoice(this.timings.stopFadeMs);
      this.engine.music.stop(this.timings.stopFadeMs);
      return;
    }
    this.unlocking = this.unlockEngine();
    this.engine.music.start(this.accent());
    // Pick the line on air back up from where the show is now
    const entry = this.onAir;
    if (entry) void this.playEntry(entry);
  };

  leave = (): void => {
    if (this.name === null && this.state.status === 'idle') return;
    const wasActive = this.name !== null;
    this.teardown();
    this.name = null;
    if (wasActive) {
      this.engine.stopVoice(this.timings.stopFadeMs);
      this.engine.music.stop(this.timings.stopFadeMs);
    }
    this.set({
      ...initialState(this.state.station),
      clockOffsetMs: this.state.clockOffsetMs,
      you: undefined,
      current: undefined,
      error: undefined,
      ...STUDIO_RESET,
    });
  };

  /** Estimated server epoch ms (for progress bars and countdowns). */
  serverNow = (): number => this.now() + this.clock.offsetMs;

  /** The name last used here or on /listen, to prefill the join form. */
  savedName = (): string | undefined => loadListenerName();

  getAnalyser = (): AnalyserNode | null => this.engine.analyser ?? null;

  // ---- lifecycle helpers -------------------------------------------------

  private accent(): string {
    return getStation(this.state.station).accent;
  }

  private unlockEngine(): Promise<void> {
    let p: Promise<void>;
    try {
      p = Promise.resolve(this.engine.unlock());
    } catch (err) {
      p = Promise.reject(err);
    }
    p.catch(noop);
    return p;
  }

  /** Waits for the audio unlock; false if it failed or this generation was superseded. */
  private async ready(gen: number): Promise<boolean> {
    try {
      await this.unlocking;
    } catch {
      if (gen === this.gen) this.fail(AUDIO_FAILED);
      return false;
    }
    return gen === this.gen;
  }

  /** Closes the socket and drops timers, fetches and the timeline. Returns the new generation. */
  private teardown(): number {
    this.gen += 1;
    this.detachSocket();
    this.clearReconnect();
    this.clearTick();
    if (this.onAir) this.clearHold(this.onAir);
    this.onAir = null;
    for (const pending of this.audio.values()) pending.abort.abort();
    this.audio.clear();
    this.timeline = [];
    this.done.clear();
    this.myIds.clear();
    this.attempts = 0;
    this.everJoined = false;
    this.socketJoined = false;
    return this.gen;
  }

  /** Gives up: stops the show and shows `message`. The name is kept so Join or a station switch retries. */
  private fail(message: string): void {
    this.teardown();
    this.engine.stopVoice(this.timings.stopFadeMs);
    this.engine.music.stop(this.timings.stopFadeMs);
    this.set({
      status: 'error',
      error: message,
      you: undefined,
      listeners: [],
      current: undefined,
      upcoming: [],
      welcomingYou: false,
    });
  }

  // ---- socket ------------------------------------------------------------

  private connect(gen: number): void {
    if (gen !== this.gen) return;
    const url = liveSocketUrl(this.origin, this.state.station);
    let socket: LiveSocket;
    try {
      socket = this.createSocket(url);
    } catch {
      this.lost(gen);
      return;
    }
    this.socket = socket;
    this.socketJoined = false;
    this.lastHeardAt = this.now();
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.lastHeardAt = this.now();
      this.send({ type: 'join', name: this.name ?? '' });
      this.startPings(socket, gen);
    };
    socket.onmessage = (ev) => {
      if (this.socket === socket) this.receive(ev.data);
    };
    socket.onclose = () => {
      if (this.socket === socket) this.lost(gen);
    };
    socket.onerror = noop; // a close event follows
  }

  private detachSocket(): void {
    this.stopPings();
    const socket = this.socket;
    if (!socket) return;
    this.socket = null;
    this.socketJoined = false;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    try {
      socket.close(1000);
    } catch {
      /* already closed */
    }
  }

  /** The socket closed or went silent: retry with backoff, keeping the timeline playing meanwhile. */
  private lost(gen: number): void {
    this.detachSocket();
    if (gen !== this.gen || this.name === null) return;
    if (this.attempts >= this.timings.maxReconnects) {
      this.fail(LOST);
      return;
    }
    const base = Math.min(this.timings.reconnectMaxMs, this.timings.reconnectBaseMs * 2 ** this.attempts);
    const wait = Math.round(base * (0.8 + 0.4 * this.random()));
    this.attempts += 1;
    this.set({ status: this.everJoined ? 'reconnecting' : 'connecting' });
    this.clearReconnect();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(gen);
    }, wait);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private send(msg: LiveClientMessage): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== SOCKET_OPEN) return;
    try {
      socket.send(JSON.stringify(msg));
    } catch {
      /* the close event handles it */
    }
  }

  private startPings(socket: LiveSocket, gen: number): void {
    this.stopPings();
    const ping = () => {
      if (this.socket !== socket) return;
      if (this.now() - this.lastHeardAt > this.timings.staleSocketMs) {
        this.lost(gen);
        return;
      }
      this.send({ type: 'ping', t0: this.mono() });
    };
    ping();
    for (let i = 1; i < this.timings.quickPings; i++) {
      this.pingTimers.push(setTimeout(ping, i * this.timings.quickPingGapMs));
    }
    this.pingInterval = setInterval(ping, this.timings.pingEveryMs);
  }

  private stopPings(): void {
    for (const timer of this.pingTimers) clearTimeout(timer);
    this.pingTimers = [];
    if (this.pingInterval !== null) clearInterval(this.pingInterval);
    this.pingInterval = null;
  }

  private receive(data: unknown): void {
    if (typeof data !== 'string') return;
    let msg: LiveServerMessage;
    try {
      msg = JSON.parse(data) as LiveServerMessage;
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    this.lastHeardAt = this.now();
    switch (msg.type) {
      case 'joined':
        this.onJoined(msg.you, msg.snapshot);
        break;
      case 'timeline':
        this.seedClock(msg.now);
        this.setTimeline(msg.lines);
        break;
      case 'presence':
        this.seedClock(msg.now);
        this.set({ listeners: cleanListeners(msg.listeners) });
        break;
      case 'status':
        if (this.socketJoined && LIVE_STATES.has(msg.state)) this.set({ status: msg.state, ...studioPatch(msg) });
        break;
      case 'pong':
        if (this.clock.add(msg.now, this.mono() - msg.t0, this.now())) this.syncClock();
        break;
      case 'error':
        this.onServerError(msg.message);
        break;
    }
  }

  private onJoined(you: LiveListener, snapshot: LiveSnapshot): void {
    if (!you || typeof you.id !== 'string' || !snapshot) return;
    this.socketJoined = true;
    this.everJoined = true;
    this.attempts = 0;
    this.myIds.add(you.id);
    this.seedClock(snapshot.now);
    const status = LIVE_STATES.has(snapshot.state) ? snapshot.state : 'on_air';
    this.set({
      you,
      listeners: cleanListeners(snapshot.listeners),
      status,
      error: undefined,
      ...STUDIO_RESET,
      ...studioPatch({ ...snapshot, state: status }),
    });
    this.setTimeline(snapshot.lines);
  }

  private onServerError(message: unknown): void {
    const text = typeof message === 'string' && message.trim() ? message.trim() : JOIN_FAILED;
    // Refused before joining (full, bad station…): stop instead of retrying in a loop
    if (!this.socketJoined) {
      this.fail(text);
      return;
    }
    this.set({ error: text });
  }

  // ---- clock -------------------------------------------------------------

  private seedClock(serverNow: number): void {
    if (this.clock.synced) return;
    this.clock.seed(serverNow, this.now());
    this.syncClock();
  }

  private syncClock(): void {
    const offset = this.clock.offsetMs;
    if (offset === this.state.clockOffsetMs) return;
    this.set({ clockOffsetMs: offset });
    if (this.name !== null) this.tick();
  }

  // ---- scheduler ---------------------------------------------------------

  private setTimeline(lines: unknown): void {
    this.timeline = cleanLines(lines);
    // The line on air keeps playing whatever the new timeline says; it just picks up any new fields
    const entry = this.onAir;
    const fresh = entry && this.timeline.find((l) => l.id === entry.line.id);
    if (entry && fresh) entry.line = fresh;
    this.tick();
  }

  /** Starts whatever is due, prefetches what's next and arms a timer for the next start. */
  private tick(): void {
    this.clearTick();
    if (this.name === null) return;
    const t = this.serverNow();
    if (!this.onAir) {
      for (const line of this.timeline) {
        if (this.done.has(line.id)) continue;
        if (line.startAt > t + START_SLOP_MS) break;
        this.markDone(line.id);
        // Mostly over already (joined late, or a slow fetch held the previous line): skip it
        if (t - line.startAt > line.durationMs * this.timings.skipFraction) continue;
        this.startLine(line);
        break;
      }
    }
    this.prefetch();
    this.publishLines();
    if (this.onAir) return;
    const next = this.timeline.find((l) => !this.done.has(l.id));
    if (!next) return;
    const gen = this.gen;
    this.tickTimer = setTimeout(
      () => {
        this.tickTimer = null;
        if (gen === this.gen) this.tick();
      },
      Math.max(0, next.startAt - t),
    );
  }

  private clearTick(): void {
    if (this.tickTimer !== null) clearTimeout(this.tickTimer);
    this.tickTimer = null;
  }

  private markDone(id: string): void {
    this.done.add(id);
    if (this.done.size <= MAX_DONE) return;
    const oldest = this.done.values().next().value;
    if (oldest !== undefined) this.done.delete(oldest);
  }

  private startLine(line: LiveLine): void {
    const entry: OnAir = { line, run: 0, hold: null };
    this.onAir = entry;
    if (this.state.muted) this.holdUntilEnd(entry);
    else void this.playEntry(entry);
  }

  /** Plays the line on air from the point the show has reached. */
  private async playEntry(entry: OnAir): Promise<void> {
    const run = ++entry.run;
    this.clearHold(entry);
    const gen = this.gen;
    const stale = () => gen !== this.gen || this.onAir !== entry || entry.run !== run;
    const pcm = await this.audioFor(entry.line);
    if (stale()) return;
    try {
      await this.unlocking;
    } catch {
      /* ready() reports it */
    }
    if (stale()) return;
    const line = entry.line;
    const late = this.serverNow() - line.startAt;
    if (!pcm || this.state.muted || late > line.durationMs * this.timings.skipFraction) {
      this.holdUntilEnd(entry);
      return;
    }
    const start = pcmDataStart(pcm);
    const at = start + (late > this.timings.lateSliceMs ? pcmOffset(late) : 0);
    if (at >= pcm.byteLength) {
      this.holdUntilEnd(entry);
      return;
    }
    const body = new Uint8Array(pcm, at);
    try {
      await this.engine.playStream(
        new Response(body, { headers: { 'content-type': `audio/pcm;rate=${TTS_SAMPLE_RATE}` } }),
      );
    } catch {
      /* a broken clip leaves the line on screen, silent, until its end */
    }
    if (stale()) return;
    this.holdUntilEnd(entry);
  }

  /** Keeps `entry` on air until its server end time, then moves on. */
  private holdUntilEnd(entry: OnAir): void {
    this.clearHold(entry);
    if (this.onAir !== entry) return;
    const remaining = entry.line.startAt + entry.line.durationMs - this.serverNow();
    if (remaining <= 0) {
      this.release(entry);
      return;
    }
    const gen = this.gen;
    entry.hold = setTimeout(() => {
      entry.hold = null;
      if (gen === this.gen) this.holdUntilEnd(entry);
    }, remaining);
  }

  private clearHold(entry: OnAir): void {
    if (entry.hold !== null) clearTimeout(entry.hold);
    entry.hold = null;
  }

  private release(entry: OnAir): void {
    if (this.onAir !== entry) return;
    this.clearHold(entry);
    this.onAir = null;
    this.dropAudio(entry.line.id);
    this.tick();
  }

  /** Fetches the line on air plus the next lines; drops audio nothing needs any more. */
  private prefetch(): void {
    const want: LiveLine[] = this.onAir ? [this.onAir.line] : [];
    const limit = want.length + PREFETCH_AHEAD + (this.onAir ? 0 : 1);
    for (const line of this.timeline) {
      if (want.length >= limit) break;
      if (!this.done.has(line.id) && line.id !== this.onAir?.line.id) want.push(line);
    }
    for (const line of want) void this.audioFor(line);
    const keep = new Set(want.map((l) => l.id));
    const listed = new Set(this.timeline.map((l) => l.id));
    for (const id of [...this.audio.keys()]) {
      if (!keep.has(id) && (this.done.has(id) || !listed.has(id))) this.dropAudio(id);
    }
  }

  private audioFor(line: LiveLine): Promise<ArrayBuffer | null> {
    const hit = this.audio.get(line.id);
    if (hit) return hit.promise;
    const abort = new AbortController();
    const url = liveAudioUrl(this.state.station, line.id);
    const pending: PendingAudio = { abort, promise: Promise.resolve(null) };
    pending.promise = this.fetchFn(url, { signal: abort.signal })
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .catch(() => null)
      .then((buf) => {
        // A failed fetch can be retried on the next tick
        if (!buf && this.audio.get(line.id) === pending) this.audio.delete(line.id);
        return abort.signal.aborted ? null : buf;
      });
    this.audio.set(line.id, pending);
    return pending.promise;
  }

  private dropAudio(id: string): void {
    const pending = this.audio.get(id);
    if (!pending) return;
    pending.abort.abort();
    this.audio.delete(id);
  }

  private namesMe(line: LiveLine | undefined): boolean {
    return !!line?.welcome?.some((id) => this.myIds.has(id));
  }

  /** Publishes current/upcoming and the welcome flags when they changed. */
  private publishLines(): void {
    const current = this.onAir?.line;
    const upcoming = this.timeline.filter((l) => !this.done.has(l.id) && l.id !== current?.id);
    const welcomingYou = this.namesMe(current);
    const patch: Partial<LiveViewState> = {};
    if (current !== this.state.current) patch.current = current;
    if (!sameLines(upcoming, this.state.upcoming)) patch.upcoming = upcoming;
    if (welcomingYou !== this.state.welcomingYou) patch.welcomingYou = welcomingYou;
    if (welcomingYou && !this.state.welcomedYou) patch.welcomedYou = true;
    if (Object.keys(patch).length) this.set(patch);
  }
}
