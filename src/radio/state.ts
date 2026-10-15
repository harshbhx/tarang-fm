/** Radio UI state contract (docs/TECH-SPEC.md §9). Produced by src/radio, rendered by src/components. */
import type { ClockSlot, PhoneCall, Role, SegmentType, Source, StationId } from '../../shared/types';

export type RadioStatus =
  | 'idle'
  | 'tuning'
  | 'playing'
  | 'paused'
  | 'call_recording'
  | 'call_thinking'
  | 'call_on_air'
  | 'error';

export interface Caption {
  role: Role | 'caller';
  /** V4 speaker ID ('' for the caller) */
  speaker: string;
  /** e.g. 'Sunny · reels', or the caller's name */
  label: string;
  text: string;
  /** English subtitle */
  en?: string;
}

export interface NowPlaying {
  id: string;
  type: SegmentType;
  title: string;
  sources?: Source[];
  fallback?: boolean;
}

export interface CallState {
  transcript?: string;
  transcriptEn?: string;
  reply?: string;
  replyEn?: string;
  error?: string;
}

/** The next slot on the show clock (its bulletin kind or serial part), and the one after it when known. */
export interface UpNextSlot extends ClockSlot {
  later?: ClockSlot;
}

/** Where a studio phone call is on its way to air: written into the next RJ link, being read, or read. */
export type PhoneAirStatus = 'up_next' | 'on_air' | 'aired';

export interface RadioState {
  status: RadioStatus;
  stationId: StationId;
  listener: { name?: string; city?: string };
  segment?: NowPlaying;
  lineIndex: number;
  /** Line currently being spoken */
  caption?: Caption;
  /** Recent captions, newest last (max 6) */
  history: Caption[];
  call?: CallState;
  /** English subtitles (off until the listener turns them on; scripts only carry them when asked) */
  showSubtitles: boolean;
  /**
   * Subtitles were just turned on and no line with one has aired since: the segment on air was written
   * without them, so the captions say they start with the next segment
   */
  subtitlesSoon?: boolean;
  /** TTFA of the most recent line */
  ttfaMs?: number;
  /** What plays next: a slot of the show clock, or just its type (mock states) */
  upNext?: SegmentType | UpNextSlot;
  error?: string;
  /** The studio phone line: its number and recent on-air calls, newest first (polled while tuned in) */
  phone?: { number: string; calls: PhoneCall[] };
  /** Per studio call id: how far it got on this listener's show (absent = waiting for the next RJ link) */
  phoneStatus: Record<string, PhoneAirStatus>;
  /** Support line shown after a call that sounded like distress; cleared on a new call or station */
  helpline?: { name: string; number: string };
  /** True when the listening cap paused a show nobody touched for a while ("Still listening?") */
  capped?: boolean;
}

export interface RadioActions {
  tuneIn(): Promise<void>;
  pause(): void;
  resume(): void;
  setStation(id: StationId): void;
  /** Push-to-talk press */
  startCall(): Promise<void>;
  /** Push-to-talk release: send the recording */
  endCall(): Promise<void>;
  cancelCall(): void;
  setListenerName(name: string): void;
  toggleSubtitles(): void;
  /** 0..1 mic level while recording (poll from requestAnimationFrame) */
  getMicLevel(): number;
  /** For visualizers; null until tuned in */
  getAnalyser(): AnalyserNode | null;
}

export const INITIAL_STATE: RadioState = {
  status: 'idle',
  stationId: 'hi',
  listener: {},
  lineIndex: 0,
  history: [],
  showSubtitles: false,
  phoneStatus: {},
};
