/** Client-side view of "Listen together" (shared by the live controller and the live UI). */
import type { LiveLine, LiveListener, LiveState } from '../../shared/live';
import type { StationId } from '../../shared/types';

export type LiveStatus =
  /** Name not entered yet */
  | 'idle'
  | 'connecting'
  /** Connected; the station is writing its first segment */
  | LiveState
  | 'reconnecting'
  | 'error';

export interface LiveViewState {
  station: StationId;
  status: LiveStatus;
  you?: LiveListener;
  listeners: LiveListener[];
  /** The line playing right now, if any */
  current?: LiveLine;
  /** Lines after the current one, in air order */
  upcoming: LiveLine[];
  /** True once a welcome line that names you has started playing */
  welcomedYou: boolean;
  /** Set while a welcome line that names you is on air */
  welcomingYou: boolean;
  /** serverNow ≈ Date.now() + clockOffsetMs */
  clockOffsetMs: number;
  muted: boolean;
  error?: string;
  /** Starts by itself when someone joins; false means the studio stopped it (off air until it starts it again) */
  enabled: boolean;
  /** Server epoch ms when the show on air ends (its six-minute limit) */
  enabledUntil?: number;
  /** Server note while sleeping, e.g. LIVE_OFF_AIR_NOTE or LIVE_ENDED_NOTE */
  note?: string;
}

export interface LiveActions {
  /** Call from a click: unlocks audio, connects and sends the name */
  join(name: string): Promise<void>;
  /** Switches station (reconnects to that station's show) */
  setStation(id: StationId): void;
  toggleMute(): void;
  leave(): void;
  /** "Tune in again" after the show ended: asks the station for a fresh show */
  restart(): void;
}
