/** Station configs and voice casts. Source of truth: docs/VOICE-CASTING.md (IDs verified live 2026-10-14). */
import type { GrammaticalGender, Role, Station, StationId, Voice } from './types';

const F: GrammaticalGender = 'feminine';
const M: GrammaticalGender = 'masculine';

function voice(speaker: string, pace: number, temperature: number, gender: GrammaticalGender): Voice {
  const [name, , ...style] = speaker.split('_');
  const label = `${name[0].toUpperCase()}${name.slice(1)} · ${style.join(' ')}`;
  return { speaker, label, pace, temperature, gender };
}

const newsFeed = (hl: string) => `https://news.google.com/rss?hl=${hl}&gl=IN&ceid=IN:${hl}`;

const hindi: Station = {
  id: 'hi',
  name: 'Tarang Hindi',
  nativeName: 'तरंग हिंदी',
  frequency: '91.1',
  language: 'hi-IN',
  languageName: 'Hindi',
  tagline: 'Dil se suniye, dil ki baat',
  accent: '#ff6b2c',
  newsFeedUrl: newsFeed('hi'),
  sttMode: 'codemix',
  stationIdText: 'आप सुन रहे हैं तरंग FM 91.1… दिल से सुनिए, दिल की बात!',
  stationIdEn: "You're listening to Tarang FM 91.1… listen with your heart!",
  cast: {
    station_id: voice('ishita_hi_ads', 1.0, 0.7, F),
    rj: voice('sunny_hi_reels', 1.05, 0.8, M),
    news: voice('simran_hi_news_breaking', 1.05, 0.4, F),
    ad_announcer: voice('mukul_hi_ads', 1.1, 0.8, M),
    ad_customer: voice('ritu_hi_ads_informal', 1.0, 0.8, F),
    narrator: voice('shubh_hi_stories_dramatic', 0.95, 0.8, M),
    char_a: voice('mukul_hi_suspense', 0.9, 0.8, M),
    char_b: voice('sanchita_hi_romantic', 1.0, 0.85, F),
    char_kid: voice('chhavi_hi_kids', 1.05, 0.8, F),
  },
};

const tamil: Station = {
  id: 'ta',
  name: 'Tarang Tamil',
  nativeName: 'தரங் தமிழ்',
  frequency: '98.3',
  language: 'ta-IN',
  languageName: 'Tamil',
  tagline: 'இதயத்தின் அலைவரிசை',
  accent: '#3b82f6',
  newsFeedUrl: newsFeed('ta'),
  sttMode: 'transcribe',
  stationIdText: 'நீங்கள் கேட்டுக் கொண்டிருப்பது தரங் FM 98.3!',
  stationIdEn: "You're listening to Tarang FM 98.3!",
  cast: {
    station_id: voice('aravind_ta_ads', 1.0, 0.7, M),
    rj: voice('gokul_ta_narration', 1.05, 0.8, M),
    news: voice('vijay_ta_narration', 1.0, 0.4, M),
    ad_announcer: voice('aravind_ta_ads', 1.1, 0.8, M),
    ad_customer: voice('gokul_ta_narration', 1.0, 0.9, M),
    narrator: voice('vijay_ta_narration', 0.95, 0.7, M),
    char_a: voice('aravind_ta_suspense', 0.9, 0.8, M),
    char_b: voice('gokul_ta_narration', 1.05, 0.9, M),
    char_kid: voice('aravind_ta_ads', 1.15, 0.9, M),
  },
};

const bangla: Station = {
  id: 'bn',
  name: 'Tarang Bangla',
  nativeName: 'তরঙ্গ বাংলা',
  frequency: '102.7',
  language: 'bn-IN',
  languageName: 'Bangla',
  tagline: 'মনের কথা, মনের সুরে',
  accent: '#22c55e',
  newsFeedUrl: newsFeed('bn'),
  sttMode: 'transcribe',
  stationIdText: 'আপনি শুনছেন তরঙ্গ FM 102.7… মনের কথা, মনের সুরে!',
  stationIdEn: "You're listening to Tarang FM 102.7… words from the heart, in the heart's tune!",
  cast: {
    station_id: voice('arnab_bn_conversation', 1.05, 0.8, M),
    rj: voice('arnab_bn_conversation', 1.05, 0.8, M),
    news: voice('roopa_bn_conversational', 1.0, 0.4, F),
    ad_announcer: voice('arnab_bn_conversation', 1.15, 0.9, M),
    ad_customer: voice('roopa_bn_conversational', 1.0, 0.9, F),
    narrator: voice('roopa_bn_conversational', 0.95, 0.7, F),
    char_a: voice('bimal_bn_suspense', 0.9, 0.8, M),
    char_b: voice('arnab_bn_conversation', 1.0, 0.9, M),
    char_kid: voice('roopa_bn_conversational', 1.15, 0.9, F),
  },
};

/** Stations on the dial, in dial order. If-time stations are appended here. */
export const STATIONS: Station[] = [hindi, tamil, bangla];

export const STATION_BY_ID = Object.fromEntries(STATIONS.map((s) => [s.id, s])) as Partial<
  Record<StationId, Station>
>;

export function getStation(id: StationId): Station {
  const station = STATION_BY_ID[id];
  if (!station) throw new Error(`Unknown station: ${id}`);
  return station;
}

/** Every speaker in any station cast: the /api/tts allowlist. */
export const CAST_SPEAKERS: ReadonlySet<string> = new Set(
  STATIONS.flatMap((s) => Object.values(s.cast).map((v) => v.speaker)),
);

export const ROLES: Role[] = [
  'station_id',
  'rj',
  'news',
  'ad_announcer',
  'ad_customer',
  'narrator',
  'char_a',
  'char_b',
  'char_kid',
];
