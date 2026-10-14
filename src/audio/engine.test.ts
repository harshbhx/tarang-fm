import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Ramp = { param: FakeParam; target: number; at: number };
const ramps: Ramp[] = [];

class FakeParam {
  value: number;
  constructor(v: number) {
    this.value = v;
  }
  setValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number, at: number) {
    ramps.push({ param: this, target: v, at });
    return this;
  }
  exponentialRampToValueAtTime() {
    return this;
  }
  setTargetAtTime() {
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}

class FakeNode {
  connect<T>(n: T): T {
    return n;
  }
  disconnect() {}
}

class FakeGain extends FakeNode {
  gain = new FakeParam(1);
}

class FakeBuffer {
  data: Float32Array;
  constructor(
    _ch: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = new Float32Array(length);
  }
  get duration() {
    return this.length / this.sampleRate;
  }
  getChannelData() {
    return this.data;
  }
}

class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null;
  onended: (() => void) | null = null;
  startAt = -1;
  stopAt = Infinity;
  ended = false;
  constructor(private ctx: FakeContext) {
    super();
  }
  start(t = 0) {
    this.startAt = t;
    this.ctx.sources.push(this);
  }
  stop(t = 0) {
    this.stopAt = t;
  }
  get endsAt() {
    return Math.min(this.stopAt, this.startAt + (this.buffer?.duration ?? 0));
  }
}

class FakeContext {
  static last: FakeContext | null = null;
  currentTime = 0;
  state = 'running';
  sampleRate = 48000;
  destination = new FakeNode();
  sources: FakeSource[] = [];
  constructor() {
    FakeContext.last = this;
  }
  resume() {
    return Promise.resolve();
  }
  createGain() {
    return new FakeGain();
  }
  createBuffer(ch: number, len: number, rate: number) {
    return new FakeBuffer(ch, len, rate);
  }
  createBufferSource() {
    return new FakeSource(this);
  }
  createAnalyser() {
    return Object.assign(new FakeNode(), { fftSize: 0, smoothingTimeConstant: 0 });
  }
  createDynamicsCompressor() {
    const p = () => new FakeParam(0);
    return Object.assign(new FakeNode(), { threshold: p(), knee: p(), ratio: p(), attack: p(), release: p() });
  }
  advance(seconds: number) {
    this.currentTime += seconds;
    for (const s of this.sources) {
      if (!s.ended && s.endsAt <= this.currentTime) {
        s.ended = true;
        s.onended?.();
      }
    }
  }
  voiceSources() {
    return this.sources.filter((s) => s.buffer && s.buffer.length > 1);
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function controlledResponse(contentType = 'audio/pcm;rate=24000') {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      cancelled = true;
    },
  });
  const res = new Response(body, { headers: { 'content-type': contentType } });
  return { res, controller, wasCancelled: () => cancelled };
}

async function newEngine() {
  const { WebAudioEngine } = await import('./engine');
  const engine = new WebAudioEngine();
  await engine.unlock();
  return { engine, ctx: FakeContext.last! };
}

beforeEach(() => {
  ramps.length = 0;
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('window', { addEventListener() {} });
  vi.stubGlobal('document', { addEventListener() {}, visibilityState: 'visible' });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('WebAudioEngine.playStream', () => {
  it('schedules chunks gaplessly and resolves after the last source ends', async () => {
    const { engine, ctx } = await newEngine();
    const { res, controller } = controlledResponse();
    const onStart = vi.fn();
    let result: { ttfaMs: number; durationMs: number } | null = null;
    const p = engine.playStream(res, { onStart, fetchStartedAt: performance.now() - 100 }).then((r) => (result = r));

    controller.enqueue(new Uint8Array(4801));
    await tick();
    const [first] = ctx.voiceSources();
    expect(first.startAt).toBeCloseTo(0.03);
    expect(first.buffer!.sampleRate).toBe(24000);
    expect(first.buffer!.length).toBe(2400);
    expect(onStart).toHaveBeenCalledTimes(1);

    controller.enqueue(new Uint8Array(12000));
    await tick();
    const [, second] = ctx.voiceSources();
    expect(second.startAt).toBeCloseTo(first.startAt + 0.1, 9);

    controller.close();
    await tick();
    expect(result).toBeNull();
    ctx.advance(0.2);
    await tick();
    expect(result).toBeNull();
    ctx.advance(0.5);
    await p;
    expect(result!.durationMs).toBe(350);
    expect(result!.ttfaMs).toBeGreaterThanOrEqual(129);
    expect(result!.ttfaMs).toBeLessThan(400);
  });

  it('holds the first buffer until ~100 ms is available, then catches up on starvation', async () => {
    const { engine, ctx } = await newEngine();
    const { res, controller } = controlledResponse();
    void engine.playStream(res);
    controller.enqueue(new Uint8Array(2000));
    await tick();
    expect(ctx.voiceSources()).toHaveLength(0);
    controller.enqueue(new Uint8Array(3000));
    await tick();
    expect(ctx.voiceSources()).toHaveLength(1);
    ctx.advance(0.1);
    controller.enqueue(new Uint8Array(200));
    await tick();
    expect(ctx.voiceSources()).toHaveLength(2);
    engine.stopVoice(0);
  });

  it('skips a WAV header and uses its sample rate', async () => {
    const { engine, ctx } = await newEngine();
    const { res, controller } = controlledResponse('audio/wav');
    const header = new Uint8Array(44);
    const v = new DataView(header.buffer);
    [...'RIFF'].forEach((c, i) => v.setUint8(i, c.charCodeAt(0)));
    v.setUint32(4, 0xffffffff, true);
    [...'WAVEfmt '].forEach((c, i) => v.setUint8(8 + i, c.charCodeAt(0)));
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, 22050, true);
    v.setUint16(34, 16, true);
    [...'data'].forEach((c, i) => v.setUint8(36 + i, c.charCodeAt(0)));
    v.setUint32(40, 0xffffffff, true);
    const p = engine.playStream(res);
    controller.enqueue(header);
    controller.enqueue(new Uint8Array(4410));
    controller.close();
    await tick();
    const [src] = ctx.voiceSources();
    expect(src.buffer!.length).toBe(2205);
    expect(src.buffer!.sampleRate).toBe(22050);
    ctx.advance(1);
    await expect(p).resolves.toEqual(expect.objectContaining({ durationMs: 100 }));
  });

  it('stopVoice cancels the reader, stops sources and resolves the pending play', async () => {
    const { engine, ctx } = await newEngine();
    const { res, controller, wasCancelled } = controlledResponse();
    const p = engine.playStream(res);
    controller.enqueue(new Uint8Array(9600));
    await tick();
    const [src] = ctx.voiceSources();
    ctx.advance(0.08);
    engine.stopVoice(100);
    const r = await p;
    expect(r.durationMs).toBe(50);
    expect(src.stopAt).toBeCloseTo(0.08 + 0.11);
    await tick();
    expect(wasCancelled()).toBe(true);
    const fade = ramps.find((x) => x.target === 0);
    expect(fade?.at).toBeCloseTo(0.18);

    const next = controlledResponse();
    const p2 = engine.playStream(next.res);
    next.controller.enqueue(new Uint8Array(4800));
    next.controller.close();
    await tick();
    const fresh = ctx.voiceSources()[1];
    expect(fresh.startAt).toBeCloseTo(0.08 + 0.03);
    ctx.advance(1);
    await expect(p2).resolves.toEqual(expect.objectContaining({ durationMs: 100 }));
  });

  it('resolves a stopped play even before any audio arrived', async () => {
    const { engine } = await newEngine();
    const { res } = controlledResponse();
    const p = engine.playStream(res);
    await tick();
    engine.stopVoice();
    await expect(p).resolves.toEqual({ ttfaMs: 0, durationMs: 0 });
  });

  it('rejects when nothing can be played', async () => {
    const { engine } = await newEngine();
    await expect(engine.playStream(new Response('nope', { status: 502 }))).rejects.toThrow(/502/);
    const empty = controlledResponse();
    const p = engine.playStream(empty.res);
    empty.controller.close();
    await expect(p).rejects.toThrow(/no audio/);
  });

  it('rejects before unlock', async () => {
    const { WebAudioEngine } = await import('./engine');
    await expect(new WebAudioEngine().playStream(new Response(new Uint8Array(10)))).rejects.toThrow(/unlock/);
  });
});

describe('ducking', () => {
  it('ducks music while voice plays and restores it 400 ms after', async () => {
    const { engine, ctx } = await newEngine();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { res, controller } = controlledResponse();
    const p = engine.playStream(res);
    controller.enqueue(new Uint8Array(4800));
    controller.close();
    await vi.advanceTimersByTimeAsync(0);
    const duck = ramps.find((r) => r.target === 0.08);
    expect(duck?.at).toBeCloseTo(0.15);

    ctx.advance(0.5);
    await p;
    await vi.advanceTimersByTimeAsync(350);
    expect(ramps.some((r) => r.target === 0.25)).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    const restore = ramps.find((r) => r.target === 0.25);
    expect(restore?.param).toBe(duck?.param);
  });

  it('stays ducked when the next line starts within the hold time', async () => {
    const { engine, ctx } = await newEngine();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const a = controlledResponse();
    const p = engine.playStream(a.res);
    a.controller.enqueue(new Uint8Array(4800));
    a.controller.close();
    await vi.advanceTimersByTimeAsync(0);
    ctx.advance(0.5);
    await p;
    await vi.advanceTimersByTimeAsync(200);
    const b = controlledResponse();
    void engine.playStream(b.res);
    b.controller.enqueue(new Uint8Array(4800));
    await vi.advanceTimersByTimeAsync(600);
    expect(ramps.some((r) => r.target === 0.25)).toBe(false);
    engine.stopVoice(0);
  });
});
