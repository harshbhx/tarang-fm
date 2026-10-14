import { getStation, ROLES, STATIONS } from '../../shared/stations';
import type { PhoneCall, Role, Source, Station, StationId } from '../../shared/types';
import { STUDIO_NUMBER_DISPLAY } from '../../shared/constants';

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
    en: "Namaste, friends! I’m RJ Sunny, and today’s show is just for you.",
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
    en: "Don’t open the door… whoever is standing outside knows your name.",
  },
  sanchita_hi_romantic: {
    text: 'तुम आए, तो लगा जैसे बारिश भी बस तुम्हारा ही इंतज़ार कर रही थी।',
    en: 'When you came, it felt like even the rain had been waiting just for you.',
  },
  chhavi_hi_kids: {
    text: 'दीदी, दीदी! मैंने छत पर एक उड़ने वाला हाथी देखा!',
    en: 'Didi, didi! I saw a flying elephant on the roof!',
  },
  nilesh_mr_conversation: {
    text: 'तरंग FM 94.3! इथे प्रत्येक आवाजाला स्वतःची एक गोष्ट आहे!',
    en: 'Tarang FM 94.3! Here every voice has a story of its own!',
  },
  ishita_mr_conversational: {
    text: 'नमस्कार मंडळी! मी तुमची RJ इशिता, आजचा शो खास तुमच्यासाठी!',
    en: "Namaskar, everyone! I’m your RJ Ishita, and today’s show is just for you!",
  },
  neha_mr_narration: {
    text: 'आता वेळ आहे ताज्या बातम्यांची. आजच्या महत्त्वाच्या घडामोडी, सर्वात आधी.',
    en: "Time for the latest news. Today’s big stories, first.",
  },
  ritu_mr_insurance: {
    text: 'खरं सांगू? आधी मी खूप काळजी करायचे, आता मी निवांत झोपते!',
    en: 'Honestly? I used to worry so much. Now I sleep like a baby!',
  },
  rupali_mr_stories: {
    text: 'खूप वर्षांपूर्वी, कोकणातल्या एका छोट्या गावात एक जुना वाडा होता.',
    en: 'Long ago, in a little Konkan village, there stood an old mansion.',
  },
  mukul_mr_stories: {
    text: 'दार उघडू नकोस… बाहेर जो उभा आहे, त्याला तुझं नाव माहीत आहे.',
    en: "Don’t open the door… whoever is standing outside knows your name.",
  },
  soham_mr_narration: {
    text: 'मी परत येईन, असं वचन दिलं होतं. आणि बघ, आज मी आलोय.',
    en: 'I promised I would come back. And look, today I am here.',
  },
  mrunal_mr_narration: {
    text: 'आई, आई! मी गच्चीवर एक उडणारा हत्ती पाहिला!',
    en: 'Aai, aai! I saw a flying elephant on the terrace!',
  },
  bhavik_gu_conversation: {
    text: 'તરંગ FM 106.1! અહીં દરેક અવાજની પોતાની એક વાર્તા છે!',
    en: 'Tarang FM 106.1! Here every voice has a story of its own!',
  },
  pooja_gu_conversational: {
    text: 'કેમ છો મિત્રો! હું છું તમારી RJ પૂજા, અને આજનો શો ફક્ત તમારા માટે!',
    en: "Kem cho, friends! I’m your RJ Pooja, and today’s show is just for you!",
  },
  pooja_gu_customer: {
    text: 'હવે સમય છે તાજા સમાચારનો. આજની મોટી હેડલાઇન્સ, સૌથી પહેલાં.',
    en: "Time for the latest news. Today’s big headlines, first.",
  },
  aravind_ta_ads: {
    text: 'தரங் FM 98.3! ஒவ்வொரு குரலுக்கும் ஒரு கதை உண்டு!',
    en: 'Tarang FM 98.3! Every voice has a story!',
  },
  gokul_ta_narration: {
    text: 'வணக்கம் நண்பர்களே! நான் உங்கள் RJ கோகுல், இன்றைய நிகழ்ச்சி உங்களுக்காக!',
    en: "Vanakkam, friends! I’m your RJ Gokul, and today’s show is for you!",
  },
  vijay_ta_narration: {
    text: 'இப்போது முக்கியச் செய்திகள். இன்றைய தலைப்புச் செய்திகளைக் கேளுங்கள்.',
    en: "Now, the main news. Here are today’s headlines.",
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
    en: "Shh! Can you hear that? Someone’s footsteps on the stairs…",
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
  mr: 'Straight from the heart',
  gu: 'Listen with your heart',
};

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** "five", for copy that should follow the dial as stations are added. */
export const STATION_COUNT_WORD = NUMBER_WORDS[STATIONS.length] ?? String(STATIONS.length);

const hindi = getStation('hi');

/** The persona that voices a station's jingle: the hero radio plays it as a sample. */
export function stationIdVoice(id: StationId): CastVoice {
  const group = VOICE_GROUPS.find((g) => g.station.id === id) ?? VOICE_GROUPS[0];
  const speaker = group.station.cast.station_id.speaker;
  const voice = group.voices.find((v) => v.speaker === speaker) ?? group.voices[0];
  return { ...voice, line: { text: group.station.stationIdText, en: group.station.stationIdEn } };
}

export const CALL_EXAMPLE = {
  caller: {
    text: 'आज मम्मी का birthday है, उनके लिए कुछ special बोल दो ना!',
    en: "It’s Mom’s birthday today. Please say something special for her!",
  },
  reply: {
    text: 'अरे वाह! मम्मी जी, जन्मदिन की ढेर सारी बधाई! आज का पूरा शो आपके नाम।',
    en: "Oh wow! Mummy ji, a very happy birthday! Today’s whole show is for you.",
  },
  voice: hindi.cast.rj,
  station: hindi,
};

export const GITHUB_URL = 'https://github.com/harshbhx/tarang-fm';

export interface ChainStep {
  key: string;
  title: string;
  body: string;
  model?: string;
}

/** The call-in loop, in order. */
export const CALL_CHAIN: ChainStep[] = [
  { key: 'you', title: 'You', body: 'Hold Call RJ and talk, up to 15 s.' },
  { key: 'stt', title: 'Saaras v4', body: 'Hears you. Hinglish stays Hinglish.', model: 'saaras:v4' },
  { key: 'llm', title: 'Sarvam-105B', body: 'Writes the RJ’s reply.', model: 'sarvam-105b' },
  { key: 'tts', title: 'Bulbul v4 Flash', body: 'Speaks it on air, streamed.', model: 'bulbul:v4-flash' },
];

export interface ModelRow {
  name: string;
  id: string;
  job: string;
}

/** The supporting models behind Bulbul. */
export const MODELS: ModelRow[] = [
  { name: 'Sarvam-105B', id: 'sarvam-105b', job: 'Writes every script, call-in reply and English subtitle' },
  { name: 'Saaras v4', id: 'saaras:v4', job: 'Transcribes callers, code-mixed or native' },
  { name: 'Sarvam Transliterate', id: 'transliterate', job: 'Writes listener and caller names in each script' },
];

/** One spoken line in the story, cast from the Hindi station's voices. */
export interface StoryLine {
  speaker: string;
  name: string;
  style: string;
  text: string;
  en: string;
  pace: number;
  temperature: number;
}

export type StoryLamp = 'id' | 'rj' | 'news' | 'ad' | 'kahani' | 'call' | 'phone';

/** One beat of "an evening on Tarang FM": what you read on the left, what the on-air stage shows on the right. */
export interface StoryBeat {
  key: string;
  lamp: StoryLamp;
  clock: string;
  kicker: string;
  title: string;
  body: string;
  lines: StoryLine[];
  /** What the caller said (call-in beat) */
  caller?: SampleLine;
  /** The studio-line card the RJ is reading from (phone beat) */
  studio?: { name: string; city: string; number: string; type: string; live?: boolean };
  /** Live headlines shown on the stage (news beat) */
  headlines?: Source[];
  city?: string;
}

export const STORY_LAMPS: { key: StoryLamp; label: string }[] = [
  { key: 'id', label: 'ID' },
  { key: 'rj', label: 'RJ' },
  { key: 'news', label: 'News' },
  { key: 'ad', label: 'Ad' },
  { key: 'kahani', label: 'Kahani' },
  { key: 'call', label: 'Call' },
  { key: 'phone', label: 'Studio' },
];

function castLine(role: Role, text: string, en: string): StoryLine {
  const v = hindi.cast[role];
  const [name, , ...style] = v.speaker.split('_');
  return { speaker: v.speaker, name: capitalize(name), style: style.join(' '), text, en, pace: v.pace, temperature: v.temperature };
}

/** The RJ's greeting, with the listener's saved name when there is one. */
export function greetingLine(name?: string): StoryLine {
  const who = name?.trim() || 'दोस्तों';
  return castLine(
    'rj',
    `नमस्ते ${who}! शाम के सात बज चुके हैं, आपके शहर में हल्की ठंडी हवा है… चलिए, आज का शो शुरू करते हैं।`,
    `Namaste, ${name?.trim() || 'friends'}! It’s just past seven, there’s a cool breeze in your city… let’s start tonight’s show.`,
  );
}

export const STORY_BEATS: StoryBeat[] = [
  {
    key: 'id',
    lamp: 'id',
    clock: '7:00 PM',
    kicker: 'Station ID',
    title: 'You tune in.',
    body: 'A sting rings out, synthesized in your browser, and the station announces itself in your language. Nothing is pre-recorded: every word tonight is written and voiced the moment you arrive.',
    lines: [castLine('station_id', hindi.stationIdText, hindi.stationIdEn)],
  },
  {
    key: 'rj',
    lamp: 'rj',
    clock: '7:01 PM',
    kicker: 'RJ link',
    title: 'The RJ knows your name.',
    body: 'RJ Sunny greets you by name and city, with the weather outside your window, then teases what’s coming up. Your name comes up once in a while, the way a real host would use it, never every link.',
    lines: [greetingLine()],
  },
  {
    key: 'news',
    lamp: 'news',
    clock: '7:04 PM',
    kicker: 'News',
    title: 'The news from your city.',
    body: 'Real headlines, pulled live from BBC, Bing News and Google News, with two from your own city when you are in India. Read in your language by a newsreader’s voice, grim stories left out.',
    lines: [castLine('news', 'अब समय है ताज़ा खबरों का। आपके शहर और देश की बड़ी सुर्खियाँ, सबसे पहले तरंग पर।', 'Time for the latest news. The big headlines from your city and the country, first on Tarang.')],
  },
  {
    key: 'ad',
    lamp: 'ad',
    clock: '7:07 PM',
    kicker: 'Ad break',
    title: 'An ad that makes you laugh.',
    body: 'A gloriously silly desi product, an announcer who believes in it completely, and one very happy customer. Two voices, one joke, never the same product twice on a station.',
    lines: [
      castLine('ad_announcer', 'पेश है चटपटा चूरन 3000! एक चम्मच, और बोरिंग मीटिंग भी मज़ेदार!', 'Presenting Chatpata Churan 3000! One spoonful, and even boring meetings are fun!'),
      castLine('ad_customer', 'सच बताऊँ? पहले मैं मीटिंग में सो जाती थी, अब सबसे आगे बैठती हूँ!', 'Honestly? I used to nod off in meetings. Now I sit right up front!'),
    ],
  },
  {
    key: 'kahani',
    lamp: 'kahani',
    clock: '7:10 PM',
    kicker: 'Kahani Corner',
    title: 'A story drops you straight in.',
    body: 'A short radio drama with a narrator, a full cast and a twist. It opens on the first line of the scene, no “today’s story is about…”, and the station remembers every tale it has told, so none comes back.',
    lines: [castLine('narrator', 'उस रात पूरी हवेली सो चुकी थी… सिवाय एक जलती हुई लालटेन के।', 'That night the whole haveli was asleep… except for one burning lantern.')],
  },
  {
    key: 'call',
    lamp: 'call',
    clock: '7:16 PM',
    kicker: 'Call-in',
    title: 'You call in. The RJ answers.',
    body: 'Hold the button and speak, Hinglish and all. Saaras v4 hears you, Sarvam-105B writes the reply, and Bulbul says it on air about two seconds later. Ask for a story and the next Kahani is yours.',
    caller: CALL_EXAMPLE.caller,
    lines: [castLine('rj', CALL_EXAMPLE.reply.text, CALL_EXAMPLE.reply.en)],
  },
  {
    key: 'phone',
    lamp: 'phone',
    clock: '7:19 PM',
    kicker: 'Studio line',
    title: 'Someone rings the studio.',
    body: `A real phone line, ${STUDIO_NUMBER_DISPLAY}. RJ Sunny picks up from any phone, no app, no internet, and within a minute the dedication is on the website and on its way to air. Every call is read once, for every listener.`,
    studio: { name: 'Priya', city: 'Vadodara', number: '+91 ••••• 4148', type: 'Dedication' },
    lines: [
      castLine(
        'rj',
        'और अभी-अभी studio line पर Vadodara से Priya का फ़ोन आया। Priya कहती हैं: मम्मी को जन्मदिन की ढेर सारी बधाई! मम्मी जी, आज का पूरा शो आपके नाम।',
        'And just now Priya called the studio line from Vadodara. Priya says: a very happy birthday to Mummy! Mummy ji, tonight’s whole show is for you.',
      ),
    ],
  },
];

/** The sign-off, revealed word by word on the way to the last Tune in. */
export const MANIFESTO =
  'Radio was always one voice, talking to everyone. Tonight it knows your name, speaks your language, and answers when you call.';
export const MANIFESTO_ACCENT = ['name', 'language', 'answers'];

/** The stories a listener can pick on the Kahani beat: each opens in a different voice from the cast. */
export const KAHANI_THEMES: { key: string; label: string; labelEn: string; role: Role; text: string; en: string }[] = [
  {
    key: 'haveli',
    label: 'भूतिया हवेली',
    labelEn: 'Haunted haveli',
    role: 'narrator',
    text: 'उस रात पूरी हवेली सो चुकी थी… सिवाय एक जलती हुई लालटेन के।',
    en: 'That night the whole haveli was asleep… except for one burning lantern.',
  },
  {
    key: 'monsoon',
    label: 'मानसून की मोहब्बत',
    labelEn: 'Monsoon romance',
    role: 'char_b',
    text: 'बारिश की पहली बूँद गिरी, और छत पर खड़ी मीरा ने सोचा… आज वो ज़रूर आएगा।',
    en: 'The first raindrop fell, and Meera, standing on the terrace, thought… today he will surely come.',
  },
  {
    key: 'elephant',
    label: 'उड़ने वाला हाथी',
    labelEn: 'A flying elephant',
    role: 'char_kid',
    text: 'दीदी, दीदी! मैंने छत पर एक उड़ने वाला हाथी देखा! सच्ची, उसके कान पतंग जैसे थे!',
    en: 'Didi, didi! I saw a flying elephant on the roof! Honestly, its ears were like kites!',
  },
];

export function kahaniLine(theme: (typeof KAHANI_THEMES)[number]): StoryLine {
  return castLine(theme.role, theme.text, theme.en);
}

const squeeze = (text: string, max: number) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}…` : clean;
};

/** The news beat read with a real headline from right now (the static line when there is none). */
export function newsLine(city: string | undefined, headline: Source | undefined): StoryLine {
  if (!headline) return STORY_BEATS.find((b) => b.key === 'news')!.lines[0];
  const title = squeeze(headline.title, 110);
  const where = city?.trim();
  return castLine(
    'news',
    `अब समय है ताज़ा खबरों का। ${where ? `${where} और देश की` : 'देश की'} बड़ी सुर्खियाँ, सबसे पहले तरंग पर। आज की एक बड़ी खबर: ${title}`,
    `Time for the latest news. The big headlines from ${where ? `${where} and ` : ''}the country, first on Tarang. One big story today: ${title}`,
  );
}

/** The studio beat read from a real call on the line (number already masked by the Worker). */
export function studioLine(call: Pick<PhoneCall, 'name' | 'city' | 'message'>): StoryLine {
  const name = call.name?.trim();
  const city = call.city?.trim();
  const message = squeeze(call.message, 140);
  return castLine(
    'rj',
    `और अभी-अभी studio line पर ${city ? `${city} से ` : ''}${name || 'एक श्रोता'} का फ़ोन आया। संदेश है: ${message}`,
    `And just now ${name || 'a listener'} called the studio line${city ? ` from ${city}` : ''}. The message: ${message}`,
  );
}

export const CALL_TYPE_LABEL: Record<string, string> = {
  dedication: 'Dedication',
  story_request: 'Story request',
  news_request: 'News request',
  chat: 'Just a chat',
};
