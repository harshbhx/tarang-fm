/** Which feeds a station, state or city pool fetches, and how publishers and places are named on air. */
import { BING_TOPICS, CITY_FEEDS, CITY_NAMES, PUBLISHERS, STATE_FEEDS, STATE_NAMES, STATION_FEEDS } from './sources';
import type { Bucket, FeedSource, NewsLang, NewsStation } from './types';

export { CITY_NAMES, STATE_NAMES } from './sources';

const NEWS_STATIONS: readonly NewsStation[] = ['hi', 'mr', 'ta', 'bn', 'gu'];

/** The newsroom pool for a station id, or undefined for stations without one (the old headline path serves them). */
export function newsStationOf(id: string): NewsStation | undefined {
  return (NEWS_STATIONS as readonly string[]).includes(id) ? (id as NewsStation) : undefined;
}

/** The state each regional station is from: its state feeds are part of the core refresh. */
export const HOME_STATE: Partial<Record<NewsStation, string>> = { mr: 'MH', ta: 'TN', bn: 'WB', gu: 'GJ' };

/** A state's own language: its press fills the city and state slots for a station in another language. */
export const STATE_LANG: Record<string, NewsStation> = { GJ: 'gu', MH: 'mr', TN: 'ta', WB: 'bn' };

const STATE_ALIASES: Record<string, string> = {
  'national capital territory of delhi': 'DL',
  'nct of delhi': 'DL',
  orissa: 'OR',
  odisha: 'OR',
  uttarakhand: 'UT',
  'tamilnadu': 'TN',
  bengal: 'WB',
};

/** ISO 3166-2 suffix from the edge's `regionCode` (preferred) or a region name ("Gujarat"). */
export function stateCodeOf(regionCode?: string, regionName?: string): string | undefined {
  const code = regionCode?.trim().toUpperCase().replace(/^IN-/, '');
  if (code && /^[A-Z]{2}$/.test(code)) return code;
  const name = regionName?.trim().toLowerCase();
  if (!name) return undefined;
  if (STATE_ALIASES[name]) return STATE_ALIASES[name];
  return Object.entries(STATE_NAMES).find(([, n]) => n.en?.toLowerCase() === name)?.[0];
}

const CITY_ALIASES: Record<string, string> = {
  baroda: 'vadodara',
  bombay: 'mumbai',
  'navi mumbai': 'mumbai',
  calcutta: 'kolkata',
  madras: 'chennai',
  bangalore: 'bengaluru',
  'new delhi': 'delhi',
  poona: 'pune',
  kovai: 'coimbatore',
};

/** Normalized city key: lowercase, no "district"/"city" suffix, common old names mapped. */
export function cityKeyOf(city?: string): string | undefined {
  const c = city
    ?.trim()
    .toLowerCase()
    .replace(/\s+(district|city|division)$/u, '')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!c) return undefined;
  return CITY_ALIASES[c] ?? c;
}

/** The city's or state's name in the station script, when known. */
export function cityName(cityKey: string | undefined, lang: NewsLang): string | undefined {
  return cityKey ? CITY_NAMES[cityKey]?.[lang] : undefined;
}

export function stateName(code: string | undefined, lang: NewsLang): string | undefined {
  return code ? STATE_NAMES[code]?.[lang] : undefined;
}

export function bingUrl(query: string, lang: NewsLang): string {
  return `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss&setlang=${lang}-IN&cc=IN`;
}

function bingFeed(id: string, lang: NewsLang, bucket: Bucket, query: string, extra: Partial<FeedSource> = {}): FeedSource {
  return { id, lang, bucket, publisher: 'bing', url: bingUrl(query, lang), tier: 1, ...extra };
}

export type RefreshKind = 'refresh' | 'topup' | 'local';

/** A station's core feeds: tier 1-2 (plus tier 3 on a top-up), Bing topics, and the home state's Bing query. */
export function coreFeeds(station: NewsStation, kind: Exclude<RefreshKind, 'local'>): FeedSource[] {
  const maxTier = kind === 'topup' ? 3 : 2;
  const feeds = STATION_FEEDS[station].filter((f) => (kind === 'topup' ? f.tier !== 2 : f.tier <= maxTier));
  for (const [bucket, q] of Object.entries(BING_TOPICS[station] ?? {})) feeds.push(bingFeed(`bing-${station}-${bucket}`, station, bucket as Bucket, q));
  const home = HOME_STATE[station];
  const homeName = stateName(home, station);
  if (home && homeName) feeds.push(bingFeed(`bing-${station}-state-${home}`, station, 'state', homeName, { state: home }));
  return feeds;
}

/** Feeds for a listener's state and city on a station: the station's language first, then the state's own press. */
export function localFeeds(station: NewsStation, state?: string, city?: string): FeedSource[] {
  const feeds: FeedSource[] = [];
  const own = state ? STATE_LANG[state] : undefined;
  const cross = own && own !== station ? own : undefined;
  if (state && state !== HOME_STATE[station]) {
    feeds.push(...(STATE_FEEDS[station]?.[state] ?? []));
    const name = stateName(state, station);
    if (name) feeds.push(bingFeed(`bing-${station}-state-${state}`, station, 'state', name, { state }));
    // The state's own press (the newsreader reads it in the station language, with attribution)
    if (cross) feeds.push(...(STATE_FEEDS[cross]?.[state] ?? []).map((f) => ({ ...f, tier: 2 as const })));
  }
  if (city) {
    feeds.push(...(CITY_FEEDS[station]?.[city] ?? []).map((f) => ({ ...f, state: f.state ?? state })));
    const name = cityName(city, station);
    if (name) feeds.push(bingFeed(`bing-${station}-city-${city}`, station, 'city', name, { city, state }));
    if (cross) feeds.push(...(CITY_FEEDS[cross]?.[city] ?? []).map((f) => ({ ...f, state: f.state ?? state, tier: 2 as const })));
  }
  return feeds;
}

/** Bing's Latin <News:Source> → publisher key. */
const BING_SOURCES: [RegExp, string][] = [
  [/divya\s*bhaskar/i, 'divyabhaskar'],
  [/dainik\s*bhaskar|bhaskar/i, 'bhaskar'],
  [/amar\s*ujala/i, 'amarujala'],
  [/news\s*18|lokmat\s*news18/i, 'news18'],
  [/\babp\b/i, 'abp'],
  [/\btv\s*9/i, 'tv9'],
  [/aaj\s*tak/i, 'aajtak'],
  [/zee/i, 'zee'],
  [/ndtv/i, 'ndtvindia'],
  [/live\s*hindustan|hindustan\s*hindi/i, 'livehindustan'],
  [/hindustan\s*times\s*bangla/i, 'htbangla'],
  [/navbharat/i, 'nbt'],
  [/jagran/i, 'jagran'],
  [/lokmat/i, 'lokmat'],
  [/maharashtra\s*times/i, 'mt'],
  [/sakal/i, 'sakal'],
  [/loksatta/i, 'loksatta'],
  [/samayam/i, 'samayam'],
  [/dinamani/i, 'dinamani'],
  [/dinamalar/i, 'dinamalar'],
  [/thanthi/i, 'dailythanthi'],
  [/oneindia/i, 'oneindia'],
  [/anandabazar/i, 'anandabazar'],
  [/sangbad\s*pratidin/i, 'pratidin'],
  [/gujarat\s*samachar/i, 'gujaratsamachar'],
  [/sandesh/i, 'sandesh'],
  [/indian\s*express/i, 'iegu'],
  [/gstv/i, 'gstv'],
  [/\bbbc\b/i, 'bbc'],
];

export function publisherFromBing(sourceName?: string): string | undefined {
  if (!sourceName) return undefined;
  return BING_SOURCES.find(([re]) => re.test(sourceName))?.[1];
}

/** Publishers Bing surfaces that the feed catalog does not carry. */
const EXTRA_PUBLISHERS: Record<string, Partial<Record<NewsLang, string>>> = {
  nbt: { hi: 'नवभारत टाइम्स' },
  jagran: { hi: 'दैनिक जागरण' },
  lokmat: { mr: 'लोकमत', hi: 'लोकमत' },
  sakal: { mr: 'सकाळ' },
  loksatta: { mr: 'लोकसत्ता' },
  dinamalar: { ta: 'தினமலர்' },
  anandabazar: { bn: 'আনন্দবাজার পত্রিকা' },
  htbangla: { bn: 'হিন্দুস্তান টাইমস বাংলা' },
  gujaratsamachar: { gu: 'ગુજરાત સમાચાર', hi: 'गुजरात समाचार' },
  sandesh: { gu: 'સંદેશ', hi: 'संदेश' },
};

/** A regional publisher named in another station's script: `${key}:${itemLang}` → station language → name. */
const CROSS_PUBLISHERS: Record<string, Partial<Record<NewsLang, string>>> = {
  'divyabhaskar:gu': { hi: 'दिव्य भास्कर', mr: 'दिव्य भास्कर' },
  'news18:gu': { hi: 'न्यूज़18 गुजराती' },
  'tv9:gu': { hi: 'टीवी9 गुजराती' },
  'abp:gu': { hi: 'एबीपी अस्मिता' },
  'bbc:gu': { hi: 'बीबीसी गुजराती' },
  'gstv:gu': { hi: 'जीएसटीवी' },
  'news18:mr': { hi: 'न्यूज़18 लोकमत', gu: 'ન્યૂઝ18 લોકમત' },
  'tv9:mr': { hi: 'टीवी9 मराठी', gu: 'ટીવી9 મરાઠી' },
  'abp:mr': { hi: 'एबीपी माझा' },
  'mt:mr': { hi: 'महाराष्ट्र टाइम्स' },
  'news18:ta': { hi: 'न्यूज़18 तमिल' },
  'samayam:ta': { hi: 'समयम तमिल' },
  'abp:ta': { hi: 'एबीपी नाडु' },
  'news18:bn': { hi: 'न्यूज़18 बांग्ला' },
  'abp:bn': { hi: 'एबीपी आनंद' },
  'bbc:en': { hi: 'बीबीसी', mr: 'बीबीसी', ta: 'பிபிசி', bn: 'বিবিসি', gu: 'બીબીસી' },
};

/** The publisher's name as the newsreader says it on this station, or undefined ("local media" then). */
export function spokenPublisher(key: string | undefined, station: NewsStation, itemLang: NewsLang): string | undefined {
  if (!key || key === 'bing' || key === 'unknown') return undefined;
  if (itemLang === station) return PUBLISHERS[key]?.[station] ?? EXTRA_PUBLISHERS[key]?.[station];
  return CROSS_PUBLISHERS[`${key}:${itemLang}`]?.[station] ?? EXTRA_PUBLISHERS[key]?.[station];
}

/** Every known city and state, each as the list of its names in every script (the fidelity check's lexicon). */
export function knownPlaceGroups(): string[][] {
  const groups: string[][] = [];
  for (const [key, row] of Object.entries(CITY_NAMES)) groups.push([key[0].toUpperCase() + key.slice(1), ...Object.values(row).filter((n): n is string => Boolean(n))]);
  for (const row of Object.values(STATE_NAMES)) groups.push(Object.values(row).filter((n): n is string => Boolean(n)));
  return groups;
}
