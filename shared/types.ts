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

/** Voices a story can draw on, by the part they suit. */
export interface StoryPool {
  narrators: Voice[];
  /** Narrators for ghost stories, mysteries and night-time suspense */
  spookyNarrators?: Voice[];
  men: Voice[];
  women: Voice[];
  kids: Voice[];
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
  /** Extra verified voices a Kahani can be cast from, so stories don't always sound the same */
  storyPool?: StoryPool;
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
  /** Stable newsroom id (aired tracking) */
  id?: string;
  /** The feed's own description: the only place a "why it matters" line may come from */
  detail?: string;
  /** Where the bulletin places it */
  slot?: NewsSlot;
  /** A light or good-news item (kicker candidate) */
  light?: boolean;
}

export type NewsSlot = 'city' | 'state' | 'national' | 'world' | 'sport' | 'business' | 'entertainment' | 'kicker';

/** What an RJ link or bulletin is for in the clock (the code decides, the writer delivers). */
export type ClockMode = 'opener' | 'payload' | 'kahani_in' | 'kahani_out' | 'full' | 'update';

/** One entry of the v2 show clock. */
export interface ClockSlot {
  type: SegmentType;
  mode?: ClockMode;
  /** kahani only: serial part */
  part?: 1 | 2 | 3;
}

/** A Kahani serial: outlined once, then aired in parts with the same cast. */
export interface SerialState {
  id: string;
  part: 1 | 2 | 3;
  /** Flat outline fields from the outline call (title, setting, names, act breaks, ending lines...) */
  outline: Record<string, string>;
  /** Locked voice per story role */
  cast: Partial<Record<'narrator' | 'char_a' | 'char_b' | 'char_kid', string>>;
}

/** What the next part's recap may draw on: what actually aired. */
export interface RecapSource {
  heard: string;
  cliffhanger: string;
  lastLines: { role: string; text: string }[];
}

/** RJ link rotation state, kept by the client (or the live station) and echoed on each request. */
export interface LinkState {
  lastTypes: string[];
  usedFactIds: string[];
  /** A question of the day waiting for its answer in a later link */
  openQuestion?: string;
  /** Running bits: next episode number per bit id */
  bitEpisodes: Record<string, number>;
  lastWeatherAt?: number;
  lastFestivalAt?: number;
  onThisDayDone?: boolean;
}

export interface Weather {
  tempC: number;
  description: string;
  /** Worth an RJ mention right now */
  notable?: 'none' | 'rain_soon' | 'raining' | 'heat' | 'cold' | 'bad_air' | 'fog';
  rainChance3h?: number;
  pm25?: number;
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
  /** rj_link only: ids of the studio phone calls this link reads on air */
  dedicated?: string[];
  /** kahani only: the serial this part belongs to (part 1 returns the new outline and cast) */
  serial?: SerialState;
  /** What the producer heard: replaces `summary` in the show log and feeds the next recap */
  heardSummary?: string;
  /** rj_link only: the rotation state after this link (echo it on the next request) */
  linkState?: LinkState;
  /** news only: newsroom ids aired in this bulletin (send them back in airedNews) */
  newsIds?: string[];
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
  /** When an RJ first read it on air (any listener); a call is read once, ever */
  airedAt?: string;
}

export interface PhoneRecentResponse {
  number: string;
  calls: PhoneCall[];
}
