import { CLOCK_LOOP_FROM, SHOW_CLOCK_V2 } from '../../shared/constants';
import { ROLES, storyVoices } from '../../shared/stations';
import type { ClockSlot, Role, SegmentType, Station, Voice } from '../../shared/types';
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

/**
 * Unique voices a station can put on air, each with the roles it plays: the cast, the daypart RJs and the
 * extra voices its stories are cast from.
 */
export function castVoices(station: Station): CastVoice[] {
  const voices = new Map<string, CastVoice>();
  const add = (voice: Voice, name: string) => {
    const entry = voices.get(voice.speaker);
    if (!entry) voices.set(voice.speaker, { speaker: voice.speaker, label: voice.label, roles: [name] });
    else if (!entry.roles.includes(name)) entry.roles.push(name);
  };
  for (const role of ROLES) add(station.cast[role], ROLE_NAMES[role]);
  for (const show of station.shows ?? []) add(show.rj, 'RJ');
  for (const voice of storyVoices(station)) add(voice, 'Story cast');
  return [...voices.values()];
}

/**
 * The segment after `next` on the show clock, or undefined when the clock is ambiguous
 * (the same pair appears twice with different followers) or the pair is unknown.
 */
export function laterOnClock(current?: SegmentType, next?: SegmentType): SegmentType | undefined {
  if (!current || !next) return undefined;
  const clock = SHOW_CLOCK_V2.map((s) => s.type);
  const loop = clock.slice(CLOCK_LOOP_FROM);
  const n = loop.length;
  const found = new Set<SegmentType>();
  for (let i = 0; i < n; i++) {
    if (loop[i] === current && loop[(i + 1) % n] === next) found.add(loop[(i + 2) % n]);
  }
  for (let i = 0; i + 2 < clock.length && i < CLOCK_LOOP_FROM; i++) {
    if (clock[i] === current && clock[i + 1] === next) found.add(clock[i + 2]);
  }
  return found.size === 1 ? [...found][0] : undefined;
}

/** The word each station says on air for a serial part (as the Kahani writer uses it); others say "Part". */
export const PART_WORDS: Partial<Record<string, string>> = {
  hi: 'कड़ी',
  mr: 'भाग',
  ta: 'பகுதி',
  bn: 'পর্ব',
  gu: 'ભાગ',
};

export interface SlotLabel {
  name: string;
  /** e.g. 'कड़ी 2', in the station language when `lang` is set */
  detail?: string;
  lang?: string;
}

/** A clock slot for the programme strip: 'Kahani · कड़ी 2', 'News update', 'RJ'. `language` is e.g. 'hi-IN'. */
export function slotLabel(slot: ClockSlot, language?: string): SlotLabel {
  if (slot.type === 'news' && slot.mode === 'update') return { name: 'News update' };
  if (slot.type === 'kahani' && slot.part) {
    const word = language ? PART_WORDS[language.split('-')[0]] : undefined;
    return word ? { name: 'Kahani', detail: `${word} ${slot.part}`, lang: language } : { name: 'Kahani', detail: `Part ${slot.part}` };
  }
  return { name: SEGMENT_NAMES[slot.type] };
}

/** 75 → '01:15'; 3725 → '1:02:05' */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Nearest station to a dial position (percent). */
export function nearestStation(stations: Station[], pct: number): Station {
  return stations.reduce((best, s) =>
    Math.abs(dialPct(Number(s.frequency)) - pct) < Math.abs(dialPct(Number(best.frequency)) - pct) ? s : best,
  );
}
