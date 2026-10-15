import { useEffect, useMemo, useRef, useState } from 'react';
import { getStation } from '../../../shared/stations';
import { LIVE_ENDED_NOTE, LIVE_OFF_AIR_NOTE, type LiveLine, type LiveListener } from '../../../shared/live';
import type { Role, SegmentType, StationId } from '../../../shared/types';
import type { LiveActions, LiveViewState } from '../types';
import LiveView from './LiveView';

const T0 = Date.now();
const minutesAgo = (m: number) => T0 - m * 60_000;

const YOU: LiveListener = { id: 'you', name: 'Priya', city: 'Pune', joinedAt: minutesAgo(0) };
const OTHERS: LiveListener[] = [
  { id: 'l-meera', name: 'Meera', city: 'Jaipur', joinedAt: minutesAgo(0.5) },
  { id: 'l-arjun', name: 'Arjun', city: 'Delhi', joinedAt: minutesAgo(0.6) },
  { id: 'l-kabir', name: 'Kabir', joinedAt: minutesAgo(3) },
  { id: 'l-ananya', name: 'Ananya', city: 'Lucknow', joinedAt: minutesAgo(7) },
  { id: 'l-rohan', name: 'Rohan', city: 'Indore', joinedAt: minutesAgo(12) },
  { id: 'l-sana', name: 'Sana', joinedAt: minutesAgo(18) },
  { id: 'l-dost', name: 'दोस्त', joinedAt: minutesAgo(25) },
  { id: 'l-vikram', name: 'Vikram', city: 'Bhopal', joinedAt: minutesAgo(31) },
];
const NEWCOMERS = ['Ishaan', 'Zoya', 'Aditya', 'Neha', 'Farhan', 'Tara'];

interface MockLine {
  segmentId: string;
  type: SegmentType;
  title: string;
  role: Role;
  text: string;
  en: string;
  welcome?: string[];
}

const HI_SCRIPT: MockLine[] = [
  { segmentId: 'seg-rj', type: 'rj_link', title: 'शाम की बातें', role: 'rj', text: 'नमस्ते दोस्तों! तरंग FM पर आप सब एक साथ सुन रहे हैं, और ये शाम अब और भी मज़ेदार होने वाली है।', en: "Hello friends! You're all listening together on Tarang FM, and this evening is about to get even more fun." },
  { segmentId: 'seg-hello-1', type: 'rj_link', title: 'आपका स्वागत है', role: 'rj', text: 'अरे वाह, पुणे से प्रिया जी हमारे साथ जुड़ी हैं! प्रिया, तरंग परिवार में आपका दिल से स्वागत है।', en: 'Oh wow, Priya from Pune has joined us! Priya, a heartfelt welcome to the Tarang family.', welcome: ['you'] },
  { segmentId: 'seg-hello-2', type: 'rj_link', title: 'आपका स्वागत है', role: 'rj', text: 'और जयपुर से मीरा और दिल्ली से अर्जुन, आप दोनों का भी बहुत-बहुत स्वागत है!', en: 'And Meera from Jaipur and Arjun from Delhi, a big welcome to you both too!', welcome: ['l-meera', 'l-arjun'] },
  { segmentId: 'seg-news', type: 'news', title: 'आज की बड़ी ख़बरें', role: 'news', text: 'अब सुनिए आज की बड़ी ख़बरें। दिल्ली में आज शाम हल्की बारिश की संभावना है।', en: "Now, today's top news. Light rain is likely in Delhi this evening." },
  { segmentId: 'seg-news', type: 'news', title: 'आज की बड़ी ख़बरें', role: 'news', text: 'मेट्रो सेवा त्योहारों के दौरान रात 12 बजे तक चलेगी।', en: 'The metro will run until midnight during the festival season.' },
  { segmentId: 'seg-kahani', type: 'kahani', title: 'हवेली वाला रेडियो', role: 'narrator', text: 'बरसात की उस रात, गाँव की पुरानी हवेली से अचानक रेडियो की आवाज़ आने लगी।', en: "That rainy night, the sound of a radio suddenly drifted out of the village's old mansion." },
  { segmentId: 'seg-kahani', type: 'kahani', title: 'हवेली वाला रेडियो', role: 'char_kid', text: 'दादी, हवेली में तो कोई रहता ही नहीं, फिर रेडियो कौन चला रहा है?', en: 'Grandma, nobody even lives in the mansion, so who is playing the radio?' },
];

function scriptFor(station: StationId): MockLine[] {
  if (station === 'hi') return HI_SCRIPT;
  const s = getStation(station);
  return [{ segmentId: 'seg-id', type: 'station_id', title: `Tarang FM ${s.frequency}`, role: 'station_id', text: s.stationIdText, en: s.stationIdEn }];
}

function toLine(station: StationId, mock: MockLine, i: number): LiveLine {
  const voice = getStation(station).cast[mock.role];
  return {
    id: `${station}-${i}`,
    segmentId: mock.segmentId,
    type: mock.type,
    title: mock.title,
    line: { role: mock.role, speaker: voice.speaker, text: mock.text, en: mock.en, pace: voice.pace, temperature: voice.temperature, pauseAfterMs: 400 },
    startAt: T0 + i * 4200,
    durationMs: 3800,
    welcome: mock.welcome,
  };
}

/** Line `index` on air (skipping welcome lines unless asked) and the four after it. */
function timeline(station: StationId, index: number, withWelcomes: boolean): { current: LiveLine; upcoming: LiveLine[] } {
  const script = scriptFor(station)
    .map((mock, i) => ({ mock, i }))
    .filter(({ mock }) => withWelcomes || !mock.welcome);
  const at = (n: number) => {
    const { mock, i } = script[((n % script.length) + script.length) % script.length];
    return toLine(station, mock, i + Math.floor(n / script.length) * 100);
  };
  return { current: at(index), upcoming: [1, 2, 3, 4].map((n) => at(index + n)) };
}

type MockKey =
  | 'idle'
  | 'idle_count'
  | 'idle_off_air'
  | 'connecting'
  | 'warming_up'
  | 'on_air'
  | 'hello_next'
  | 'welcoming_you'
  | 'welcoming_other'
  | 'welcomed'
  | 'muted'
  | 'reconnecting'
  | 'sleeping'
  | 'off_air'
  | 'ended'
  | 'offline'
  | 'error';

const MOCK_LABELS: { key: MockKey; label: string }[] = [
  { key: 'idle', label: 'Name entry' },
  { key: 'idle_count', label: 'Name entry, 9 listening' },
  { key: 'idle_off_air', label: 'Name entry, off air' },
  { key: 'connecting', label: 'Connecting' },
  { key: 'warming_up', label: 'Warming up' },
  { key: 'hello_next', label: 'Hello up next' },
  { key: 'welcoming_you', label: 'Welcoming you' },
  { key: 'welcoming_other', label: 'Welcoming others' },
  { key: 'welcomed', label: 'On air' },
  { key: 'muted', label: 'Muted' },
  { key: 'reconnecting', label: 'Reconnecting' },
  { key: 'sleeping', label: 'Sleeping' },
  { key: 'off_air', label: 'Off air' },
  { key: 'ended', label: 'Show ended' },
  { key: 'offline', label: 'Offline' },
  { key: 'error', label: 'Error' },
];

const ADVANCING: MockKey[] = ['on_air', 'welcomed', 'muted', 'reconnecting', 'offline'];

function buildState(key: MockKey, station: StationId, index: number, extra: LiveListener[], muted: boolean): LiveViewState {
  const listeners = [YOU, ...OTHERS, ...extra];
  const base: LiveViewState = {
    station,
    status: 'on_air',
    you: YOU,
    listeners,
    upcoming: [],
    welcomedYou: true,
    welcomingYou: false,
    clockOffsetMs: 0,
    muted,
    enabled: true,
  };
  const air = timeline(station, index, false);
  const hiScript = station === 'hi';
  switch (key) {
    case 'idle':
      return { ...base, status: 'idle', you: undefined, listeners: [], welcomedYou: false, muted: false };
    case 'idle_count':
      return { ...base, status: 'idle', you: undefined, listeners: OTHERS.slice(0, 9), welcomedYou: false, muted: false };
    case 'idle_off_air':
      return { ...base, status: 'idle', you: undefined, listeners: [], welcomedYou: false, muted: false, enabled: false };
    case 'off_air':
      return { ...base, status: 'sleeping', listeners: [YOU, ...OTHERS.slice(0, 2)], welcomedYou: false, enabled: false, note: LIVE_OFF_AIR_NOTE };
    case 'ended':
      return { ...base, status: 'sleeping', listeners: [YOU, ...OTHERS.slice(0, 2)], note: LIVE_ENDED_NOTE };
    case 'connecting':
    case 'sleeping':
      return { ...base, status: key, listeners: key === 'sleeping' ? listeners : [], welcomedYou: false };
    case 'warming_up':
      return { ...base, status: 'warming_up', welcomedYou: false, upcoming: hiScript ? timeline(station, 0, true).upcoming : [] };
    case 'hello_next': {
      const t = timeline(station, 0, true);
      return { ...base, welcomedYou: false, current: t.current, upcoming: t.upcoming };
    }
    case 'welcoming_you': {
      const t = timeline(station, hiScript ? 1 : 0, true);
      return { ...base, welcomedYou: true, welcomingYou: hiScript, current: t.current, upcoming: t.upcoming };
    }
    case 'welcoming_other': {
      const t = timeline(station, hiScript ? 2 : 0, true);
      return { ...base, current: t.current, upcoming: t.upcoming };
    }
    case 'muted':
      return { ...base, ...air, muted: true };
    case 'reconnecting':
      return { ...base, ...air, status: 'reconnecting' };
    case 'error':
      return { ...base, status: 'error', error: 'Lost the connection to the studio.' };
    default:
      return { ...base, ...air };
  }
}

/** A stand-in analyser with a voice-like spectrum, so the glow, VU meters and dial move in review. */
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

/** Design review harness for /live: mock states, a scripted join, no audio or network. */
export default function LivePreview() {
  const [key, setKey] = useState<MockKey>('idle');
  const [station, setStation] = useState<StationId>('hi');
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [extra, setExtra] = useState<LiveListener[]>([]);
  const [autoplay, setAutoplay] = useState(true);
  const keyRef = useRef(key);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    keyRef.current = key;
  });

  useEffect(() => {
    if (!autoplay || !ADVANCING.includes(key)) return;
    const timer = window.setInterval(() => setIndex((i) => i + 1), 4200);
    return () => window.clearInterval(timer);
  }, [autoplay, key]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const state = buildState(key, station, index, extra, muted || key === 'muted');

  const actions = useMemo<LiveActions>(() => {
    const clear = () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
    /** Play a sequence of [delay ms, state] steps */
    const run = (steps: [number, MockKey][]) => {
      clear();
      let at = 0;
      for (const [delay, next] of steps) {
        at += delay;
        timers.current.push(window.setTimeout(() => setKey(next), at));
      }
    };
    return {
      join: async () => {
        setIndex(0);
        run([
          [0, 'connecting'],
          [1200, 'warming_up'],
          [2600, 'hello_next'],
          [4200, 'welcoming_you'],
          [5200, 'welcoming_other'],
          [4200, 'welcomed'],
        ]);
      },
      setStation: (id) => {
        setStation(id);
        if (keyRef.current === 'idle' || keyRef.current === 'idle_count' || keyRef.current === 'idle_off_air') return;
        setIndex(0);
        run([
          [0, 'connecting'],
          [1400, 'welcomed'],
        ]);
      },
      toggleMute: () => setMuted((on) => !on),
      restart: () =>
        run([
          [0, 'warming_up'],
          [2600, 'welcomed'],
        ]),
      leave: () => {
        clear();
        setKey('idle');
      },
    };
  }, []);

  const analyser = useMemo(() => fakeAnalyser(() => ['on_air', 'hello_next', 'welcoming_you', 'welcoming_other', 'welcomed', 'offline'].includes(keyRef.current)), []);
  const getAnalyser = useMemo(() => () => analyser, [analyser]);

  return (
    <>
      <nav aria-label="Preview states" className="border-line relative z-50 border-b bg-black">
        <div className="mx-auto flex max-w-5xl items-center gap-2 overflow-x-auto px-4 py-2 sm:px-6">
          <span className="text-fg-3 shrink-0 pr-1 font-mono text-xs">Live preview</span>
          {MOCK_LABELS.map((mock) => (
            <button
              key={mock.key}
              type="button"
              className="pill"
              aria-pressed={mock.key === key}
              onClick={() => {
                timers.current.forEach((t) => window.clearTimeout(t));
                setKey(mock.key);
              }}
            >
              {mock.label}
            </button>
          ))}
          <button
            type="button"
            className="pill"
            onClick={() =>
              setExtra((list) => [
                ...list,
                { id: `new-${list.length}`, name: NEWCOMERS[list.length % NEWCOMERS.length], joinedAt: Date.now() },
              ])
            }
          >
            Add a listener
          </button>
          <button type="button" className="pill" aria-pressed={autoplay} onClick={() => setAutoplay((on) => !on)}>
            Auto-advance lines
          </button>
        </div>
      </nav>
      <LiveView
        state={state}
        actions={actions}
        getAnalyser={getAnalyser}
        previewOffline={key === 'offline'}
        preJoin={key === 'idle_off_air' ? { offAir: true, listening: 0 } : undefined}
      />
    </>
  );
}
