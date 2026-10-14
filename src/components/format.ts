import { ROLES } from '../../shared/stations';
import type { Role, SegmentType, Station } from '../../shared/types';
import type { Caption, RadioStatus } from '../radio/state';

export const DIAL_MIN = 88;
export const DIAL_MAX = 108;

/** Position of a frequency on the dial glass, in percent of its width. */
export function dialPct(freq: number): number {
  return 4 + ((freq - DIAL_MIN) / (DIAL_MAX - DIAL_MIN)) * 92;
}

/** 'तरंग हिंदी' → 'हिंदी' */
export function nativeLanguage(station: Station): string {
  const parts = station.nativeName.split(' ');
  return parts.length > 1 ? parts.slice(1).join(' ') : station.nativeName;
}

export const SEGMENT_NAMES: Record<SegmentType, string> = {
  station_id: 'Station ID',
  rj_link: 'RJ',
  news: 'News',
  ad_break: 'Ad break',
  kahani: 'Kahani Corner',
};

/** Latin labels for the split-flap board */
const SEGMENT_BOARD: Record<SegmentType, string> = {
  station_id: 'STATION ID',
  rj_link: 'RJ',
  news: 'NEWS',
  ad_break: 'AD BREAK',
  kahani: 'KAHANI',
};

export function boardLabel(status: RadioStatus, segment?: SegmentType): string {
  if (status === 'tuning') return 'TUNING';
  if (status === 'paused') return 'PAUSED';
  if (status === 'error') return 'NO SIGNAL';
  if (status === 'call_recording' || status === 'call_thinking' || status === 'call_on_air') return 'CALL IN';
  return segment ? SEGMENT_BOARD[segment] : 'ON AIR';
}

export const ROLE_NAMES: Record<Role | 'caller', string> = {
  station_id: 'Station ID',
  rj: 'RJ',
  news: 'Newsreader',
  ad_announcer: 'Ad announcer',
  ad_customer: 'Ad customer',
  narrator: 'Narrator',
  char_a: 'Character',
  char_b: 'Character',
  char_kid: 'Child',
  caller: 'Caller',
};

/** 'Sunny · reels' → 'Sunny' */
export function voiceName(label: string): string {
  return label.split('·')[0]?.trim() || label;
}

export function sameCaption(a: Caption, b: Caption): boolean {
  return a.speaker === b.speaker && a.text === b.text;
}

export interface CastVoice {
  speaker: string;
  label: string;
  roles: string[];
}

/** Unique voices in a station cast, each with the roles it plays. */
export function castVoices(station: Station): CastVoice[] {
  const voices = new Map<string, CastVoice>();
  for (const role of ROLES) {
    const voice = station.cast[role];
    const name = ROLE_NAMES[role];
    const entry = voices.get(voice.speaker);
    if (!entry) voices.set(voice.speaker, { speaker: voice.speaker, label: voice.label, roles: [name] });
    else if (!entry.roles.includes(name)) entry.roles.push(name);
  }
  return [...voices.values()];
}
