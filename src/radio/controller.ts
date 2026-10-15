/** Show scheduler and radio store (docs/TECH-SPEC.md §9). */
import { CALL_MAX_SECONDS, LISTENER_NAME_MAX, PAUSE_AFTER_MS, SHOW_CLOCK_V2 } from '../../shared/constants';
import type { CallMeta, Dedication, SegmentRequest } from '../../shared/schemas';
import { getStation, STATION_BY_ID } from '../../shared/stations';
import type {
  Line,
  LinkState,
  Mood,
  PhoneCall,
  PhoneRecentResponse,
  Segment,
  SegmentType,
  SerialState,
  Source,
  Station,
  StationId,
  Weather,
} from '../../shared/types';
import type { AudioEngine, Recorder } from '../audio/types';
import * as defaultApi from './api';
import { readAhead, type CallSubtitles, type LiveCallResponse } from './api';
import {
  cleanTheme,
  entryKey,
  findAhead,
  firstEntry,
  insertedEntry,
  isSerialPart,
  nextEntry,
  partOf,
  position,
  slotOf,
  type ClockEntry,
} from './clock';
import { cleanListenerName, listenerContext, loadListenerName, loadPhoneHolder, saveListenerName } from './listener';
import { addAiredNews, cleanLinkState, cleanSerial, recapSourceFrom } from './session';
import {
  INITIAL_STATE,
  type Caption,
  type CallState,
  type NowPlaying,
  type PhoneAirStatus,
  type RadioActions,
  type RadioState,
  type RadioStatus,
  type UpNextSlot,
} from './state';

export interface RadioApi {
  getContext: typeof defaultApi.getContext;
  getSegment: typeof defaultApi.getSegment;
  ttsFetch: typeof defaultApi.ttsFetch;
  postCall: typeof defaultApi.postCall;
  /** Optional: without it the studio phone line is not polled */
  getPhoneRecent?: typeof defaultApi.getPhoneRecent;
  /** Optional: reports the studio calls an RJ link has started reading, so no other listener's RJ reads them */
  markPhoneAired?: typeof defaultApi.markPhoneAired;
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
  /** A show nobody touches for this long pauses itself and asks "Still listening?" (0 = never) */
  listenCapMs: number;
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
  phonePollMs: 10_000,
  listenCapMs: 6 * 60_000,
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
  entry: ClockEntry;
  promise: Promise<Segment | null>;
  controller: AbortController;
  /** Whether the script was asked to carry English subtitles */
  subtitles: boolean;
  /** Studio calls this segment holds: taken while it is written, then the ones its script reads */
  claimed: string[];
  /** The request as sent, once built (a rewrite keeps its producer settings and story theme) */
  req?: SegmentRequest;
  /** Set once the request settles */
  segment?: Segment | null;
  /** Written again in its place (subtitles were turned on before it aired); whoever waits gets that one */
  rewrite?: PendingSegment;
}

interface Aired {
  id: string;
  type: SegmentType;
  summary?: string;
  mood?: Mood;
}

/** One loop's Kahani serial, as its parts are written. */
interface SerialRun {
  /** The latest serial state a part returned (part 1 brings the outline and cast) */
  serial?: SerialState;
  /** Each part as written, which is what airs */
  parts: Partial<Record<1 | 2 | 3, Segment>>;
  /** A caller's story theme (part 1 only) */
  theme?: string;
}

/** What this station's show echoes back to the server on every request (clock v2). */
interface ShowState {
  station: StationId;
  /** RJ link rotation state from the last link on air */
  linkState?: LinkState;
  /** Newsroom ids aired this session, never repeated */
  airedNews: string[];
  /** One serial per clock loop */
  serials: Map<number, SerialRun>;
  /** A caller's story theme for the next serial whose part 1 isn't written yet */
  storyTheme?: string;
}

function freshShow(station: StationId): ShowState {
  return { station, airedNews: [], serials: new Map() };
}

export type ShowLog = NonNullable<SegmentRequest['showLog']>;
export type ProducerPlan = NonNullable<SegmentRequest['producer']>;

interface PhonePoll {
  abort: AbortController;
  timer: ReturnType<typeof setTimeout> | null;
  /** Settles once the first poll of this run has finished (ok or not) */
  first: Promise<void>;
  /** Polls now instead of waiting for the timer (no-op while a poll is in flight) */
  now: () => void;
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
/** A studio call this fresh brings the next RJ link forward; older ones wait for the clock's own links. */
const PHONE_JUMP_MS = 15 * 60 * 1000;
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
/** Earlier stories sent with each Kahani request (kept across station switches) */
const MAX_STORY_LOG = 8;
const SUMMARY_CHARS = 200;
/** The RJ greets the listener by name on the first link, then only every eighth (about every 40 minutes). */
const GREET_EVERY = 8;
const CATCHPHRASE_ODDS = 0.3;
const BIT_ODDS = 0.35;
const CARE_HELPLINE = { name: 'Tele-MANAS', number: '14416' } as const;
const MISSES_BEFORE_BACKOFF = 3;
/**
 * How many slots ahead a serial's part 1 (outline included, 34–62 s to write) is requested: from the opener at
 * tune-in, and from the loop's last link after that, which leaves about two minutes of air before its handover.
 */
const SERIAL_LEAD = 4;
/** How far ahead the clock is searched for a serial part (two loops) */
const SERIAL_SEARCH = SHOW_CLOCK_V2.length * 2;

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

/** A studio call as the RJ link request carries it (the script reads it on air). */
export function toDedication(call: PhoneCall): Dedication {
  const d: Dedication = { id: call.id, type: call.type, message: call.message.trim().slice(0, 220) };
  const name = call.name?.trim().slice(0, 40);
  const city = call.city?.trim().slice(0, 60);
  const theme = call.theme?.trim().slice(0, 120);
  if (name) d.name = name;
  if (city) d.city = city;
  if (theme) d.theme = theme;
  return d;
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
  /** An extra segment to play after the entry with key `after` */
  private plannedNext: { after: string; entry: ClockEntry } | null = null;
  private show: ShowState = freshShow(INITIAL_STATE.stationId);
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
  /**
   * Studio-line calls handed to an RJ link this session: 'writing' while the link is requested, then the
   * on-air status. A call is read on air once; one whose link never airs goes back in the queue.
   */
  private readonly phoneTaken = new Map<string, 'writing' | PhoneAirStatus>();
  /** This tab's id on the studio line; the calls its RJ links read are claimed in this name */
  private readonly phoneHolder = loadPhoneHolder();
  /** Calls an RJ link was already brought forward (or rewritten) for, so each call moves the queue once */
  private readonly phoneJumped = new Set<string>();
  /** Summaries of the Kahanis aired this session, oldest first, so each new story is different */
  private storyLog: string[] = [];

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

  // ---- listening cap -----------------------------------------------------

  private capTimer: ReturnType<typeof setTimeout> | undefined;
  /** The cap was reached mid-segment: the show pauses when the segment on air ends */
  private capPending = false;

  /** The listener did something: restart the cap clock and clear a "Still listening?" prompt. */
  private touch(): void {
    if (this.capTimer) clearTimeout(this.capTimer);
    this.capTimer = this.timings.listenCapMs > 0 ? setTimeout(() => this.capReached(), this.timings.listenCapMs) : undefined;
    this.capPending = false;
    if (this.state.capped) this.set({ capped: false });
  }

  /**
   * Pauses a show nobody has touched for listenCapMs, so a forgotten tab stops writing and voicing new segments.
   * It pauses at a segment boundary (never mid-part), so resuming carries on with the next segment.
   */
  private capReached(): void {
    this.capTimer = undefined;
    const status = this.state.status;
    if (CALL_STATUSES.has(status)) {
      // Never cut a caller off: check again after the call
      this.touch();
      return;
    }
    if (status !== 'playing' && status !== 'tuning') return;
    if (this.cursor?.segment) this.capPending = true;
    else this.capPause();
  }

  private capPause(): void {
    this.capPending = false;
    this.pause();
    this.set({ capped: true });
  }

  // ---- actions -----------------------------------------------------------

  tuneIn = async (): Promise<void> => {
    const status = this.state.status;
    this.touch();
    if (status === 'paused') {
      this.resume();
      return;
    }
    if (status !== 'idle' && status !== 'error') return;
    this.unlocking = this.unlockEngine();
    const gen = this.interrupt();
    this.resetStationScope();
    if (this.show.station !== this.state.stationId) this.show = freshShow(this.state.stationId);
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
    this.touch();
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
    if (status !== 'idle' && status !== 'error') this.touch();
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
    this.show = freshShow(id);
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
    this.touch();
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
    let res: LiveCallResponse;
    try {
      const meta: CallMeta = {
        station: station.id,
        listener: this.listener(),
        nowPlaying: this.state.segment?.title.slice(0, NOW_PLAYING_CHARS) || undefined,
        subtitles: this.state.showSubtitles,
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
    const on = !this.state.showSubtitles;
    this.set({ showSubtitles: on, subtitlesSoon: on });
    // Scripts only carry subtitles when asked: the ones written without them are written again
    if (on) this.rewriteForSubtitles();
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
    // What the producer heard beats the writer's own summary
    const summary = segment.heardSummary?.trim() || segment.summary?.trim();
    const linkState = segment.type === 'rj_link' ? cleanLinkState(segment.linkState) : undefined;
    if (linkState) this.show.linkState = linkState;
    if (segment.type === 'news') this.show.airedNews = addAiredNews(this.show.airedNews, segment.newsIds);
    if (segment.type === 'kahani' && !segment.fallback && summary) {
      this.storyLog = [...this.storyLog, summary.slice(0, SUMMARY_CHARS)].slice(-MAX_STORY_LOG);
    }
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
    this.releaseCalls([...this.phoneTaken].filter(([, s]) => s !== 'aired').map(([id]) => id));
    this.phoneJumped.clear();
    this.plannedNext = null;
    // The clock starts again from the top, with a new serial
    this.show.serials.clear();
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
    // The serial's part 1 (with its outline) is written alongside the opener
    this.planSerial(station.id);
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
    if (planned && planned.after === entryKey(entry)) return planned.entry;
    return nextEntry(entry);
  }

  private advance(entry: ClockEntry): ClockEntry {
    const next = this.following(entry);
    if (this.plannedNext?.after === entryKey(entry)) this.plannedNext = null;
    return next;
  }

  /** The next slot for the programme strip, with the one after it. */
  private upNextSlot(next: ClockEntry): UpNextSlot {
    return { ...slotOf(next), later: slotOf(this.following(next)) };
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
          if (this.capPending) {
            // "Still listening?" waits for a segment boundary: resuming starts this entry
            this.capPause();
            return;
          }
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
          if (entry.inserted && entry.type === 'rj_link' && !loaded.dedicated?.length) {
            // Slotted in for a studio call that another listener's RJ got to first: the clock just carries on
            entry = this.advance(entry);
            continue;
          }
          segment = loaded;
          lineIndex = 0;
        }
        if (lineIndex < segment.lines.length) {
          await this.playSegment(gen, station, entry, segment, lineIndex, !resumed);
          if (gen !== this.gen) return;
        }
        // Also reached when a call-in ended on the link's last line and the show resumes past it
        this.markCalls(segment.dedicated ?? [], 'aired');
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
    this.pruneSegments(entry, [entry, following]);
    this.prefetchSegment(following, station.id);
    this.planSerial(station.id, entry);
    this.set({ segment: toNowPlaying(segment), lineIndex: startLine, upNext: this.upNextSlot(following) });
    this.airCalls(segment);
    this.jumpQueue(entry, segment.lines.length - startLine);

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
    if (this.state.subtitlesSoon && segment.lines[index].en) patch.subtitlesSoon = false;
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
    return this.settled(this.requestSegment(entry, station));
  }

  /** The segment for `entry`: already requested, or requested now. `carry` is the request a rewrite replaces. */
  private requestSegment(entry: ClockEntry, station: StationId, carry?: SegmentRequest): PendingSegment {
    const key = entryKey(entry);
    const hit = this.segments.get(key);
    if (hit) return hit;
    const ticket: Omit<PendingSegment, 'promise'> = {
      entry,
      controller: linkedController(this.stationAbort.signal),
      subtitles: this.state.showSubtitles,
      claimed: [],
    };
    const pending: PendingSegment = Object.assign(ticket, { promise: this.fetchSegment(ticket, station, carry) });
    void pending.promise.then((segment) => {
      pending.segment = segment;
      const current = this.segments.get(key) === pending && !pending.controller.signal.aborted;
      if (segment && current && isSerialPart(pending.entry)) this.partWritten(pending.entry, segment, station);
    });
    this.segments.set(key, pending);
    return pending;
  }

  private serialRun(loop: number): SerialRun {
    let run = this.show.serials.get(loop);
    if (!run) {
      run = { parts: {} };
      this.show.serials.set(loop, run);
    }
    return run;
  }

  /** A serial part was written: it is what airs, its serial is the latest, and the next part starts now. */
  private partWritten(entry: ClockEntry & { part: 1 | 2 | 3 }, segment: Segment, station: StationId): void {
    const run = this.serialRun(entry.loop);
    run.parts[entry.part] = segment;
    const serial = cleanSerial(segment.serial);
    if (serial) run.serial = serial;
    this.planSerial(station);
  }

  /** Where serial part `part` of loop `loop` is on the clock from `from`, if still ahead (or on air). */
  private partAhead(from: ClockEntry, loop: number, part: 1 | 2 | 3) {
    return findAhead(from, (e) => e.loop === loop && isSerialPart(e) && e.part === part, SERIAL_SEARCH);
  }

  /**
   * Writes the serial ahead of the clock: part 1 (with its outline) SERIAL_LEAD slots before it airs, which at
   * tune-in is alongside the opener, and part n+1 as soon as part n is written (it only needs part n's lines).
   * Nothing new is written while the show is paused.
   */
  private planSerial(station: StationId, at = this.cursor?.entry): void {
    if (!at || !PHONE_STATUSES.has(this.state.status)) return;
    // The station ID is voiced from the station's own copy, at once: plan from the opener
    const from = at.type === 'station_id' ? nextEntry(at) : at;
    for (const loop of [from.loop, from.loop + 1]) {
      for (const part of [1, 2, 3] as const) {
        const ahead = this.partAhead(from, loop, part);
        if (!ahead || this.segments.has(entryKey(ahead.entry))) continue;
        const due = part === 1 ? ahead.steps <= SERIAL_LEAD : !!this.show.serials.get(loop)?.parts[(part - 1) as 1 | 2];
        if (due) this.requestSegment(ahead.entry, station);
      }
    }
  }

  /** The request for a serial part, already made or made now; one that failed is asked for again. */
  private requestPart(loop: number, part: 1 | 2 | 3, station: StationId): PendingSegment | null {
    const at = this.cursor?.entry ?? this.resumeAt?.entry;
    const ahead = at && this.partAhead(at, loop, part);
    if (!ahead) return null;
    const key = entryKey(ahead.entry);
    const hit = this.segments.get(key);
    if (hit && hit.segment === null && !hit.rewrite) this.segments.delete(key);
    return this.requestSegment(ahead.entry, station);
  }

  /**
   * A caller asked for a story: it seeds the next serial. If a serial's part 1 is still being written, that
   * serial is the caller's: part 1 is written again on their theme.
   */
  private seedStory(theme: string | undefined): void {
    const clean = cleanTheme(theme);
    if (!clean) return;
    const station = this.state.stationId;
    for (const [key, pending] of this.segments) {
      const { entry } = pending;
      if (!isSerialPart(entry) || entry.part !== 1 || pending.segment !== undefined || pending.rewrite) continue;
      this.serialRun(entry.loop).theme = clean;
      pending.controller.abort();
      this.segments.delete(key);
      pending.rewrite = this.requestSegment(entry, station, pending.req);
      return;
    }
    this.show.storyTheme = clean;
  }

  /** A segment once written; one that was written again in the meantime hands over to its rewrite. */
  private async settled(pending: PendingSegment): Promise<Segment | null> {
    const segment = await pending.promise;
    return pending.rewrite ? this.settled(pending.rewrite) : segment;
  }

  /**
   * Subtitles were turned on: every segment written without them that hasn't started yet is written again
   * with them, so they start with the next segment. The line on air (and the rest of its segment) plays on.
   */
  private rewriteForSubtitles(): void {
    const at = this.resumeAt ?? this.cursor;
    if (!at) return;
    // Paused (or stopped): just drop them, and the show asks for fresh ones when it plays on
    const rewrite = PHONE_STATUSES.has(this.state.status);
    const station = this.state.stationId;
    const here = position(at.entry);
    /** Loops whose earliest upcoming serial part is written again: their later parts follow it, written afresh */
    const rewritten = new Set<number>();
    const upcoming = [...this.segments]
      .filter(([, pending]) => {
        const { entry } = pending;
        // Station IDs are voiced from the station's own copy; a failed request has nothing to rewrite
        if (pending.subtitles || entry.type === 'station_id' || pending.segment === null) return false;
        const pos = position(entry);
        return pos > here || (pos === here && !at.segment);
      })
      .sort(([, a], [, b]) => position(a.entry) - position(b.entry));
    for (const [key, pending] of upcoming) {
      const { entry } = pending;
      pending.controller.abort();
      this.segments.delete(key);
      // Its studio calls go back in the queue, and the rewrite (an RJ link) takes them again
      const held = pending.segment
        ? (pending.segment.dedicated ?? []).filter((id) => this.phoneTaken.get(id) === 'up_next')
        : pending.claimed.splice(0);
      this.releaseCalls(held);
      if (isSerialPart(entry)) {
        const run = this.show.serials.get(entry.loop);
        if (rewritten.has(entry.loop) || !rewrite) {
          // Written again once the part before it is
          if (run) delete run.parts[entry.part];
          continue;
        }
        rewritten.add(entry.loop);
      }
      if (rewrite) pending.rewrite = this.requestSegment(entry, station, pending.req);
    }
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

  /** Drops the requests the show no longer needs: all but `keep`, and the serial parts still ahead of `current`. */
  private pruneSegments(current: ClockEntry, keep: ClockEntry[]): void {
    const keys = new Set(keep.map(entryKey));
    const here = position(current);
    for (const [key, pending] of this.segments) {
      if (keys.has(key)) continue;
      if (isSerialPart(pending.entry) && position(pending.entry) > here) continue;
      pending.controller.abort();
      this.segments.delete(key);
      const ids = (pending.segment?.dedicated ?? []).filter((id) => this.phoneTaken.get(id) === 'up_next');
      this.releaseCalls(ids);
    }
  }

  private async fetchSegment(
    pending: Omit<PendingSegment, 'promise'>,
    station: StationId,
    carry?: SegmentRequest,
  ): Promise<Segment | null> {
    const { entry, claimed } = pending;
    const signal = pending.controller.signal;
    try {
      if (entry.type === 'station_id') {
        this.localSegments += 1;
        return stationIdSegment(getStation(station), this.localSegments);
      }
      const built = await this.segmentRequest(entry, station, pending.subtitles, signal, carry);
      if (!built) return null;
      const { req, phoneIds } = built;
      pending.req = req;
      claimed.push(...phoneIds);
      // A studio call that never makes it into a script (failed, aborted or template segment) goes back in the
      // queue; a segment dropped for a rewrite has already handed its calls back, so this releases nothing then
      const release = () => this.releaseCalls(claimed.splice(0));
      for (let attemptNo = 0; ; attemptNo++) {
        if (signal.aborted) {
          release();
          return null;
        }
        try {
          const segment = await this.api.getSegment(req, signal);
          if (signal.aborted) {
            release();
            return null;
          }
          const read = new Set(segment.fallback ? [] : (segment.dedicated ?? []));
          const kept = claimed.filter((id) => read.has(id));
          this.releaseCalls(claimed.filter((id) => !read.has(id)));
          claimed.splice(0, claimed.length, ...kept);
          this.markCalls(kept, 'up_next');
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

  /**
   * The /api/segment request for `entry`, or null when it was dropped while waiting for the context (then it
   * takes no link number, story theme or studio call). `carry` is the request a subtitle rewrite replaces.
   */
  private async segmentRequest(
    entry: ClockEntry,
    station: StationId,
    subtitles: boolean,
    signal: AbortSignal,
    carry?: SegmentRequest,
  ): Promise<{ req: SegmentRequest; phoneIds: string[] } | null> {
    const context = this.context ?? this.fetchContext(station);
    // The first RJ link also waits for the first phone-line poll, so a waiting dedication makes it in
    const phone = entry.type === 'rj_link' ? this.phonePoll?.first : undefined;
    await Promise.race([Promise.all([context, phone]), delay(this.timings.contextWaitMs)]);
    if (signal.aborted) return null;
    const part = partOf(entry);
    if (entry.mode === 'kahani_in' && part) {
      // The tease must be true: the handover is written once its part is (a part that failed is asked for again)
      const pending = this.requestPart(entry.loop, part, station);
      const written = pending ? await this.settled(pending) : null;
      if (signal.aborted || !written) return null;
    }
    if (isSerialPart(entry) && entry.part > 1) {
      // The part before it is being written again (subtitles): this one recaps what that one says
      const before = [...this.segments.values()].find(
        (p) => isSerialPart(p.entry) && p.entry.loop === entry.loop && p.entry.part === entry.part - 1,
      );
      if (before && before.segment === undefined) await this.settled(before);
      if (signal.aborted) return null;
    }
    const run = part ? this.serialRun(entry.loop) : undefined;
    const req: SegmentRequest = {
      station,
      type: entry.type,
      listener: this.listener(),
      upNext: this.following(entry).type,
      subtitles,
    };
    if (entry.mode) req.mode = entry.mode;
    if (entry.type === 'news') {
      req.headlines = this.headlines;
      if (this.show.airedNews.length) req.airedNews = [...this.show.airedNews];
    }
    if (entry.type === 'rj_link') {
      const linkState = carry?.linkState ?? this.show.linkState;
      if (linkState) req.linkState = linkState;
      if (run && part) {
        // A handover carries the serial as its part left it; one after a part that never aired is a plain link
        const serial = cleanSerial(run.parts[part]?.serial);
        if (entry.mode === 'kahani_out' && !run.parts[part]) req.mode = 'payload';
        else if (serial) req.serial = serial;
      }
    }
    if (run && isSerialPart(entry)) {
      req.part = entry.part;
      const prev = entry.part > 1 ? run.parts[(entry.part - 1) as 1 | 2] : undefined;
      const prevSerial = cleanSerial(prev?.serial);
      // Part 1 starts a serial (a rewrite keeps the outline it was written from); later parts continue the latest
      const serial = entry.part === 1 ? (carry ? cleanSerial(run.parts[1]?.serial) : undefined) : (prevSerial ?? run.serial);
      if (serial) req.serial = serial;
      if (prev && prevSerial) req.recapSource = recapSourceFrom({ ...prev, serial: prevSerial });
      if (!serial) {
        // A new story (or a server without serials): it differs from the night's earlier ones, on a caller's theme
        if (this.storyLog.length) req.recentStories = this.storyLog.slice(-MAX_STORY_LOG);
        let theme = (entry.part === 1 ? run.theme : undefined) ?? carry?.theme;
        if (!theme && !carry && this.show.storyTheme) {
          theme = this.show.storyTheme;
          this.show.storyTheme = undefined;
          if (entry.part === 1) run.theme = theme;
        }
        if (theme) req.theme = theme;
      }
    }
    if (entry.type === 'rj_link' && this.weather) req.weather = this.weather;
    if (entry.type === 'rj_link') {
      // A rewrite is the same link: it keeps its place in the producer's rotation (the first link still greets)
      let producer = carry?.producer;
      if (!producer) {
        producer = producerPlan(this.links, this.lastCatchphrase, this.random);
        this.links += 1;
        this.lastCatchphrase = producer.useCatchphrase;
      }
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
    const recent = this.recentCalls.slice(-MAX_RECENT_CALLS);
    if (recent.length) req.recentCalls = recent.slice(0, MAX_REQUEST_CALLS);
    const phoneCalls = entry.type === 'rj_link' ? this.takePhoneCalls() : [];
    if (phoneCalls.length) {
      req.dedications = phoneCalls.map(toDedication);
      req.holder = this.phoneHolder;
    }
    return { req, phoneIds: phoneCalls.map((c) => c.id) };
  }

  /** Studio-line calls no RJ has read (here or for any other listener), newest first. */
  private waitingCalls(): PhoneCall[] {
    return (this.state.phone?.calls ?? []).filter((c) => !c.airedAt && !this.phoneTaken.has(c.id));
  }

  /** Up to two waiting studio-line calls, oldest first, taken so each is read on air once. */
  private takePhoneCalls(): PhoneCall[] {
    const calls = this.waitingCalls().slice(-MAX_PHONE_CALLS_PER_LINK).reverse();
    for (const c of calls) this.phoneTaken.set(c.id, 'writing');
    return calls;
  }

  /** Puts calls whose RJ link never aired back in the queue. */
  private releaseCalls(ids: string[]): void {
    let changed = false;
    for (const id of ids) {
      const status = this.phoneTaken.get(id);
      if (!status || status === 'aired') continue;
      this.phoneTaken.delete(id);
      changed = true;
    }
    if (changed) this.publishPhoneStatus();
  }

  private markCalls(ids: string[], status: PhoneAirStatus): void {
    if (!ids.length) return;
    for (const id of ids) if (this.phoneTaken.get(id) !== 'aired') this.phoneTaken.set(id, status);
    this.publishPhoneStatus();
  }

  private publishPhoneStatus(): void {
    const phoneStatus: Record<string, PhoneAirStatus> = {};
    for (const [id, status] of this.phoneTaken) phoneStatus[id] = status === 'writing' ? 'up_next' : status;
    this.set({ phoneStatus });
  }

  /**
   * As an RJ link with studio calls starts: those calls are on air (and marked aired in the shared table, so
   * no listener's RJ reads them again), and a caller's story theme is queued.
   */
  private airCalls(segment: Segment): void {
    const ids = segment.dedicated ?? [];
    if (!ids.length) return;
    const fresh = ids.filter((id) => this.phoneTaken.get(id) !== 'on_air' && this.phoneTaken.get(id) !== 'aired');
    this.markCalls(ids, 'on_air');
    if (fresh.length) {
      void this.api.markPhoneAired?.({ station: segment.station, holder: this.phoneHolder, ids: fresh }).catch(noop);
    }
    const story = (this.state.phone?.calls ?? []).find((c) => ids.includes(c.id) && c.type === 'story_request' && c.theme?.trim());
    if (story) this.seedStory(story.theme);
  }

  /**
   * A fresh studio call doesn't wait for the clock's next RJ link: one is slotted in after the current
   * segment (or the upcoming link is rewritten to include it), so the caller hears it within minutes.
   * `linesLeft` is how much of the current segment remains; with less than two lines there's no time to
   * write a link, and the next segment start looks again.
   */
  private jumpQueue(current: ClockEntry, linesLeft: number): void {
    const status = this.state.status;
    if ((status !== 'playing' && status !== 'tuning') || this.plannedNext || current.type === 'rj_link') return;
    if (linesLeft < 2 || [...this.phoneTaken.values()].includes('writing')) return;
    const cutoff = Date.now() - PHONE_JUMP_MS;
    const fresh = this.waitingCalls().filter((c) => !this.phoneJumped.has(c.id) && Date.parse(c.at) >= cutoff);
    if (!fresh.length) return;
    for (const c of fresh) this.phoneJumped.add(c.id);

    const station = this.state.stationId;
    const following = this.following(current);
    const key = entryKey(following);
    const pending = this.segments.get(key);
    if (following.type === 'rj_link') {
      // The next link is already written: write it again with the new call(s) in it, unless it's full
      if ((pending?.segment?.dedicated?.length ?? 0) >= MAX_PHONE_CALLS_PER_LINK) return;
      if (pending) {
        pending.controller.abort();
        this.segments.delete(key);
        this.releaseCalls(pending.segment?.dedicated ?? []);
      }
      this.prefetchSegment(following, station);
      return;
    }
    // Slot a link in; the segment already written for the next slot moves along one place, unwasted
    const inserted = insertedEntry(current, 'rj_link', 'payload');
    if (pending) {
      this.segments.delete(key);
      pending.entry = nextEntry(inserted);
      this.segments.set(entryKey(pending.entry), pending);
    }
    this.plannedNext = { after: entryKey(current), entry: inserted };
    this.prefetchSegment(inserted, station);
    this.set({ upNext: this.upNextSlot(inserted) });
  }

  /**
   * Calls another listener's RJ has read since this tab wrote them into an upcoming link (only possible once
   * this tab's claim ran out, e.g. after a long pause): that link is written again without them.
   */
  private dropStaleLinks(ids: string[]): void {
    const live = new Set([this.cursor?.segment, this.resumeAt?.segment]);
    let dropped: ClockEntry | null = null;
    for (const [key, pending] of this.segments) {
      const segment = pending.segment;
      if (!segment || live.has(segment) || !segment.dedicated?.some((id) => ids.includes(id))) continue;
      pending.controller.abort();
      this.segments.delete(key);
      this.releaseCalls(segment.dedicated.filter((id) => !ids.includes(id)));
      dropped = this.cursor ? this.following(this.cursor.entry) : null;
    }
    if (dropped && this.state.status === 'playing') this.prefetchSegment(dropped, this.state.stationId);
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
    let inFlight = false;
    const poll: PhonePoll = {
      abort: new AbortController(),
      timer: null,
      first: new Promise<void>((resolve) => {
        settleFirst = resolve;
      }),
      now: () => {
        if (inFlight || this.phonePoll !== poll) return;
        if (poll.timer !== null) clearTimeout(poll.timer);
        void tick();
      },
    };
    this.phonePoll = poll;
    const tick = async (): Promise<void> => {
      poll.timer = null;
      inFlight = true;
      try {
        const res = await this.api.getPhoneRecent?.(poll.abort.signal);
        if (this.phonePoll === poll) this.applyPhone(res);
      } catch {
        /* keep the last list; the next poll tries again */
      }
      inFlight = false;
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
      prev.calls.every((c, i) => {
        const next = phone.calls[i];
        return c.id === next.id && c.message === next.message && c.airedAt === next.airedAt;
      });
    if (!same) this.set({ phone });

    // Calls any listener's RJ has read are done here too: never taken again, shown as aired
    const airedElsewhere: string[] = [];
    let changed = false;
    for (const c of phone.calls) {
      if (!c.airedAt) continue;
      const status = this.phoneTaken.get(c.id);
      if (status === 'on_air' || status === 'aired') continue;
      if (status === 'up_next') airedElsewhere.push(c.id);
      this.phoneTaken.set(c.id, 'aired');
      changed = true;
    }
    if (changed) this.publishPhoneStatus();
    if (airedElsewhere.length) this.dropStaleLinks(airedElsewhere);

    const c = this.cursor;
    if (c?.segment) this.jumpQueue(c.entry, c.segment.lines.length - c.lineIndex);
  }

  /** Checks the studio line right away (the tab came back into view); the regular poll carries on after. */
  refreshPhone = (): void => {
    this.phonePoll?.now();
  };

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

  private async putOnAir(gen: number, station: Station, res: LiveCallResponse, signal: AbortSignal): Promise<void> {
    if (!res || typeof res !== 'object') throw new Error('Malformed call response');
    const transcript = typeof res.transcript === 'string' ? res.transcript.trim() : '';
    if (transcript) {
      this.recentCalls = [...this.recentCalls, transcript.slice(0, RECENT_CALL_CHARS)].slice(-MAX_RECENT_CALLS);
    }
    if (res.intent === 'story_request') this.seedStory(res.theme || transcript);
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
    // Streamed calls send subtitles after the reply; they're filled in wherever the call is still on screen.
    void res.subtitles?.then((subs) => {
      if (gen === this.gen) this.applyCallSubtitles(subs, transcript, reply);
    });
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

  /** Adds late-arriving English subtitles to the call panel and to the caller's and RJ's captions. */
  private applyCallSubtitles(subs: CallSubtitles, transcript: string, reply: Line | null): void {
    if (!subs.transcriptEn && !subs.replyEn) return;
    const fill = (c: Caption): Caption => {
      if (c.en) return c;
      if (subs.transcriptEn && c.role === 'caller' && c.text === transcript) return { ...c, en: subs.transcriptEn };
      if (subs.replyEn && reply && c.role !== 'caller' && c.text === reply.text) return { ...c, en: subs.replyEn };
      return c;
    };
    const patch: Partial<RadioState> = { history: this.state.history.map(fill) };
    if (this.state.caption) patch.caption = fill(this.state.caption);
    const call = this.state.call;
    if (call && call.transcript === transcript) {
      patch.call = {
        ...call,
        transcriptEn: call.transcriptEn ?? subs.transcriptEn,
        replyEn: call.replyEn ?? subs.replyEn,
      };
    }
    this.set(patch);
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
