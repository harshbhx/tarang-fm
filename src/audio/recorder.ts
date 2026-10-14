import { CALL_MAX_SECONDS } from '../../shared/constants';
import { audioContextCtor, getSharedContext, setAudioSessionType } from './context';
import type { Recorder } from './types';

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
const METER_FLOOR_DB = -60;
const METER_CEIL_DB = -10;

const noop = () => undefined;

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

interface Take {
  stream: MediaStream;
  recorder: MediaRecorder;
  source: MediaStreamAudioSourceNode | null;
  meterOut: GainNode | null;
  chunks: Blob[];
  timer: ReturnType<typeof setTimeout>;
  cancelled: boolean;
  released: boolean;
  done: Promise<Blob>;
}

export class MicRecorder implements Recorder {
  private take: Take | null = null;
  private starting: Promise<void> | null = null;
  private ownCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private samples: Float32Array<ArrayBuffer> | null = null;

  get recording(): boolean {
    return this.take?.recorder.state === 'recording';
  }

  start(): Promise<void> {
    if (this.starting) return this.starting;
    if (this.recording) return Promise.resolve();
    this.take = null;
    // The meter context is grabbed synchronously, while still inside the press gesture.
    const ctx = this.meterContext();
    this.starting = this.begin(ctx).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  /** Returns the recording. After an auto-stop it still returns that take. */
  stop(): Promise<Blob> {
    if (this.starting) return this.starting.then(() => this.stop());
    const take = this.take;
    if (!take) return Promise.reject(new Error('Not recording'));
    if (take.recorder.state !== 'inactive') take.recorder.stop();
    return take.done;
  }

  cancel(): void {
    if (this.starting) {
      this.starting.then(() => this.cancel(), noop);
      return;
    }
    const take = this.take;
    if (!take || take.recorder.state === 'inactive') return;
    take.cancelled = true;
    take.recorder.stop();
  }

  /** Perceptual 0..1 level: RMS mapped from -60..-10 dBFS. */
  level(): number {
    if (!this.recording || !this.analyser || !this.samples) return 0;
    this.analyser.getFloatTimeDomainData(this.samples);
    let sum = 0;
    for (let i = 0; i < this.samples.length; i++) sum += this.samples[i] * this.samples[i];
    const rms = Math.sqrt(sum / this.samples.length);
    if (rms <= 0) return 0;
    const db = 20 * Math.log10(rms);
    return Math.min(1, Math.max(0, (db - METER_FLOOR_DB) / (METER_CEIL_DB - METER_FLOOR_DB)));
  }

  private async begin(ctx: AudioContext | null): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access is not available in this browser');
    if (typeof MediaRecorder === 'undefined') throw new Error('Recording is not supported in this browser');

    setAudioSessionType('play-and-record');
    let stream: MediaStream;
    let recorder: MediaRecorder;
    const mimeType = pickMimeType();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      setAudioSessionType('playback');
      throw e;
    }
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      setAudioSessionType('playback');
      throw e;
    }

    let source: MediaStreamAudioSourceNode | null = null;
    let meterOut: GainNode | null = null;
    if (ctx) {
      try {
        source = ctx.createMediaStreamSource(stream);
        const analyser = this.ensureAnalyser(ctx);
        meterOut = ctx.createGain();
        meterOut.gain.value = 0;
        source.connect(analyser);
        analyser.connect(meterOut).connect(ctx.destination);
      } catch {
        source?.disconnect();
        source = null;
      }
    }

    let resolveDone: (b: Blob) => void = noop;
    let rejectDone: (e: unknown) => void = noop;
    const done = new Promise<Blob>((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });
    done.catch(noop);

    const take: Take = {
      stream,
      recorder,
      source,
      meterOut,
      chunks: [],
      timer: setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, CALL_MAX_SECONDS * 1000),
      cancelled: false,
      released: false,
      done,
    };
    recorder.addEventListener('dataavailable', (e) => {
      if (e.data && e.data.size > 0) take.chunks.push(e.data);
    });
    recorder.addEventListener('stop', () => {
      this.release(take);
      if (take.cancelled) rejectDone(new DOMException('Recording cancelled', 'AbortError'));
      else resolveDone(new Blob(take.chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }));
    });
    recorder.addEventListener('error', () => {
      this.release(take);
      rejectDone(new Error('Recording failed'));
    });

    this.take = take;
    try {
      recorder.start(250);
    } catch (e) {
      this.release(take);
      this.take = null;
      throw e;
    }
  }

  private meterContext(): AudioContext | null {
    let ctx = getSharedContext();
    if (!ctx || ctx.state === 'closed') {
      if (!this.ownCtx) {
        const Ctor = audioContextCtor();
        if (!Ctor) return null;
        this.ownCtx = new Ctor();
      }
      ctx = this.ownCtx;
    }
    if (ctx.state !== 'running') ctx.resume().catch(noop);
    return ctx;
  }

  private ensureAnalyser(ctx: AudioContext): AnalyserNode {
    if (!this.analyser || this.analyser.context !== ctx) {
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.samples = new Float32Array(this.analyser.fftSize);
    }
    return this.analyser;
  }

  private release(take: Take): void {
    if (take.released) return;
    take.released = true;
    clearTimeout(take.timer);
    take.stream.getTracks().forEach((t) => t.stop());
    take.source?.disconnect();
    take.meterOut?.disconnect();
    if (this.take === take) this.analyser?.disconnect();
    setAudioSessionType('playback');
  }
}
