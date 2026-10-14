/**
 * Web Audio engine (docs/TECH-SPEC.md §7).
 *
 * voice sessions → voiceBus → compressor ─┐
 * music bed → musicGain (ducked) ─────────┼→ master → analyser → destination
 * sfx → sfxGain ──────────────────────────┘
 */
import { TTS_SAMPLE_RATE } from '../../shared/constants';
import { audioContextCtor, rampTo, setAudioSessionType, setSharedContext } from './context';
import { MusicBed } from './music';
import { PcmStreamDecoder } from './pcm';
import { Sfx } from './sfx';
import type { AudioEngine, PlayResult } from './types';

const BATCH_S = 0.1;
const LEAD_S = 0.03;
const LOW_WATER_S = 0.06;
const MASTER_LEVEL = 0.9;
const MUSIC_LEVEL = 0.25;
const DUCK_LEVEL = 0.08;
const DUCK_ATTACK_S = 0.15;
const DUCK_HOLD_MS = 400;
const DUCK_RELEASE_S = 0.8;
const SFX_LEVEL = 0.7;
const DEFAULT_STOP_FADE_MS = 120;
const UNLOCK_TIMEOUT_MS = 1500;

const noop = () => undefined;

interface VoiceSession {
  gain: GainNode;
  rate: number;
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
  sources: Set<AudioBufferSourceNode>;
  nextStart: number;
  firstStart: number;
  started: boolean;
  streamDone: boolean;
  stopped: boolean;
  settled: boolean;
  samples: number;
  ttfaMs: number;
  resolve: (r: PlayResult) => void;
  reject: (e: unknown) => void;
}

function rateFromContentType(res: Response): number {
  const m = /rate=(\d+)/i.exec(res.headers.get('content-type') ?? '');
  const rate = m ? Number(m[1]) : NaN;
  return rate >= 8000 && rate <= 96000 ? rate : TTS_SAMPLE_RATE;
}

export class WebAudioEngine implements AudioEngine {
  private ctx: AudioContext | null = null;
  private voiceBus: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private sessions = new Set<VoiceSession>();
  private duckTimer: ReturnType<typeof setTimeout> | null = null;
  private ducked = false;
  private readonly bed = new MusicBed();
  private readonly fx = new Sfx(() => this.bed.root);

  readonly music = {
    start: (accent?: string): void => this.bed.start(accent),
    stop: (fadeMs?: number): void => this.bed.stop(fadeMs),
  };

  readonly sfx = {
    sting: (): Promise<void> => this.fx.sting(),
    callTone: (): Promise<void> => this.fx.callTone(),
    tuneStatic: (ms: number): Promise<void> => this.fx.tuneStatic(ms),
  };

  get analyser(): AnalyserNode | null {
    return this.analyserNode;
  }

  /** Everything up to the resume() call runs synchronously so iOS sees it inside the gesture. */
  unlock(): Promise<void> {
    setAudioSessionType('playback');
    const ctx = this.ctx ?? this.build();
    const blip = ctx.createBufferSource();
    blip.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    blip.connect(ctx.destination);
    blip.start(0);
    if (ctx.state === 'running') return Promise.resolve();
    const resumed = ctx.resume().catch(noop);
    const timeout = new Promise<void>((r) => setTimeout(r, UNLOCK_TIMEOUT_MS));
    return Promise.race([resumed, timeout]).then(noop);
  }

  playStream(res: Response, opts: { onStart?: () => void; fetchStartedAt?: number } = {}): Promise<PlayResult> {
    const fetchStartedAt = opts.fetchStartedAt ?? performance.now();
    const ctx = this.ctx;
    const bus = this.voiceBus;
    const fail = (msg: string) => {
      res.body?.cancel().catch(noop);
      return Promise.reject(new Error(msg));
    };
    if (!ctx || !bus) return fail('Audio engine is locked: call unlock() from a user gesture first');
    if (!res.ok) return fail(`TTS request failed with status ${res.status}`);
    if (!res.body) return fail('TTS response has no body');
    const body = res.body;

    return new Promise<PlayResult>((resolve, reject) => {
      const gain = ctx.createGain();
      gain.connect(bus);
      const s: VoiceSession = {
        gain,
        rate: rateFromContentType(res),
        reader: null,
        sources: new Set(),
        nextStart: 0,
        firstStart: 0,
        started: false,
        streamDone: false,
        stopped: false,
        settled: false,
        samples: 0,
        ttfaMs: 0,
        resolve,
        reject,
      };
      this.sessions.add(s);
      void this.pump(ctx, s, body, fetchStartedAt, opts.onStart);
    });
  }

  stopVoice(fadeMs = DEFAULT_STOP_FADE_MS): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const fade = Math.max(0, fadeMs) / 1000;
    for (const s of [...this.sessions]) {
      s.stopped = true;
      s.reader?.cancel().catch(noop);
      rampTo(s.gain.gain, 0, fade, ctx);
      const end = ctx.currentTime + fade + 0.01;
      for (const src of s.sources) {
        try {
          src.stop(end);
        } catch {
          /* not started or already stopped */
        }
      }
      setTimeout(() => s.gain.disconnect(), fadeMs + 100);
      this.settle(s);
    }
  }

  silence(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, Math.max(0, ms)));
  }

  private build(): AudioContext {
    const Ctor = audioContextCtor();
    if (!Ctor) throw new Error('Web Audio is not supported in this browser');
    const ctx = new Ctor({ latencyHint: 'interactive' });

    const master = ctx.createGain();
    master.gain.value = MASTER_LEVEL;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.8;
    master.connect(analyser).connect(ctx.destination);

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 10;
    compressor.ratio.value = 3.5;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.2;
    compressor.connect(master);
    const voiceBus = ctx.createGain();
    voiceBus.connect(compressor);

    const musicGain = ctx.createGain();
    musicGain.gain.value = MUSIC_LEVEL;
    musicGain.connect(master);

    const sfxGain = ctx.createGain();
    sfxGain.gain.value = SFX_LEVEL;
    sfxGain.connect(master);

    this.ctx = ctx;
    this.voiceBus = voiceBus;
    this.musicGain = musicGain;
    this.analyserNode = analyser;
    this.bed.attach(ctx, musicGain);
    this.fx.attach(ctx, sfxGain);
    setSharedContext(ctx);

    const wake = () => {
      if (ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(noop);
    };
    for (const ev of ['pointerdown', 'touchend', 'keydown']) {
      window.addEventListener(ev, wake, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') wake();
    });
    return ctx;
  }

  private async pump(
    ctx: AudioContext,
    s: VoiceSession,
    body: ReadableStream<Uint8Array>,
    fetchStartedAt: number,
    onStart?: () => void,
  ): Promise<void> {
    const decoder = new PcmStreamDecoder();
    const pending: Float32Array[] = [];
    let pendingLen = 0;
    let error: unknown = null;

    const schedule = () => {
      if (pendingLen === 0 || s.stopped) return;
      const rate = decoder.format?.sampleRate ?? s.rate;
      const buf = ctx.createBuffer(1, pendingLen, rate);
      const ch = buf.getChannelData(0);
      let at = 0;
      for (const p of pending) {
        ch.set(p, at);
        at += p.length;
      }
      pending.length = 0;
      pendingLen = 0;

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(s.gain);
      const startAt = Math.max(ctx.currentTime + LEAD_S, s.nextStart);
      src.start(startAt);
      s.nextStart = startAt + buf.duration;
      s.samples += buf.length;
      s.rate = rate;
      s.sources.add(src);
      src.onended = () => {
        s.sources.delete(src);
        src.disconnect();
        if (s.streamDone && s.sources.size === 0) this.settle(s);
      };

      if (!s.started) {
        s.started = true;
        s.firstStart = startAt;
        s.ttfaMs = Math.round(performance.now() - fetchStartedAt + (startAt - ctx.currentTime) * 1000);
        this.duck();
        try {
          onStart?.();
        } catch (e) {
          console.error(e);
        }
      }
    };

    const add = (out: Float32Array | null) => {
      if (!out) return;
      pending.push(out);
      pendingLen += out.length;
    };

    let reader: ReadableStreamDefaultReader<Uint8Array>;
    try {
      reader = body.getReader();
    } catch (e) {
      this.settle(s, e);
      return;
    }
    s.reader = reader;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (s.stopped || done) break;
        add(decoder.push(value));
        const batch = (decoder.format?.sampleRate ?? s.rate) * BATCH_S;
        const starving = s.started && s.nextStart - ctx.currentTime < LOW_WATER_S;
        if (pendingLen >= batch || (starving && pendingLen > 0)) schedule();
      }
    } catch (e) {
      if (!s.stopped) error = e;
    }
    if (s.stopped) return;

    add(decoder.flush());
    schedule();
    s.streamDone = true;
    if (s.sources.size === 0) {
      this.settle(s, error ?? (s.samples === 0 ? new Error('TTS stream contained no audio') : null));
    }
  }

  /** Resolves (or, if nothing played, rejects) a session exactly once. */
  private settle(s: VoiceSession, error: unknown = null): void {
    if (s.settled) return;
    s.settled = true;
    this.sessions.delete(s);
    if (!s.stopped) setTimeout(() => s.gain.disconnect(), 50);
    this.releaseDuck();

    const scheduledMs = (s.samples / s.rate) * 1000;
    let durationMs = scheduledMs;
    if (s.stopped && this.ctx) {
      const played = (this.ctx.currentTime - s.firstStart) * 1000;
      durationMs = s.started ? Math.min(scheduledMs, Math.max(0, played)) : 0;
    }
    if (error && !s.started) s.reject(error);
    else s.resolve({ ttfaMs: s.ttfaMs, durationMs: Math.round(durationMs) });
  }

  private duck(): void {
    if (this.duckTimer !== null) {
      clearTimeout(this.duckTimer);
      this.duckTimer = null;
    }
    if (this.ducked || !this.ctx || !this.musicGain) return;
    this.ducked = true;
    rampTo(this.musicGain.gain, DUCK_LEVEL, DUCK_ATTACK_S, this.ctx);
  }

  private releaseDuck(): void {
    if (!this.ducked || this.voiceActive()) return;
    if (this.duckTimer !== null) clearTimeout(this.duckTimer);
    this.duckTimer = setTimeout(() => {
      this.duckTimer = null;
      if (this.voiceActive() || !this.ctx || !this.musicGain) return;
      this.ducked = false;
      rampTo(this.musicGain.gain, MUSIC_LEVEL, DUCK_RELEASE_S, this.ctx);
    }, DUCK_HOLD_MS);
  }

  private voiceActive(): boolean {
    for (const s of this.sessions) if (s.started) return true;
    return false;
  }
}
