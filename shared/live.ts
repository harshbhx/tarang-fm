/**
 * "Listen together" contract: one shared show per station, run by a Durable Object.
 * A started station wakes when the first listener joins and sleeps after the last one leaves.
 *
 * Routes (all under /api/live/:station):
 *   GET  /ws               WebSocket upgrade. Client sends LiveClientMessage, server sends LiveServerMessage (JSON text frames).
 *   GET  /audio/:lineId    The line's speech: PCM s16le, 24 kHz, mono (same format as /api/tts). Immutable, cacheable.
 *   GET  /now              JSON LiveSnapshot (debugging and tests).
 *   POST /control          Studio switch. Header `Authorization: Bearer <LIVE_ADMIN_TOKEN>`, body LiveControlRequest,
 *                          reply LiveControlResponse; 401 without the key.
 *
 * Stations are switched OFF by default: listeners can join an off-air station, but nothing is written
 * or voiced until the studio starts it. A started station switches itself off after LIVE_AUTO_OFF_MS.
 */
import type { Line, SegmentType, StationId } from './types';

/** Bytes of PCM per millisecond of audio (24 kHz × 16-bit mono). */
export const LIVE_PCM_BYTES_PER_MS = 48;
/** Keep at least this much audio written and voiced ahead of the on-air clock. */
export const LIVE_BUFFER_AHEAD_MS = 45_000;
/** A started station switches itself off after this long with nobody listening. */
export const LIVE_IDLE_SLEEP_MS = 3 * 60_000;
/** Joins within this window share one welcome line. */
export const LIVE_WELCOME_BATCH_MS = 4_000;
/** A welcome goes on air no sooner than this after the previous one. */
export const LIVE_WELCOME_MIN_GAP_MS = 12_000;
/** Max chars of a listener name. */
export const LIVE_NAME_MAX = 24;
/** Max listeners per station. */
export const LIVE_MAX_LISTENERS = 200;
/** A started station always switches itself off after this long, even if nobody stops it (credit safety). */
export const LIVE_AUTO_OFF_MS = 6 * 60_000;
/** Status note while the studio has the station switched off. */
export const LIVE_OFF_AIR_NOTE = 'off_air';

export type LiveState = 'warming_up' | 'on_air' | 'sleeping';

export interface LiveListener {
  /** Opaque id the server gives each connection */
  id: string;
  /** Cleaned display name as typed (may be Latin script); 'दोस्त'-style default if empty or rejected */
  name: string;
  city?: string;
  /** Server epoch ms */
  joinedAt: number;
}

/** One spoken line placed on the shared timeline. */
export interface LiveLine {
  /** Unique id; also the audio URL key */
  id: string;
  segmentId: string;
  /** Segment type; welcome lines use 'rj_link' with `welcome` set */
  type: SegmentType;
  /** Segment title for the now-playing card */
  title: string;
  line: Line;
  /** Server epoch ms when this line starts on air */
  startAt: number;
  /** Length of the audio (from the PCM byte count) */
  durationMs: number;
  /** Listener ids this line welcomes (live welcome lines only) */
  welcome?: string[];
}

export interface LiveSnapshot {
  station: StationId;
  state: LiveState;
  /** Switched on by the studio (and not yet auto-off) */
  enabled: boolean;
  /** Server epoch ms when a started station switches itself off */
  enabledUntil?: number;
  /** Why the station is sleeping, e.g. LIVE_OFF_AIR_NOTE */
  note?: string;
  /** Server epoch ms */
  now: number;
  listeners: LiveListener[];
  /** Lines not yet finished (end > now), in air order */
  lines: LiveLine[];
}

export type LiveClientMessage =
  | { type: 'join'; name: string }
  | { type: 'ping'; t0: number };

export type LiveServerMessage =
  /** Reply to join: who you are, plus a full snapshot */
  | { type: 'joined'; you: LiveListener; snapshot: LiveSnapshot }
  /** Full replacement of the upcoming timeline (sent when lines are added or re-timed) */
  | { type: 'timeline'; now: number; lines: LiveLine[] }
  | { type: 'presence'; now: number; listeners: LiveListener[] }
  | { type: 'status'; now: number; state: LiveState; note?: string; enabled?: boolean; enabledUntil?: number }
  /** Clock sync: t0 echoes the client's performance-based send time */
  | { type: 'pong'; now: number; t0: number }
  | { type: 'error'; code: string; message: string };

export interface LiveControlRequest {
  action: 'start' | 'stop';
}

export interface LiveControlResponse {
  station: StationId;
  enabled: boolean;
  enabledUntil?: number;
  state: LiveState;
  listeners: number;
}
