/** The RJ fact packet: ranked, true, scoped facts for one link. Code picks the fact; the writer only delivers it. */
import type { StationId, Weather } from '../../shared/types';

/** Station languages that have native text in the pools. */
export type FactLang = 'hi' | 'mr' | 'ta' | 'bn' | 'gu';

export type FactType =
  /** Opener only: the current weather as a basic line */
  | 'weather_now'
  /** rain_soon, raining, heat, cold or fog, only when notable */
  | 'weather_notable'
  /** CPCB band "poor" or worse (index > 200), said as a category word, never a number */
  | 'air_bad'
  /** Official NDMA SACHET alert naming the listener's city or district, still valid */
  | 'alert'
  /** Festival today, tomorrow, this week (disputed dates) or a countdown (confirmed dates) */
  | 'festival'
  /** India fixture today or tomorrow (with the IST start time when a source gives one), or within a week */
  | 'cricket'
  /** Curated, neutral, India-relevant item for today's date */
  | 'on_this_day'
  /** Curated, verified fact about the listener's city */
  | 'city_fact';

export interface Fact {
  /** Stable id (≤ 64 chars), e.g. 'fest:diwali:today:2026-11-08'. Echo aired ids in linkState.usedFactIds. */
  id: string;
  type: FactType;
  /** Rank, 0–100, higher first. Timely and useful beats curious: alert > rain > air > festival > cricket > on this day > city fact. */
  priority: number;
  /** The true claim in English, with exact values. Everything the writer may state comes from here. */
  claimEn: string;
  /** Ready native phrasing per station language, when available (ASCII digits, so keptTokens match in every script) */
  nativeText?: Partial<Record<FactLang, string>>;
  /** Numbers and Latin tokens the script must keep verbatim (years, percentages, temperatures, 'UNESCO'). */
  keptTokens: string[];
  /** Native-script names and phrases the script must keep verbatim in that language (a city, a festival, a spoken time). */
  keptNative?: Partial<Record<FactLang, string[]>>;
  /** Other numbers the claim contains that the script may use but need not (e.g. the hours in an alert window). */
  allowedTokens?: string[];
  /** Required qualifier, as an instruction to the writer ("say this week, never the day") */
  hedge?: string;
  /** The qualifier phrase itself, per language, when there is a fixed one */
  hedgeNative?: Partial<Record<FactLang, string>>;
  /** One line on why a listener cares right now: the natural point of the link */
  angleEn: string;
  /** Epoch ms after which the fact must not air */
  expiresAt: number;
  /** Who said it, credited where natural: 'IMD Chennai via NDMA SACHET', 'Open-Meteo', 'en.wikipedia.org/wiki/…' */
  source: string;
}

export interface FactPacket {
  v: 1;
  builtAt: number;
  station: StationId;
  /** IST calendar context the facts were scoped to */
  today: { date: string; time: string; weekday: number; hour: number };
  /** Where the facts are scoped: the curated city when known, else the edge city */
  place: { cityKey?: string; city?: string; cityNative?: string; region?: string; lat?: number; lon?: number };
  /** Opener basics: the extended Weather shape and the weather_now fact. Only the opener may use these. */
  opener: { weather?: Weather; facts: Fact[] };
  /** Payload candidates, best first, already filtered by expiry and usedFactIds */
  facts: Fact[];
  /** The fact the RJ link should carry, and a backup of a different type */
  chosen?: Fact;
  backup?: Fact;
  /** Which live sources answered (for logs; a missing source only means fewer facts) */
  sources: { weather: boolean; air: boolean; alerts: boolean };
}

export interface FactPacketInput {
  station: { id: StationId };
  /** cf.city or the listener's city */
  city?: string;
  /** cf.region, e.g. 'Gujarat' */
  region?: string;
  lat?: number;
  lon?: number;
  /** Epoch ms */
  now: number;
  usedFactIds?: string[];
}
