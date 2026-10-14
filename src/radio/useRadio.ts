import { useSyncExternalStore } from 'react';
import { createAudioEngine, createRecorder } from '../audio';
import { RadioController } from './controller';
import type { RadioActions, RadioState } from './state';

let shared: RadioController | null = null;

/** The app-wide controller, created on first use (the AudioContext itself waits for Tune in). */
export function getRadioController(): RadioController {
  shared ??= new RadioController({ engine: createAudioEngine(), recorder: createRecorder() });
  return shared;
}

export function useRadio(): [RadioState, RadioActions] {
  const controller = getRadioController();
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return [state, controller];
}
