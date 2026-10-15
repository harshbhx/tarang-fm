import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LIVE_AUTO_OFF_MS,
  LIVE_ENDED_NOTE,
  LIVE_OFF_AIR_NOTE,
  LIVE_PCM_BYTES_PER_MS,
  type LiveLine,
  type LiveListener,
  type LiveServerMessage,
  type LiveSnapshot,
  type LiveState,
} from '../../shared/live';
import { getStation } from '../../shared/stations';
import type { Line } from '../../shared/types';
import type { AudioEngine, PlayResult } from '../audio/types';
import { median, ServerClock } from './clock';
import { LiveController, pcmDataStart, pcmOffset, type LiveSocket } from './controller';

/** The fake server's clock runs this far ahead of the local one */
const AHEAD = 2000;
const T0 = 1_760_000_000_000;

const server = () => Date.now() + AHEAD;
const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

class FakeSocket {
  readyState = 0;
  sent: Array<{ type: string; name?: string; t0?: number }> = [];
  closed = false;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    this.closed = true;
    this.readyState = 3;
  }

  // ---- server side ----
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  receive(msg: LiveServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }

  drop(): void {
    this.readyState = 3;
    this.onclose?.({});
  }

  pings(): number {
    return this.sent.filter((m) => m.type === 'ping').length;
  }
}

/** Audio bodies are filled with one byte value per line id, so a play can be traced to its line. */
const codes = new Map<string, number>();
const idsByCode = new Map<number, string>();
function codeFor(id: string): number {
  let code = codes.get(id);
  if (code === undefined) {
    code = codes.size + 1;
    codes.set(id, code);
    idsByCode.set(code, id);
  }
  return code;
}

interface Play {
  id: string;
  bytes: number;
  at: number;
}

class FakeEngine implements AudioEngine {
  plays: Play[] = [];
  unlocks = 0;
  voiceStops = 0;
  musicLog: string[] = [];
  readonly analyser = null;
  private active = new Set<() => void>();

  readonly sfx = {
    sting: async () => {},
    callTone: async () => {},
    tuneStatic: async () => {},
  };

  readonly music = {
    start: (accent?: string) => {
      this.musicLog.push(`start:${accent}`);
    },
    stop: () => {
      this.musicLog.push('stop');
    },
  };

  async unlock(): Promise<void> {
    this.unlocks++;
  }

  playStream(res: Response, opts: { onStart?: () => void } = {}): Promise<PlayResult> {
    return new Promise((resolve, reject) => {
      res.arrayBuffer().then((ab) => {
        const bytes = new Uint8Array(ab);
        this.plays.push({ id: idsByCode.get(bytes[0]) ?? '?', bytes: bytes.length, at: server() });
        opts.onStart?.();
        const finish = () => {
          if (!this.active.delete(finish)) return;
          clearTimeout(timer);
          resolve({ ttfaMs: 1, durationMs: bytes.length / LIVE_PCM_BYTES_PER_MS });
        };
        this.active.add(finish);
        const timer = setTimeout(finish, bytes.length / LIVE_PCM_BYTES_PER_MS);
      }, reject);
    });
  }

  stopVoice(): void {
    this.voiceStops++;
    for (const finish of [...this.active]) finish();
  }

  silence(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  playedIds(): string[] {
    return this.plays.map((p) => p.id);
  }
}

function line(id: string, startAt: number, durationMs: number, welcome?: string[]): LiveLine {
  const spoken: Line = { role: 'rj', speaker: 'shubh_hi_radio', text: `${id} text`, pace: 1, temperature: 0.5, pauseAfterMs: 0 };
  const l: LiveLine = { id, segmentId: 'seg-1', type: welcome ? 'rj_link' : 'news', title: 'Title', line: spoken, startAt, durationMs };
  if (welcome) l.welcome = welcome;
  return l;
}

function harness() {
  const engine = new FakeEngine();
  const sockets: FakeSocket[] = [];
  const fetched: string[] = [];
  const aborted: string[] = [];
  const durations = new Map<string, number>();

  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    fetched.push(url);
    const id = decodeURIComponent(url.split('/').pop() ?? '');
    init?.signal?.addEventListener('abort', () => aborted.push(id));
    await Promise.resolve();
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const ms = durations.get(id) ?? 1000;
    return new Response(new Uint8Array(ms * LIVE_PCM_BYTES_PER_MS).fill(codeFor(id)));
  }) as typeof fetch;

  const controller = new LiveController({
    engine,
    origin: 'http://localhost:5173',
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket as unknown as LiveSocket;
    },
    fetch: fakeFetch,
    now: () => Date.now(),
    mono: () => Date.now(),
    random: () => 0.5,
  });

  const socket = () => sockets[sockets.length - 1];

  /** Registers the lines' audio lengths so the fake /audio route serves the right byte counts. */
  const serve = (lines: LiveLine[]) => {
    for (const l of lines) durations.set(l.id, l.durationMs);
    return lines;
  };

  const joined = (
    you: LiveListener,
    lines: LiveLine[],
    state: LiveState = 'on_air',
    studio: Partial<LiveSnapshot> = { enabled: true, enabledUntil: server() + LIVE_AUTO_OFF_MS },
  ): LiveServerMessage => ({
    type: 'joined',
    you,
    snapshot: { station: 'hi', state, enabled: false, now: server(), listeners: [you], lines: serve(lines), ...studio },
  });

  /** join(name) from a click, the socket opens, and the server answers with a snapshot. */
  async function joinAs(name: string, lines: LiveLine[] = [], id = 'u1'): Promise<FakeSocket> {
    const p = controller.join(name);
    socket().open();
    socket().receive(joined({ id, name, joinedAt: server() }, lines));
    await p;
    await flush();
    return socket();
  }

  return { engine, sockets, socket, fetched, aborted, controller, serve, joined, joinAs };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'], now: T0 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('helpers', () => {
  it('pcmOffset converts late ms to an even byte offset', () => {
    expect(pcmOffset(1000)).toBe(1000 * LIVE_PCM_BYTES_PER_MS);
    expect(pcmOffset(3 / LIVE_PCM_BYTES_PER_MS)).toBe(2);
    expect(pcmOffset(-50)).toBe(0);
    for (const ms of [0.01, 1.3, 157.77, 3001.9]) expect(pcmOffset(ms) % 2).toBe(0);
  });

  it('pcmDataStart skips a WAV header and leaves raw PCM alone', () => {
    expect(pcmDataStart(new Uint8Array(100).fill(7).buffer)).toBe(0);
    const wav = new Uint8Array(44 + 10);
    const view = new DataView(wav.buffer);
    wav.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
    wav.set([...'WAVE'].map((c) => c.charCodeAt(0)), 8);
    wav.set([...'fmt '].map((c) => c.charCodeAt(0)), 12);
    view.setUint32(16, 16, true);
    wav.set([...'data'].map((c) => c.charCodeAt(0)), 36);
    view.setUint32(40, 10, true);
    expect(pcmDataStart(wav.buffer)).toBe(44);
  });

  it('median handles odd and even counts', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it('ServerClock prefers ping samples over a seeded guess', () => {
    const clock = new ServerClock();
    clock.seed(10_500, 10_000);
    expect(clock.offsetMs).toBe(500);
    // Sent at 9_900, back at 10_000 (rtt 100): the server stamped 10_250 at the midpoint 9_950
    expect(clock.add(10_250, 100, 10_000)).toBe(true);
    expect(clock.offsetMs).toBe(300);
    expect(clock.add(10_250, -5, 10_000)).toBe(false);
    expect(clock.add(10_250, 60_000, 10_000)).toBe(false);
  });
});

describe('LiveController', () => {
  it('joins: unlocks audio, connects, sends the name and shows the snapshot', async () => {
    const h = harness();
    const p = h.controller.join('  Asha   K ');
    expect(h.engine.unlocks).toBe(1);
    expect(h.controller.getSnapshot().status).toBe('connecting');
    expect(h.sockets).toHaveLength(1);
    expect(h.socket().url).toBe('ws://localhost:5173/api/live/hi/ws');

    h.socket().open();
    expect(h.socket().sent[0]).toEqual({ type: 'join', name: 'Asha K' });
    expect(h.socket().sent[1].type).toBe('ping');
    await flush(1000);
    expect(h.socket().pings()).toBe(3);
    await flush(9000);
    expect(h.socket().pings()).toBe(4);

    const you = { id: 'u1', name: 'Asha K', joinedAt: server() };
    h.socket().receive(h.joined(you, [], 'warming_up'));
    await p;
    let s = h.controller.getSnapshot();
    expect(s.status).toBe('warming_up');
    expect(s.you).toEqual(you);
    expect(s.listeners).toEqual([you]);
    expect(s.clockOffsetMs).toBe(AHEAD);
    expect(h.engine.musicLog).toEqual([`start:${getStation('hi').accent}`]);

    const ravi = { id: 'u2', name: 'Ravi', joinedAt: server() };
    h.socket().receive({ type: 'presence', now: server(), listeners: [you, ravi] });
    h.socket().receive({ type: 'status', now: server(), state: 'on_air' });
    s = h.controller.getSnapshot();
    expect(s.listeners.map((l) => l.name)).toEqual(['Asha K', 'Ravi']);
    expect(s.status).toBe('on_air');
  });

  it('starts off air before joining and tracks the studio switch from the snapshot', async () => {
    const h = harness();
    expect(h.controller.getSnapshot().enabled).toBe(false);
    const until = server() + LIVE_AUTO_OFF_MS;
    const p = h.controller.join('Asha');
    h.socket().open();
    h.socket().receive(h.joined({ id: 'u1', name: 'Asha', joinedAt: server() }, [], 'warming_up', { enabled: true, enabledUntil: until }));
    await p;
    const s = h.controller.getSnapshot();
    expect(s.enabled).toBe(true);
    expect(s.enabledUntil).toBe(until);
    expect(s.note).toBeUndefined();
  });

  it('an off-air station waits quietly, then picks up the studio starting it', async () => {
    const h = harness();
    const p = h.controller.join('Asha');
    h.socket().open();
    h.socket().receive(
      h.joined({ id: 'u1', name: 'Asha', joinedAt: server() }, [], 'sleeping', { enabled: false, note: LIVE_OFF_AIR_NOTE }),
    );
    await p;
    let s = h.controller.getSnapshot();
    expect(s.status).toBe('sleeping');
    expect(s.enabled).toBe(false);
    expect(s.enabledUntil).toBeUndefined();
    expect(s.note).toBe(LIVE_OFF_AIR_NOTE);

    // A status without the switch fields keeps them
    h.socket().receive({ type: 'status', now: server(), state: 'sleeping' });
    s = h.controller.getSnapshot();
    expect(s.enabled).toBe(false);
    expect(s.note).toBe(LIVE_OFF_AIR_NOTE);

    // The studio starts the station: warming up, the note clears
    const until = server() + LIVE_AUTO_OFF_MS;
    h.socket().receive({ type: 'status', now: server(), state: 'warming_up', enabled: true, enabledUntil: until });
    s = h.controller.getSnapshot();
    expect(s.status).toBe('warming_up');
    expect(s.enabled).toBe(true);
    expect(s.enabledUntil).toBe(until);
    expect(s.note).toBeUndefined();

    h.socket().receive({ type: 'status', now: server(), state: 'on_air' });
    s = h.controller.getSnapshot();
    expect(s.status).toBe('on_air');
    expect(s.enabled).toBe(true);
    expect(s.enabledUntil).toBe(until);

    // Auto-off: back to sleeping with the off-air note
    h.socket().receive({ type: 'status', now: server(), state: 'sleeping', enabled: false, note: LIVE_OFF_AIR_NOTE });
    s = h.controller.getSnapshot();
    expect(s.status).toBe('sleeping');
    expect(s.enabled).toBe(false);
    expect(s.enabledUntil).toBeUndefined();
    expect(s.note).toBe(LIVE_OFF_AIR_NOTE);

    // Leaving forgets the station's switch
    h.controller.leave();
    s = h.controller.getSnapshot();
    expect(s.enabled).toBe(false);
    expect(s.note).toBeUndefined();
  });

  it('keeps the median of the last 5 ping offsets', async () => {
    const h = harness();
    const ws = await h.joinAs('Asha');
    expect(h.controller.getSnapshot().clockOffsetMs).toBe(AHEAD);

    // rtt 100 ms; the server stamps the midpoint of the round trip plus `offset`
    const pong = (offset: number) =>
      ws.receive({ type: 'pong', t0: Date.now() - 100, now: Date.now() - 50 + offset });
    for (const offset of [100, 300, 200, 5000, 250]) pong(offset);
    expect(h.controller.getSnapshot().clockOffsetMs).toBe(250);
    pong(260); // drops the oldest (100)
    expect(h.controller.getSnapshot().clockOffsetMs).toBe(260);
    expect(h.controller.serverNow() - Date.now()).toBe(260);
  });

  it('joining mid-line plays only the rest of the PCM, from the right byte', async () => {
    const h = harness();
    const a = line('A', server() - 3000, 8000);
    const b = line('B', a.startAt + 8000 + 200, 1000);
    await h.joinAs('Asha', [a, b]);

    expect(h.controller.getSnapshot().current?.id).toBe('A');
    expect(h.controller.getSnapshot().upcoming.map((l) => l.id)).toEqual(['B']);
    expect(h.engine.plays).toHaveLength(1);
    expect(h.engine.plays[0]).toMatchObject({ id: 'A', bytes: (8000 - 3000) * LIVE_PCM_BYTES_PER_MS });
    expect(h.fetched).toEqual(['/api/live/hi/audio/A', '/api/live/hi/audio/B']);

    await flush(5000 + 200);
    expect(h.engine.playedIds()).toEqual(['A', 'B']);
    expect(h.engine.plays[1].bytes).toBe(1000 * LIVE_PCM_BYTES_PER_MS);
    expect(h.engine.plays[1].at).toBe(b.startAt);
  });

  it('skips a line that is mostly over and plays from the next one', async () => {
    const h = harness();
    const a = line('A', server() - 7000, 8000);
    const b = line('B', server() + 1500, 1000);
    await h.joinAs('Asha', [a, b]);
    expect(h.engine.plays).toHaveLength(0);
    expect(h.controller.getSnapshot().current).toBeUndefined();
    await flush(1600);
    expect(h.engine.playedIds()).toEqual(['B']);
  });

  it('a re-timed timeline never plays an id twice and keeps the line on air', async () => {
    const h = harness();
    const a = line('A', server() + 100, 1000);
    const b = line('B', a.startAt + 1200, 1000);
    const ws = await h.joinAs('Asha', [a, b]);
    await flush(150);
    expect(h.engine.playedIds()).toEqual(['A']);

    // A welcome goes in after A; B moves later. A is on air and must not be cut or restarted.
    const a2 = { ...a };
    const w = line('W', a.startAt + 1200, 1000, ['u9']);
    const b2 = { ...b, startAt: w.startAt + 1200 };
    h.serve([w]);
    ws.receive({ type: 'timeline', now: server(), lines: [a2, w, b2] });
    expect(h.controller.getSnapshot().current?.id).toBe('A');
    expect(h.engine.voiceStops).toBe(0);

    // Just after A ends, a late timeline still lists A (re-timed so it looks unfinished)
    await flush(1000);
    ws.receive({ type: 'timeline', now: server(), lines: [{ ...a, startAt: server() - 100 }, w, b2] });
    await flush(0);
    expect(h.engine.playedIds()).toEqual(['A']);

    await flush(4000);
    expect(h.engine.playedIds()).toEqual(['A', 'W', 'B']);
    expect(h.engine.plays.find((p) => p.id === 'B')?.at).toBe(b2.startAt);
  });

  it('welcomingYou is set while a welcome naming you plays; welcomedYou stays set', async () => {
    const h = harness();
    const n = line('N', server() + 100, 500);
    const other = line('O', n.startAt + 600, 500, ['u2']);
    const w = line('W', other.startAt + 600, 1000, ['u2', 'u1']);
    const m = line('M', w.startAt + 1100, 500);
    await h.joinAs('Asha', [n, other, w, m], 'u1');

    await flush(150);
    let s = h.controller.getSnapshot();
    expect(s.current?.id).toBe('N');
    expect([s.welcomingYou, s.welcomedYou]).toEqual([false, false]);

    await flush(600);
    s = h.controller.getSnapshot();
    expect(s.current?.id).toBe('O');
    expect([s.welcomingYou, s.welcomedYou]).toEqual([false, false]);

    await flush(600);
    s = h.controller.getSnapshot();
    expect(s.current?.id).toBe('W');
    expect([s.welcomingYou, s.welcomedYou]).toEqual([true, true]);

    await flush(1100);
    s = h.controller.getSnapshot();
    expect(s.current?.id).toBe('M');
    expect([s.welcomingYou, s.welcomedYou]).toEqual([false, true]);
  });

  it('reconnects with backoff and re-sends join with the same name, without replaying', async () => {
    const h = harness();
    const a = line('A', server() + 100, 3000);
    const first = await h.joinAs('Asha', [a]);
    await flush(200);
    expect(h.engine.playedIds()).toEqual(['A']);

    first.drop();
    expect(h.controller.getSnapshot().status).toBe('reconnecting');
    expect(h.sockets).toHaveLength(1);
    await flush(499);
    expect(h.sockets).toHaveLength(1);
    await flush(1);
    expect(h.sockets).toHaveLength(2);
    expect(h.socket().url).toBe(first.url);

    h.socket().open();
    expect(h.socket().sent[0]).toEqual({ type: 'join', name: 'Asha' });
    h.socket().receive(h.joined({ id: 'u1b', name: 'Asha', joinedAt: server() }, [a]));
    await flush(0);
    expect(h.controller.getSnapshot().status).toBe('on_air');
    expect(h.controller.getSnapshot().you?.id).toBe('u1b');
    // A kept playing through the drop and is not started again
    expect(h.engine.voiceStops).toBe(0);
    expect(h.engine.playedIds()).toEqual(['A']);
  });

  it('backs off further after each failed attempt', async () => {
    const h = harness();
    await h.joinAs('Asha');
    h.socket().drop();
    await flush(500);
    expect(h.sockets).toHaveLength(2);
    h.socket().drop(); // never opened
    await flush(999);
    expect(h.sockets).toHaveLength(2);
    await flush(1);
    expect(h.sockets).toHaveLength(3);
  });

  it('a join refused by the server is an error, not a retry loop', async () => {
    const h = harness();
    void h.controller.join('Asha');
    h.socket().open();
    h.socket().receive({ type: 'error', code: 'full', message: 'This station is full right now.' });
    const s = h.controller.getSnapshot();
    expect(s.status).toBe('error');
    expect(s.error).toBe('This station is full right now.');
    expect(h.socket().closed).toBe(true);
    await flush(60_000);
    expect(h.sockets).toHaveLength(1);
  });

  it('mute stops the voice but keeps the clock; unmute resumes the line mid-way', async () => {
    const h = harness();
    const a = line('A', server() + 100, 4000);
    await h.joinAs('Asha', [a]);
    await flush(200);
    expect(h.engine.playedIds()).toEqual(['A']);

    h.controller.toggleMute();
    expect(h.controller.getSnapshot().muted).toBe(true);
    expect(h.engine.voiceStops).toBe(1);
    expect(h.engine.musicLog.at(-1)).toBe('stop');
    await flush(1000);
    expect(h.controller.getSnapshot().current?.id).toBe('A');

    h.controller.toggleMute();
    await flush(0);
    expect(h.engine.plays).toHaveLength(2);
    // 1100 ms of the line had gone by
    expect(h.engine.plays[1]).toMatchObject({ id: 'A', bytes: (4000 - 1100) * LIVE_PCM_BYTES_PER_MS });

    await flush(3000);
    expect(h.controller.getSnapshot().current).toBeUndefined();
  });

  it('setStation leaves the old show, aborts its fetches and joins the new one with the same name', async () => {
    const h = harness();
    const a = line('A', server() + 5000, 1000);
    const b = line('B', a.startAt + 1200, 1000);
    const old = await h.joinAs('Asha', [a, b]);
    expect(h.fetched).toHaveLength(2);

    h.controller.setStation('ta');
    expect(old.closed).toBe(true);
    expect(h.aborted.sort()).toEqual(['A', 'B']);
    let s = h.controller.getSnapshot();
    expect(s.station).toBe('ta');
    expect(s.status).toBe('connecting');
    expect(s.upcoming).toEqual([]);
    expect(s.enabled).toBe(false);
    expect(h.socket().url).toBe('ws://localhost:5173/api/live/ta/ws');
    h.socket().open();
    expect(h.socket().sent[0]).toEqual({ type: 'join', name: 'Asha' });
    await flush(0);
    expect(h.engine.musicLog.at(-1)).toBe(`start:${getStation('ta').accent}`);

    h.socket().receive(h.joined({ id: 'u5', name: 'Asha', joinedAt: server() }, []));
    s = h.controller.getSnapshot();
    expect(s.status).toBe('on_air');
    expect(s.enabled).toBe(true);
    // Nothing from the old station plays
    await flush(10_000);
    expect(h.engine.plays).toHaveLength(0);
  });

  it('leave closes the socket, stops audio and clears every timer', async () => {
    const h = harness();
    const a = line('A', server() + 100, 2000);
    const b = line('B', a.startAt + 2200, 1000);
    const ws = await h.joinAs('Asha', [a, b]);
    await flush(200);
    expect(h.engine.playedIds()).toEqual(['A']);

    h.controller.leave();
    expect(ws.closed).toBe(true);
    expect(h.engine.voiceStops).toBe(1);
    expect(h.engine.musicLog.at(-1)).toBe('stop');
    expect(h.aborted).toContain('B');
    const s = h.controller.getSnapshot();
    expect(s.status).toBe('idle');
    expect(s.current).toBeUndefined();
    expect(s.you).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);

    await flush(10_000);
    expect(h.engine.playedIds()).toEqual(['A']);
    expect(h.sockets).toHaveLength(1);
  });

  it('a socket that goes silent is dropped and replaced', async () => {
    const h = harness();
    await h.joinAs('Asha');
    // No pongs come back: after staleSocketMs the next ping sees a dead socket
    await flush(30_000);
    expect(h.sockets[0].closed).toBe(false);
    await flush(10_000);
    expect(h.sockets[0].closed).toBe(true);
    expect(h.controller.getSnapshot().status).toBe('reconnecting');
    await flush(500);
    expect(h.sockets).toHaveLength(2);
  });
});

describe('LiveController show limit', () => {
  it('the show ending is told apart from off air, and Tune in again asks for a fresh show', async () => {
    const h = harness();
    const ws = await h.joinAs('Asha');
    expect(h.controller.getSnapshot().enabled).toBe(true);

    // The six-minute limit: sleeping with the ended note; the station still starts by itself
    ws.receive({ type: 'status', now: server(), state: 'sleeping', enabled: true, note: LIVE_ENDED_NOTE });
    let s = h.controller.getSnapshot();
    expect(s.status).toBe('sleeping');
    expect(s.note).toBe(LIVE_ENDED_NOTE);
    expect(s.enabled).toBe(true);
    expect(s.enabledUntil).toBeUndefined();

    h.controller.restart();
    expect(ws.sent.filter((m) => m.type === 'restart')).toHaveLength(1);

    // A refused restart shows its reason; the next status clears the ended note
    ws.receive({ type: 'error', code: 'too_soon', message: 'The show is starting again. Try once more in a few seconds.' });
    expect(h.controller.getSnapshot().status).toBe('sleeping');
    expect(h.controller.getSnapshot().error).toMatch(/starting again/);
    h.controller.restart();
    expect(h.controller.getSnapshot().error).toBeUndefined();

    const until = server() + LIVE_AUTO_OFF_MS;
    ws.receive({ type: 'status', now: server(), state: 'warming_up', enabled: true, enabledUntil: until });
    s = h.controller.getSnapshot();
    expect(s.status).toBe('warming_up');
    expect(s.note).toBeUndefined();
    expect(s.enabledUntil).toBe(until);
  });

  it('a newcomer to an ended show sees it ended; restart is a no-op before joining', async () => {
    const h = harness();
    h.controller.restart();
    const p = h.controller.join('Asha');
    h.socket().open();
    expect(h.socket().sent.some((m) => m.type === 'restart')).toBe(false);
    h.socket().receive(h.joined({ id: 'u1', name: 'Asha', joinedAt: server() }, [], 'sleeping', { enabled: true, note: LIVE_ENDED_NOTE }));
    await p;
    const s = h.controller.getSnapshot();
    expect(s.status).toBe('sleeping');
    expect(s.note).toBe(LIVE_ENDED_NOTE);
    expect(s.enabled).toBe(true);
  });
});
