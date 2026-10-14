import { getStation, ROLES, STATIONS } from '../../shared/stations';
import type { Role, Station, StationId } from '../../shared/types';

export interface SampleLine {
  text: string;
  en: string;
}

export interface CastVoice {
  speaker: string;
  name: string;
  style: string;
  station: Station;
  roles: string;
  pace: number;
  temperature: number;
  line: SampleLine;
}

/** Short lines written for each persona's style (Hindi and Bangla verbs match the voice's gender). */
const SAMPLES: Record<string, SampleLine> = {
  ishita_hi_ads: {
    text: 'तरंग FM 91.1, जहाँ हर आवाज़ की अपनी एक कहानी है!',
    en: 'Tarang FM 91.1, where every voice has a story of its own!',
  },
  sunny_hi_reels: {
    text: 'नमस्ते दोस्तों! मैं हूँ RJ Sunny, और आज का शो सिर्फ़ आपके लिए है।',
    en: "Namaste, friends! I'm RJ Sunny, and today's show is just for you.",
  },
  simran_hi_news_breaking: {
    text: 'अब समय है ताज़ा खबरों का। देश-दुनिया की बड़ी सुर्खियाँ, सबसे पहले।',
    en: 'Time for the latest news. The big headlines from India and the world, first.',
  },
  mukul_hi_ads: {
    text: 'पेश है चटपटा चूरन 3000! एक चम्मच, और बोरिंग मीटिंग भी मज़ेदार!',
    en: 'Presenting Chatpata Churan 3000! One spoonful, and even boring meetings are fun!',
  },
  ritu_hi_ads_informal: {
    text: 'सच बताऊँ? पहले मैं मीटिंग में सो जाती थी, अब सबसे आगे बैठती हूँ!',
    en: 'Honestly? I used to nod off in meetings. Now I sit right up front!',
  },
  shubh_hi_stories_dramatic: {
    text: 'उस रात पूरी हवेली सो चुकी थी… सिवाय एक जलती हुई लालटेन के।',
    en: 'That night the whole haveli was asleep… except for one burning lantern.',
  },
  mukul_hi_suspense: {
    text: 'दरवाज़ा मत खोलना… बाहर जो खड़ा है, वो तुम्हारा नाम जानता है।',
    en: "Don't open the door… whoever is standing outside knows your name.",
  },
  sanchita_hi_romantic: {
    text: 'तुम आए, तो लगा जैसे बारिश भी बस तुम्हारा ही इंतज़ार कर रही थी।',
    en: 'When you came, it felt like even the rain had been waiting just for you.',
  },
  chhavi_hi_kids: {
    text: 'दीदी, दीदी! मैंने छत पर एक उड़ने वाला हाथी देखा!',
    en: 'Didi, didi! I saw a flying elephant on the roof!',
  },
  aravind_ta_ads: {
    text: 'தரங் FM 98.3! ஒவ்வொரு குரலுக்கும் ஒரு கதை உண்டு!',
    en: 'Tarang FM 98.3! Every voice has a story!',
  },
  gokul_ta_narration: {
    text: 'வணக்கம் நண்பர்களே! நான் உங்கள் RJ கோகுல், இன்றைய நிகழ்ச்சி உங்களுக்காக!',
    en: "Vanakkam, friends! I'm your RJ Gokul, and today's show is for you!",
  },
  vijay_ta_narration: {
    text: 'இப்போது முக்கியச் செய்திகள். இன்றைய தலைப்புச் செய்திகளைக் கேளுங்கள்.',
    en: "Now, the main news. Here are today's headlines.",
  },
  aravind_ta_suspense: {
    text: 'அந்த இருட்டு அறையில், யாரோ மெதுவாக நடக்கும் சத்தம் கேட்டது…',
    en: 'In that dark room came the sound of someone walking, slowly…',
  },
  arnab_bn_conversation: {
    text: 'নমস্কার বন্ধুরা! এক কাপ চা নিয়ে বসে পড়ুন, আড্ডা শুরু হচ্ছে।',
    en: 'Namaskar, friends! Grab a cup of tea and settle in, the adda is starting.',
  },
  roopa_bn_conversational: {
    text: 'অনেক দিন আগে, গঙ্গার ধারে ছিল এক ছোট্ট গ্রাম।',
    en: 'Long ago, on the banks of the Ganga, there was a little village.',
  },
  bimal_bn_suspense: {
    text: 'চুপ! শুনতে পাচ্ছ? সিঁড়িতে কার যেন পায়ের শব্দ…',
    en: "Shh! Can you hear that? Someone's footsteps on the stairs…",
  },
};

const ROLE_LABEL: Record<Role, string> = {
  station_id: 'station ID',
  rj: 'RJ',
  news: 'news',
  ad_announcer: 'ad announcer',
  ad_customer: 'ad customer',
  narrator: 'narrator',
  char_a: 'drama',
  char_b: 'drama',
  char_kid: 'kid in the drama',
};

function capitalize(s: string): string {
  return s ? `${s[0].toUpperCase()}${s.slice(1)}` : s;
}

/** Every distinct persona across the dial, grouped by station in dial order. */
export const VOICE_GROUPS: { station: Station; voices: CastVoice[] }[] = STATIONS.map((station) => {
  const bySpeaker = new Map<string, { roles: string[]; pace: number; temperature: number }>();
  for (const role of ROLES) {
    const v = station.cast[role];
    const entry = bySpeaker.get(v.speaker) ?? { roles: [], pace: v.pace, temperature: v.temperature };
    const label = ROLE_LABEL[role];
    if (!entry.roles.includes(label)) entry.roles.push(label);
    bySpeaker.set(v.speaker, entry);
  }
  const voices = [...bySpeaker].map(([speaker, entry]): CastVoice => {
    const [name, , ...style] = speaker.split('_');
    return {
      speaker,
      name: capitalize(name),
      style: style.join(' '),
      station,
      roles: entry.roles.join(', '),
      pace: entry.pace,
      temperature: entry.temperature,
      line: SAMPLES[speaker] ?? { text: station.stationIdText, en: station.stationIdEn },
    };
  });
  return { station, voices };
});

export const VOICE_COUNT = new Set(VOICE_GROUPS.flatMap((g) => g.voices.map((v) => v.speaker))).size;

/** English gloss for each station's tagline. */
export const TAGLINE_EN: Partial<Record<StationId, string>> = {
  hi: 'Dil se suniye, dil ki baat',
  ta: "The heart's frequency",
  bn: "Words from the heart, in the heart's tune",
};

const hindi = getStation('hi');

export interface ProgrammeItem {
  key: string;
  title: string;
  body: string;
  roles: Role[];
  anytime?: boolean;
}

export const PROGRAMME: ProgrammeItem[] = [
  {
    key: 'station_id',
    title: 'Station ID',
    body: 'The spoken jingle, over a sting synthesized live in your browser.',
    roles: ['station_id'],
  },
  {
    key: 'rj',
    title: 'RJ link',
    body: 'Your RJ greets you by name and city, knows the time of day and teases what is coming up.',
    roles: ['rj'],
  },
  {
    key: 'news',
    title: 'News',
    body: "Today's real headlines in your language, rephrased for radio. Sources stay on screen.",
    roles: ['news'],
  },
  {
    key: 'ad',
    title: 'Ad break',
    body: 'A fictional, gloriously silly desi product. One announcer, one very happy customer.',
    roles: ['ad_announcer', 'ad_customer'],
  },
  {
    key: 'kahani',
    title: 'Kahani Corner',
    body: 'A 60 to 90 second radio drama with a narrator, a full cast and a twist.',
    roles: ['narrator', 'char_a', 'char_b', 'char_kid'],
  },
  {
    key: 'call',
    title: 'Call-in',
    body: 'Hold Call RJ and talk. The RJ replies on air, and a story request shapes the next Kahani.',
    roles: ['rj'],
    anytime: true,
  },
];

export function programmeSpeakers(item: ProgrammeItem): string[] {
  return [...new Set(item.roles.map((r) => hindi.cast[r].speaker))];
}

export const CALL_EXAMPLE = {
  caller: {
    text: 'आज मम्मी का birthday है, उनके लिए कुछ special बोल दो ना!',
    en: "It's Mom's birthday today. Please say something special for her!",
  },
  reply: {
    text: 'अरे वाह! मम्मी जी, जन्मदिन की ढेर सारी बधाई! आज का पूरा शो आपके नाम।',
    en: "Oh wow! Mummy ji, a very happy birthday! Today's whole show is for you.",
  },
  voice: hindi.cast.rj,
  station: hindi,
};

export const GITHUB_URL = 'https://github.com/harshbhx/tarang-fm';
