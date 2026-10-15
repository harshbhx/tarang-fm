import type { ClockSlot, SegmentType } from './types';

export const TTS_MODEL = 'bulbul:v4-flash';
export const TTS_SAMPLE_RATE = 24000;
export const STT_MODEL = 'saaras:v4';
export const LLM_MODEL = 'sarvam-105b';

/** Max characters per spoken line after cleaning */
export const MAX_LINE_CHARS = 220;
/** Max characters accepted by /api/tts */
export const TTS_MAX_CHARS = 300;
/** Max call-in recording length */
export const CALL_MAX_SECONDS = 15;
export const CALL_MAX_BYTES = 2 * 1024 * 1024;
export const LISTENER_NAME_MAX = 40;

/** Programme order. After the first pass the clock loops from index 1. */
export const SHOW_CLOCK: SegmentType[] = [
  'station_id',
  'rj_link',
  'news',
  'ad_break',
  'kahani',
  'rj_link',
  'ad_break',
  'kahani',
];

/**
 * Show clock v2 (writing redesign): one loop is one complete Kahani serial. An RJ link hands into and out of
 * every part, news alternates full and update, and no two ads touch. The loop starts again at CLOCK_LOOP_FROM.
 * (SHOW_CLOCK above stays until every consumer moves to this.)
 */
export const SHOW_CLOCK_V2: ClockSlot[] = [
  { type: 'station_id' },
  { type: 'rj_link', mode: 'opener' },
  { type: 'news', mode: 'full' },
  { type: 'ad_break' },
  { type: 'rj_link', mode: 'kahani_in' },
  { type: 'kahani', part: 1 },
  { type: 'rj_link', mode: 'kahani_out' },
  { type: 'news', mode: 'update' },
  { type: 'ad_break' },
  { type: 'rj_link', mode: 'kahani_in' },
  { type: 'kahani', part: 2 },
  { type: 'rj_link', mode: 'kahani_out' },
  { type: 'ad_break' },
  { type: 'rj_link', mode: 'kahani_in' },
  { type: 'kahani', part: 3 },
  { type: 'rj_link', mode: 'kahani_out' },
];
export const CLOCK_LOOP_FROM = 2;

/** Default silence after a line, by segment type (ms) */
export const PAUSE_AFTER_MS: Record<SegmentType, number> = {
  station_id: 500,
  rj_link: 350,
  news: 450,
  ad_break: 250,
  kahani: 400,
};

/** The studio call-in line (Sarvam Voice Agents inbound number). */
export const STUDIO_NUMBER = '+917965854148';
export const STUDIO_NUMBER_DISPLAY = '+91 79 6585 4148';

/** How a line is acted. Bulbul has no SSML, so delivery maps to pace / pitch / loudness / gap (worker/show.ts). */
export const DELIVERIES = ['normal', 'warm', 'excited', 'fast', 'hushed', 'shout', 'dramatic', 'sad'] as const;
