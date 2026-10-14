import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import AnimatedBeam from '../components/bits/AnimatedBeam';
import { BorderBeam } from '../components/bits/MagicUi';
import { CALL_CHAIN, CALL_EXAMPLE } from './data';
import { MicIcon } from './icons';
import { PlayGlyph, SpeakerId, type Vars } from './ui';
import type { VoicePlayer } from './useVoicePlayer';

export const DEMO_ID = 'call-demo';
const MIN_HOLD_MS = 500;
const TYPE_MS = 2200;
const THINK_MS = 700;

type Phase = 'idle' | 'holding' | 'short' | 'thinking' | 'speaking' | 'done' | 'error';

/** Which stage of the pipeline is lit in each phase (index into CALL_CHAIN). */
const STAGE: Record<Phase, number> = { idle: -1, holding: 1, short: 0, thinking: 2, speaking: 3, done: 3, error: 3 };

/**
 * The call-in, hands on: hold the button and the sample caller's words come in as Saaras hears them, let go
 * and the RJ's reply is written and spoken, the pipeline lighting up stage by stage. The reply is the real
 * Bulbul voice; the caller is a sample, since this page has no microphone of its own.
 */
export default function HoldToTalk({ player }: { player: VoicePlayer }) {
  const { voice, station, caller, reply } = CALL_EXAMPLE;
  const [phase, setPhase] = useState<Phase>('idle');
  const [heard, setHeard] = useState(0);
  const [held, setHeld] = useState(0);
  const pressedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const nodes = useRef<(HTMLSpanElement | null)[]>([]);
  const nodeRef = (i: number) => ({ current: nodes.current[i] ?? null });

  const chars = [...caller.text];
  const playerPhase = player.state.id === DEMO_ID ? player.state.phase : null;
  const ttfa = player.state.ttfa[DEMO_ID];

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    if (ticker.current) clearInterval(ticker.current);
    timer.current = null;
    ticker.current = null;
  };

  const start = () => {
    if (phase === 'holding') return;
    clear();
    if (playerPhase) player.stop();
    pressedAt.current = performance.now();
    setHeard(0);
    setHeld(0);
    setPhase('holding');
    ticker.current = setInterval(() => {
      const ms = performance.now() - pressedAt.current;
      setHeld(ms);
      setHeard(Math.min(chars.length, Math.round((ms / TYPE_MS) * chars.length)));
    }, 50);
  };

  const end = () => {
    if (phase !== 'holding') return;
    clear();
    const ms = performance.now() - pressedAt.current;
    if (ms < MIN_HOLD_MS) {
      setPhase('short');
      timer.current = setTimeout(() => setPhase('idle'), 1800);
      return;
    }
    setHeard(chars.length);
    setPhase('thinking');
    timer.current = setTimeout(() => {
      setPhase('speaking');
      player.toggle({ id: DEMO_ID, station: station.id, speaker: voice.speaker, text: reply.text, pace: voice.pace, temperature: voice.temperature });
    }, THINK_MS);
  };

  // The reply finishing (or failing) ends the demo
  useEffect(() => {
    if (phase !== 'speaking') return;
    if (playerPhase === 'error') setPhase('error');
    else if (player.state.id !== DEMO_ID && player.state.phase === null && ttfa !== undefined) setPhase('done');
  }, [phase, playerPhase, player.state.id, player.state.phase, ttfa]);

  useEffect(() => clear, []);

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      start();
    }
  };
  const onKeyUp = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      end();
    }
  };

  const stage = STAGE[phase];
  const holding = phase === 'holding';
  const seconds = (held / 1000).toFixed(1);
  let hint = 'Press and hold, like the real button. A sample caller speaks for you here.';
  if (phase === 'holding') hint = 'Listening… let go when you’re done.';
  else if (phase === 'short') hint = 'That was too short. Hold the button while you speak.';
  else if (phase === 'thinking') hint = 'Sarvam-105B is writing the RJ’s reply…';
  else if (phase === 'speaking') hint = playerPhase === 'loading' ? 'Bulbul v4 Flash is on the line…' : ttfa !== undefined ? `On air. First audio in ${ttfa} ms.` : 'On air.';
  else if (phase === 'done') hint = `Reply on air in ${ttfa} ms from the moment it was written. Hold again to replay.`;
  else if (phase === 'error') hint = player.state.error ?? 'The reply did not come through. Try again.';

  return (
    <div className="lp-demo" data-phase={phase} style={{ '--st': station.accent } as Vars}>
      <div ref={container} className="lp-pipe" aria-label="How a call travels">
        {CALL_CHAIN.map((step, i) => (
          <div key={step.key} className="lp-pipe-step" data-on={stage >= i} data-active={stage === i}>
            <span
              ref={(el) => {
                nodes.current[i] = el;
              }}
              className="lp-pipe-node"
              aria-hidden="true"
            >
              {i === 0 ? <MicIcon size={16} /> : i}
            </span>
            <span className="lp-pipe-text">
              <span className="lp-pipe-title">{step.title}</span>
              <span className="lp-pipe-body">{step.body}</span>
              {step.model && <SpeakerId id={step.model} />}
            </span>
          </div>
        ))}
        {CALL_CHAIN.slice(1).map((step, i) => (
          <AnimatedBeam
            key={step.key}
            containerRef={container}
            fromRef={nodeRef(i)}
            toRef={nodeRef(i + 1)}
            lit={stage > i}
            duration={1.6}
            delay={i * 0.25}
            color="#ffd08a"
          />
        ))}
      </div>

      <div className="lp-demo-row">
        <button
          type="button"
          className="lp-hold"
          data-holding={holding}
          onPointerDown={onPointerDown}
          onPointerUp={end}
          onPointerCancel={end}
          onLostPointerCapture={end}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onContextMenu={(e) => e.preventDefault()}
          aria-pressed={holding}
          aria-label="Hold to talk to the RJ"
          aria-describedby="hold-hint"
        >
          <span className="lp-hold-fill" aria-hidden="true" />
          <span className="lp-hold-icon" aria-hidden="true">
            <MicIcon size={18} />
          </span>
          <span className="lp-hold-label">{holding ? 'Listening' : 'Hold to talk'}</span>
          <span className="lp-hold-pill" aria-hidden="true">
            <span className="lp-hold-eq">
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} style={{ '--i': String(i) } as Vars} />
              ))}
            </span>
            <span className="lp-hold-time">{seconds}s</span>
          </span>
        </button>
        <p id="hold-hint" className="lp-demo-hint" data-kind={phase === 'short' || phase === 'error' ? 'error' : phase === 'done' ? 'ttfa' : undefined} aria-live="polite">
          {hint}
        </p>
      </div>

      <div className="lp-exchange" data-stage={stage}>
        <figure className="lp-bubble lp-bubble--you" data-on={stage >= 1}>
          <figcaption>You, heard by Saaras v4</figcaption>
          <p className="lp-native" lang={station.language}>
            {stage >= 2 ? caller.text : chars.slice(0, heard).join('')}
            {holding && <span className="lp-caret" aria-hidden="true" />}
          </p>
          <p className="lp-english" data-on={stage >= 2}>
            {caller.en}
          </p>
        </figure>
        <figure className="lp-bubble lp-bubble--rj" data-on={stage >= 3}>
          {stage >= 3 && <BorderBeam size={110} duration={8} colorFrom="#ffd38a" colorTo="#ff6b2c" />}
          <figcaption>
            RJ reply, written by Sarvam-105B <SpeakerId id={voice.speaker} />
          </figcaption>
          <p className="lp-native" lang={station.language}>
            {reply.text}
          </p>
          <p className="lp-english">{reply.en}</p>
          <div className="lp-bubble-actions">
            <button
              type="button"
              className="lp-ghost lp-ghost--sm"
              data-phase={playerPhase ?? 'idle'}
              onClick={() =>
                player.toggle({ id: DEMO_ID, station: station.id, speaker: voice.speaker, text: reply.text, pace: voice.pace, temperature: voice.temperature })
              }
            >
              <PlayGlyph phase={playerPhase ?? 'idle'} size={16} />
              {playerPhase === 'loading' || playerPhase === 'playing' ? 'Stop' : playerPhase === 'error' ? 'Try again' : 'Play the reply'}
            </button>
          </div>
        </figure>
      </div>
    </div>
  );
}
