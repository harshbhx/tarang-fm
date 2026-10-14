/** Synthesized effects: station sting, phone-line ring, and FM-dial static. */

const STING_STEPS = [1, 5 / 4, 3 / 2, 2];
const STING_GAP_S = 0.16;
const STING_RING_S = 0.75;

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}

function whenEnded(node: AudioScheduledSourceNode, fallbackMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, fallbackMs + 250);
    node.addEventListener('ended', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private dest: AudioNode | null = null;
  private noise: AudioBuffer | null = null;
  private keyRoot: () => number | null;

  constructor(keyRoot: () => number | null) {
    this.keyRoot = keyRoot;
  }

  attach(ctx: AudioContext, dest: AudioNode): void {
    this.ctx = ctx;
    this.dest = dest;
  }

  /** ~1.2 s four-note FM bell arpeggio, in the music bed's key when one is playing. */
  async sting(): Promise<void> {
    const { ctx, dest } = this;
    if (!ctx || !dest) return;
    let base = this.keyRoot() ?? 69.3;
    while (base < 520) base *= 2;
    const t0 = ctx.currentTime + 0.02;
    let last: OscillatorNode | null = null;
    for (let i = 0; i < STING_STEPS.length; i++) {
      const final = i === STING_STEPS.length - 1;
      const ring = final ? STING_RING_S * 1.3 : STING_RING_S;
      last = this.bell(base * STING_STEPS[i], t0 + i * STING_GAP_S, ring, final ? 0.3 : 0.24);
    }
    const total = (STING_GAP_S * (STING_STEPS.length - 1) + STING_RING_S * 1.3) * 1000;
    if (last) await whenEnded(last, total);
  }

  /** Indian ringback burst (400 Hz × 25 Hz, 0.4 on / 0.2 off / 0.4 on), band-limited like a phone line. */
  async callTone(): Promise<void> {
    const { ctx, dest } = this;
    if (!ctx || !dest) return;
    const t0 = ctx.currentTime + 0.02;
    const tone = ctx.createOscillator();
    tone.frequency.value = 400;
    const am = ctx.createOscillator();
    am.frequency.value = 25;
    const amDepth = ctx.createGain();
    amDepth.gain.value = 0.5;
    const shaped = ctx.createGain();
    shaped.gain.value = 0.5;
    am.connect(amDepth).connect(shaped.gain);

    const env = ctx.createGain();
    env.gain.value = 0;
    const level = 0.35;
    for (const [on, off] of [
      [0, 0.4],
      [0.6, 1.0],
    ]) {
      env.gain.setValueAtTime(0, t0 + on);
      env.gain.linearRampToValueAtTime(level, t0 + on + 0.01);
      env.gain.setValueAtTime(level, t0 + off - 0.01);
      env.gain.linearRampToValueAtTime(0, t0 + off);
    }

    const line = ctx.createBiquadFilter();
    line.type = 'bandpass';
    line.frequency.value = 1000;
    line.Q.value = 0.5;
    tone.connect(shaped).connect(env).connect(line).connect(dest);

    const end = t0 + 1.05;
    tone.start(t0);
    am.start(t0);
    tone.stop(end);
    am.stop(end);
    await whenEnded(tone, 1050);
    line.disconnect();
  }

  /** Band-passed noise sweeping like a dial being turned, with a faint heterodyne whistle. */
  async tuneStatic(ms: number): Promise<void> {
    const { ctx, dest } = this;
    if (!ctx || !dest || ms <= 0) return wait(ms);
    const dur = ms / 1000;
    const t0 = ctx.currentTime + 0.01;
    const end = t0 + dur;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    src.loop = true;

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.8;
    band.frequency.setValueAtTime(500, t0);
    band.frequency.exponentialRampToValueAtTime(3200, t0 + dur * 0.45);
    band.frequency.exponentialRampToValueAtTime(900, end);

    const env = ctx.createGain();
    const level = 0.32;
    const fadeIn = Math.min(0.04, dur / 4);
    const fadeOut = Math.min(0.12, dur / 3);
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(level, t0 + fadeIn);
    env.gain.setValueAtTime(level, end - fadeOut);
    env.gain.linearRampToValueAtTime(0, end);

    const wobble = ctx.createGain();
    wobble.gain.value = 0.7;
    const flutter = ctx.createOscillator();
    flutter.frequency.value = 7;
    const flutterDepth = ctx.createGain();
    flutterDepth.gain.value = 0.3;
    flutter.connect(flutterDepth).connect(wobble.gain);

    const whistle = ctx.createOscillator();
    whistle.frequency.setValueAtTime(2400, t0);
    whistle.frequency.exponentialRampToValueAtTime(180, t0 + dur * 0.6);
    whistle.frequency.exponentialRampToValueAtTime(1300, end);
    const whistleGain = ctx.createGain();
    whistleGain.gain.value = 0.025;

    src.connect(band).connect(wobble).connect(env);
    whistle.connect(whistleGain).connect(env);
    env.connect(dest);

    for (const node of [src, flutter, whistle]) {
      node.start(t0);
      node.stop(end + 0.02);
    }
    await whenEnded(src, ms);
    env.disconnect();
  }

  private bell(freq: number, t: number, ring: number, peak: number): OscillatorNode {
    const ctx = this.ctx!;
    const carrier = ctx.createOscillator();
    carrier.frequency.value = freq;
    const mod = ctx.createOscillator();
    mod.frequency.value = freq * 3.5;
    const index = ctx.createGain();
    index.gain.setValueAtTime(freq * 4, t);
    index.gain.exponentialRampToValueAtTime(freq * 0.2, t + ring * 0.6);
    mod.connect(index).connect(carrier.frequency);

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + 0.005);
    amp.gain.exponentialRampToValueAtTime(0.0008, t + ring);
    carrier.connect(amp).connect(this.dest!);

    carrier.start(t);
    mod.start(t);
    carrier.stop(t + ring + 0.02);
    mod.stop(t + ring + 0.02);
    carrier.addEventListener('ended', () => amp.disconnect());
    return carrier;
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise && this.noise.sampleRate === ctx.sampleRate) return this.noise;
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
    return buf;
  }
}
