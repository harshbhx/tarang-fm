import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import AmbientBackground from '../../components/AmbientBackground';
import CaptionStage, { ErrorNotice, StageNote, WaitingLine } from '../../components/CaptionStage';
import CompactDialBar from '../../components/CompactDialBar';
import Footer from '../../components/Footer';
import RadioDevice from '../../components/RadioDevice';
import Visualizer from '../../components/Visualizer';
import { VoicesOnAir } from '../../components/Voices';
import { voiceName } from '../../components/format';
import { useAudioPulse, useHeardVoices, useOnline, useOutOfView, useReducedMotion } from '../../components/hooks';
import { SubtitlesIcon } from '../../components/icons';
import { STATIONS, getStation, rjVoiceAt } from '../../../shared/stations';
import type { Station } from '../../../shared/types';
import type { Caption } from '../../radio/state';
import type { LiveActions, LiveViewState } from '../types';
import { liveCaption, statusCopy } from './format';
import { useAiredLines } from './hooks';
import JoinPanel from './JoinPanel';
import LiveDock from './LiveDock';
import LiveProgramme from './LiveProgramme';
import Presence, { type HelloState } from './Presence';
import WelcomeBanner from './WelcomeBanner';
import '../live.css';

interface LiveViewProps {
  state: LiveViewState;
  actions: LiveActions;
  /** The master analyser of the audio engine the show plays through (drives the glow, VU meters and dial visualizer) */
  getAnalyser?: () => AnalyserNode | null;
  /** The name last used on this device, to prefill the join form */
  savedName?: () => string | undefined;
  /** Design review only: render the offline notice */
  previewOffline?: boolean;
}

/** "Listen together": the shared live show, on the same radio as the personal mode. */
export default function LiveView(props: LiveViewProps) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        <LiveShell {...props} />
      </LazyMotion>
    </MotionConfig>
  );
}

const noAnalyser = () => null;

const noName = () => undefined;

function LiveShell({ state, actions, getAnalyser = noAnalyser, savedName = noName, previewOffline = false }: LiveViewProps) {
  const { status } = state;
  const station = getStation(state.station);
  const rootRef = useRef<HTMLDivElement>(null);
  const deviceRef = useRef<HTMLDivElement>(null);
  const analyserRef = useRef(getAnalyser);
  const reduced = useReducedMotion();
  const online = useOnline() && !previewOffline;
  const [showSubtitles, setShowSubtitles] = useState(true);
  // The name you joined with, so "Try again" can rejoin from the same click.
  const [joinedAs, setJoinedAs] = useState('');

  const idle = status === 'idle';
  const tuning = status === 'connecting' || status === 'reconnecting' || status === 'warming_up';
  const onAir = status === 'on_air';
  const lit = onAir || tuning;

  useEffect(() => {
    analyserRef.current = getAnalyser;
  });
  const readAnalyser = useCallback(() => analyserRef.current(), []);
  const subscribe = useAudioPulse(readAnalyser, rootRef, onAir || status === 'reconnecting', reduced);

  const aired = useAiredLines(idle ? undefined : state.current, `${state.station}:${idle ? 'off' : 'on'}`);
  const caption = state.current && !idle ? liveCaption(state.current, station) : undefined;
  const history = useMemo(() => aired.map((line) => liveCaption(line, station)), [aired, station]);
  const heard = useHeardVoices(caption, history);
  const barVisible = useOutOfView(deviceRef, !idle, 24, '.dial-glass');

  const rjName = rjNameFor(station, caption);
  const welcoming = useMemo(() => new Set(state.current?.welcome ?? []), [state.current]);
  const hello = helloState(state);

  const join = (name: string) => {
    setJoinedAs(name);
    actions.join(name).catch(() => undefined);
  };
  const retry = () => join(joinedAs || state.you?.name || '');
  const listening = state.listeners.length + (state.you && !state.listeners.some((l) => l.id === state.you?.id) ? 1 : 0);

  return (
    <div ref={rootRef} className="radio live" data-status={status} style={{ '--accent': station.accent } as CSSProperties}>
      <AmbientBackground accent={station.accent} active={onAir} />
      {idle ? null : (
        <CompactDialBar visible={barVisible} stations={STATIONS} station={station} onAir={onAir} tuning={tuning} lit={lit} />
      )}

      <div className={`shell ${idle ? 'pb-10' : 'with-dock'}`}>
        <main className="flex flex-col">
          {idle ? null : (
            <h1 className="sr-only">
              Listen together: Tarang FM {station.languageName} {station.frequency}, live
            </h1>
          )}

          <div ref={deviceRef}>
            <RadioDevice
              stations={STATIONS}
              station={station}
              onStation={(id) => actions.setStation(id)}
              onAir={onAir}
              tuning={tuning}
              lit={lit}
              compact={!idle}
              dialChildren={
                <div className="dial-viz">
                  <Visualizer
                    subscribe={subscribe}
                    barColor={station.accent}
                    processing={lit}
                    alpha={0.55}
                    height="100%"
                    fadeWidth={64}
                  />
                </div>
              }
            />
          </div>

          {idle ? (
            <JoinPanel
              stations={STATIONS}
              station={station}
              listening={state.listeners.length}
              initialName={savedName() ?? ''}
              online={online}
              onStation={(id) => actions.setStation(id)}
              onJoin={join}
            />
          ) : (
            <>
              <LiveProgramme status={status} current={state.current} upcoming={state.upcoming} lang={station.language} />

              <LiveStage
                state={state}
                station={station}
                caption={caption}
                history={history}
                showSubtitles={showSubtitles}
                online={online}
                onToggleSubtitles={() => setShowSubtitles((on) => !on)}
                onRetry={retry}
              />

              <div className="below">
                <Presence
                  listeners={state.listeners}
                  you={state.you}
                  welcoming={welcoming}
                  hello={hello}
                  rjName={rjName}
                  live={onAir}
                />
                <VoicesOnAir station={station} heard={heard} current={caption?.speaker} />
              </div>
            </>
          )}
        </main>

        <Footer />
      </div>

      {idle ? null : (
        <>
          <WelcomeBanner show={state.welcomingYou} rjName={rjName} />
          <LiveDock
            muted={state.muted}
            listening={listening}
            yourName={state.you?.name}
            onToggleMute={() => actions.toggleMute()}
            onLeave={() => actions.leave()}
          />
        </>
      )}
    </div>
  );
}

/** The RJ's first name in Latin script for UI copy ('Sunny'), from the line on air when it is theirs. */
function rjNameFor(station: Station, caption?: Caption): string {
  if (caption?.role === 'rj' && caption.label) return voiceName(caption.label);
  return voiceName(rjVoiceAt(station, new Date().getHours()).label);
}

function helloState(state: LiveViewState): HelloState {
  if (state.welcomingYou) return 'on_air';
  if (state.welcomedYou) return 'done';
  const id = state.you?.id;
  if (id && state.upcoming.some((line) => line.welcome?.includes(id))) return 'up_next';
  return 'waiting';
}

function LiveStage({
  state,
  station,
  caption,
  history,
  showSubtitles,
  online,
  onToggleSubtitles,
  onRetry,
}: {
  state: LiveViewState;
  station: Station;
  caption?: Caption;
  history: Caption[];
  showSubtitles: boolean;
  online: boolean;
  onToggleSubtitles: () => void;
  onRetry: () => void;
}) {
  const { status } = state;
  const copy = statusCopy(status, station);
  const showLine = status === 'on_air' || status === 'reconnecting';

  let stage: ReactNode;
  if (status === 'error') {
    stage = <ErrorNotice message={state.error || 'Lost the connection to the studio.'} onRetry={onRetry} />;
  } else {
    stage = (
      <CaptionStage
        caption={showLine ? caption : undefined}
        history={showLine ? history : []}
        showSubtitles={showSubtitles}
        lang={station.language}
        live={status === 'on_air' && !state.muted}
        placeholder={copy ? <StatusNotice title={copy.title} detail={copy.detail} /> : null}
      />
    );
  }

  let note: ReactNode = null;
  if (!online) {
    note = <StageNote tone="warn">You&rsquo;re offline. You&rsquo;ll rejoin the live show once you reconnect.</StageNote>;
  } else if (status === 'reconnecting' && caption) {
    note = <StageNote tone="warn">Reconnecting… you&rsquo;ll be back in sync with everyone in a moment.</StageNote>;
  } else if (status !== 'error' && state.error) {
    note = <StageNote tone="warn">{state.error}</StageNote>;
  } else if (state.muted && status === 'on_air') {
    note = <StageNote tone="info">You&rsquo;re muted. The show and captions keep going; unmute to hear it.</StageNote>;
  }

  return (
    <section aria-labelledby="now-title" className="stage">
      <div className="stage-head">
        <h2 id="now-title" className="stage-title">
          Live captions
        </h2>
        <button type="button" className="pill pill-sm" aria-pressed={showSubtitles} onClick={onToggleSubtitles}>
          <SubtitlesIcon width={16} height={16} />
          English subtitles
        </button>
      </div>
      {note}
      <div className="mt-4">{stage}</div>
    </section>
  );
}

function StatusNotice({ title, detail }: { title: string; detail: string }) {
  return (
    <div role="status" className="flex flex-col gap-3 pt-1">
      <WaitingLine>{title}</WaitingLine>
      <p className="text-fg-3 max-w-md">{detail}</p>
    </div>
  );
}
