import { useEffect, useSyncExternalStore } from 'react';
import { apiFetch, ensureSession, sessionToken } from '../radio/apiSession';
import { getSharedEngine } from '../radio/useRadio';
import { LiveController } from './controller';
import type { LiveActions, LiveViewState } from './types';

let shared: LiveController | null = null;
/** Mounted useLive() callers; the show is left once the last one unmounts. */
let mounted = 0;

/** The app-wide live controller, sharing the radio's audio engine (one AudioContext per app). */
export function getLiveController(): LiveController {
  shared ??= new LiveController({
    engine: getSharedEngine(),
    fetch: (input, init) => apiFetch(String(input), init),
    session: { token: sessionToken, ensure: () => ensureSession() },
  });
  return shared;
}

export function useLive(): [LiveViewState, LiveActions] {
  const controller = getLiveController();
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    mounted += 1;
    return () => {
      mounted -= 1;
      // Deferred so a quick remount (StrictMode, a re-keyed view) keeps the show going
      setTimeout(() => {
        if (mounted === 0) controller.leave();
      }, 0);
    };
  }, [controller]);
  return [state, controller];
}
