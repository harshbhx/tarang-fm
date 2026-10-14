import { WebAudioEngine } from './engine';
import { MicRecorder } from './recorder';
import type { AudioEngine, Recorder } from './types';

export type { AudioEngine, PlayResult, Recorder } from './types';
export { PcmStreamDecoder } from './pcm';

/** Create once per app. Call unlock() from the first user gesture before anything else. */
export function createAudioEngine(): AudioEngine {
  return new WebAudioEngine();
}

export function createRecorder(): Recorder {
  return new MicRecorder();
}
