import { useSyncExternalStore } from 'react';
import { createAudioEngine, createRecorder, type AudioEngine } from '../audio';
import { RadioController } from './controller';
import type { RadioActions, RadioState } from './state';

let shared: RadioController | null = null;
let engine: AudioEngine | null = null;

/** One audio engine for the whole app, shared by the landing page's voice samples and the radio. */
export function getSharedEngine(): AudioEngine {
  engine ??= createAudioEngine();
  return engine;
}

/** The app-wide controller, created on first use (the AudioContext itself waits for Tune in). */
export function getRadioController(): RadioController {
  shared ??= new RadioController({ engine: getSharedEngine(), recorder: createRecorder() });
  return shared;
}

export function useRadio(): [RadioState, RadioActions] {
  const controller = getRadioController();
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return [state, controller];
}
