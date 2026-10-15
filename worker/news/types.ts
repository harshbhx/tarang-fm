/** Newsroom types: feeds, items in the pool, and the bulletin slate. */

export type NewsLang = 'hi' | 'mr' | 'ta' | 'bn' | 'gu' | 'en';
/** A station's own pool (one per language station). */
export type NewsStation = Exclude<NewsLang, 'en'>;
export type Bucket = 'city' | 'state' | 'national' | 'world' | 'sports' | 'business' | 'entertainment' | 'science' | 'kicker';
export type BulletinMode = 'full' | 'update';

export interface FeedSource {
  id: string;
  /** Language of the feed's items */
  lang: NewsLang;
  /** Slot it feeds (tagging may re-bucket a mixed feed) */
  bucket: Bucket;
  /** PUBLISHERS key */
  publisher: string;
  url: string;
  /** 1 = every refresh, 2 = full refresh, 3 = top-up and fallback only */
  tier: 1 | 2 | 3;
  /** One feed carrying national, world and sport together (BBC, Aaj Tak, 'latest' feeds) */
  mixed?: boolean;
  /** ISO 3166-2 suffix for state feeds, e.g. 'GJ' */
  state?: string;
  /** Normalized city key for city feeds */
  city?: string;
  /** Publisher dates run ahead of the clock (always clamped anyway) */
  clampFutureDates?: boolean;
}

/** One parsed feed item before it reaches the pool. */
export interface RawItem {
  title: string;
  descr: string;
  url: string;
  /** ms since epoch, or NaN when the feed has no usable date */
  publishedAt: number;
  /** Bing's <News:Source> (Latin publisher name) */
  sourceName?: string;
}

/** A filtered, normalized item ready to store. */
export interface PoolItem {
  id: string;
  pool: NewsStation;
  lang: NewsLang;
  bucket: Bucket;
  state?: string;
  city?: string;
  title: string;
  descr: string;
  url: string;
  publisherKey: string;
  publisherSpoken?: string;
  feedId: string;
  publishedAt: number;
  fetchedAt: number;
  expiresAt: number;
  titleKey: string;
  clusterId: string;
  topicId: string;
  light: boolean;
  death: boolean;
  question: boolean;
  opinion: boolean;
}

/** A story as the slate picker sees it: one representative per cluster. */
export interface Story {
  clusterId: string;
  topicId: string;
  itemId: string;
  lang: NewsLang;
  bucket: Bucket;
  state?: string;
  city?: string;
  title: string;
  descr: string;
  url: string;
  publisherSpoken?: string;
  publishedAt: number;
  /** Distinct publishers carrying the story */
  sources: number;
  /** Every item id in the story (a story merged later still matches the id a session heard it under) */
  memberIds?: string[];
  light: boolean;
  death: boolean;
  question: boolean;
  opinion: boolean;
  /** When this station last aired the story or its topic (ms), if it did */
  stationAiredAt?: number;
  topicAiredAt?: number;
}
