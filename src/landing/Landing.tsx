import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { LazyMotion, MotionConfig, domAnimation, m, useInView, useReducedMotion } from 'motion/react';
import type { AudioEngine } from '../audio';
import { STATIONS } from '../../shared/stations';
import type { StationId } from '../../shared/types';
import {
  CALL_EXAMPLE,
  GITHUB_URL,
  PROGRAMME,
  VOICE_COUNT,
  VOICE_GROUPS,
  programmeSpeakers,
  type CastVoice,
} from './data';
import { GitHubIcon, MicIcon, PlayIcon, RetryIcon, StopIcon, WaveMark } from './icons';
import RadioDial from './RadioDial';
import { useVoicePlayer, type VoicePlayer } from './useVoicePlayer';
import './landing.css';

type Vars = CSSProperties & Record<`--${string}`, string>;

interface LandingProps {
  onTuneIn: (station: StationId) => void;
  /** Optional: reuse the radio's engine instead of creating a second AudioContext. */
  engine?: AudioEngine;
}

export default function Landing({ onTuneIn, engine }: LandingProps) {
  const player = useVoicePlayer(engine);

  const tune = (id: StationId) => {
    player.stop();
    onTuneIn(id);
  };

  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        <div className="lp">
          <div className="lp-room" aria-hidden="true" />
          <header className="lp-wrap lp-top">
            <a className="lp-brand" href="#top" aria-label="Tarang FM, back to top">
              <WaveMark size={22} />
              <span className="lp-brand-name">Tarang FM</span>
              <span className="lp-brand-native" lang="hi">
                तरंग
              </span>
            </a>
            <a className="lp-ghost" href={GITHUB_URL} target="_blank" rel="noreferrer">
              <GitHubIcon size={18} />
              GitHub
            </a>
          </header>

          <main id="top">
            <Hero onTuneIn={tune} />
            <OnAir />
            <Voices player={player} />
            <CallIn player={player} />
            <Sarvam />
            <FinalCta onTuneIn={tune} />
          </main>

          <footer className="lp-foot">
            <div className="lp-wrap lp-foot-inner">
              <p className="lp-foot-lead">
                <WaveMark size={18} />
                Built for the Sarvam Bulbul Build Challenge.
              </p>
              <a className="lp-ghost" href={GITHUB_URL} target="_blank" rel="noreferrer">
                <GitHubIcon size={18} />
                Source on GitHub
              </a>
              <p className="lp-foot-note">Hosts and stories are AI-generated. Headlines via Google News.</p>
            </div>
          </footer>
        </div>
      </LazyMotion>
    </MotionConfig>
  );
}

function TuneButton({ onClick, label = 'Tune in now' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="lp-cta" onClick={onClick}>
      <span className="lp-cta-dot" aria-hidden="true" />
      {label}
    </button>
  );
}

function Hero({ onTuneIn }: { onTuneIn: (id: StationId) => void }) {
  return (
    <section className="lp-wrap lp-hero" aria-labelledby="hero-title">
      <div className="lp-hero-copy">
        <h1 id="hero-title" className="lp-h1">
          AI radio, in your language.
        </h1>
        <p className="lp-lede">
          A live show in Hindi, Tamil or Bangla, hosted, read and acted by {VOICE_COUNT} Sarvam Bulbul v4 Flash
          voices. Call in, and the RJ talks back.
        </p>
        <div className="lp-hero-actions">
          <TuneButton onClick={() => onTuneIn('hi')} />
          <p className="lp-hint">Starts on Hindi 91.1. No install, no login.</p>
        </div>
      </div>
      <div className="lp-hero-visual">
        <RadioDial onTuneIn={onTuneIn} />
        <p className="lp-hint lp-hint--center">Or press a station button to start there.</p>
      </div>
    </section>
  );
}

function SectionHead({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div className="lp-head">
      <h2 id={id} className="lp-h2">
        {title}
      </h2>
      <p className="lp-sub">{children}</p>
    </div>
  );
}

function SpeakerId({ id, accent }: { id: string; accent?: string }) {
  return (
    <code className="lp-id" style={accent ? ({ '--st': accent } as Vars) : undefined}>
      {id}
    </code>
  );
}

function OnAir() {
  const hindi = STATIONS[0];
  return (
    <section className="lp-section" aria-labelledby="onair-title">
      <div className="lp-wrap lp-split">
        <div className="lp-split-side">
          <SectionHead id="onair-title" title="What's on air">
            A full radio hour, written fresh for you. Each segment is voiced by the persona whose style fits the job.
          </SectionHead>
          <p className="lp-note">
            <span className="lp-dot" style={{ '--st': hindi.accent } as Vars} aria-hidden="true" />
            Speaker IDs shown are the Hindi {hindi.frequency} cast.
          </p>
        </div>
        <ol className="lp-rundown">
          {PROGRAMME.map((item, i) => (
            <m.li
              key={item.key}
              className="lp-cue"
              data-anytime={item.anytime ?? false}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.45, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="lp-cue-mark" aria-hidden="true">
                {item.anytime ? <MicIcon size={16} /> : i + 1}
              </span>
              <div className="lp-cue-body">
                <h3 className="lp-h3">
                  {item.title}
                  {item.anytime && <span className="lp-cue-when">Anytime</span>}
                </h3>
                <p>{item.body}</p>
                <div className="lp-ids">
                  {programmeSpeakers(item).map((s) => (
                    <SpeakerId key={s} id={s} />
                  ))}
                </div>
              </div>
            </m.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function LiveBars({ active, analyser }: { active: boolean; analyser: () => AnalyserNode | null }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!active || reduce) return;
    const node = analyser();
    if (!node) return;
    const data = new Uint8Array(node.frequencyBinCount);
    const bands: [number, number][] = [
      [2, 6],
      [6, 14],
      [14, 30],
      [30, 64],
    ];
    let raf = 0;
    const tick = () => {
      node.getByteFrequencyData(data);
      bands.forEach(([a, b], i) => {
        let sum = 0;
        for (let k = a; k < b; k++) sum += data[k];
        const v = Math.min(1, sum / (b - a) / 200);
        const el = bars.current[i];
        if (el) el.style.transform = `scaleY(${0.18 + v * 0.82})`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, reduce, analyser]);

  return (
    <span className="lp-bars" data-active={active} data-static={reduce ?? false} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          ref={(el) => {
            bars.current[i] = el;
          }}
        />
      ))}
    </span>
  );
}

function PlayGlyph({ phase }: { phase: string }) {
  if (phase === 'loading') return <span className="lp-spin" aria-hidden="true" />;
  if (phase === 'playing') return <StopIcon size={18} />;
  if (phase === 'error') return <RetryIcon size={18} />;
  return <PlayIcon size={18} />;
}

function VoiceCard({ voice, player }: { voice: CastVoice; player: VoicePlayer }) {
  const { state } = player;
  const phase = state.id === voice.speaker ? (state.phase ?? 'idle') : 'idle';
  const ttfa = state.ttfa[voice.speaker];
  const busy = phase === 'loading' || phase === 'playing';
  const action = busy ? 'Stop' : 'Play';

  let status = `On air: ${voice.roles}`;
  if (phase === 'loading') status = 'Connecting to Bulbul…';
  else if (phase === 'error') status = state.error ?? 'Something went wrong.';
  else if (ttfa !== undefined) status = `First audio in ${ttfa} ms`;

  return (
    <li className="lp-voice" data-phase={phase} style={{ '--st': voice.station.accent } as Vars}>
      <div className="lp-voice-top">
        <button
          type="button"
          className="lp-play"
          aria-label={`${action} ${voice.name}, ${voice.style} voice in ${voice.station.languageName}`}
          onClick={() =>
            player.toggle({
              id: voice.speaker,
              station: voice.station.id,
              speaker: voice.speaker,
              text: voice.line.text,
              pace: voice.pace,
              temperature: voice.temperature,
            })
          }
        >
          <PlayGlyph phase={phase} />
        </button>
        <div className="lp-voice-who">
          <p className="lp-voice-name">{voice.name}</p>
          <p className="lp-voice-style">
            {voice.style[0].toUpperCase() + voice.style.slice(1)}, {voice.station.languageName}
          </p>
        </div>
        <LiveBars active={phase === 'playing'} analyser={player.analyser} />
      </div>
      <SpeakerId id={voice.speaker} />
      <p className="lp-voice-line" lang={voice.station.language}>
        {voice.line.text}
      </p>
      <p className="lp-voice-en">{voice.line.en}</p>
      <p className="lp-voice-status" data-kind={phase === 'error' ? 'error' : ttfa !== undefined ? 'ttfa' : 'meta'} aria-live="polite">
        {status}
      </p>
    </li>
  );
}

function Voices({ player }: { player: VoicePlayer }) {
  return (
    <section className="lp-section" aria-labelledby="voices-title">
      <div className="lp-wrap">
        <SectionHead id="voices-title" title="Meet the voices">
          {VOICE_COUNT} Bulbul v4 Flash personas across three languages, each cast for its job by style. Press play to
          hear one, streamed live.
        </SectionHead>
        <div className="lp-vgroups">
          {VOICE_GROUPS.map(({ station, voices }) => (
            <div key={station.id} className="lp-vgroup" style={{ '--st': station.accent } as Vars}>
              <h3 className="lp-vgroup-title">
                <span className="lp-dot" aria-hidden="true" />
                <span>
                  {station.languageName} {station.frequency}
                </span>
                <span className="lp-vgroup-native" lang={station.language}>
                  {station.nativeName}
                </span>
                <span className="lp-vgroup-count">
                  {voices.length} {voices.length === 1 ? 'voice' : 'voices'}
                </span>
              </h3>
              <ul className="lp-vgrid" data-count={voices.length}>
                {voices.map((v) => (
                  <VoiceCard key={v.speaker} voice={v} player={player} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const LOOP = [
  { key: 'you', title: 'You speak', body: 'Hold Call RJ, talk for up to 15 seconds, let go.', model: null },
  { key: 'stt', title: 'Saaras v4', body: 'Turns your voice into text. Hinglish stays Hinglish.', model: 'saaras:v4' },
  { key: 'llm', title: 'Sarvam-105B', body: 'Understands what you asked and writes the RJ’s reply.', model: 'sarvam-105b' },
  { key: 'tts', title: 'Bulbul v4 Flash', body: 'The RJ answers on air, streamed as it is spoken.', model: 'bulbul:v4-flash' },
];

function CallIn({ player }: { player: VoicePlayer }) {
  const ref = useRef<HTMLOListElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const { voice, station, caller, reply } = CALL_EXAMPLE;
  const id = 'call-reply';
  const phase = player.state.id === id ? (player.state.phase ?? 'idle') : 'idle';
  const busy = phase === 'loading' || phase === 'playing';
  const ttfa = player.state.ttfa[id];

  return (
    <section className="lp-section" aria-labelledby="call-title">
      <div className="lp-wrap">
        <SectionHead id="call-title" title="Call the RJ">
          Hold the button, say something in your language and let go. The RJ answers you on air in about two seconds.
        </SectionHead>

        <ol ref={ref} className="lp-loop" data-live={inView}>
          {LOOP.map((step, i) => (
            <li key={step.key} className="lp-loop-step" style={{ '--i': String(i) } as Vars}>
              <span className="lp-loop-node" aria-hidden="true">
                {i + 1}
              </span>
              <h3 className="lp-h3">{step.title}</h3>
              <p>{step.body}</p>
              {step.model && <SpeakerId id={step.model} />}
            </li>
          ))}
        </ol>
        <p className="lp-loop-time">
          <span className="lp-loop-time-bar" aria-hidden="true" />
          From letting go to hearing the RJ: about 2 seconds.
        </p>

        <div className="lp-exchange">
          <figure className="lp-bubble">
            <figcaption>Caller, transcribed by Saaras v4</figcaption>
            <p className="lp-bubble-text" lang="hi">
              {caller.text}
            </p>
            <p className="lp-bubble-en">{caller.en}</p>
          </figure>
          <figure className="lp-bubble lp-bubble--rj" style={{ '--st': station.accent } as Vars}>
            <figcaption>
              RJ reply, written by Sarvam-105B
              <SpeakerId id={voice.speaker} />
            </figcaption>
            <p className="lp-bubble-text" lang="hi">
              {reply.text}
            </p>
            <p className="lp-bubble-en">{reply.en}</p>
            <div className="lp-bubble-actions">
              <button
                type="button"
                className="lp-small-btn"
                data-phase={phase}
                onClick={() =>
                  player.toggle({
                    id,
                    station: station.id,
                    speaker: voice.speaker,
                    text: reply.text,
                    pace: voice.pace,
                    temperature: voice.temperature,
                  })
                }
              >
                <PlayGlyph phase={phase} />
                {busy ? 'Stop' : phase === 'error' ? 'Try again' : 'Play the reply'}
              </button>
              <span className="lp-voice-status" data-kind={ttfa !== undefined ? 'ttfa' : 'meta'} aria-live="polite">
                {phase === 'loading'
                  ? 'Connecting to Bulbul…'
                  : phase === 'error'
                    ? player.state.error
                    : ttfa !== undefined
                      ? `First audio in ${ttfa} ms`
                      : ''}
              </span>
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}

const OTHER_MODELS = [
  {
    name: 'Saaras v4',
    id: 'saaras:v4',
    job: 'Hears the callers',
    body: 'Codemix mode keeps Hinglish intact. Tamil and Bangla callers are transcribed in their own script.',
  },
  {
    name: 'Sarvam-105B',
    id: 'sarvam-105b',
    job: 'Writes the whole show',
    body: 'RJ links, news rephrased from real headlines, ads and dramas, plus the reply to every call-in.',
  },
  {
    name: 'Sarvam Translate',
    id: 'mayura:v1',
    job: 'Subtitles every line',
    body: 'An English line under each native-script caption, so anyone can follow any station.',
  },
];

const SPECS: [string, string][] = [
  ['Voices', `${VOICE_COUNT} Bulbul v4 Flash personas`],
  ['Stations', 'Hindi 91.1, Tamil 98.3, Bangla 102.7'],
  ['First audio', 'About 300 ms per line'],
  ['Call-in reply', 'About 2 s'],
  ['Install', 'None. It runs in your browser'],
  ['Hosted on', 'Cloudflare Workers'],
];

function Sarvam() {
  return (
    <section className="lp-section" aria-labelledby="sarvam-title">
      <div className="lp-wrap">
        <SectionHead id="sarvam-title" title="Built on Sarvam">
          Four Sarvam models run the station, live. Nothing you hear is pre-recorded.
        </SectionHead>
        <div className="lp-stack">
          <article className="lp-bulbul">
            <div className="lp-bulbul-head">
              <h3 className="lp-h3 lp-h3--lg">Bulbul v4 Flash</h3>
              <SpeakerId id="bulbul:v4-flash" />
            </div>
            <p className="lp-bulbul-job">Every voice on the station.</p>
            <ul className="lp-bulbul-list">
              <li>
                {VOICE_COUNT} personas cast by style: <code>news_breaking</code>, <code>ads</code>,{' '}
                <code>stories_dramatic</code>, <code>suspense</code>, <code>kids</code>, <code>reels</code> and more.
              </li>
              <li>Streamed as raw 24 kHz audio straight into the browser, so a line starts in about 300 ms.</li>
              <li>Pace and expressiveness tuned per role: brisk for news, slow and loose for suspense.</li>
              <li>The speaker ID of every line is printed on screen, so you always know who is talking.</li>
            </ul>
          </article>

          <dl className="lp-plate">
            <span className="lp-screw" aria-hidden="true" />
            <span className="lp-screw" aria-hidden="true" />
            <span className="lp-screw" aria-hidden="true" />
            <span className="lp-screw" aria-hidden="true" />
            {SPECS.map(([k, v]) => (
              <div key={k} className="lp-plate-row">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>

          <ul className="lp-models">
            {OTHER_MODELS.map((mdl) => (
              <li key={mdl.id} className="lp-model">
                <h3 className="lp-h3">{mdl.name}</h3>
                <p className="lp-model-job">{mdl.job}</p>
                <p>{mdl.body}</p>
                <SpeakerId id={mdl.id} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function FinalCta({ onTuneIn }: { onTuneIn: (id: StationId) => void }) {
  return (
    <section className="lp-section lp-final" aria-labelledby="final-title">
      <div className="lp-wrap lp-final-inner">
        <h2 id="final-title" className="lp-h2 lp-final-title">
          Dil se suniye.
        </h2>
        <p className="lp-sub">Listen with your heart. Pick a station and the show starts right away.</p>
        <TuneButton onClick={() => onTuneIn('hi')} />
        <div className="lp-final-stations" role="group" aria-label="Or tune in to a station">
          {STATIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className="lp-station"
              style={{ '--st': s.accent } as Vars}
              aria-label={`Tune in to ${s.languageName} ${s.frequency}`}
              onClick={() => onTuneIn(s.id)}
            >
              <span className="lp-dot" aria-hidden="true" />
              {s.languageName}
              <span className="lp-station-freq">{s.frequency}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
