import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import { LISTENER_NAME_MAX } from '../../shared/constants';
import { STATIONS, getStation } from '../../shared/stations';
import type { Station, StationId } from '../../shared/types';
import type { RadioActions, RadioState } from '../radio/state';
import AmbientBackground from './AmbientBackground';
import CallButton from './CallButton';
import CallPanel from './CallPanel';
import CaptionStage, { ErrorNotice, OnAirSoon, TuningNotice } from './CaptionStage';
import Footer from './Footer';
import NowPlaying, { ShowMeta } from './NowPlaying';
import RadioDevice from './RadioDevice';
import Sources from './Sources';
import SpotlightCard from './SpotlightCard';
import StationPicker from './StationPicker';
import Visualizer from './Visualizer';
import { VoicesOnAir } from './Voices';
import { SEGMENT_NAMES, boardLabel, castVoices, voiceName } from './format';
import { useAudioPulse, useCoachMark, useHeardVoices, useMicMeter, useReducedMotion } from './hooks';
import { CloseIcon, PauseIcon, PlayIcon, RetryIcon, SubtitlesIcon } from './icons';

type Props = { state: RadioState; actions: RadioActions };

export default function RadioApp({ state, actions }: Props) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        <RadioShell state={state} actions={actions} />
      </LazyMotion>
    </MotionConfig>
  );
}

function RadioShell({ state, actions }: Props) {
  const { status } = state;
  const station = getStation(state.stationId);
  const rootRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef(actions);
  const reduced = useReducedMotion();
  const [name, setName] = useState(state.listener.name ?? '');

  useEffect(() => {
    actionsRef.current = actions;
  });

  const idle = status === 'idle';
  const isCall = status === 'call_recording' || status === 'call_thinking' || status === 'call_on_air';
  const live = status === 'playing' || status === 'tuning' || isCall;

  const getAnalyser = useCallback(() => actionsRef.current.getAnalyser(), []);
  const getMicLevel = useCallback(() => actionsRef.current.getMicLevel(), []);
  const subscribe = useAudioPulse(getAnalyser, rootRef, live, reduced);
  const secondsLeft = useMicMeter(status === 'call_recording', getMicLevel, rootRef);
  const heard = useHeardVoices(state.caption, state.history);

  const tuneIn = () => {
    actions.tuneIn().catch(() => undefined);
  };
  const setStation = (id: StationId) => actions.setStation(id);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    tuneIn();
  };

  return (
    <div ref={rootRef} className="radio" style={{ '--accent': station.accent } as CSSProperties}>
      <AmbientBackground accent={station.accent} active={live} />
      <div
        className={`mx-auto w-full max-w-3xl px-4 pt-[max(12px,env(safe-area-inset-top))] sm:px-6 lg:max-w-[1120px] lg:px-10 ${idle ? 'pb-12' : 'with-dock'}`}
      >
        <main className="flex flex-col lg:pt-4">
          {idle ? (
            <header className="pt-2 pb-5 lg:pb-8">
              <h1 className="text-[1.5rem] leading-[1.1] font-semibold tracking-[-0.025em] text-balance sm:text-5xl lg:text-6xl">
                AI radio in your language
              </h1>
              <p className="text-fg-2 mt-2 max-w-xl text-[0.92rem] leading-relaxed sm:mt-3 sm:text-lg">
                Live shows voiced by Sarvam&rsquo;s Bulbul v4 Flash. Pick a station and tap Tune in.
              </p>
            </header>
          ) : (
            <h1 className="sr-only">
              Tarang FM, {station.languageName} {station.frequency}
            </h1>
          )}

          <form
            onSubmit={submit}
            className="flex flex-col gap-5"
          >
            <RadioDevice
              stations={STATIONS}
              station={station}
              onStation={setStation}
              onAir={status === 'playing' || isCall}
              tuning={status === 'tuning'}
              lit={live || status === 'paused'}
              compact={!idle}
              dialChildren={
                <div className="dial-viz">
                  <Visualizer
                    subscribe={subscribe}
                    barColor={station.accent}
                    processing={live}
                    alpha={0.6}
                    height="100%"
                    fadeWidth={48}
                  />
                </div>
              }
            >
              {idle ? (
                <button type="submit" className="tune-btn w-full">
                  <PlayIcon width={18} height={18} />
                  Tune in to {station.languageName} {station.frequency}
                </button>
              ) : null}
            </RadioDevice>

            {idle ? null : (
              <Dock
                state={state}
                station={station}
                actions={actions}
                secondsLeft={secondsLeft}
                onStation={setStation}
                onRetry={tuneIn}
              />
            )}
          </form>

          {idle ? (
            <div className="mt-6 flex flex-col gap-5">
              <label className="flex max-w-sm flex-col gap-2">
                <span className="text-fg-2 text-sm">
                  What should the RJ call you? <span className="text-fg-3">(optional)</span>
                </span>
                <input
                  className="field"
                  type="text"
                  name="listener-name"
                  value={name}
                  maxLength={LISTENER_NAME_MAX}
                  autoComplete="given-name"
                  enterKeyHint="go"
                  placeholder="Your first name"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      tuneIn();
                    }
                  }}
                  onChange={(event) => {
                    setName(event.target.value);
                    actions.setListenerName(event.target.value);
                  }}
                />
              </label>
              <p className="text-fg-3 max-w-xl text-sm leading-relaxed">
                On air: news from today&rsquo;s headlines, a comic ad break, a short radio drama and live call-ins,
                voiced by {castVoices(station).length} different Bulbul v4 voices. Turn your sound on.
              </p>
            </div>
          ) : (
            <div className="min-w-0">
              <Show
                state={state}
                station={station}
                isCall={isCall}
                secondsLeft={secondsLeft}
                heard={heard}
                onToggleSubtitles={() => actions.toggleSubtitles()}
                onRetry={tuneIn}
              />
            </div>
          )}
        </main>

        <Footer />
      </div>
    </div>
  );
}

function Show({
  state,
  station,
  isCall,
  secondsLeft,
  heard,
  onToggleSubtitles,
  onRetry,
}: {
  state: RadioState;
  station: Station;
  isCall: boolean;
  secondsLeft: number;
  heard: ReadonlySet<string>;
  onToggleSubtitles: () => void;
  onRetry: () => void;
}) {
  const { status, segment } = state;
  const tuning = status === 'tuning';
  const shownSegment = tuning ? undefined : segment;

  let stage: ReactNode;
  if (status === 'error') {
    stage = <ErrorNotice message={state.error} onRetry={onRetry} />;
  } else if (isCall) {
    stage = (
      <CallPanel
        status={status}
        call={state.call}
        station={station}
        listenerName={state.listener.name}
        caption={state.caption}
        showSubtitles={state.showSubtitles}
        secondsLeft={secondsLeft}
      />
    );
  } else {
    stage = (
      <CaptionStage
        caption={tuning ? undefined : state.caption}
        history={tuning ? [] : state.history}
        showSubtitles={state.showSubtitles}
        lang={station.language}
        paused={status === 'paused'}
        live={status === 'playing'}
        placeholder={tuning ? <TuningNotice station={station} /> : <OnAirSoon station={station} />}
      />
    );
  }

  return (
    <>
      <section aria-labelledby="now-title" className="relative mt-5 sm:mt-7">
        <SpotlightCard
          ambient
          theme="room"
          spotlightColor={station.accent}
          intensity={0.12}
          spotlightSize={380}
          borderGlow={0.55}
          className="stage-card rounded-[20px] p-5 sm:p-8"
        >
          <h2 id="now-title" className="sr-only">
            Now on air
          </h2>
          <NowPlaying
            board={boardLabel(status, shownSegment?.type)}
            name={
              shownSegment && !isCall && status !== 'error'
                ? SEGMENT_NAMES[shownSegment.type]
                : boardLabel(status, shownSegment?.type)
            }
            title={isCall || status === 'error' ? undefined : shownSegment?.title}
            lang={station.language}
            action={
              <button
                type="button"
                className="pill"
                aria-pressed={state.showSubtitles}
                aria-label="English subtitles"
                onClick={onToggleSubtitles}
              >
                <SubtitlesIcon width={16} height={16} />
                EN
              </button>
            }
          />
          <div className="mt-4">{stage}</div>
          {status !== 'error' && !isCall ? <ShowMeta upNext={state.upNext} ttfaMs={state.ttfaMs} /> : null}
        </SpotlightCard>
      </section>

      <VoicesOnAir station={station} heard={heard} current={state.caption?.speaker} className="mt-9" />

      {segment?.type === 'news' && segment.sources?.length && !tuning ? (
        <Sources sources={segment.sources} lang={station.language} className="mt-9" />
      ) : null}
    </>
  );
}

function Dock({
  state,
  station,
  actions,
  secondsLeft,
  onStation,
  onRetry,
}: {
  state: RadioState;
  station: Station;
  actions: RadioActions;
  secondsLeft: number;
  onStation: (id: StationId) => void;
  onRetry: () => void;
}) {
  const { status } = state;
  const [coach, dismissCoach] = useCoachMark(status === 'playing' && !!state.caption);
  const dockRef = useRef<HTMLElement>(null);

  // Publish the fixed dock's height (0 when it sits in the desktop column) as --dock-h.
  useEffect(() => {
    const dock = dockRef.current;
    const host = dock?.closest<HTMLElement>('.radio');
    if (!dock || !host) return;
    const update = () => {
      const fixed = getComputedStyle(dock).position === 'fixed';
      host.style.setProperty('--dock-h', `${fixed ? Math.ceil(dock.getBoundingClientRect().height) : 0}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(dock);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      host.style.removeProperty('--dock-h');
    };
  }, []);

  return (
    <section ref={dockRef} aria-label="Controls" className="dock">
      <div className="mx-auto flex max-w-3xl flex-col gap-2.5 sm:px-2 lg:px-0">
        <div className="lg:hidden">
          <StationPicker stations={STATIONS} value={station.id} onChange={onStation} variant="pills" />
        </div>
        <div className="relative flex items-stretch gap-2">
          {coach ? (
            <div className="coach" role="note">
              <span>Hold to talk to the RJ, live</span>
              <button
                type="button"
                className="grid size-8 shrink-0 place-items-center rounded-lg hover:bg-black/10"
                aria-label="Dismiss hint"
                onClick={dismissCoach}
              >
                <CloseIcon width={14} height={14} />
              </button>
            </div>
          ) : null}
          <TransportKey status={status} actions={actions} onRetry={onRetry} />
          <div className="min-w-0 flex-1">
            <CallButton
              status={status}
              secondsLeft={secondsLeft}
              rjName={voiceName(station.cast.rj.label)}
              onStart={() => {
                if (coach) dismissCoach();
                actions.startCall().catch(() => undefined);
              }}
              onEnd={() => {
                actions.endCall().catch(() => undefined);
              }}
              onCancel={() => actions.cancelCall()}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function TransportKey({
  status,
  actions,
  onRetry,
}: {
  status: RadioState['status'];
  actions: RadioActions;
  onRetry: () => void;
}) {
  if (status === 'error') {
    return (
      <button type="button" className="icon-btn" data-attention="true" aria-label="Try again" onClick={onRetry}>
        <RetryIcon />
      </button>
    );
  }
  if (status === 'paused') {
    return (
      <button type="button" className="icon-btn" data-attention="true" aria-label="Resume" onClick={() => actions.resume()}>
        <PlayIcon />
      </button>
    );
  }
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label="Pause"
      disabled={status !== 'playing'}
      onClick={() => actions.pause()}
    >
      <PauseIcon />
    </button>
  );
}
