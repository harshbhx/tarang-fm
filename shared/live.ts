/**
 * "Listen together" contract: one shared show per station, run by a Durable Object.
 * A station starts by itself when a listener joins and switches off a minute after the last one leaves.
 *
 * Routes (all under /api/live/:station):
 *   GET  /ws               WebSocket upgrade. Client sends LiveClientMessage, server sends LiveServerMessage (JSON text frames).
 *   GET  /audio/:lineId    The line's speech: PCM s16le, 24 kHz, mono (same format as /api/tts). Immutable, cacheable.
 *   GET  /now              JSON LiveSnapshot (debugging and tests).
 *   POST /control          Studio switch. Header `Authorization: Bearer <LIVE_ADMIN_TOKEN>`, body LiveControlRequest,
 *                          reply LiveControlResponse; 401 without the key.
 *
 * No switch is needed: a join wakes a sleeping station (first sound within seconds) and it switches itself
 * off after LIVE_IDLE_SLEEP_MS with nobody listening. Each show still ends after LIVE_AUTO_OFF_MS, for
 * everyone, with LIVE_ENDED_NOTE; a listener's { type: 'restart' } ("Tune in again") starts a fresh one,
 * at most once per LIVE_RESTART_GAP_MS. Joins and reconnects never restart an ended show while its listeners
 * are still there (a minute after the last one left, a join starts a fresh one again).
 * The studio's Stop is a kill switch: the station stays off air (LIVE_OFF_AIR_NOTE) and never starts by
 * itself until the studio presses Start again.
 */
import type { Line, SegmentType, StationId } from './types';

/** Bytes of PCM per millisecond of audio (24 kHz × 16-bit mono). */
export const LIVE_PCM_BYTES_PER_MS = 48;
/** Keep at least this much audio written and voiced ahead of the on-air clock. */
export const LIVE_BUFFER_AHEAD_MS = 45_000;
/** A station switches itself off after this long with nobody listening. */
export const LIVE_IDLE_SLEEP_MS = 60_000;
/** Joins within this window share one welcome line. */
export const LIVE_WELCOME_BATCH_MS = 4_000;
/** A welcome goes on air no sooner than this after the previous one. */
export const LIVE_WELCOME_MIN_GAP_MS = 12_000;
/** Max chars of a listener name. */
export const LIVE_NAME_MAX = 24;
/** Max listeners per station. */
export const LIVE_MAX_LISTENERS = 200;
/** Every show ends after this long, even with listeners (credit safety); "Tune in again" starts a fresh one. */
export const LIVE_AUTO_OFF_MS = 6 * 60_000;
/** A restart ("Tune in again") starts a fresh show at most once per this long, per station. */
export const LIVE_RESTART_GAP_MS = 30_000;
/** Status note while the studio has the station switched off (no auto-start until it presses Start). */
export const LIVE_OFF_AIR_NOTE = 'off_air';
/** Status note after a show reached LIVE_AUTO_OFF_MS; a 'restart' message starts a fresh show. */
export const LIVE_ENDED_NOTE = 'show_ended';

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
  /** Starts by itself when someone joins; false while the studio has it stopped (off air) */
  enabled: boolean;
  /** Server epoch ms when the show on air ends (its LIVE_AUTO_OFF_MS limit); only while awake */
  enabledUntil?: number;
  /** Why the station is sleeping, e.g. LIVE_OFF_AIR_NOTE or LIVE_ENDED_NOTE */
  note?: string;
  /** Server epoch ms */
  now: number;
  listeners: LiveListener[];
  /** Lines not yet finished (end > now), in air order */
  lines: LiveLine[];
}

export type LiveClientMessage =
  | { type: 'join'; name: string }
  /** "Tune in again" after LIVE_ENDED_NOTE: starts a fresh show (at most once per LIVE_RESTART_GAP_MS) */
  | { type: 'restart' }
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

/** start: auto-start on again (and wakes the show for anyone waiting); stop: off air, no auto-start until start. */
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
