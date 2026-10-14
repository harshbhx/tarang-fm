import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { PAUSE_AFTER_MS } from '../../shared/constants';
import type { Line } from '../../shared/types';
import { createRecorder } from '../audio';
import AnimatedBeam from '../components/bits/AnimatedBeam';
import { BorderBeam } from '../components/bits/MagicUi';
import { postCall, type LiveCallResponse } from '../radio/api';
import { listenerContext, loadListenerName } from '../radio/listener';
import { CALL_CHAIN, CALL_EXAMPLE } from './data';
import { MicIcon } from './icons';
import { PlayGlyph, SpeakerId, type Vars } from './ui';
import type { VoicePlayer } from './useVoicePlayer';

export const DEMO_ID = 'call-demo';
const MIN_HOLD_MS = 500;
const TYPE_MS = 2200;
const THINK_MS = 700;
const BAR_WEIGHTS = [0.6, 0.85, 1, 0.8, 0.65];

type Mode = 'mic' | 'sample';
type Phase = 'idle' | 'holding' | 'short' | 'thinking' | 'speaking' | 'done' | 'error';

/** Which stage of the pipeline is lit in each phase (index into CALL_CHAIN). */
const STAGE: Record<Phase, number> = { idle: -1, holding: 1, short: 0, thinking: 2, speaking: 3, done: 3, error: 3 };

/** The sample reply as a playable line in the RJ's voice. */
const sampleLine = (text: string, en?: string): Line => ({
  role: 'rj',
  speaker: CALL_EXAMPLE.voice.speaker,
  text,
  en,
  pace: CALL_EXAMPLE.voice.pace,
  temperature: CALL_EXAMPLE.voice.temperature,
  pauseAfterMs: PAUSE_AFTER_MS.rj_link,
});

const micSupported = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

function micProblem(err: unknown): string {
  if (err instanceof Error && err.name === 'NotAllowedError') return 'the microphone was not allowed';
  if (err instanceof Error && err.name === 'NotFoundError') return 'no microphone was found';
  return 'the microphone is not available here';
}

/**
 * The call-in, for real: hold the button and your voice is recorded, let go and it goes through the same
 * pipeline as the radio's own call button (Saaras hears you, Sarvam-105B writes, Bulbul speaks the reply on
 * this page), the pipeline lighting up stage by stage. Without a microphone, a sample caller stands in and
 * the page says so. Nothing is stored.
 */
export default function HoldToTalk({ player }: { player: VoicePlayer }) {
  const { voice, station, caller, reply: sampleReply } = CALL_EXAMPLE;
  const recorder = useMemo(() => createRecorder(), []);
  const [mode, setMode] = useState<Mode>(() => (micSupported() ? 'mic' : 'sample'));
  const [note, setNote] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [held, setHeld] = useState(0);
  const [heard, setHeard] = useState(0);
  const [transcript, setTranscript] = useState<{ text: string; en?: string } | null>(null);
  const [reply, setReply] = useState<Line | null>(null);
  const [replyEn, setReplyEn] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | null>(null);

  const pressedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const meterFrame = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const run = useRef(0);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const container = useRef<HTMLDivElement>(null);
  const nodes = useRef<(HTMLSpanElement | null)[]>([]);
  const nodeRef = (i: number) => ({ current: nodes.current[i] ?? null });

  const chars = [...caller.text];
  const playerPhase = player.state.id === DEMO_ID ? player.state.phase : null;
  const ttfa = player.state.ttfa[DEMO_ID];

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    if (ticker.current) clearInterval(ticker.current);
    cancelAnimationFrame(meterFrame.current);
    timer.current = null;
    ticker.current = null;
    meterFrame.current = 0;
  };

  const setBars = (level: number) => {
    bars.current.forEach((el, i) => {
      if (el) el.style.transform = `scaleY(${Math.max(0.12, Math.min(1, level * BAR_WEIGHTS[i] * 1.3))})`;
    });
  };

  const speak = (line: Line) => {
    setPhase('speaking');
    player.toggle({ id: DEMO_ID, station: station.id, speaker: line.speaker, text: line.text, pace: line.pace, temperature: line.temperature });
  };

  const start = () => {
    if (phase === 'holding') return;
    clear();
    abort.current?.abort();
    if (playerPhase) player.stop();
    run.current += 1;
    pressedAt.current = performance.now();
    setHeld(0);
    setHeard(0);
    setProblem(null);
    setTranscript(null);
    setReply(null);
    setReplyEn(undefined);
    setPhase('holding');
    ticker.current = setInterval(() => setHeld(performance.now() - pressedAt.current), 100);

    if (mode === 'mic') {
      const attempt = run.current;
      recorder.start().catch((err) => {
        if (attempt !== run.current) return;
        // No microphone: the sample caller takes over, this time and after
        setMode('sample');
        setNote(`A sample caller speaks for you, since ${micProblem(err)}.`);
        startSampleTyping();
      });
      const meter = () => {
        setBars(recorder.level());
        meterFrame.current = requestAnimationFrame(meter);
      };
      meterFrame.current = requestAnimationFrame(meter);
    } else {
      startSampleTyping();
    }
  };

  const startSampleTyping = () => {
    cancelAnimationFrame(meterFrame.current);
    const type = () => {
      const ms = performance.now() - pressedAt.current;
      setHeard(Math.min(chars.length, Math.round((ms / TYPE_MS) * chars.length)));
      setBars(0.35 + 0.45 * Math.abs(Math.sin(ms / 140)) * Math.abs(Math.cos(ms / 310)));
      meterFrame.current = requestAnimationFrame(type);
    };
    meterFrame.current = requestAnimationFrame(type);
  };

  const end = () => {
    if (phase !== 'holding') return;
    clear();
    setBars(0);
    const ms = performance.now() - pressedAt.current;
    if (ms < MIN_HOLD_MS) {
      if (mode === 'mic') recorder.cancel();
      setPhase('short');
      timer.current = setTimeout(() => setPhase('idle'), 2200);
      return;
    }
    setPhase('thinking');
    if (mode === 'sample') {
      setHeard(chars.length);
      setTranscript({ text: caller.text, en: caller.en });
      timer.current = setTimeout(() => {
        const line = sampleLine(sampleReply.text, sampleReply.en);
        setReply(line);
        setReplyEn(sampleReply.en);
        speak(line);
      }, THINK_MS);
      return;
    }
    void sendRecording();
  };

  const sendRecording = async () => {
    const attempt = run.current;
    let blob: Blob;
    try {
      blob = await recorder.stop();
    } catch (err) {
      if (attempt !== run.current) return;
      setProblem(err instanceof Error && err.name === 'NotAllowedError' ? 'Allow the microphone, then hold again.' : 'Could not record. Check the microphone and try again.');
      setPhase('error');
      return;
    }
    if (attempt !== run.current) return;
    if (blob.size === 0) {
      setPhase('short');
      timer.current = setTimeout(() => setPhase('idle'), 2200);
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    let res: LiveCallResponse;
    try {
      res = await postCall(blob, { station: station.id, listener: listenerContext({ name: loadListenerName() }) }, controller.signal);
    } catch (err) {
      if (attempt !== run.current || controller.signal.aborted) return;
      setProblem(err instanceof Error && err.message && !/fetch/i.test(err.message) ? err.message : 'The RJ could not take your call. Try again.');
      setPhase('error');
      return;
    }
    if (attempt !== run.current) return;
    const heardText = typeof res.transcript === 'string' ? res.transcript.trim() : '';
    setTranscript({ text: heardText || '…', en: res.transcriptEn });
    void res.subtitles?.then((subs) => {
      if (attempt !== run.current) return;
      if (subs.transcriptEn) setTranscript((t) => (t ? { ...t, en: t.en ?? subs.transcriptEn } : t));
      if (subs.replyEn) setReplyEn((en) => en ?? subs.replyEn);
    });
    const line = res.reply?.text?.trim() ? res.reply : null;
    setReply(line);
    setReplyEn(line?.en);
    if (line) speak(line);
    else {
      setProblem('The RJ did not catch that. Hold the button and try again.');
      setPhase('error');
    }
  };

  // The reply finishing (or failing) ends the demo
  useEffect(() => {
    if (phase !== 'speaking') return;
    if (playerPhase === 'error') {
      setProblem(player.state.error ?? 'The reply did not come through. Try again.');
      setPhase('error');
    } else if (player.state.id !== DEMO_ID && player.state.phase === null && ttfa !== undefined) setPhase('done');
  }, [phase, playerPhase, player.state.id, player.state.phase, player.state.error, ttfa]);

  useEffect(
    () => () => {
      clear();
      abort.current?.abort();
      recorder.cancel();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

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
  const youText = mode === 'sample' && (holding || stage < 2) ? chars.slice(0, heard).join('') : (transcript?.text ?? '');
  const youEn = mode === 'sample' ? (stage >= 2 ? caller.en : '') : (transcript?.en ?? '');
  const rjLine = reply ?? (mode === 'sample' ? sampleLine(sampleReply.text, sampleReply.en) : null);

  let hint = mode === 'mic' ? 'Press and hold, say anything in your language, let go. Your voice goes to the RJ.' : 'Press and hold, like the real button. A sample caller speaks for you here.';
  if (phase === 'holding') hint = mode === 'mic' ? 'Listening… speak, then let go.' : 'Listening… let go when you’re done.';
  else if (phase === 'short') hint = 'That was too short. Hold the button while you speak.';
  else if (phase === 'thinking') hint = mode === 'mic' ? 'Saaras v4 is listening back, Sarvam-105B is writing the reply…' : 'Sarvam-105B is writing the RJ’s reply…';
  else if (phase === 'speaking') hint = playerPhase === 'loading' ? 'Bulbul v4 Flash is on the line…' : ttfa !== undefined ? `On air. First audio in ${ttfa} ms.` : 'On air.';
  else if (phase === 'done') hint = `Reply on air ${ttfa} ms after it was written. Hold again to say something else.`;
  else if (phase === 'error') hint = problem ?? 'Something went wrong. Try again.';

  return (
    <div className="lp-demo" data-phase={phase} data-mode={mode} style={{ '--st': station.accent } as Vars}>
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
          <AnimatedBeam key={step.key} containerRef={container} fromRef={nodeRef(i)} toRef={nodeRef(i + 1)} lit={stage > i} duration={1.6} delay={i * 0.25} color="#ffd08a" />
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
              {BAR_WEIGHTS.map((_, i) => (
                <span
                  key={i}
                  ref={(el) => {
                    bars.current[i] = el;
                  }}
                />
              ))}
            </span>
            <span className="lp-hold-time">{seconds}s</span>
          </span>
        </button>
        <div className="lp-demo-hints">
          <p id="hold-hint" className="lp-demo-hint" data-kind={phase === 'short' || phase === 'error' ? 'error' : phase === 'done' ? 'ttfa' : undefined} aria-live="polite">
            {hint}
          </p>
          <p className="lp-demo-note">
            {note ??
              (mode === 'mic' ? (
                <>
                  Uses your microphone for this one reply; nothing is kept.{' '}
                  <button type="button" className="lp-link" onClick={() => setMode('sample')}>
                    No mic? Use a sample caller
                  </button>
                </>
              ) : (
                micSupported() && (
                  <button type="button" className="lp-link" onClick={() => setMode('mic')}>
                    Use my microphone instead
                  </button>
                )
              ))}
          </p>
        </div>
      </div>

      <div className="lp-exchange" data-stage={stage}>
        <figure className="lp-bubble lp-bubble--you" data-on={stage >= 1}>
          <figcaption>{mode === 'mic' ? 'You, heard by Saaras v4' : 'A sample caller, heard by Saaras v4'}</figcaption>
          <p className="lp-native" lang={station.language}>
            {youText || (holding ? '' : mode === 'mic' ? 'Your words appear here.' : '')}
            {(holding || phase === 'thinking') && !youText && <span className="lp-caret" aria-hidden="true" />}
          </p>
          <p className="lp-english" data-on={!!youEn}>
            {youEn}
          </p>
        </figure>
        <figure className="lp-bubble lp-bubble--rj" data-on={stage >= 3}>
          {stage >= 3 && <BorderBeam size={110} duration={8} colorFrom="#ffd38a" colorTo="#ff6b2c" />}
          <figcaption>
            RJ reply, written by Sarvam-105B <SpeakerId id={rjLine?.speaker ?? voice.speaker} />
          </figcaption>
          <p className="lp-native" lang={station.language}>
            {rjLine?.text ?? 'The RJ answers here, in the voice of the station.'}
          </p>
          <p className="lp-english">{replyEn ?? (mode === 'sample' ? sampleReply.en : '')}</p>
          {rjLine && (
            <div className="lp-bubble-actions">
              <button type="button" className="lp-ghost lp-ghost--sm" data-phase={playerPhase ?? 'idle'} onClick={() => speak(rjLine)}>
                <PlayGlyph phase={playerPhase ?? 'idle'} size={16} />
                {playerPhase === 'loading' || playerPhase === 'playing' ? 'Stop' : playerPhase === 'error' ? 'Try again' : 'Play the reply'}
              </button>
            </div>
          )}
        </figure>
      </div>
    </div>
  );
}
