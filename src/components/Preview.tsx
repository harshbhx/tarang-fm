import { useEffect, useMemo, useRef, useState } from 'react';
import { getStation } from '../../shared/stations';
import type { Role, SegmentType, Source, StationId } from '../../shared/types';
import { INITIAL_STATE, type Caption, type RadioActions, type RadioState } from '../radio/state';
import RadioApp from './RadioApp';

function line(stationId: StationId, role: Role, text: string, en: string): Caption {
  const voice = getStation(stationId).cast[role];
  return { role, speaker: voice.speaker, label: voice.label, text, en };
}

interface ScriptLine {
  type: SegmentType;
  title: string;
  caption: Caption;
  ttfa: number;
  sources?: Source[];
}

const listener = { name: 'Priya', city: 'Pune' };

const taSources: Source[] = [
  { title: 'சென்னையில் இன்று இரவு கனமழைக்கு வாய்ப்பு', url: 'https://news.google.com/?mock=1', source: 'Sample source' },
  { title: 'மெட்ரோ ரயில் சேவை நேரம் நீட்டிப்பு', url: 'https://news.google.com/?mock=2', source: 'Sample source' },
  { title: 'கோவையில் புதிய தொழில்நுட்பப் பூங்கா திறப்பு', url: 'https://news.google.com/?mock=3', source: 'Sample source' },
];

const SCRIPTS: Record<'hi' | 'ta' | 'bn', ScriptLine[]> = {
  hi: [
    { type: 'station_id', title: 'Tarang FM 91.1', ttfa: 262, caption: line('hi', 'station_id', 'आप सुन रहे हैं तरंग FM 91.1… दिल से सुनिए, दिल की बात!', "You're listening to Tarang FM 91.1… listen with your heart!") },
    { type: 'rj_link', title: 'शाम की बातें', ttfa: 298, caption: line('hi', 'rj', 'नमस्ते प्रिया! पुणे की इस भीगी शाम में, आपके लिए एक हल्की-सी डरावनी कहानी।', 'Hello Priya! On this rainy Pune evening, a slightly spooky story just for you.') },
    { type: 'kahani', title: 'हवेली वाला रेडियो', ttfa: 241, caption: line('hi', 'narrator', 'बरसात की उस रात, गाँव की पुरानी हवेली से अचानक रेडियो की आवाज़ आने लगी।', "That rainy night, the sound of a radio suddenly drifted out of the village's old mansion.") },
    { type: 'kahani', title: 'हवेली वाला रेडियो', ttfa: 312, caption: line('hi', 'char_kid', 'दादी, हवेली में तो कोई रहता ही नहीं, फिर रेडियो कौन चला रहा है?', 'Grandma, nobody even lives in the mansion, so who is playing the radio?') },
    { type: 'kahani', title: 'हवेली वाला रेडियो', ttfa: 276, caption: line('hi', 'char_b', 'बेटा, कहते हैं वो रेडियो सिर्फ़ उसी रात बजता है, जब कोई अपना घर लौटता है।', 'Child, they say that radio only plays on the night someone dear comes home.') },
    { type: 'kahani', title: 'हवेली वाला रेडियो', ttfa: 284, caption: line('hi', 'char_a', 'दरवाज़ा मत खोलना… आज रात कोई और भी सुन रहा है।', "Don't open the door… someone else is listening tonight.") },
    { type: 'ad_break', title: 'सपनों वाला गद्दा', ttfa: 233, caption: line('hi', 'ad_announcer', 'पेश है नया ‘सपनों वाला गद्दा’! लेटते ही नींद, सोमवार की मीटिंग में भी!', "Presenting the new 'Dream Mattress'! Lie down and you're asleep, even in Monday's meeting!") },
    { type: 'ad_break', title: 'सपनों वाला गद्दा', ttfa: 251, caption: line('hi', 'ad_customer', 'सच में? फिर तो बॉस से कहूँगी, गद्दे ने सुला दिया!', "Really? Then I'll tell my boss the mattress put me to sleep!") },
  ],
  ta: [
    { type: 'station_id', title: 'Tarang FM 98.3', ttfa: 270, caption: line('ta', 'station_id', 'நீங்கள் கேட்டுக் கொண்டிருப்பது தரங் FM 98.3!', "You're listening to Tarang FM 98.3!") },
    { type: 'rj_link', title: 'மாலை வணக்கம்', ttfa: 305, caption: line('ta', 'rj', 'வணக்கம் பிரியா! அடுத்து இன்றைய முக்கியச் செய்திகள், கேட்டுக்கிட்டே இருங்க!', 'Hello Priya! Next up, the top news of the day, keep listening!') },
    { type: 'news', title: 'இன்றைய முக்கியச் செய்திகள்', ttfa: 312, sources: taSources, caption: line('ta', 'news', 'சென்னையில் இன்று இரவு கனமழை பெய்யக்கூடும் என வானிலை மையம் தெரிவித்துள்ளது.', 'The weather centre says heavy rain is likely in Chennai tonight.') },
    { type: 'news', title: 'இன்றைய முக்கியச் செய்திகள்', ttfa: 288, sources: taSources, caption: line('ta', 'news', 'மெட்ரோ ரயில் சேவை நாளை முதல் இரவு 11 மணி வரை நீட்டிக்கப்படுகிறது.', 'From tomorrow, metro rail service will run until 11 pm.') },
    { type: 'kahani', title: 'கடற்கரை ரகசியம்', ttfa: 264, caption: line('ta', 'narrator', 'அந்த இரவு கடற்கரையில் ஒரு பழைய ரேடியோ தானாகவே ஒலிக்கத் தொடங்கியது.', 'That night on the beach, an old radio started playing all by itself.') },
    { type: 'kahani', title: 'கடற்கரை ரகசியம்', ttfa: 279, caption: line('ta', 'char_a', 'யாரும் இல்லை… ஆனால் யாரோ நம்மைக் கேட்டுக்கொண்டிருக்கிறார்கள்.', "There's no one here… yet someone is listening to us.") },
  ],
  bn: [
    { type: 'station_id', title: 'Tarang FM 102.7', ttfa: 255, caption: line('bn', 'station_id', 'আপনি শুনছেন তরঙ্গ FM 102.7… মনের কথা, মনের সুরে!', "You're listening to Tarang FM 102.7… words from the heart!") },
    { type: 'ad_break', title: 'ঘুমপাড়ানি বালিশ', ttfa: 241, caption: line('bn', 'ad_announcer', 'আসছে নতুন ‘ঘুমপাড়ানি বালিশ’! মাথা রাখলেই ঘুম, অফিসের মিটিংয়েও!', "Introducing the new 'Lullaby Pillow'! Rest your head and you're asleep, even in office meetings!") },
    { type: 'ad_break', title: 'ঘুমপাড়ানি বালিশ', ttfa: 268, caption: line('bn', 'ad_customer', 'সত্যি? তাহলে বস কিছু বললে বলব, বালিশটাই দায়ী!', "Really? Then if my boss says anything, I'll blame the pillow!") },
    { type: 'kahani', title: 'নদীর ধারের বাড়ি', ttfa: 290, caption: line('bn', 'narrator', 'সেই রাতে নদীর ধারের পুরনো বাড়ি থেকে হঠাৎ রেডিওর আওয়াজ ভেসে এল।', 'That night, the sound of a radio suddenly drifted from the old house by the river.') },
    { type: 'kahani', title: 'নদীর ধারের বাড়ি', ttfa: 302, caption: line('bn', 'char_a', 'দরজা খুলো না… আজ রাতে আর কেউও শুনছে।', "Don't open the door… someone else is listening tonight.") },
  ],
};

function liveState(stationId: 'hi' | 'ta' | 'bn', index: number): RadioState {
  const script = SCRIPTS[stationId];
  const at = (i: number) => script[((i % script.length) + script.length) % script.length];
  const current = at(index);
  const history: Caption[] = [];
  for (let i = Math.max(0, index - 6); i < index; i++) history.push(at(i).caption);
  let upNext: SegmentType | undefined;
  for (let i = 1; i < script.length; i++) {
    if (at(index + i).type !== current.type) {
      upNext = at(index + i).type;
      break;
    }
  }
  return {
    ...INITIAL_STATE,
    status: 'playing',
    stationId,
    listener,
    segment: { id: `${stationId}-${current.type}-${current.title}`, type: current.type, title: current.title, sources: current.sources },
    lineIndex: index,
    history,
    caption: current.caption,
    ttfaMs: current.ttfa,
    upNext,
  };
}

const callTranscript = 'हाय सनी! मैं प्रिया, पुणे से बोल रही हूँ। आज मेरी मम्मी का बर्थडे है, उन्हें विश कर दो ना!';
const callTranscriptEn = "Hi Sunny! It's Priya, calling from Pune. It's my mom's birthday today, please wish her!";
const callReply = 'अरे वाह प्रिया! पुणे से ढेर सारा प्यार। मम्मी जी, जन्मदिन बहुत-बहुत मुबारक हो, अगली कहानी आपके नाम!';
const callReplyEn = 'Wow, Priya! Lots of love from Pune. Happy birthday, Mom, the next story is for you!';

type MockKey = 'idle' | 'tuning' | 'hi' | 'ta' | 'bn' | 'paused' | 'recording' | 'thinking' | 'onair' | 'error';

const MOCK_LABELS: { key: MockKey; label: string }[] = [
  { key: 'idle', label: 'Idle' },
  { key: 'tuning', label: 'Tuning' },
  { key: 'hi', label: 'Hindi show' },
  { key: 'ta', label: 'Tamil news' },
  { key: 'bn', label: 'Bangla ad' },
  { key: 'paused', label: 'Paused' },
  { key: 'recording', label: 'Call recording' },
  { key: 'thinking', label: 'Call thinking' },
  { key: 'onair', label: 'Call on air' },
  { key: 'error', label: 'Error' },
];

const LIVE_KEYS: MockKey[] = ['hi', 'ta', 'bn'];

function buildState(key: MockKey, station: 'hi' | 'ta' | 'bn', index: number): RadioState {
  const live = liveState(station, index);
  switch (key) {
    case 'idle':
      return { ...INITIAL_STATE, stationId: station };
    case 'tuning':
      return { ...INITIAL_STATE, status: 'tuning', stationId: station, listener };
    case 'hi':
    case 'ta':
    case 'bn':
      return live;
    case 'paused':
      return { ...live, status: 'paused' };
    case 'recording':
      return { ...liveState('hi', 5), status: 'call_recording', call: {} };
    case 'thinking':
      return { ...liveState('hi', 5), status: 'call_thinking', call: {} };
    case 'onair':
      return {
        ...liveState('hi', 5),
        status: 'call_on_air',
        call: { transcript: callTranscript, transcriptEn: callTranscriptEn, reply: callReply, replyEn: callReplyEn },
        caption: line('hi', 'rj', callReply, callReplyEn),
        ttfaMs: 356,
      };
    case 'error':
      return { ...live, status: 'error', error: 'Could not load the next segment (network error).' };
  }
}

/** A stand-in analyser that produces a voice-like spectrum, so the glow and visualizer move in review. */
function fakeAnalyser(isSpeaking: () => boolean): AnalyserNode {
  const fake = {
    fftSize: 256,
    frequencyBinCount: 128,
    getByteFrequencyData(out: Uint8Array) {
      const t = performance.now() / 1000;
      const speaking = isSpeaking();
      const syllables = Math.max(0, Math.sin(t * Math.PI * 2 * 3.1) * 0.5 + 0.5) * (0.55 + 0.45 * Math.sin(t * 1.7));
      for (let i = 0; i < out.length; i++) {
        const shape = Math.exp(-i / 22) * (0.8 + 0.2 * Math.sin(i * 0.9 + t * 9));
        const v = speaking ? (0.25 + 0.75 * syllables) * shape + Math.random() * 0.08 : 0;
        out[i] = Math.max(0, Math.min(255, Math.round(v * 255)));
      }
    },
  };
  return fake as unknown as AnalyserNode;
}

/** Design review harness: RadioApp driven by mock states and a fake analyser, no audio or network. */
export default function Preview() {
  const [key, setKey] = useState<MockKey>('hi');
  const [station, setStation] = useState<'hi' | 'ta' | 'bn'>('hi');
  const [index, setIndex] = useState(3);
  const [autoplay, setAutoplay] = useState(true);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const keyRef = useRef(key);
  const stationRef = useRef(station);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    keyRef.current = key;
    stationRef.current = station;
  });

  useEffect(() => {
    if (!autoplay || !LIVE_KEYS.includes(key)) return;
    const timer = window.setInterval(() => setIndex((i) => i + 1), 4200);
    return () => window.clearInterval(timer);
  }, [autoplay, key]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const state: RadioState = { ...buildState(key, station, index), showSubtitles };

  const actions = useMemo<RadioActions>(() => {
    const later = (ms: number, fn: () => void) => {
      timers.current.push(window.setTimeout(fn, ms));
    };
    const goLive = (id: 'hi' | 'ta' | 'bn') => {
      setStation(id);
      setKey('tuning');
      later(1600, () => {
        setIndex(1);
        setKey(id);
      });
    };
    return {
      tuneIn: async () => goLive(stationRef.current),
      pause: () => setKey('paused'),
      resume: () => setKey(stationRef.current),
      setStation: (id) => {
        const next = id === 'ta' || id === 'bn' ? id : 'hi';
        if (keyRef.current === 'idle') setStation(next);
        else goLive(next);
      },
      startCall: async () => setKey('recording'),
      endCall: async () => {
        setKey('thinking');
        later(2200, () => setKey('onair'));
      },
      cancelCall: () => setKey(stationRef.current),
      setListenerName: () => undefined,
      toggleSubtitles: () => setShowSubtitles((on) => !on),
      getMicLevel: () => {
        const t = performance.now() / 1000;
        return Math.max(0, 0.42 + 0.38 * Math.sin(t * 7.3) * Math.sin(t * 2.1) + (Math.random() - 0.5) * 0.18);
      },
      getAnalyser: () => null,
    };
  }, []);

  const analyser = useMemo(
    () => fakeAnalyser(() => LIVE_KEYS.includes(keyRef.current) || keyRef.current === 'onair'),
    [],
  );
  const reviewActions = useMemo<RadioActions>(() => ({ ...actions, getAnalyser: () => analyser }), [actions, analyser]);

  return (
    <>
      <nav aria-label="Preview states" className="border-line border-b bg-black">
        <div className="mx-auto flex max-w-5xl items-center gap-2 overflow-x-auto px-4 py-2 sm:px-6">
          <span className="text-fg-3 shrink-0 pr-1 font-mono text-xs">UI preview</span>
          {MOCK_LABELS.map((mock) => (
            <button
              key={mock.key}
              type="button"
              className="pill"
              aria-pressed={mock.key === key}
              onClick={() => {
                if (mock.key === 'hi' || mock.key === 'ta' || mock.key === 'bn') setStation(mock.key);
                setKey(mock.key);
              }}
            >
              {mock.label}
            </button>
          ))}
          <button type="button" className="pill" aria-pressed={autoplay} onClick={() => setAutoplay((on) => !on)}>
            Auto-advance lines
          </button>
        </div>
      </nav>
      <RadioApp state={state} actions={reviewActions} />
    </>
  );
}
