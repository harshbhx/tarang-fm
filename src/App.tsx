import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { StationId } from '../shared/types';
import RadioApp from './components/RadioApp';
import Landing from './landing/Landing';
import { getSharedEngine, useRadio } from './radio/useRadio';

const AudioDebug = lazy(() => import('./audio/AudioDebug'));
const Preview = lazy(() => import('./components/Preview'));

type View = 'landing' | 'listen' | 'audio-debug' | 'preview';

const LISTEN_PATH = '/listen';

function viewFromUrl(): View {
  const params = new URLSearchParams(window.location.search);
  if (params.get('debug') === 'audio') return 'audio-debug';
  if (params.get('preview') === 'ui') return 'preview';
  return window.location.pathname.startsWith(LISTEN_PATH) ? 'listen' : 'landing';
}

function Station({ view, onNavigate }: { view: 'landing' | 'listen'; onNavigate: (view: View) => void }) {
  const [state, actions] = useRadio();

  // Tune in from the landing page: start audio inside the same click, then show the radio.
  const tuneIn = useCallback(
    (station: StationId) => {
      actions.setStation(station);
      void actions.tuneIn();
      window.history.pushState(null, '', LISTEN_PATH);
      window.scrollTo(0, 0);
      onNavigate('listen');
    },
    [actions, onNavigate],
  );

  // While the landing page is open, warm the Worker's news and weather caches so the first RJ link starts sooner.
  useEffect(() => {
    if (view !== 'landing') return;
    const timer = window.setTimeout(() => {
      void fetch(`/api/context?station=${state.stationId}`, { priority: 'low' } as RequestInit).catch(() => undefined);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [view, state.stationId]);

  // Going back to the landing page pauses the show.
  useEffect(() => {
    if (view === 'landing' && (state.status === 'playing' || state.status === 'tuning')) actions.pause();
  }, [view, state.status, actions]);

  if (view === 'landing') return <Landing onTuneIn={tuneIn} engine={getSharedEngine()} />;
  return <RadioApp state={state} actions={actions} />;
}

export default function App() {
  const [view, setView] = useState(viewFromUrl);

  useEffect(() => {
    const onPop = () => setView(viewFromUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (view === 'audio-debug' || view === 'preview') {
    return <Suspense fallback={null}>{view === 'audio-debug' ? <AudioDebug /> : <Preview />}</Suspense>;
  }
  return <Station view={view} onNavigate={setView} />;
}
