import { LIVE_OFF_AIR_NOTE, type LiveLine, type LiveListener } from '../../../shared/live';
import type { SegmentType, Station } from '../../../shared/types';
import type { Caption } from '../../radio/state';
import type { LiveStatus, LiveViewState } from '../types';

/** 'sunny_hi_reels' → 'Sunny · reels' (the cast label when the station knows the voice). */
export function voiceLabel(station: Station, speaker: string): string {
  const known = [...Object.values(station.cast), ...(station.shows ?? []).map((show) => show.rj)].find(
    (voice) => voice.speaker === speaker,
  );
  if (known) return known.label;
  const [name = '', , ...style] = speaker.split('_');
  if (!name) return speaker;
  const display = `${name[0].toUpperCase()}${name.slice(1)}`;
  return style.length ? `${display} · ${style.join(' ')}` : display;
}

/** A live line as a caption for the shared caption stage. */
export function liveCaption(live: LiveLine, station: Station): Caption {
  const { line } = live;
  return { role: line.role, speaker: line.speaker, label: voiceLabel(station, line.speaker), text: line.text, en: line.en };
}

export interface UpcomingSegment {
  id: string;
  type: SegmentType;
  title: string;
  /** A live hello for listeners who just joined */
  welcome: boolean;
}

/** Distinct segments after the one on air, in air order. */
export function upcomingSegments(upcoming: LiveLine[], currentSegmentId?: string, max = 2): UpcomingSegment[] {
  const seen = new Set<string>(currentSegmentId ? [currentSegmentId] : []);
  const out: UpcomingSegment[] = [];
  for (const line of upcoming) {
    if (seen.has(line.segmentId)) continue;
    seen.add(line.segmentId);
    out.push({ id: line.segmentId, type: line.type, title: line.title, welcome: Boolean(line.welcome?.length) });
    if (out.length >= max) break;
  }
  return out;
}

/** Newest listener first; ties keep the server's order. */
export function newestFirst(listeners: LiveListener[]): LiveListener[] {
  return listeners
    .map((listener, index) => ({ listener, index }))
    .sort((a, b) => b.listener.joinedAt - a.listener.joinedAt || a.index - b.index)
    .map((entry) => entry.listener);
}

/** First letter of a name for its avatar (whole grapheme where the browser can split them). */
export function initial(name: string): string {
  const clean = name.trim();
  if (!clean) return '?';
  const first =
    typeof Intl.Segmenter === 'function'
      ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(clean)][0]?.segment
      : undefined;
  return (first ?? Array.from(clean)[0]).toLocaleUpperCase();
}

/** Names of the listeners a line welcomes, in the order the RJ says them. */
export function welcomedNames(line: LiveLine | undefined, listeners: LiveListener[]): string[] {
  if (!line?.welcome?.length) return [];
  return line.welcome
    .map((id) => listeners.find((l) => l.id === id)?.name)
    .filter((name): name is string => Boolean(name));
}

/** 'Priya' · 'Priya and Arjun' · 'Priya, Arjun and 2 more' */
export function joinNames(names: string[], max = 2): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} and ${rest} more` : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

/** Latin label for the split-flap board */
const SEGMENT_BOARD: Record<SegmentType, string> = {
  station_id: 'STATION ID',
  rj_link: 'RJ',
  news: 'NEWS',
  ad_break: 'AD BREAK',
  kahani: 'KAHANI',
};

export function liveBoard(status: LiveStatus, current?: LiveLine): string {
  switch (status) {
    case 'connecting':
    case 'reconnecting':
      return 'TUNING';
    case 'warming_up':
      return 'WARM UP';
    case 'error':
      return 'NO SIGNAL';
    case 'idle':
    case 'sleeping':
      return 'OFF AIR';
    default:
      if (!current) return 'ON AIR';
      return current.welcome?.length ? 'WELCOME' : SEGMENT_BOARD[current.type];
  }
}

export interface StatusCopy {
  title: string;
  detail: string;
}

/** Sleeping because the studio has the station switched off (not just resting between listeners). */
export function isOffAir(state: Pick<LiveViewState, 'status' | 'enabled' | 'note'>): boolean {
  return state.status === 'sleeping' && (state.note === LIVE_OFF_AIR_NOTE || !state.enabled);
}

export const OFF_AIR_COPY: StatusCopy = {
  title: 'Off air right now',
  detail: 'The studio will start the show soon, stay tuned.',
};

/** Plain-language studio status shown in place of the caption while nothing is on air. */
export function statusCopy(status: LiveStatus, station: Station, offAir = false): StatusCopy | undefined {
  if (offAir && status === 'sleeping') return OFF_AIR_COPY;
  switch (status) {
    case 'connecting':
      return { title: 'Connecting to the studio…', detail: `Finding the live ${station.languageName} show on ${station.frequency}.` };
    case 'warming_up':
      return {
        title: 'Waking up the studio… the RJ is getting ready',
        detail: 'The first segment is being written and voiced. Everyone tuned in hears it at the same moment.',
      };
    case 'sleeping':
      return {
        title: 'The studio is asleep. Waking it up…',
        detail: 'The station rests when nobody is listening and wakes as soon as someone tunes in.',
      };
    case 'reconnecting':
      return { title: 'Reconnecting…', detail: "You'll be back in sync with everyone in a moment." };
    case 'on_air':
      return { title: 'Next voice in a moment…', detail: 'Stay tuned. The next line plays for everyone at the same time.' };
    default:
      return undefined;
  }
}

/** Below this the countdown shows seconds too ('4m 12s'). */
const AUTO_OFF_SECONDS_BELOW_MS = 10 * 60_000;

/** Time left before a started station switches itself off: '1h 42m', '24m', '4m 12s', '45s'. */
export function formatAutoOff(ms: number): string {
  if (!(ms > 0)) return 'any moment';
  if (ms < AUTO_OFF_SECONDS_BELOW_MS) {
    const seconds = Math.ceil(ms / 1000);
    const m = Math.floor(seconds / 60);
    const sec = seconds % 60;
    if (!m) return `${sec}s`;
    return sec ? `${m}m ${sec}s` : `${m}m`;
  }
  const minutes = Math.ceil(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
