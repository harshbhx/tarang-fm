/**
 * Procedural music bed: a tanpura-like drone (Pa Sa Sa Sa, plucked in a cycle over
 * sustained sawtooth strings through a slowly swept low-pass) plus a soft open pad.
 */
import { rampTo } from './context';

/** Low tonic options (Hz): C2, C#2, D2, D#2, E2, F2. Picked per station accent. */
const ROOTS = [65.41, 69.3, 73.42, 77.78, 82.41, 87.31];
const CROSSFADE_S = 2.5;
const PLUCK_GAP_S = 1.15;
const LOOKAHEAD_S = 2.5;
const STRING_PEAK = 0.11;
const STRING_SUSTAIN = 0.035;
const PAD_LEVEL = 0.022;

function hexHue(accent: string): number | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(accent.trim());
  if (!m) return null;
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return null;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** Colour accents map by hue, so distinct station colours get distinct keys; other strings hash. */
export function rootForAccent(accent = ''): number {
  const hue = hexHue(accent);
  if (hue !== null) return ROOTS[Math.floor((hue / 360) * ROOTS.length) % ROOTS.length];
  let h = 0x811c9dc5;
  for (let i = 0; i < accent.length; i++) {
    h ^= accent.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ROOTS[(h >>> 0) % ROOTS.length];
}

class Bed {
  readonly out: GainNode;
  readonly root: number;
  private ctx: AudioContext;
  private oscs: OscillatorNode[] = [];
  private strings: GainNode[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextPluck: number;
  private pluckIndex = 0;

  constructor(ctx: AudioContext, dest: AudioNode, root: number) {
    this.ctx = ctx;
    this.root = root;
    const t = ctx.currentTime;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.Q.value = 3.5;
    filter.connect(this.out);

    const sweep = this.osc('sine', 0.045, t);
    const sweepDepth = ctx.createGain();
    sweepDepth.gain.value = 450;
    sweep.connect(sweepDepth).connect(filter.frequency);

    // Tanpura strings: Pa (low fifth), Sa, Sa (upper tonic), Sa (low tonic).
    const tuning = [root * 1.5, root * 2, root * 2.004, root];
    for (const f of tuning) {
      const osc = this.osc('sawtooth', f, t);
      const g = ctx.createGain();
      g.gain.value = STRING_SUSTAIN * 0.5;
      osc.connect(g).connect(filter);
      this.strings.push(g);
    }

    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 1400;
    const pad = ctx.createGain();
    pad.gain.value = PAD_LEVEL;
    padFilter.connect(pad).connect(this.out);
    const breath = this.osc('sine', 0.07, t);
    const breathDepth = ctx.createGain();
    breathDepth.gain.value = PAD_LEVEL * 0.6;
    breath.connect(breathDepth).connect(pad.gain);
    for (const [ratio, cents] of [
      [2, -5],
      [3, 4],
      [4, -3],
    ] as const) {
      const osc = this.osc('triangle', root * ratio, t);
      osc.detune.value = cents;
      osc.connect(padFilter);
    }

    this.nextPluck = t + 0.1;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 1000);
  }

  fadeIn(seconds: number): void {
    rampTo(this.out.gain, 1, seconds, this.ctx);
  }

  stop(seconds: number): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    rampTo(this.out.gain, 0, seconds, this.ctx);
    const end = this.ctx.currentTime + seconds + 0.05;
    for (const o of this.oscs) {
      try {
        o.stop(end);
      } catch {
        /* already stopped */
      }
    }
    this.oscs[0]?.addEventListener('ended', () => this.out.disconnect());
  }

  private osc(type: OscillatorType, freq: number, t: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.start(t);
    this.oscs.push(o);
    return o;
  }

  private schedule(): void {
    const now = this.ctx.currentTime;
    if (this.nextPluck < now) this.nextPluck = now + 0.05;
    while (this.nextPluck < now + LOOKAHEAD_S) {
      const i = this.pluckIndex++ % this.strings.length;
      const g = this.strings[i].gain;
      const t = this.nextPluck;
      const peak = STRING_PEAK * (0.85 + Math.random() * 0.3);
      g.setTargetAtTime(peak, t, 0.015);
      g.setTargetAtTime(STRING_SUSTAIN, t + 0.06, 1.4);
      const gap = i === this.strings.length - 1 ? PLUCK_GAP_S * 1.6 : PLUCK_GAP_S;
      this.nextPluck += gap * (0.97 + Math.random() * 0.06);
    }
  }
}

export class MusicBed {
  private ctx: AudioContext | null = null;
  private dest: AudioNode | null = null;
  private current: Bed | null = null;
  private wanted: string | null = null;

  attach(ctx: AudioContext, dest: AudioNode): void {
    this.ctx = ctx;
    this.dest = dest;
    if (this.wanted !== null) this.start(this.wanted);
  }

  /** Tonic of the playing bed, or null. */
  get root(): number | null {
    return this.current?.root ?? null;
  }

  start(accent = ''): void {
    this.wanted = accent;
    if (!this.ctx || !this.dest) return;
    const root = rootForAccent(accent);
    if (this.current?.root === root) {
      this.current.fadeIn(CROSSFADE_S);
      return;
    }
    this.current?.stop(CROSSFADE_S);
    this.current = new Bed(this.ctx, this.dest, root);
    this.current.fadeIn(CROSSFADE_S);
  }

  stop(fadeMs = 1500): void {
    this.wanted = null;
    this.current?.stop(Math.max(0, fadeMs) / 1000);
    this.current = null;
  }
}
