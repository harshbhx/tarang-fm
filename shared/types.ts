import type { DELIVERIES } from './constants';

/** Contracts shared by the browser app and the Worker. See docs/TECH-SPEC.md §4. */

export type StationId = 'hi' | 'ta' | 'bn' | 'mr' | 'en' | 'te' | 'kn' | 'pa' | 'gu';
export type TtsLanguage =
  | 'hi-IN' | 'ta-IN' | 'bn-IN' | 'mr-IN' | 'en-IN' | 'te-IN' | 'kn-IN' | 'pa-IN' | 'gu-IN';

export type Role =
  | 'station_id'
  | 'rj'
  | 'news'
  | 'ad_announcer'
  | 'ad_customer'
  | 'narrator'
  | 'char_a'
  | 'char_b'
  | 'char_kid';

export type SegmentType = 'station_id' | 'rj_link' | 'news' | 'ad_break' | 'kahani';
export type Daypart = 'morning' | 'afternoon' | 'evening' | 'night';
export type GrammaticalGender = 'feminine' | 'masculine';
export type Delivery = (typeof DELIVERIES)[number];
export type Mood = 'light' | 'heavy';

export interface Voice {
  /** bulbul:v4-flash persona ID, e.g. 'mukul_hi_suspense' */
  speaker: string;
  /** Display name, e.g. 'Mukul · suspense' */
  label: string;
  /** 0.5–2.0 */
  pace: number;
  /** 0.01–1.0 (expressiveness) */
  temperature: number;
  /** Grammatical gender for scripts, from the pitch audition */
  gender: GrammaticalGender;
}

export interface Station {
  id: StationId;
  name: string;
  nativeName: string;
  /** Display only */
  frequency: string;
  language: TtsLanguage;
  languageName: string;
  tagline: string;
  /** CSS colour */
  accent: string;
  newsFeedUrl: string;
  sttMode: 'codemix' | 'transcribe';
  /** Fixed jingle line in native script */
  stationIdText: string;
  /** English version of the jingle line (subtitle) */
  stationIdEn: string;
  cast: Record<Role, Voice>;
  /** Daypart shows with their own RJ (local hours, [from, to)); the cast rj is used outside them */
  shows?: Show[];
}

export interface Show {
  /** Local hour the show starts (inclusive) and ends (exclusive); wraps past midnight when from > to */
  from: number;
  to: number;
  /** Show name in the station language, e.g. 'सुबह की चाय' */
  name: string;
  /** RJ name in the station language, e.g. 'सनी' */
  rjName: string;
  rj: Voice;
}

export interface Line {
  role: Role;
  speaker: string;
  /** ≤ 220 chars, already cleaned */
  text: string;
  /** English subtitle (Sarvam Translate); absent if translation failed or station is English */
  en?: string;
  pace: number;
  temperature: number;
  /** Acting direction; pace, loudness and pitch already include it */
  delivery?: Delivery;
  /** Bulbul loudness (0.1–2.5) */
  loudness?: number;
  /** Bulbul pitch (−0.5–0.5) */
  pitch?: number;
  /** Silence after this line */
  pauseAfterMs: number;
}

export interface Source {
  title: string;
  url: string;
  source?: string;
  /** From the listener's own city feed */
  local?: boolean;
}

export interface Weather {
  tempC: number;
  description: string;
}

export interface Segment {
  id: string;
  station: StationId;
  type: SegmentType;
  /** Shown on the now-playing card */
  title: string;
  lines: Line[];
  /** News only */
  sources?: Source[];
  /** True if template content was used */
  fallback?: boolean;
  /** One English sentence on what aired (feeds the show log and the next RJ link's tease) */
  summary?: string;
  /** News only: heavy when the bulletin was dominated by death, disaster or violence */
  mood?: Mood;
}

export interface ListenerContext {
  /** ≤ 40 chars */
  name?: string;
  city?: string;
  /** 'HH:mm' */
  localTime: string;
  daypart: Daypart;
  /** Browser-local date 'YYYY-MM-DD' (occasions) */
  localDate?: string;
  /** 0 = Sunday */
  weekday?: number;
  /** State or region from the edge, e.g. 'Gujarat' */
  region?: string;
  /** Session nickname the RJ gave this listener on a call */
  nickname?: string;
}

export interface ContextResponse {
  city?: string;
  region?: string;
  country?: string;
  timezone?: string;
  /** May be empty */
  headlines: Source[];
  weather?: Weather;
}

export type CallIntent = 'chat' | 'dedication' | 'story_request' | 'news_request' | 'retry' | 'deflect' | 'care' | 'other';

export interface CallResponse {
  transcript: string;
  /** English subtitle of what the caller said */
  transcriptEn?: string;
  /** Detected BCP-47 */
  language?: string;
  intent: CallIntent;
  /** For story_request */
  theme?: string;
  /** RJ line to synthesize via /api/tts */
  reply: Line;
  /** Kind, funny nickname the RJ gave the caller (kept for the session) */
  nickname?: string;
}

export interface ApiError {
  error: { code: string; message: string };
}

export type PhoneRequestType = 'dedication' | 'story_request' | 'news_request' | 'chat' | 'other';

/** A call to the studio line, as the web show sees it (the caller's number is masked). */
export interface PhoneCall {
  id: string;
  /** ISO timestamp of the end of the call */
  at: string;
  name?: string;
  city?: string;
  /** e.g. '+91 ••••• 4148' */
  maskedNumber: string;
  type: PhoneRequestType;
  /** Short on-air message in the caller's language */
  message: string;
  theme?: string;
}

export interface PhoneRecentResponse {
  number: string;
  calls: PhoneCall[];
}
