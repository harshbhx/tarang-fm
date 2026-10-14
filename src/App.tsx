import { lazy, Suspense, useState } from 'react';
import RadioApp from './components/RadioApp';
import { useRadio } from './radio/useRadio';

const AudioDebug = lazy(() => import('./audio/AudioDebug'));
const Preview = lazy(() => import('./components/Preview'));

type View = 'radio' | 'audio-debug' | 'preview';

function viewFromUrl(): View {
  const params = new URLSearchParams(window.location.search);
  if (params.get('debug') === 'audio') return 'audio-debug';
  if (params.get('preview') === 'ui') return 'preview';
  return 'radio';
}

function Radio() {
  const [state, actions] = useRadio();
  return <RadioApp state={state} actions={actions} />;
}

export default function App() {
  const [view] = useState(viewFromUrl);
  if (view === 'radio') return <Radio />;
  return (
    <Suspense fallback={null}>{view === 'audio-debug' ? <AudioDebug /> : <Preview />}</Suspense>
  );
}
