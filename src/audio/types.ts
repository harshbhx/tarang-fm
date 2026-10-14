/** Audio engine contract (docs/TECH-SPEC.md §7). Implemented in src/audio/index.ts. */

export interface PlayResult {
  /** fetch start → first scheduled sample */
  ttfaMs: number;
  durationMs: number;
}

export interface AudioEngine {
  /** Create/resume the AudioContext. Must be called inside a user gesture (Tune in click). */
  unlock(): Promise<void>;
  /**
   * Play a streamed /api/tts response (raw 16-bit LE mono PCM at 24 kHz, or WAV).
   * Resolves when playback ends, or early (without throwing) if stopVoice() interrupts it.
   */
  playStream(res: Response, opts?: { onStart?: () => void; fetchStartedAt?: number }): Promise<PlayResult>;
  /** Fade out and cancel any playing voice (barge-in, station switch, pause). */
  stopVoice(fadeMs?: number): void;
  /** Wait without sound (pauseAfterMs between lines). */
  silence(ms: number): Promise<void>;
  music: {
    start(accent?: string): void;
    stop(fadeMs?: number): void;
  };
  sfx: {
    sting(): Promise<void>;
    callTone(): Promise<void>;
    tuneStatic(ms: number): Promise<void>;
  };
  /** Master analyser for visualizers (null until unlocked). */
  readonly analyser: AnalyserNode | null;
}

export interface Recorder {
  /** Asks for mic permission on first use. */
  start(): Promise<void>;
  /** Stops (auto-stops at CALL_MAX_SECONDS) and returns the recording. */
  stop(): Promise<Blob>;
  /** Discard an in-progress recording. */
  cancel(): void;
  /** 0..1 RMS level for the meter */
  level(): number;
  readonly recording: boolean;
}
