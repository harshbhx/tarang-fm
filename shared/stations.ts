/** Station configs and voice casts. Source of truth: docs/VOICE-CASTING.md (IDs verified live 2026-10-14). */
import type { GrammaticalGender, Role, Show, Station, StationId, Voice } from './types';

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
    news: voice('simran_hi_news', 1.0, 0.4, F),
    ad_announcer: voice('mukul_hi_ads', 1.1, 0.8, M),
    ad_customer: voice('ritu_hi_ads_informal', 1.0, 0.8, F),
    narrator: voice('shubh_hi_stories_dramatic', 0.95, 0.8, M),
    char_a: voice('mukul_hi_suspense', 0.9, 0.8, M),
    char_b: voice('sanchita_hi_romantic', 1.0, 0.85, F),
    char_kid: voice('chhavi_hi_kids', 1.05, 0.8, F),
  },
  shows: [
    { from: 6, to: 11, name: 'सुबह की चाय', rjName: 'सनी', rj: voice('sunny_hi_reels', 1.05, 0.8, M) },
    { from: 11, to: 16, name: 'दोपहर की गपशप', rjName: 'रितु', rj: voice('ritu_hi_social_lively', 1.0, 0.8, F) },
    { from: 16, to: 21, name: 'घर वापसी', rjName: 'सनी', rj: voice('sunny_hi_reels', 1.05, 0.8, M) },
    { from: 21, to: 6, name: 'रात की बात', rjName: 'रतन', rj: voice('ratan_hi_latenight_warm', 0.95, 0.7, M) },
  ],
  storyPool: {
    narrators: [
      voice('shubh_hi_stories_dramatic', 0.95, 0.8, M),
      voice('shubh_hi_stories_mixed', 0.97, 0.78, M),
      voice('sanchita_hi_romantic', 0.95, 0.75, F),
      voice('ritu_hi_social_lively', 1.0, 0.75, F),
    ],
    spookyNarrators: [
      voice('ratan_hi_latenight_warm', 0.92, 0.7, M),
      voice('shubh_hi_stories_dramatic', 0.92, 0.8, M),
      voice('mukul_hi_suspense', 0.9, 0.75, M),
    ],
    men: [
      voice('mukul_hi_suspense', 0.9, 0.8, M),
      voice('anand_hi_news', 1.0, 0.75, M),
      voice('sunny_hi_reels', 1.05, 0.85, M),
      voice('mukul_hi_ads', 1.0, 0.85, M),
      voice('ratan_hi_latenight_warm', 0.95, 0.8, M),
    ],
    women: [
      voice('sanchita_hi_romantic', 1.0, 0.85, F),
      voice('ritu_hi_ads_informal', 1.0, 0.85, F),
      voice('simran_hi_social_excited', 1.0, 0.85, F),
      voice('ritu_hi_social_lively', 1.0, 0.85, F),
      voice('ishita_hi_ads', 1.0, 0.8, F),
    ],
    kids: [voice('chhavi_hi_kids', 1.05, 0.8, F), voice('kunal_hi_kids', 1.05, 0.8, M)],
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
  // Every live Tamil voice is masculine, so Tamil stories have male characters
  storyPool: {
    narrators: [voice('vijay_ta_narration', 0.95, 0.7, M), voice('gokul_ta_narration', 0.95, 0.75, M)],
    spookyNarrators: [voice('aravind_ta_suspense', 0.9, 0.75, M), voice('vijay_ta_narration', 0.92, 0.7, M)],
    men: [
      voice('aravind_ta_suspense', 0.9, 0.8, M),
      voice('gokul_ta_narration', 1.05, 0.9, M),
      voice('aravind_ta_ads', 1.0, 0.85, M),
      voice('vijay_ta_narration', 1.0, 0.8, M),
    ],
    women: [],
    kids: [voice('aravind_ta_ads', 1.15, 0.9, M)],
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
  storyPool: {
    narrators: [voice('roopa_bn_conversational', 0.95, 0.7, F), voice('arnab_bn_conversation', 0.95, 0.75, M)],
    spookyNarrators: [voice('bimal_bn_suspense', 0.9, 0.75, M)],
    men: [voice('bimal_bn_suspense', 0.9, 0.8, M), voice('arnab_bn_conversation', 1.0, 0.9, M)],
    women: [voice('roopa_bn_conversational', 1.0, 0.9, F)],
    kids: [voice('roopa_bn_conversational', 1.15, 0.9, F)],
  },
};

const marathi: Station = {
  id: 'mr',
  name: 'Tarang Marathi',
  nativeName: 'तरंग मराठी',
  frequency: '94.3',
  language: 'mr-IN',
  languageName: 'Marathi',
  tagline: 'मनातलं, मनापासून',
  accent: '#ec4899',
  newsFeedUrl: newsFeed('mr'),
  sttMode: 'transcribe',
  stationIdText: 'तुम्ही ऐकत आहात तरंग FM 94.3… मनातलं, मनापासून!',
  stationIdEn: "You're listening to Tarang FM 94.3… straight from the heart!",
  cast: {
    station_id: voice('nilesh_mr_conversation', 1.0, 0.7, M),
    rj: voice('ishita_mr_conversational', 1.05, 0.8, F),
    news: voice('neha_mr_narration', 1.0, 0.4, F),
    ad_announcer: voice('nilesh_mr_conversation', 1.1, 0.8, M),
    ad_customer: voice('ritu_mr_insurance', 1.0, 0.8, F),
    narrator: voice('rupali_mr_stories', 0.95, 0.75, F),
    char_a: voice('mukul_mr_stories', 0.9, 0.8, M),
    char_b: voice('soham_mr_narration', 1.0, 0.85, M),
    char_kid: voice('mrunal_mr_narration', 1.1, 0.85, F),
  },
  storyPool: {
    narrators: [
      voice('rupali_mr_stories', 0.95, 0.75, F),
      voice('neha_mr_narration', 0.95, 0.7, F),
      voice('soham_mr_narration', 0.95, 0.75, M),
    ],
    spookyNarrators: [voice('mukul_mr_stories', 0.9, 0.75, M), voice('soham_mr_narration', 0.92, 0.75, M)],
    men: [
      voice('mukul_mr_stories', 0.9, 0.8, M),
      voice('soham_mr_narration', 1.0, 0.85, M),
      voice('nilesh_mr_conversation', 1.0, 0.85, M),
    ],
    women: [
      voice('ishita_mr_conversational', 1.0, 0.85, F),
      voice('ritu_mr_insurance', 1.0, 0.85, F),
      voice('neha_mr_narration', 1.0, 0.8, F),
      voice('rupali_mr_stories', 1.0, 0.8, F),
    ],
    kids: [voice('mrunal_mr_narration', 1.1, 0.85, F)],
  },
};

const gujarati: Station = {
  id: 'gu',
  name: 'Tarang Gujarati',
  nativeName: 'તરંગ ગુજરાતી',
  frequency: '106.1',
  language: 'gu-IN',
  languageName: 'Gujarati',
  tagline: 'દિલથી સાંભળો, દિલની વાત',
  accent: '#a855f7',
  newsFeedUrl: newsFeed('gu'),
  sttMode: 'transcribe',
  stationIdText: 'તમે સાંભળી રહ્યા છો તરંગ FM 106.1… દિલથી સાંભળો, દિલની વાત!',
  stationIdEn: "You're listening to Tarang FM 106.1… listen with your heart!",
  cast: {
    station_id: voice('bhavik_gu_conversation', 1.0, 0.7, M),
    rj: voice('pooja_gu_conversational', 1.05, 0.8, F),
    news: voice('pooja_gu_customer', 1.0, 0.4, F),
    ad_announcer: voice('bhavik_gu_conversation', 1.1, 0.85, M),
    ad_customer: voice('pooja_gu_conversational', 1.0, 0.9, F),
    narrator: voice('pooja_gu_customer', 0.95, 0.7, F),
    char_a: voice('bhavik_gu_conversation', 0.95, 0.8, M),
    char_b: voice('pooja_gu_conversational', 1.05, 0.9, F),
    char_kid: voice('pooja_gu_customer', 1.15, 0.9, F),
  },
  storyPool: {
    narrators: [voice('pooja_gu_customer', 0.95, 0.7, F), voice('bhavik_gu_conversation', 0.95, 0.75, M)],
    men: [voice('bhavik_gu_conversation', 0.95, 0.8, M)],
    women: [voice('pooja_gu_conversational', 1.05, 0.9, F), voice('pooja_gu_customer', 1.0, 0.85, F)],
    kids: [voice('pooja_gu_customer', 1.15, 0.9, F)],
  },
};

/** Stations on the dial, in frequency order. */
export const STATIONS: Station[] = [hindi, marathi, tamil, bangla, gujarati];

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
  STATIONS.flatMap((s) => [...Object.values(s.cast), ...(s.shows ?? []).map((show) => show.rj), ...storyVoices(s)].map((v) => v.speaker)),
);

/** Every voice a station's stories may be cast from. */
export function storyVoices(station: Station): Voice[] {
  const p = station.storyPool;
  return p ? [...p.narrators, ...(p.spookyNarrators ?? []), ...p.men, ...p.women, ...p.kids] : [];
}

/** The show on air at a local hour, if the station runs daypart shows. */
export function showAt(station: Station, hour: number): Show | undefined {
  return station.shows?.find((show) => (show.from < show.to ? hour >= show.from && hour < show.to : hour >= show.from || hour < show.to));
}

/** The RJ voice on air at a local hour (the daypart show's RJ, or the station's default RJ). */
export function rjVoiceAt(station: Station, hour: number): Voice {
  return showAt(station, hour)?.rj ?? station.cast.rj;
}

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
