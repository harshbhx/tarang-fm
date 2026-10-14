import type { SegmentType } from './types';

export const TTS_MODEL = 'bulbul:v4-flash';
export const TTS_SAMPLE_RATE = 24000;
export const STT_MODEL = 'saaras:v4';
export const LLM_MODEL = 'sarvam-105b';
export const TRANSLATE_MODEL = 'mayura:v1';

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
