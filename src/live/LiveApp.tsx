import LiveView from './ui/LiveView';
import { getLiveController, useLive } from './useLive';

const getAnalyser = () => getLiveController().getAnalyser();
const savedName = () => getLiveController().savedName();

/** /live: "Listen together", one shared show per station. */
export default function LiveApp() {
  const [state, actions] = useLive();
  return <LiveView state={state} actions={actions} getAnalyser={getAnalyser} savedName={savedName} />;
}
