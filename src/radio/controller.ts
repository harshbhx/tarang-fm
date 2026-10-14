/** Show scheduler and radio store (docs/TECH-SPEC.md §9). */
import { CALL_MAX_SECONDS, LISTENER_NAME_MAX, PAUSE_AFTER_MS } from '../../shared/constants';
import type { CallMeta, SegmentRequest } from '../../shared/schemas';
import { getStation, STATION_BY_ID } from '../../shared/stations';
import type {
  CallResponse,
  Line,
  Mood,
  PhoneCall,
  PhoneRecentResponse,
  Segment,
  SegmentType,
  Source,
  Station,
  StationId,
  Weather,
} from '../../shared/types';
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
  /** Optional: without it the studio phone line is not polled */
  getPhoneRecent?: typeof defaultApi.getPhoneRecent;
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
  /** How often the studio phone line is polled while tuned in */
  phonePollMs: number;
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
  phonePollMs: 45_000,
};

export interface RadioControllerOptions {
  engine: AudioEngine;
  recorder: Recorder;
  api?: RadioApi;
  timings?: Partial<RadioTimings>;
  /** Random source for the producer's rotation (tests pin it) */
  random?: () => number;
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
  /** Set once the request settles */
  segment?: Segment | null;
}

interface Aired {
  id: string;
  type: SegmentType;
  summary?: string;
  mood?: Mood;
}

export type ShowLog = NonNullable<SegmentRequest['showLog']>;
export type ProducerPlan = NonNullable<SegmentRequest['producer']>;

interface PhonePoll {
  abort: AbortController;
  timer: ReturnType<typeof setTimeout> | null;
  /** Settles once the first poll of this run has finished (ok or not) */
  first: Promise<void>;
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
/** Studio-line dedications read in one RJ link */
const MAX_PHONE_CALLS_PER_LINK = 2;
/** SegmentRequest.recentCalls limit */
const MAX_REQUEST_CALLS = 5;
const RECENT_CALL_CHARS = 300;
/** While tuned in (a web call-in included), the studio phone line is polled. */
const PHONE_STATUSES: ReadonlySet<RadioStatus> = new Set<RadioStatus>([
  'tuning',
  'playing',
  'call_recording',
  'call_thinking',
  'call_on_air',
]);
const NOW_PLAYING_CHARS = 120;
/** SegmentRequest.showLog / CallMeta.showLog limit */
const SHOW_LOG_MAX = 4;
const SUMMARY_CHARS = 200;
/** The RJ greets the listener on the first link and every 4th link after it */
const GREET_EVERY = 4;
const CATCHPHRASE_ODDS = 0.3;
const BIT_ODDS = 0.35;
const CARE_HELPLINE = { name: 'Tele-MANAS', number: '14416' } as const;
const MISSES_BEFORE_BACKOFF = 3;

const TOO_SHORT = 'That was too short. Hold the button while you speak.';
const WEAK_SIGNAL = 'Weak signal. Retrying…';

/** Producer settings for the session's `linkNo`-th RJ link (0-based); a catchphrase never runs twice in a row. */
export function producerPlan(linkNo: number, lastCatchphrase: boolean, random: () => number = Math.random): ProducerPlan {
  return {
    firstLink: linkNo === 0,
    greetListener: linkNo % GREET_EVERY === 0,
    useCatchphrase: !lastCatchphrase && random() < CATCHPHRASE_ODDS,
    bit: random() < BIT_ODDS ? 'any' : 'none',
  };
}

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
  if (station.language !== 'en-IN') {
    line.en = station.stationIdEn;
  }
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
    if (h.local === true) source.local = true;
    out.push(source);
    if (out.length === 8) break;
  }
  return out;
}

function cleanPhone(res: PhoneRecentResponse | null | undefined): RadioState['phone'] | null {
  if (!res || typeof res !== 'object') return null;
  const calls: PhoneCall[] = [];
  for (const c of Array.isArray(res.calls) ? res.calls : []) {
    if (!c || typeof c.id !== 'string' || !c.id) continue;
    if (typeof c.message !== 'string' || !c.message.trim()) continue;
    if (typeof c.at !== 'string' || Number.isNaN(Date.parse(c.at))) continue;
    calls.push(c);
    if (calls.length === 6) break;
  }
  return { number: typeof res.number === 'string' ? res.number : '', calls };
}

/** 'Phone call from Priya in Vadodara: …', the form the RJ link reads out on air. */
export function phoneCallLine(call: PhoneCall): string {
  const name = call.name?.trim() || 'a listener';
  const city = call.city?.trim();
  return `Phone call from ${name}${city ? ` in ${city}` : ''}: ${call.message.trim()}`.slice(0, RECENT_CALL_CHARS);
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
  private weather: Weather | undefined;
  private recentCalls: string[] = [];
  /** Segments that went on air this session, oldest first */
  private aired: Aired[] = [];
  private links = 0;
  private lastCatchphrase = false;
  private region: string | undefined;
  private readonly random: () => number;
  private localSegments = 0;
  private phonePoll: PhonePoll | null = null;
  /** Studio-line calls already given to an RJ link this session (each is read on air once) */
  private readonly phoneRead = new Set<string>();

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
    this.random = options.random ?? Math.random;
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
    const status = this.state.status;
    this.state = { ...this.state, ...patch };
    if (this.state.status !== status) this.syncPhonePoll();
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
    this.aired = [];
    this.links = 0;
    this.lastCatchphrase = false;
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
      helpline: undefined,
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
    this.set({ status: 'call_recording', call: {}, helpline: undefined });

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
      const meta: CallMeta = {
        station: station.id,
        listener: this.listener(),
        nowPlaying: this.state.segment?.title.slice(0, NOW_PLAYING_CHARS) || undefined,
      };
      const showLog = this.showLog();
      if (showLog.length) meta.showLog = showLog;
      res = await this.api.postCall(blob, meta, controller.signal);
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
    return listenerContext({ ...this.state.listener, region: this.region });
  }

  /** The last few aired segments with a summary, oldest first */
  private showLog(): ShowLog {
    return this.aired
      .filter((a) => a.summary)
      .slice(-SHOW_LOG_MAX)
      .map((a) => ({ type: a.type, summary: (a.summary ?? '').slice(0, SUMMARY_CHARS) }));
  }

  private recordAired(segment: Segment): void {
    if (this.aired.some((a) => a.id === segment.id)) return;
    const summary = segment.summary?.trim();
    const aired: Aired = { id: segment.id, type: segment.type };
    if (summary) aired.summary = summary;
    if (segment.mood) aired.mood = segment.mood;
    this.aired = [...this.aired, aired].slice(-SHOW_LOG_MAX * 2);
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
    this.weather = undefined;
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
      this.weather = ctx.weather && Number.isFinite(ctx.weather.tempC) ? ctx.weather : undefined;
      const region = ctx.region?.trim();
      if (region) this.region = region;
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
    this.recordAired(segment);
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
    const pending: PendingSegment = { promise, controller };
    void promise.then((segment) => {
      pending.segment = segment;
    });
    this.segments.set(key, pending);
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
      const { req, phoneIds } = await this.segmentRequest(entry, station);
      // A dedication that never makes it on air (failed, aborted or template segment) stays unread
      const release = () => phoneIds.forEach((id) => this.phoneRead.delete(id));
      for (let attemptNo = 0; ; attemptNo++) {
        if (signal.aborted) {
          release();
          return null;
        }
        try {
          const segment = await this.api.getSegment(req, signal);
          if (segment.fallback) release();
          return segment;
        } catch (err) {
          if (signal.aborted || attemptNo >= 1) {
            if (!signal.aborted) console.warn(`Segment ${entry.type} failed`, err);
            release();
            return null;
          }
          await delay(this.timings.segmentRetryMs);
        }
      }
    } catch {
      return null;
    }
  }

  private async segmentRequest(entry: ClockEntry, station: StationId): Promise<{ req: SegmentRequest; phoneIds: string[] }> {
    const context = this.context ?? this.fetchContext(station);
    // The first RJ link also waits for the first phone-line poll, so a waiting dedication makes it in
    const phone = entry.type === 'rj_link' ? this.phonePoll?.first : undefined;
    await Promise.race([Promise.all([context, phone]), delay(this.timings.contextWaitMs)]);
    const req: SegmentRequest = {
      station,
      type: entry.type,
      listener: this.listener(),
      upNext: this.following(entry).type,
    };
    if (entry.type === 'news') req.headlines = this.headlines;
    if (entry.type === 'rj_link' && this.weather) req.weather = this.weather;
    if (entry.type === 'rj_link') {
      const producer = producerPlan(this.links, this.lastCatchphrase, this.random);
      this.links += 1;
      this.lastCatchphrase = producer.useCatchphrase;
      req.producer = producer;
      // Only tease the next segment when it is already written, so the tease is true
      const upcoming = this.segments.get(entryKey(this.following(entry)))?.segment;
      const summary = upcoming?.summary?.trim();
      if (upcoming && summary) req.next = { type: upcoming.type, summary: summary.slice(0, SUMMARY_CHARS) };
    }
    const showLog = this.showLog();
    if (showLog.length) req.showLog = showLog;
    const previous = this.aired[this.aired.length - 1];
    if (previous?.mood) req.moodAfterPrevious = previous.mood;
    if (entry.type === 'kahani' && entry.theme) req.theme = entry.theme;
    const phoneCalls = entry.type === 'rj_link' ? this.takePhoneCalls() : [];
    const recent = [...phoneCalls.map(phoneCallLine), ...this.recentCalls.slice(-MAX_RECENT_CALLS)];
    if (recent.length) req.recentCalls = recent.slice(0, MAX_REQUEST_CALLS);
    return { req, phoneIds: phoneCalls.map((c) => c.id) };
  }

  /** Up to two unread studio-line calls, newest first, marked read so each is dedicated on air once. */
  private takePhoneCalls(): PhoneCall[] {
    const calls = (this.state.phone?.calls ?? [])
      .filter((c) => !this.phoneRead.has(c.id))
      .slice(0, MAX_PHONE_CALLS_PER_LINK);
    for (const c of calls) this.phoneRead.add(c.id);
    return calls;
  }

  // ---- studio phone line -------------------------------------------------

  /** Exactly one poller runs while tuned in; pause, idle and error stop it. */
  private syncPhonePoll(): void {
    const on = PHONE_STATUSES.has(this.state.status);
    if (on && !this.phonePoll) this.startPhonePoll();
    else if (!on && this.phonePoll) this.stopPhonePoll();
  }

  private startPhonePoll(): void {
    if (!this.api.getPhoneRecent) return;
    let settleFirst = noop;
    const poll: PhonePoll = {
      abort: new AbortController(),
      timer: null,
      first: new Promise<void>((resolve) => {
        settleFirst = resolve;
      }),
    };
    this.phonePoll = poll;
    const tick = async (): Promise<void> => {
      poll.timer = null;
      try {
        const res = await this.api.getPhoneRecent?.(poll.abort.signal);
        if (this.phonePoll === poll) this.applyPhone(res);
      } catch {
        /* keep the last list; the next poll tries again */
      }
      settleFirst();
      if (this.phonePoll !== poll) return;
      poll.timer = setTimeout(() => void tick(), this.timings.phonePollMs);
    };
    void tick();
  }

  private stopPhonePoll(): void {
    const poll = this.phonePoll;
    if (!poll) return;
    this.phonePoll = null;
    if (poll.timer !== null) clearTimeout(poll.timer);
    poll.abort.abort();
  }

  private applyPhone(res: PhoneRecentResponse | undefined): void {
    const phone = cleanPhone(res);
    if (!phone) return;
    const prev = this.state.phone;
    const same =
      !!prev &&
      prev.number === phone.number &&
      prev.calls.length === phone.calls.length &&
      prev.calls.every((c, i) => c.id === phone.calls[i].id && c.message === phone.calls[i].message);
    if (!same) this.set({ phone });
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
    if (res.intent === 'care') this.set({ helpline: { ...CARE_HELPLINE } });

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
