/** Show scheduler and radio store (docs/TECH-SPEC.md §9). */
import { CALL_MAX_SECONDS, LISTENER_NAME_MAX, PAUSE_AFTER_MS } from '../../shared/constants';
import type { SegmentRequest } from '../../shared/schemas';
import { getStation, STATION_BY_ID } from '../../shared/stations';
import type { CallResponse, Line, Segment, Source, Station, StationId } from '../../shared/types';
import type { AudioEngine, Recorder } from '../audio/types';
import * as defaultApi from './api';
import { readAhead } from './api';
import { entryKey, firstEntry, nextEntry, withStoryRequest, type ClockEntry } from './clock';
import { cleanListenerName, listenerContext, loadListenerName, saveListenerName } from './listener';
import {
  INITIAL_STATE,
  type Caption,
  type CallState,
  type NowPlaying,
  type RadioActions,
  type RadioState,
  type RadioStatus,
} from './state';

export interface RadioApi {
  getContext: typeof defaultApi.getContext;
  getSegment: typeof defaultApi.getSegment;
  ttsFetch: typeof defaultApi.ttsFetch;
  postCall: typeof defaultApi.postCall;
}

export interface RadioTimings {
  /** How long a caption stays up when its line's TTS failed */
  ttsFailCaptionMs: number;
  /** Delay before the single segment retry */
  segmentRetryMs: number;
  /** Max wait for /api/context before requesting a segment without it */
  contextWaitMs: number;
  /** Pause between attempts once several segments in a row failed */
  failureBackoffMs: number;
  /** Shorter recordings are discarded */
  minCallMs: number;
  /** How long a finished call's state (and error) stays visible */
  callLingerMs: number;
  stopFadeMs: number;
  callStopFadeMs: number;
  staticMs: number;
}

export const DEFAULT_TIMINGS: RadioTimings = {
  ttsFailCaptionMs: 2000,
  segmentRetryMs: 800,
  contextWaitMs: 4000,
  failureBackoffMs: 3000,
  minCallMs: 500,
  callLingerMs: 6000,
  stopFadeMs: 150,
  callStopFadeMs: 200,
  staticMs: 600,
};

export interface RadioControllerOptions {
  engine: AudioEngine;
  recorder: Recorder;
  api?: RadioApi;
  timings?: Partial<RadioTimings>;
}

interface Cursor {
  entry: ClockEntry;
  segment: Segment | null;
  lineIndex: number;
  /** Whether the line at lineIndex has started playing */
  started: boolean;
}

interface PendingSegment {
  promise: Promise<Segment | null>;
  controller: AbortController;
}

interface PendingTts {
  key: string;
  promise: Promise<Response>;
  startedAt: number;
  timing: { firstChunkAt?: number };
}

const CALL_STATUSES: ReadonlySet<RadioStatus> = new Set<RadioStatus>([
  'call_recording',
  'call_thinking',
  'call_on_air',
]);
const MAX_HISTORY = 6;
const MAX_RECENT_CALLS = 3;
const RECENT_CALL_CHARS = 300;
const NOW_PLAYING_CHARS = 120;
const MISSES_BEFORE_BACKOFF = 3;

const TOO_SHORT = 'That was too short. Hold the button while you speak.';
const WEAK_SIGNAL = 'Weak signal. Retrying…';

const noop = () => {};
const now = () => performance.now();
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Runs an engine call that may throw or reject without ever breaking the programme. */
async function attempt(fn: () => Promise<unknown> | unknown): Promise<void> {
  try {
    await fn();
  } catch {
    /* audio glitches never stop the show */
  }
}

function linkedController(parent: AbortSignal): AbortController {
  const controller = new AbortController();
  if (parent.aborted) controller.abort();
  else parent.addEventListener('abort', () => controller.abort(), { once: true });
  return controller;
}

function freshCursor(): Cursor {
  return { entry: firstEntry(), segment: null, lineIndex: 0, started: false };
}

function voiceLabel(speaker: string): string {
  const [name = '', , ...style] = speaker.split('_');
  if (!name) return speaker;
  const cap = `${name[0].toUpperCase()}${name.slice(1)}`;
  return style.length ? `${cap} · ${style.join(' ')}` : cap;
}

export function lineCaption(line: Line, station: Station): Caption {
  const voice = station.cast[line.role];
  const label = voice && voice.speaker === line.speaker ? voice.label : voiceLabel(line.speaker);
  const caption: Caption = { role: line.role, speaker: line.speaker, label, text: line.text };
  if (line.en) caption.en = line.en;
  return caption;
}

export function stationIdSegment(station: Station, n: number): Segment {
  const voice = station.cast.station_id;
  const line: Line = {
    role: 'station_id',
    speaker: voice.speaker,
    text: station.stationIdText,
    pace: voice.pace,
    temperature: voice.temperature,
    pauseAfterMs: PAUSE_AFTER_MS.station_id,
  };
  if (station.language !== 'en-IN') line.en = `You're listening to Tarang FM ${station.frequency}!`;
  return {
    id: `local-${station.id}-station-id-${n}`,
    station: station.id,
    type: 'station_id',
    title: `${station.name} · ${station.frequency}`,
    lines: [line],
  };
}

function toNowPlaying(segment: Segment): NowPlaying {
  const np: NowPlaying = { id: segment.id, type: segment.type, title: segment.title };
  if (segment.sources?.length) np.sources = segment.sources;
  if (segment.fallback) np.fallback = true;
  return np;
}

function cleanHeadlines(list: Source[] | undefined): Source[] {
  if (!Array.isArray(list)) return [];
  const out: Source[] = [];
  for (const h of list) {
    const title = typeof h?.title === 'string' ? h.title.trim().slice(0, 300) : '';
    const url = typeof h?.url === 'string' ? h.url.trim() : '';
    if (!title || !/^https?:\/\//i.test(url) || url.length > 2000) continue;
    const source: Source = { title, url };
    if (typeof h.source === 'string' && h.source.trim()) source.source = h.source.trim().slice(0, 120);
    out.push(source);
    if (out.length === 8) break;
  }
  return out;
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.name === 'NotAllowedError') return 'Microphone permission was denied.';
  if (err instanceof Error && err.name === 'NotFoundError') return 'No microphone found.';
  if (err instanceof defaultApi.ApiRequestError && err.message) return err.message;
  return fallback;
}

export class RadioController implements RadioActions {
  private state: RadioState;
  private readonly subscribers = new Set<() => void>();
  private readonly engine: AudioEngine;
  private readonly recorder: Recorder;
  private readonly api: RadioApi;
  private readonly timings: RadioTimings;

  /** Bumped on every interruption; a loop or call flow whose generation is stale must stop. */
  private gen = 0;
  /** TTS requests of the current run (aborted on pause, call, station switch). */
  private runAbort = new AbortController();
  /** Context and segment requests of the current station (aborted on station switch). */
  private stationAbort = new AbortController();
  private unlocking: Promise<void> | null = null;

  private cursor: Cursor | null = null;
  private resumeAt: Cursor | null = null;
  private plannedNext: { afterSeq: number; entry: ClockEntry } | null = null;
  private readonly segments = new Map<string, PendingSegment>();
  private readonly tts = new Map<string, PendingTts>();
  private context: Promise<void> | null = null;
  private headlines: Source[] = [];
  private recentCalls: string[] = [];
  private localSegments = 0;

  private callResume: 'playing' | 'paused' = 'playing';
  private recStart: Promise<void> | null = null;
  private recStartedAt = 0;
  private callAbort: AbortController | null = null;
  private callTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: RadioControllerOptions) {
    this.engine = options.engine;
    this.recorder = options.recorder;
    this.api = options.api ?? defaultApi;
    this.timings = { ...DEFAULT_TIMINGS, ...options.timings };
    const name = loadListenerName();
    this.state = { ...INITIAL_STATE, listener: name ? { name } : {} };
  }

  // ---- store -------------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  };

  getSnapshot = (): RadioState => this.state;

  private set(patch: Partial<RadioState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of [...this.subscribers]) listener();
  }

  private showCaption(caption: Caption, patch: Partial<RadioState> = {}): void {
    const prev = this.state.caption;
    const history = prev ? [...this.state.history, prev].slice(-MAX_HISTORY) : this.state.history;
    this.set({ ...patch, caption, history });
  }

  // ---- actions -----------------------------------------------------------

  tuneIn = async (): Promise<void> => {
    const status = this.state.status;
    if (status === 'paused') {
      this.resume();
      return;
    }
    if (status !== 'idle' && status !== 'error') return;
    this.unlocking = this.unlockEngine();
    const gen = this.interrupt();
    this.resetStationScope();
    this.cursor = freshCursor();
    this.resumeAt = null;
    this.set({ status: 'tuning', error: undefined });
    this.fetchContext(this.state.stationId);
    if (!(await this.ready(gen))) return;
    this.startProgramme(gen);
  };

  pause = (): void => {
    const status = this.state.status;
    if (CALL_STATUSES.has(status)) {
      this.callResume = 'paused';
      return;
    }
    if (status !== 'playing' && status !== 'tuning') return;
    this.resumeAt = this.cursor ? { ...this.cursor, started: false } : null;
    this.interrupt();
    this.engine.stopVoice(this.timings.stopFadeMs);
    this.engine.music.stop();
    this.set({ status: 'paused' });
  };

  resume = (): void => {
    const status = this.state.status;
    if (CALL_STATUSES.has(status)) {
      this.callResume = 'playing';
      return;
    }
    if (status !== 'paused') return;
    this.unlocking = this.unlockEngine();
    const gen = this.interrupt();
    const from = this.resumeAt ?? freshCursor();
    this.resumeAt = null;
    this.set({ status: 'playing', error: undefined });
    void (async () => {
      if (!(await this.ready(gen))) return;
      this.engine.music.start(this.station().accent);
      await this.run(gen, from);
    })();
  };

  setStation = (id: StationId): void => {
    if (!STATION_BY_ID[id] || id === this.state.stationId) return;
    const status = this.state.status;
    if (status === 'idle' || status === 'error') {
      this.set({ stationId: id });
      return;
    }
    this.unlocking = this.unlockEngine();
    this.abortCall();
    const gen = this.interrupt();
    this.resetStationScope();
    this.recentCalls = [];
    this.engine.stopVoice(this.timings.stopFadeMs);
    this.engine.music.stop(this.timings.stopFadeMs);
    this.cursor = freshCursor();
    this.resumeAt = null;
    this.set({
      stationId: id,
      status: 'tuning',
      segment: undefined,
      lineIndex: 0,
      upNext: undefined,
      call: undefined,
      error: undefined,
    });
    this.fetchContext(id);
    void (async () => {
      if (!(await this.ready(gen))) return;
      await attempt(() => this.engine.sfx.tuneStatic(this.timings.staticMs));
      if (gen !== this.gen) return;
      this.startProgramme(gen);
    })();
  };

  startCall = async (): Promise<void> => {
    const status = this.state.status;
    if (status !== 'playing' && status !== 'paused' && status !== 'tuning') return;
    if (status !== 'paused') this.resumeAt = this.positionAfterCurrentLine();
    this.callResume = status === 'paused' ? 'paused' : 'playing';
    const gen = this.interrupt();
    this.engine.stopVoice(this.timings.callStopFadeMs);
    this.recStartedAt = 0;
    this.set({ status: 'call_recording', call: {} });

    const starting = this.startRecorder();
    this.recStart = starting;
    try {
      await starting;
    } catch (err) {
      this.finishCall(gen, { error: errorMessage(err, 'Could not open the microphone.') });
      return;
    }
    if (gen !== this.gen) {
      // Cancelled or the station changed while the mic permission prompt was open
      void attempt(() => this.recorder.cancel());
      return;
    }
    if (this.state.status !== 'call_recording') return;
    const maxMs = CALL_MAX_SECONDS * 1000 - 250;
    this.callTimer = setTimeout(() => {
      if (gen === this.gen && this.state.status === 'call_recording') void this.endCall();
    }, maxMs);
  };

  endCall = async (): Promise<void> => {
    if (this.state.status !== 'call_recording') return;
    const gen = this.gen;
    this.clearCallTimer();
    this.set({ status: 'call_thinking' });
    try {
      await this.recStart;
    } catch {
      return; // startCall reports the mic error
    }
    if (gen !== this.gen) return;
    if (now() - this.recStartedAt < this.timings.minCallMs) {
      void attempt(() => this.recorder.cancel());
      this.finishCall(gen, { error: TOO_SHORT });
      return;
    }

    let blob: Blob;
    try {
      blob = await this.recorder.stop();
    } catch (err) {
      this.finishCall(gen, { error: errorMessage(err, 'Could not record. Check the microphone.') });
      return;
    }
    if (gen !== this.gen) return;
    if (blob.size === 0) {
      this.finishCall(gen, { error: TOO_SHORT });
      return;
    }

    const controller = new AbortController();
    this.callAbort = controller;
    const station = this.station();
    let res: CallResponse;
    try {
      res = await this.api.postCall(
        blob,
        {
          station: station.id,
          listener: this.listener(),
          nowPlaying: this.state.segment?.title.slice(0, NOW_PLAYING_CHARS) || undefined,
        },
        controller.signal,
      );
    } catch (err) {
      this.finishCall(gen, { error: errorMessage(err, 'The RJ could not take your call. Try again.') });
      return;
    }
    if (gen !== this.gen) return;
    try {
      await this.putOnAir(gen, station, res, controller.signal);
    } catch (err) {
      console.error('Call-in failed', err);
      if (gen !== this.gen) return;
      this.engine.stopVoice(this.timings.stopFadeMs);
      this.finishCall(gen, { error: 'The RJ could not take your call. Try again.' });
    }
  };

  cancelCall = (): void => {
    if (!CALL_STATUSES.has(this.state.status)) return;
    this.abortCall();
    const gen = this.interrupt();
    this.engine.stopVoice(this.timings.stopFadeMs);
    this.set({ call: undefined });
    this.finishCall(gen);
  };

  setListenerName = (name: string): void => {
    // Keep the raw text (spaces included) so a controlled input can type freely
    const raw = name.slice(0, LISTENER_NAME_MAX);
    saveListenerName(raw);
    const listener = { ...this.state.listener };
    if (raw) listener.name = raw;
    else delete listener.name;
    this.set({ listener });
  };

  toggleSubtitles = (): void => {
    this.set({ showSubtitles: !this.state.showSubtitles });
  };

  getMicLevel = (): number => {
    try {
      return this.recorder.level();
    } catch {
      return 0;
    }
  };

  getAnalyser = (): AnalyserNode | null => this.engine.analyser ?? null;

  // ---- lifecycle helpers -------------------------------------------------

  private station(): Station {
    return getStation(this.state.stationId);
  }

  private listener() {
    return listenerContext(this.state.listener);
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
      if (gen === this.gen) {
        this.interrupt();
        this.set({ status: 'error', error: 'Audio could not start. Tap Tune in to try again.' });
      }
      return false;
    }
    return gen === this.gen;
  }

  /** Stops the running loop or call flow and drops line prefetches. Returns the new generation. */
  private interrupt(): number {
    this.gen += 1;
    this.runAbort.abort();
    this.runAbort = new AbortController();
    this.tts.clear();
    return this.gen;
  }

  private resetStationScope(): void {
    this.stationAbort.abort();
    this.stationAbort = new AbortController();
    this.segments.clear();
    this.plannedNext = null;
    this.context = null;
    this.headlines = [];
  }

  private startProgramme(gen: number): void {
    const station = this.station();
    this.engine.music.start(station.accent);
    if (!this.context) this.fetchContext(station.id);
    const from = freshCursor();
    this.cursor = from;
    void this.run(gen, from);
  }

  private fetchContext(station: StationId): Promise<void> {
    const signal = this.stationAbort.signal;
    const p = this.api.getContext(station, signal).then((ctx) => {
      if (signal.aborted) return;
      this.headlines = cleanHeadlines(ctx.headlines);
      const city = ctx.city?.trim();
      if (city && city !== this.state.listener.city) {
        this.set({ listener: { ...this.state.listener, city } });
      }
    }, noop);
    this.context = p;
    return p;
  }

  // ---- programme loop ----------------------------------------------------

  /** The entry after `entry`, honouring a call's story request. */
  private following(entry: ClockEntry): ClockEntry {
    const planned = this.plannedNext;
    if (planned && planned.afterSeq === entry.seq) return planned.entry;
    return nextEntry(entry);
  }

  private advance(entry: ClockEntry): ClockEntry {
    const next = this.following(entry);
    if (this.plannedNext?.afterSeq === entry.seq) this.plannedNext = null;
    return next;
  }

  private async run(gen: number, from: Cursor): Promise<void> {
    const station = this.station();
    let entry = from.entry;
    let segment = from.segment;
    let lineIndex = from.lineIndex;
    let resumed = segment !== null;
    let misses = 0;

    while (gen === this.gen) {
      try {
        if (!segment) {
          this.cursor = { entry, segment: null, lineIndex: 0, started: false };
          const loaded = await this.loadSegment(entry, station.id);
          if (gen !== this.gen) return;
          if (!loaded || loaded.lines.length === 0) {
            misses += 1;
            if (misses >= MISSES_BEFORE_BACKOFF) {
              this.set({ error: WEAK_SIGNAL });
              await delay(this.timings.failureBackoffMs);
              if (gen !== this.gen) return;
            }
            entry = this.advance(entry);
            continue;
          }
          misses = 0;
          segment = loaded;
          lineIndex = 0;
        }
        if (lineIndex < segment.lines.length) {
          await this.playSegment(gen, station, entry, segment, lineIndex, !resumed);
          if (gen !== this.gen) return;
        }
      } catch (err) {
        if (gen !== this.gen) return;
        console.error('Programme error', err);
        await delay(1000);
        if (gen !== this.gen) return;
      }
      segment = null;
      lineIndex = 0;
      resumed = false;
      entry = this.advance(entry);
    }
  }

  private async playSegment(
    gen: number,
    station: Station,
    entry: ClockEntry,
    segment: Segment,
    startLine: number,
    sting: boolean,
  ): Promise<void> {
    const following = this.following(entry);
    this.pruneSegments([entry, following]);
    this.prefetchSegment(following, station.id);
    this.set({ segment: toNowPlaying(segment), lineIndex: startLine, upNext: following.type });

    for (let i = startLine; i < segment.lines.length; i++) {
      if (gen !== this.gen) return;
      this.cursor = { entry, segment, lineIndex: i, started: false };
      const pending = this.ensureTts(segment, i, station.id);
      if (!pending) return;
      if (i === startLine && sting) {
        if (entry.type === 'station_id') {
          // The jingle is voiced over the sting
          void attempt(() => this.engine.sfx.sting());
        } else {
          await attempt(() => this.engine.sfx.sting());
          if (gen !== this.gen) return;
        }
      }
      await this.playLine(gen, station, segment, i, pending);
    }
  }

  private async playLine(
    gen: number,
    station: Station,
    segment: Segment,
    index: number,
    pending: PendingTts,
  ): Promise<void> {
    let res: Response | null = null;
    try {
      res = await pending.promise;
    } catch {
      res = null;
    }
    if (gen !== this.gen) {
      res?.body?.cancel().catch(noop);
      return;
    }
    if (this.tts.get(pending.key) === pending) this.tts.delete(pending.key);

    let started = false;
    if (res) {
      try {
        await this.engine.playStream(res, {
          fetchStartedAt: pending.startedAt,
          onStart: () => {
            started = true;
            this.lineStarted(gen, station, segment, index, pending);
          },
        });
      } catch {
        /* broken stream: handled like a failed line below */
      }
      if (gen !== this.gen) return;
    }
    if (!started) {
      this.lineStarted(gen, station, segment, index, null);
      await delay(this.timings.ttsFailCaptionMs);
      return;
    }
    const pauseMs = segment.lines[index].pauseAfterMs ?? PAUSE_AFTER_MS[segment.type];
    await attempt(() => this.engine.silence(pauseMs));
  }

  private lineStarted(
    gen: number,
    station: Station,
    segment: Segment,
    index: number,
    pending: PendingTts | null,
  ): void {
    if (gen !== this.gen) return;
    const cursor = this.cursor;
    if (cursor && cursor.segment === segment && cursor.lineIndex === index) cursor.started = true;
    const patch: Partial<RadioState> = { lineIndex: index, error: undefined };
    if (this.state.status === 'tuning') patch.status = 'playing';
    if (pending) patch.ttfaMs = Math.round((pending.timing.firstChunkAt ?? now()) - pending.startedAt);
    this.showCaption(lineCaption(segment.lines[index], station), patch);
    this.ensureTts(segment, index + 1, station.id);
  }

  private ensureTts(segment: Segment, index: number, station: StationId): PendingTts | null {
    const line = segment.lines[index];
    if (!line) return null;
    const key = `${segment.id}#${index}`;
    const existing = this.tts.get(key);
    if (existing) return existing;
    const signal = linkedController(this.runAbort.signal).signal;
    const timing: PendingTts['timing'] = {};
    const startedAt = now();
    const promise = this.api.ttsFetch(line, station, signal).then((res) =>
      readAhead(res, () => {
        timing.firstChunkAt ??= now();
      }),
    );
    promise.catch(noop);
    const pending: PendingTts = { key, promise, startedAt, timing };
    this.tts.set(key, pending);
    return pending;
  }

  // ---- segments ----------------------------------------------------------

  private loadSegment(entry: ClockEntry, station: StationId): Promise<Segment | null> {
    const key = entryKey(entry);
    const hit = this.segments.get(key);
    if (hit) return hit.promise;
    const controller = linkedController(this.stationAbort.signal);
    const promise = this.fetchSegment(entry, station, controller.signal);
    this.segments.set(key, { promise, controller });
    return promise;
  }

  /** Prefetches an upcoming segment; if it fails, warms the one after it instead. */
  private prefetchSegment(entry: ClockEntry, station: StationId): void {
    const key = entryKey(entry);
    const signal = this.stationAbort.signal;
    void this.loadSegment(entry, station).then((segment) => {
      if (signal.aborted || (segment && segment.lines.length > 0)) return;
      if (!this.segments.has(key)) return;
      void this.loadSegment(this.following(entry), station);
    });
  }

  private pruneSegments(keep: ClockEntry[]): void {
    const keys = new Set(keep.map(entryKey));
    for (const [key, pending] of this.segments) {
      if (keys.has(key)) continue;
      pending.controller.abort();
      this.segments.delete(key);
    }
  }

  private async fetchSegment(entry: ClockEntry, station: StationId, signal: AbortSignal): Promise<Segment | null> {
    try {
      if (entry.type === 'station_id') {
        this.localSegments += 1;
        return stationIdSegment(getStation(station), this.localSegments);
      }
      const req = await this.segmentRequest(entry, station);
      for (let attemptNo = 0; ; attemptNo++) {
        if (signal.aborted) return null;
        try {
          return await this.api.getSegment(req, signal);
        } catch (err) {
          if (signal.aborted || attemptNo >= 1) {
            if (!signal.aborted) console.warn(`Segment ${entry.type} failed`, err);
            return null;
          }
          await delay(this.timings.segmentRetryMs);
        }
      }
    } catch {
      return null;
    }
  }

  private async segmentRequest(entry: ClockEntry, station: StationId): Promise<SegmentRequest> {
    const context = this.context ?? this.fetchContext(station);
    await Promise.race([context, delay(this.timings.contextWaitMs)]);
    const req: SegmentRequest = {
      station,
      type: entry.type,
      listener: this.listener(),
      upNext: this.following(entry).type,
    };
    if (entry.type === 'news') req.headlines = this.headlines;
    if (entry.type === 'kahani' && entry.theme) req.theme = entry.theme;
    if (this.recentCalls.length) req.recentCalls = this.recentCalls.slice(-MAX_RECENT_CALLS);
    return req;
  }

  // ---- call-in -----------------------------------------------------------

  private startRecorder(): Promise<void> {
    let p: Promise<void>;
    try {
      p = this.recorder.start();
    } catch (err) {
      p = Promise.reject(err);
    }
    const started = p.then(() => {
      this.recStartedAt = now();
    });
    started.catch(noop);
    return started;
  }

  private positionAfterCurrentLine(): Cursor | null {
    const c = this.cursor;
    if (!c) return null;
    const next = c.segment && c.started ? c.lineIndex + 1 : c.lineIndex;
    return { ...c, lineIndex: next, started: false };
  }

  private async putOnAir(gen: number, station: Station, res: CallResponse, signal: AbortSignal): Promise<void> {
    if (!res || typeof res !== 'object') throw new Error('Malformed call response');
    const transcript = typeof res.transcript === 'string' ? res.transcript.trim() : '';
    if (transcript) {
      this.recentCalls = [...this.recentCalls, transcript.slice(0, RECENT_CALL_CHARS)].slice(-MAX_RECENT_CALLS);
    }
    if (res.intent === 'story_request') this.planStory(res.theme || transcript);

    const reply = res.reply?.text?.trim() ? res.reply : null;
    const startedAt = now();
    let firstChunkAt: number | undefined;
    const audio: Promise<Response | null> = reply
      ? this.api
          .ttsFetch(reply, station.id, signal)
          .then((r) => readAhead(r, () => (firstChunkAt ??= now())))
          .catch(() => null)
      : Promise.resolve(null);

    await attempt(() => this.engine.sfx.callTone());
    if (gen !== this.gen) return;

    const call: CallState = { transcript, transcriptEn: res.transcriptEn, reply: reply?.text, replyEn: reply?.en };
    if (transcript) {
      const name = cleanListenerName(this.state.listener.name);
      const caption: Caption = { role: 'caller', speaker: '', label: name ?? 'Caller', text: transcript };
      if (res.transcriptEn) caption.en = res.transcriptEn;
      this.showCaption(caption, { status: 'call_on_air', call });
    } else {
      this.set({ status: 'call_on_air', call });
    }

    if (reply) {
      const body = await audio;
      if (gen !== this.gen) {
        body?.body?.cancel().catch(noop);
        return;
      }
      let started = false;
      if (body) {
        try {
          await this.engine.playStream(body, {
            fetchStartedAt: startedAt,
            onStart: () => {
              if (gen !== this.gen) return;
              started = true;
              this.showCaption(lineCaption(reply, station), {
                ttfaMs: Math.round((firstChunkAt ?? now()) - startedAt),
              });
            },
          });
        } catch {
          /* fall through to the caption-only path */
        }
        if (gen !== this.gen) return;
      }
      if (!started) {
        this.showCaption(lineCaption(reply, station));
        await delay(this.timings.ttsFailCaptionMs);
        if (gen !== this.gen) return;
      }
      await attempt(() => this.engine.silence(reply.pauseAfterMs || PAUSE_AFTER_MS.rj_link));
    }
    this.finishCall(gen);
  }

  /** Makes the segment after the current one a kahani on the caller's theme. */
  private planStory(theme: string | undefined): void {
    const current = this.resumeAt?.entry ?? this.cursor?.entry;
    if (!current) return;
    const entry = withStoryRequest(current, theme);
    this.plannedNext = { afterSeq: current.seq, entry };
    this.pruneSegments([current, entry]);
    this.prefetchSegment(entry, this.state.stationId);
    this.set({ upNext: entry.type });
  }

  /** Ends the call flow of generation `gen` and hands back to the programme. */
  private finishCall(gen: number, patch?: Partial<CallState>): void {
    if (gen !== this.gen) return;
    this.clearCallTimer();
    this.callAbort = null;
    const call: CallState | undefined = patch ? { ...this.state.call, ...patch } : this.state.call;
    this.lingerCall(call);
    if (this.callResume === 'paused') {
      this.interrupt();
      this.engine.music.stop();
      this.set({ status: 'paused', call });
      return;
    }
    const next = this.interrupt();
    const from = this.resumeAt ?? freshCursor();
    this.resumeAt = null;
    this.engine.music.start(this.station().accent);
    this.set({ status: 'playing', call });
    void this.run(next, from);
  }

  private lingerCall(call: CallState | undefined): void {
    if (!call) return;
    setTimeout(() => {
      if (this.state.call === call && !CALL_STATUSES.has(this.state.status)) this.set({ call: undefined });
    }, this.timings.callLingerMs);
  }

  private abortCall(): void {
    this.clearCallTimer();
    this.callAbort?.abort();
    this.callAbort = null;
    if (this.recorder.recording) void attempt(() => this.recorder.cancel());
  }

  private clearCallTimer(): void {
    if (this.callTimer !== null) clearTimeout(this.callTimer);
    this.callTimer = null;
  }
}
