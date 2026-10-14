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
}

export interface ListenerContext {
  /** ≤ 40 chars */
  name?: string;
  city?: string;
  /** 'HH:mm' */
  localTime: string;
  daypart: Daypart;
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

export type CallIntent = 'chat' | 'dedication' | 'story_request' | 'news_request' | 'other';

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
}

export interface ApiError {
  error: { code: string; message: string };
}
