import { useEffect, useState } from 'react';
import { LIVE_OFF_AIR_NOTE } from '../../shared/live';
import type { StationId } from '../../shared/types';
import { fetchLiveNow, forgetAdminKey, takeAdminKey } from './studio';
import LiveView from './ui/LiveView';
import StudioControls from './ui/StudioControls';
import { getLiveController, useLive } from './useLive';

const getAnalyser = () => getLiveController().getAnalyser();
const savedName = () => getLiveController().savedName();

/** How often the join form re-reads the station before you join */
const PEEK_EVERY_MS = 30_000;

interface PreJoin {
  station: StationId;
  offAir: boolean;
  listening: number;
}

/** The station's public snapshot while the join form is open: off air or not, and who is listening. */
function usePreJoin(station: StationId, idle: boolean): PreJoin | undefined {
  const [peek, setPeek] = useState<PreJoin>();
  useEffect(() => {
    if (!idle) return;
    const abort = new AbortController();
    const read = async () => {
      if (document.visibilityState === 'hidden') return;
      const snapshot = await fetchLiveNow(station, abort.signal);
      if (!snapshot || abort.signal.aborted) return;
      setPeek({
        station,
        offAir: snapshot.enabled === false || snapshot.note === LIVE_OFF_AIR_NOTE,
        listening: Array.isArray(snapshot.listeners) ? snapshot.listeners.length : 0,
      });
    };
    void read();
    const timer = window.setInterval(() => void read(), PEEK_EVERY_MS);
    return () => {
      abort.abort();
      window.clearInterval(timer);
    };
  }, [station, idle]);
  return peek?.station === station ? peek : undefined;
}

/** /live: "Listen together", one shared show per station. */
export default function LiveApp() {
  const [state, actions] = useLive();
  // `?admin=<key>` is saved and wiped from the address bar on the first render
  const [adminKey, setAdminKey] = useState(takeAdminKey);
  const preJoin = usePreJoin(state.station, state.status === 'idle');

  const forget = () => {
    forgetAdminKey();
    setAdminKey(null);
  };

  return (
    <LiveView
      state={state}
      actions={actions}
      getAnalyser={getAnalyser}
      savedName={savedName}
      preJoin={preJoin}
      studio={adminKey ? <StudioControls adminKey={adminKey} onForget={forget} /> : null}
    />
  );
}
