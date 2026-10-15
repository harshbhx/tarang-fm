import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import BlurText from './bits/BlurText';
import ClickSpark from './bits/ClickSpark';
import Magnet from './bits/Magnet';
import { LISTENER_NAME_MAX, STUDIO_NUMBER, STUDIO_NUMBER_DISPLAY } from '../../shared/constants';
import { STATIONS, getStation } from '../../shared/stations';
import type { Station, StationId } from '../../shared/types';
import type { RadioActions, RadioState } from '../radio/state';
import AmbientBackground from './AmbientBackground';
import CallButton from './CallButton';
import CallPanel from './CallPanel';
import CareBanner from './CareBanner';
import StillListening from './StillListening';
import CaptionStage, { ErrorNotice, OnAirSoon, StageNote, TuningNotice } from './CaptionStage';
import CompactDialBar from './CompactDialBar';
import Footer from './Footer';
import ProgrammeStrip from './ProgrammeStrip';
import RadioDevice from './RadioDevice';
import Sources from './Sources';
import { StudioDockKey, StudioLinePanel } from './StudioLine';
import Visualizer from './Visualizer';
import { VoicesOnAir } from './Voices';
import { SEGMENT_NAMES, boardLabel, castVoices, voiceName } from './format';
import {
  useAudioPulse,
  useCoachMark,
  useHeardVoices,
  useMicMeter,
  useOnline,
  useOutOfView,
  useReducedMotion,
} from './hooks';
import { CloseIcon, CollapseIcon, ExpandIcon, PauseIcon, PlayIcon, RetryIcon, SubtitlesIcon } from './icons';
import { useFullscreen, useKeyboardShortcuts, useMediaSession, useWakeLock } from './product';

type Props = {
  state: RadioState;
  actions: RadioActions;
  /** Design review only: render the offline notice */
  previewOffline?: boolean;
};

/** Sparks in the station's warm amber when the radio switches on. */
const TUNE_SPARKS = ['#ffd38a', '#ff9a4d', '#ff6b2c'];

export default function RadioApp({ state, actions, previewOffline = false }: Props) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        <RadioShell state={state} actions={actions} previewOffline={previewOffline} />
      </LazyMotion>
    </MotionConfig>
  );
}

const LANGUAGE_LIST = (() => {
  const names = STATIONS.map((s) => s.languageName);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join('');
})();

function RadioShell({ state, actions, previewOffline }: Required<Props>) {
  const { status } = state;
  const station = getStation(state.stationId);
  const rootRef = useRef<HTMLDivElement>(null);
  const deviceRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef(actions);
  const reduced = useReducedMotion();
  const online = useOnline() && !previewOffline;

  useEffect(() => {
    actionsRef.current = actions;
  });

  const idle = status === 'idle';
  const isCall = status === 'call_recording' || status === 'call_thinking' || status === 'call_on_air';
  const live = status === 'playing' || status === 'tuning' || isCall;
  const lit = live || status === 'paused';
  const onAir = status === 'playing' || isCall;

  const getAnalyser = useCallback(() => actionsRef.current.getAnalyser(), []);
  const getMicLevel = useCallback(() => actionsRef.current.getMicLevel(), []);
  const subscribe = useAudioPulse(getAnalyser, rootRef, live, reduced);
  const secondsLeft = useMicMeter(status === 'call_recording', getMicLevel, rootRef);
  const heard = useHeardVoices(state.caption, state.history);
  const barVisible = useOutOfView(deviceRef, !idle, 24, '.dial-glass');

  const tuneIn = () => {
    actions.tuneIn().catch(() => undefined);
  };
  const setStation = (id: StationId) => actions.setStation(id);
  const stepStation = (by: 1 | -1) => {
    const order = [...STATIONS].sort((a, b) => Number(a.frequency) - Number(b.frequency));
    const at = order.findIndex((s) => s.id === station.id);
    actions.setStation(order[(at + by + order.length) % order.length].id);
  };
  const togglePlay = () => {
    if (status === 'playing' || status === 'tuning') actions.pause();
    else if (status === 'paused') actions.resume();
    else if (status === 'error') tuneIn();
  };

  const fullscreen = useFullscreen();
  const segmentName = state.segment && !isCall ? SEGMENT_NAMES[state.segment.type] : isCall ? 'Call-in' : undefined;
  useMediaSession(
    idle
      ? null
      : {
          title: state.segment?.title && !isCall ? state.segment.title : (segmentName ?? station.name),
          artist: `${station.name} · FM ${station.frequency}`,
          album: segmentName ? `Tarang FM · ${segmentName}` : 'Tarang FM',
        },
    onAir,
    { play: togglePlay, pause: () => actions.pause(), next: () => stepStation(1), previous: () => stepStation(-1) },
  );
  useWakeLock(onAir);
  useKeyboardShortcuts(
    {
      togglePlay,
      nextStation: () => stepStation(1),
      previousStation: () => stepStation(-1),
      toggleFullscreen: fullscreen.toggle,
      toggleSubtitles: () => actions.toggleSubtitles(),
    },
    !idle && !isCall,
  );
  // Back on the tune-in screen (or after an error), the full-screen view closes.
  useEffect(() => {
    if (idle && fullscreen.immersive) fullscreen.exit();
  }, [idle, fullscreen]);

  return (
    <div
      ref={rootRef}
      className="radio"
      data-status={status}
      data-immersive={fullscreen.immersive && !idle}
      style={{ '--accent': station.accent } as CSSProperties}
    >
      <AmbientBackground accent={station.accent} active={live} />
      {idle ? null : (
        <CompactDialBar
          visible={barVisible}
          stations={STATIONS}
          station={station}
          onAir={onAir}
          tuning={status === 'tuning'}
          lit={lit}
        />
      )}

      <div className={`shell ${idle ? 'pb-10' : 'with-dock'}`}>
        <main className="flex flex-col">
          {idle ? null : (
            <h1 className="sr-only">
              Tarang FM, {station.languageName} {station.frequency}
            </h1>
          )}

          <div className={idle ? undefined : 'onair'}>
          <div ref={deviceRef}>
            <RadioDevice
              stations={STATIONS}
              station={station}
              onStation={setStation}
              onAir={onAir}
              tuning={status === 'tuning'}
              lit={lit}
              compact={!idle}
              topAction={
                idle ? null : (
                  <button
                    type="button"
                    className="top-key"
                    aria-pressed={fullscreen.immersive}
                    aria-label={fullscreen.immersive ? 'Exit full screen' : 'Full screen'}
                    title={fullscreen.immersive ? 'Exit full screen (F)' : 'Full screen (F)'}
                    onClick={fullscreen.toggle}
                  >
                    {fullscreen.immersive ? <CollapseIcon width={16} height={16} /> : <ExpandIcon width={16} height={16} />}
                    <span className="top-key-text">{fullscreen.immersive ? 'Exit' : 'Full screen'}</span>
                  </button>
                )
              }
              dialChildren={
                <div className="dial-viz">
                  <Visualizer
                    subscribe={subscribe}
                    barColor={station.accent}
                    processing={live}
                    alpha={0.55}
                    height="100%"
                    fadeWidth={64}
                  />
                </div>
              }
            />
          </div>

          {idle ? null : (
            <ShowScreen
              state={state}
              station={station}
              isCall={isCall}
              online={online}
              secondsLeft={secondsLeft}
              onToggleSubtitles={() => actions.toggleSubtitles()}
              onRetry={tuneIn}
              onResume={() => actions.resume()}
            />
          )}
          </div>

          {idle ? (
            <TunePanel
              station={station}
              initialName={state.listener.name ?? ''}
              online={online}
              onName={(name) => actions.setListenerName(name)}
              onTuneIn={tuneIn}
            />
          ) : (
            <ShowBelow state={state} station={station} heard={heard} />
          )}
        </main>

        <Footer showKeys={!idle} />
      </div>

      {idle ? null : <Dock state={state} station={station} actions={actions} secondsLeft={secondsLeft} onRetry={tuneIn} />}
    </div>
  );
}

function TunePanel({
  station,
  initialName,
  online,
  onName,
  onTuneIn,
}: {
  station: Station;
  initialName: string;
  online: boolean;
  onName: (name: string) => void;
  onTuneIn: () => void;
}) {
  const [name, setName] = useState(initialName);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onTuneIn();
  };
  const voices = castVoices(station).length;

  return (
    <section aria-labelledby="tune-title" className="tune-panel">
      <div className="tune-copy">
        <BlurText as="h1" id="tune-title" className="display-lg" text="Pick a station, then tune in" delay={60} />
        <p className="tune-lede">
          Live shows in {LANGUAGE_LIST}: today&rsquo;s headlines, a comic ad break, Kahani Corner and your
          call&#8209;ins, all voiced by Sarvam&rsquo;s Bulbul&nbsp;v4.
        </p>
      </div>

      <form onSubmit={submit} className="tune-form">
        <label className="flex flex-col gap-2">
          <span className="text-fg-2 text-sm">
            What should the RJ call you? <span className="text-fg-3">Optional</span>
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
            onChange={(event) => {
              setName(event.target.value);
              onName(event.target.value);
            }}
          />
        </label>
        <Magnet reach={70} strength={0.22} limit={10} style={{ display: 'flex', width: '100%' }}>
          <ClickSpark
            sparkColor={TUNE_SPARKS}
            sparkCount={10}
            sparkRadius={40}
            sparkSize={10}
            duration={520}
            glow={0.6}
            className="tune-spark"
            style={{ height: 'auto' }}
          >
            <button type="submit" className="tune-btn">
              <PlayIcon width={18} height={18} />
              Tune in to {station.languageName} {station.frequency}
            </button>
          </ClickSpark>
        </Magnet>
        {online ? (
          <p className="tune-hint">
            <span className="tune-hint-dot" aria-hidden="true" />
            Sound on. {voices} Bulbul v4 voices are on {station.name} today.
          </p>
        ) : (
          <p className="tune-hint" data-tone="warn" role="status">
            <span className="tune-hint-dot" aria-hidden="true" />
            You&rsquo;re offline. Connect to the internet to tune in.
          </p>
        )}
        <p className="tune-studio">
          Or call the studio from any phone:{' '}
          <a href={`tel:${STUDIO_NUMBER}`}>{STUDIO_NUMBER_DISPLAY}</a>. RJ Sunny puts you on air.
        </p>
      </form>
    </section>
  );
}

/** The on-air screen under the radio: programme strip and the live caption stage, sized to fit one screen. */
function ShowScreen({
  state,
  station,
  isCall,
  online,
  secondsLeft,
  onToggleSubtitles,
  onRetry,
  onResume,
}: {
  state: RadioState;
  station: Station;
  isCall: boolean;
  online: boolean;
  secondsLeft: number;
  onToggleSubtitles: () => void;
  onRetry: () => void;
  onResume: () => void;
}) {
  const { status, segment } = state;
  const tuning = status === 'tuning';
  const shownSegment = tuning ? undefined : segment;
  const board = boardLabel(status, shownSegment?.type);

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
        subtitlesSoon={state.subtitlesSoon}
        lang={station.language}
        paused={status === 'paused'}
        live={status === 'playing'}
        placeholder={tuning ? <TuningNotice station={station} /> : <OnAirSoon station={station} />}
      />
    );
  }

  let note: ReactNode = null;
  if (!online) {
    note = <StageNote tone="warn">You&rsquo;re offline. The show picks up again once you reconnect.</StageNote>;
  } else if (status !== 'error' && state.error) {
    note = <StageNote tone="warn">{state.error} The show keeps going with what&rsquo;s ready.</StageNote>;
  } else if (!isCall && state.call?.error) {
    const mic = /microphone|permission|denied/i.test(state.call.error);
    note = (
      <StageNote tone="info">
        Your call didn&rsquo;t go through. {state.call.error}{' '}
        {mic ? 'Allow microphone access for this site, then hold the button again.' : 'Hold the button to try again.'}
      </StageNote>
    );
  }

  return (
    <>
      <ProgrammeStrip
        board={board}
        boardName={shownSegment && !isCall && status !== 'error' ? SEGMENT_NAMES[shownSegment.type] : board}
        segment={isCall || status === 'error' ? undefined : shownSegment?.type}
        title={isCall || status === 'error' ? undefined : shownSegment?.title}
        lang={station.language}
        upNext={state.upNext}
        ttfaMs={state.ttfaMs}
        clockKey={station.id}
        tools={
          <button
            type="button"
            className="pill pill-sm prog-cc"
            aria-pressed={state.showSubtitles}
            aria-label="English subtitles"
            title="English subtitles (C)"
            onClick={onToggleSubtitles}
          >
            <SubtitlesIcon width={16} height={16} />
            <span className="prog-cc-text">English</span>
          </button>
        }
      />

      {state.helpline ? <CareBanner key={state.helpline.number} helpline={state.helpline} /> : null}
      {state.capped && state.status === 'paused' ? <StillListening onResume={onResume} /> : null}

      <section aria-labelledby="now-title" className="stage">
        <h2 id="now-title" className="sr-only">
          {isCall ? 'Call-in' : 'Live captions'}
        </h2>
        {note}
        <div className="stage-body">{stage}</div>
      </section>
    </>
  );
}

/** Below the on-air screen: who's on air, the news sources and the studio phone line. */
function ShowBelow({ state, station, heard }: { state: RadioState; station: Station; heard: ReadonlySet<string> }) {
  const { segment } = state;
  const tuning = state.status === 'tuning';
  return (
    <>
      <div className="below">
        <VoicesOnAir station={station} heard={heard} current={state.caption?.speaker} />
        {segment?.type === 'news' && segment.sources?.length && !tuning ? (
          <Sources sources={segment.sources} lang={station.language} />
        ) : null}
        <StudioLinePanel
          phone={state.phone}
          phoneStatus={state.phoneStatus}
          radio={state.status === 'paused' ? 'paused' : state.status === 'idle' || state.status === 'error' ? 'off' : 'live'}
          className="below-wide"
        />
      </div>
    </>
  );
}

function Dock({
  state,
  station,
  actions,
  secondsLeft,
  onRetry,
}: {
  state: RadioState;
  station: Station;
  actions: RadioActions;
  secondsLeft: number;
  onRetry: () => void;
}) {
  const { status } = state;
  const [coach, dismissCoach] = useCoachMark(status === 'playing' && !!state.caption);
  const dockRef = useRef<HTMLElement>(null);

  // Publish the fixed dock's height as --dock-h so captions never hide behind it.
  useEffect(() => {
    const dock = dockRef.current;
    const host = dock?.closest<HTMLElement>('.radio');
    if (!dock || !host) return;
    const update = () => host.style.setProperty('--dock-h', `${Math.ceil(dock.getBoundingClientRect().height)}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(dock);
    return () => {
      observer.disconnect();
      host.style.removeProperty('--dock-h');
    };
  }, []);

  return (
    <section ref={dockRef} aria-label="Controls" className="dock">
      <div className="dock-inner">
        {coach ? (
          <div className="coach" role="note">
            <span>Hold to talk to the RJ, live on air</span>
            <button type="button" className="coach-close" aria-label="Dismiss hint" onClick={dismissCoach}>
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
        <StudioDockKey phone={state.phone} />
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
