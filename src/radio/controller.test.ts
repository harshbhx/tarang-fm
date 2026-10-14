import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CallMeta, SegmentRequest } from '../../shared/schemas';
import { getStation } from '../../shared/stations';
import type { CallResponse, Line, Segment, StationId } from '../../shared/types';
import type { AudioEngine, PlayResult, Recorder } from '../audio/types';
import { RadioController, type RadioApi } from './controller';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const abortError = () => new DOMException('Aborted', 'AbortError');
const waitFor = (fn: () => void) => vi.waitFor(fn, { timeout: 3000, interval: 2 });

class FakeEngine implements AudioEngine {
  played: string[] = [];
  unlocks = 0;
  stops = 0;
  statics = 0;
  stings = 0;
  musicLog: string[] = [];
  playMs = 15;
  onPlay?: (text: string) => void;
  readonly analyser = null;
  private active = new Set<() => void>();

  readonly sfx = {
    sting: async () => {
      this.stings++;
      await delay(1);
    },
    callTone: async () => {
      await delay(1);
    },
    tuneStatic: async () => {
      this.statics++;
      await delay(2);
    },
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
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.active.delete(finish);
        resolve({ ttfaMs: 1, durationMs: 1 });
      };
      this.active.add(finish);
      res.text().then(
        (text) => {
          if (done) return;
          this.played.push(text);
          opts.onStart?.();
          setTimeout(finish, this.playMs);
          this.onPlay?.(text);
        },
        (err) => {
          if (done) return;
          done = true;
          this.active.delete(finish);
          reject(err);
        },
      );
    });
  }

  stopVoice(): void {
    this.stops++;
    for (const finish of [...this.active]) finish();
  }

  silence(ms: number): Promise<void> {
    return delay(ms);
  }
}

class FakeRecorder implements Recorder {
  recording = false;
  cancels = 0;
  startDelay = 1;
  async start(): Promise<void> {
    await delay(this.startDelay);
    this.recording = true;
  }
  async stop(): Promise<Blob> {
    this.recording = false;
    return new Blob([new Uint8Array(200)], { type: 'audio/webm;codecs=opus' });
  }
  cancel(): void {
    this.recording = false;
    this.cancels++;
  }
  level(): number {
    return 0.5;
  }
}

function rjLine(station: StationId, text: string): Line {
  const voice = getStation(station).cast.rj;
  return { role: 'rj', speaker: voice.speaker, text, en: `${text} (en)`, pace: 1, temperature: 0.5, pauseAfterMs: 0 };
}

function harness() {
  const engine = new FakeEngine();
  const recorder = new FakeRecorder();
  const requests: SegmentRequest[] = [];
  const aborted: string[] = [];
  const tts: string[] = [];
  const calls: CallMeta[] = [];
  const failSegment = new Set<string>();
  const failTts = new Set<string>();
  let segDelay = 3;
  let callDelay = 5;
  let callResponse: CallResponse = {
    transcript: 'ek sher ki kahani sunao',
    transcriptEn: 'tell me a story about a tiger',
    intent: 'story_request',
    theme: 'tiger',
    reply: rjLine('hi', 'reply-text'),
  };
  let n = 0;

  const api: RadioApi = {
    getContext: async () => ({ city: 'Jammu', headlines: [{ title: 'Headline', url: 'https://example.com/1' }] }),
    getSegment: async (req: SegmentRequest, signal?: AbortSignal): Promise<Segment> => {
      requests.push(req);
      await delay(segDelay);
      if (signal?.aborted) {
        aborted.push(req.type);
        throw abortError();
      }
      if (failSegment.has(req.type)) throw new Error('segment failed');
      n += 1;
      const tag = `${req.station}:${req.type}${req.theme ? `(${req.theme})` : ''}`;
      return {
        id: `seg-${n}`,
        station: req.station,
        type: req.type,
        title: `${req.type} ${n}`,
        lines: [0, 1].map((i) => rjLine(req.station, `${tag}:${i}`)),
      };
    },
    ttsFetch: async (line, _station, signal) => {
      tts.push(line.text);
      await delay(2);
      if (signal?.aborted) throw abortError();
      if (failTts.has(line.text)) throw new Error('tts failed');
      return new Response(line.text, { headers: { 'content-type': 'audio/pcm' } });
    },
    postCall: async (_blob, meta, signal) => {
      calls.push(meta);
      await delay(callDelay);
      if (signal?.aborted) throw abortError();
      return callResponse;
    },
  };

  const c = new RadioController({
    engine,
    recorder,
    api,
    timings: {
      ttsFailCaptionMs: 10,
      segmentRetryMs: 2,
      contextWaitMs: 50,
      failureBackoffMs: 10,
      minCallMs: 10,
      callLingerMs: 30,
      staticMs: 1,
    },
  });
  return {
    c,
    engine,
    recorder,
    requests,
    aborted,
    tts,
    calls,
    failSegment,
    failTts,
    setSegDelay: (ms: number) => (segDelay = ms),
    setCallDelay: (ms: number) => (callDelay = ms),
    setCallResponse: (r: CallResponse) => (callResponse = r),
  };
}

const HI_ID = getStation('hi').stationIdText;
const TA_ID = getStation('ta').stationIdText;

let active: ReturnType<typeof harness> | null = null;
function setup() {
  active = harness();
  return active;
}

afterEach(() => {
  active?.c.cancelCall();
  active?.c.pause();
  active = null;
});

describe('RadioController programme', () => {
  it('plays the clock in order with personalised requests', async () => {
    const h = setup();
    await h.c.tuneIn();
    await waitFor(() => expect(h.engine.played.length).toBeGreaterThanOrEqual(7));
    expect(h.engine.played.slice(0, 7)).toEqual([
      HI_ID,
      'hi:rj_link:0',
      'hi:rj_link:1',
      'hi:news:0',
      'hi:news:1',
      'hi:ad_break:0',
      'hi:ad_break:1',
    ]);
    const rj = h.requests.find((r) => r.type === 'rj_link');
    expect(rj?.upNext).toBe('news');
    expect(rj?.listener.city).toBe('Jammu');
    expect(rj?.listener.localTime).toMatch(/^\d{2}:\d{2}$/);
    expect(h.requests.find((r) => r.type === 'news')?.headlines).toHaveLength(1);
    expect(h.requests.find((r) => r.type === 'rj_link')?.headlines).toBeUndefined();

    const s = h.c.getSnapshot();
    expect(s.status).toBe('playing');
    expect(s.listener.city).toBe('Jammu');
    expect(s.caption?.speaker).toBe(getStation('hi').cast.rj.speaker);
    expect(s.caption?.label).toBe(getStation('hi').cast.rj.label);
    expect(s.history.length).toBeLessThanOrEqual(6);
    expect(s.history.length).toBeGreaterThan(0);
    expect(typeof s.ttfaMs).toBe('number');
    expect(h.engine.musicLog[0]).toBe(`start:${getStation('hi').accent}`);
  });

  it('prefetches the next segment and the next line', async () => {
    const h = setup();
    let seenSegments: string[] = [];
    let seenTts: string[] = [];
    h.engine.onPlay = (text) => {
      if (text === 'hi:rj_link:0') {
        seenSegments = h.requests.map((r) => r.type);
        seenTts = [...h.tts];
      }
    };
    await h.c.tuneIn();
    await waitFor(() => expect(seenTts.length).toBeGreaterThan(0));
    expect(seenSegments).toContain('news');
    expect(seenTts).toContain('hi:rj_link:1');
  });

  it('ignores a double tap on Tune in', async () => {
    const h = setup();
    void h.c.tuneIn();
    void h.c.tuneIn();
    await waitFor(() => expect(h.engine.played.length).toBeGreaterThanOrEqual(5));
    expect(h.engine.unlocks).toBe(1);
    expect(h.engine.played.filter((t) => t === HI_ID)).toHaveLength(1);
    expect(new Set(h.engine.played).size).toBe(h.engine.played.length);
  });

  it('switches station mid-line without leaking the old programme', async () => {
    const h = setup();
    let switchedAt = -1;
    let requestsAt = -1;
    h.engine.onPlay = (text) => {
      if (text === 'hi:rj_link:0') {
        switchedAt = h.engine.played.length;
        requestsAt = h.requests.length;
        h.c.setStation('ta');
      }
    };
    await h.c.tuneIn();
    await waitFor(() => expect(h.engine.played.filter((t) => t.startsWith('ta:')).length).toBeGreaterThanOrEqual(3));
    const after = h.engine.played.slice(switchedAt);
    expect(after[0]).toBe(TA_ID);
    expect(after.some((t) => t.startsWith('hi:'))).toBe(false);
    expect(h.engine.statics).toBe(1);
    expect(h.engine.musicLog).toContain(`start:${getStation('ta').accent}`);
    expect(h.c.getSnapshot().stationId).toBe('ta');
    expect(h.requests.slice(requestsAt).every((r) => r.station === 'ta')).toBe(true);
    expect(h.aborted).toContain('news');
  });

  it('only changes the station id before tuning in', () => {
    const h = setup();
    h.c.setStation('bn');
    expect(h.c.getSnapshot()).toMatchObject({ stationId: 'bn', status: 'idle' });
    expect(h.engine.statics).toBe(0);
    expect(h.engine.unlocks).toBe(0);
  });

  it('pauses and restarts the current line on resume', async () => {
    const h = setup();
    let pausedAt = -1;
    h.engine.onPlay = (text) => {
      if (text === 'hi:rj_link:0' && pausedAt < 0) {
        pausedAt = h.engine.played.length;
        h.c.pause();
      }
    };
    await h.c.tuneIn();
    await waitFor(() => expect(h.c.getSnapshot().status).toBe('paused'));
    await delay(60);
    expect(h.engine.played.length).toBe(pausedAt);
    expect(h.engine.musicLog).toContain('stop');
    h.c.resume();
    await waitFor(() => expect(h.engine.played.length).toBeGreaterThanOrEqual(pausedAt + 2));
    expect(h.engine.played.slice(pausedAt, pausedAt + 2)).toEqual(['hi:rj_link:0', 'hi:rj_link:1']);
  });

  it('shows the caption and moves on when a line fails to synthesise', async () => {
    const h = setup();
    h.failTts.add('hi:rj_link:0');
    await h.c.tuneIn();
    await waitFor(() => expect(h.engine.played).toContain('hi:rj_link:1'));
    expect(h.engine.played).not.toContain('hi:rj_link:0');
    expect(h.c.getSnapshot().history.some((cap) => cap.text === 'hi:rj_link:0')).toBe(true);
  });

  it('retries a failed segment once, then skips it', async () => {
    const h = setup();
    h.failSegment.add('news');
    await h.c.tuneIn();
    await waitFor(() => expect(h.engine.played).toContain('hi:ad_break:0'));
    expect(h.engine.played.some((t) => t.includes(':news:'))).toBe(false);
    expect(h.requests.filter((r) => r.type === 'news').length).toBe(2);
  });
});

describe('RadioController call-in', () => {
  it('puts the caller on air, queues the requested story and resumes from the next line', async () => {
    const h = setup();
    let called = false;
    h.engine.onPlay = (text) => {
      if (text === 'hi:rj_link:0' && !called) {
        called = true;
        void h.c.startCall();
      }
    };
    await h.c.tuneIn();
    await waitFor(() => expect(h.c.getSnapshot().status).toBe('call_recording'));
    expect(h.c.getMicLevel()).toBe(0.5);
    await delay(25);
    await h.c.endCall();
    await waitFor(() => expect(h.engine.played).toContain('hi:news:0'));

    const played = h.engine.played;
    const reply = played.indexOf('reply-text');
    expect(reply).toBeGreaterThan(played.indexOf('hi:rj_link:0'));
    expect(played.slice(reply + 1, reply + 5)).toEqual([
      'hi:rj_link:1',
      'hi:kahani(tiger):0',
      'hi:kahani(tiger):1',
      'hi:news:0',
    ]);

    const story = h.requests.find((r) => r.type === 'kahani');
    expect(story?.theme).toBe('tiger');
    expect(story?.recentCalls).toEqual(['ek sher ki kahani sunao']);
    expect(h.calls[0]).toMatchObject({ station: 'hi', nowPlaying: 'rj_link 1' });

    const s = h.c.getSnapshot();
    const caller = [...s.history, s.caption].find((cap) => cap?.role === 'caller');
    expect(caller).toMatchObject({ speaker: '', label: 'Caller', en: 'tell me a story about a tiger' });
    expect(s.status).toBe('playing');
  });

  it('drops a too-short recording and keeps the programme going', async () => {
    const h = setup();
    let called = false;
    h.engine.onPlay = (text) => {
      if (text === 'hi:rj_link:0' && !called) {
        called = true;
        void h.c.startCall().then(() => h.c.endCall());
      }
    };
    await h.c.tuneIn();
    await waitFor(() => expect(h.engine.played).toContain('hi:rj_link:1'));
    expect(h.calls).toHaveLength(0);
    expect(h.recorder.cancels).toBe(1);
    expect(h.c.getSnapshot().call?.error).toMatch(/too short/);
  });

  it('handles release before the mic permission resolves', async () => {
    const h = setup();
    h.recorder.startDelay = 30;
    let called = false;
    h.engine.onPlay = (text) => {
      if (text === 'hi:rj_link:0' && !called) {
        called = true;
        void h.c.startCall();
        void h.c.endCall();
      }
    };
    await h.c.tuneIn();
    await waitFor(() => expect(h.engine.played).toContain('hi:rj_link:1'));
    expect(h.calls).toHaveLength(0);
    expect(h.c.getSnapshot().status).toBe('playing');
  });

  it('stays paused after a call that was paused', async () => {
    const h = setup();
    let called = false;
    h.engine.onPlay = (text) => {
      if (text === 'hi:rj_link:0' && !called) {
        called = true;
        void h.c.startCall();
      }
    };
    await h.c.tuneIn();
    await waitFor(() => expect(h.c.getSnapshot().status).toBe('call_recording'));
    h.c.pause();
    await delay(25);
    await h.c.endCall();
    await waitFor(() => expect(h.engine.played).toContain('reply-text'));
    await waitFor(() => expect(h.c.getSnapshot().status).toBe('paused'));
    const count = h.engine.played.length;
    await delay(50);
    expect(h.engine.played.length).toBe(count);
    h.c.resume();
    await waitFor(() => expect(h.engine.played.length).toBeGreaterThan(count));
    expect(h.engine.played[count]).toBe('hi:rj_link:1');
  });

  it('abandons the call when the station changes while the RJ is thinking', async () => {
    const h = setup();
    h.setCallDelay(40);
    let called = false;
    h.engine.onPlay = (text) => {
      if (text === 'hi:rj_link:0' && !called) {
        called = true;
        void h.c.startCall();
      }
    };
    await h.c.tuneIn();
    await waitFor(() => expect(h.c.getSnapshot().status).toBe('call_recording'));
    await delay(25);
    void h.c.endCall();
    await waitFor(() => expect(h.c.getSnapshot().status).toBe('call_thinking'));
    h.c.setStation('ta');
    await waitFor(() => expect(h.engine.played.filter((t) => t.startsWith('ta:')).length).toBeGreaterThanOrEqual(2));
    await delay(60);
    expect(h.engine.played).not.toContain('reply-text');
    expect(h.engine.played.filter((t) => t.startsWith('hi:'))).toEqual(['hi:rj_link:0']);
    expect(h.c.getSnapshot().call).toBeUndefined();
  });

  it('reports call errors and resumes', async () => {
    const h = setup();
    h.setCallResponse(undefined as unknown as CallResponse);
    let called = false;
    h.engine.onPlay = (text) => {
      if (text === 'hi:rj_link:0' && !called) {
        called = true;
        void h.c.startCall();
      }
    };
    await h.c.tuneIn();
    await waitFor(() => expect(h.c.getSnapshot().status).toBe('call_recording'));
    await delay(25);
    await h.c.endCall();
    await waitFor(() => expect(h.engine.played).toContain('hi:rj_link:1'));
    expect(h.c.getSnapshot().status).toBe('playing');
  });

  it('cancels a call and resumes the programme', async () => {
    const h = setup();
    let called = false;
    h.engine.onPlay = (text) => {
      if (text === 'hi:rj_link:0' && !called) {
        called = true;
        void h.c.startCall();
      }
    };
    await h.c.tuneIn();
    await waitFor(() => expect(h.recorder.recording).toBe(true));
    h.c.cancelCall();
    expect(h.recorder.cancels).toBe(1);
    await waitFor(() => expect(h.engine.played).toContain('hi:rj_link:1'));
    expect(h.calls).toHaveLength(0);
  });
});

describe('RadioController call-in races', () => {
  it('cancels a call while the mic permission prompt is open', async () => {
    const h = setup();
    h.recorder.startDelay = 30;
    let called = false;
    h.engine.onPlay = (text) => {
      if (text === 'hi:rj_link:0' && !called) {
        called = true;
        void h.c.startCall();
        h.c.cancelCall();
      }
    };
    await h.c.tuneIn();
    await waitFor(() => expect(h.recorder.cancels).toBe(1));
    expect(h.recorder.recording).toBe(false);
    await waitFor(() => expect(h.engine.played).toContain('hi:rj_link:1'));
    expect(h.calls).toHaveLength(0);
  });
});

describe('RadioController settings', () => {
  it('keeps the raw listener name and toggles subtitles', () => {
    const h = setup();
    h.c.setListenerName('Harsh ');
    expect(h.c.getSnapshot().listener.name).toBe('Harsh ');
    h.c.setListenerName('');
    expect(h.c.getSnapshot().listener.name).toBeUndefined();
    h.c.toggleSubtitles();
    expect(h.c.getSnapshot().showSubtitles).toBe(false);
  });

  it('notifies subscribers with immutable snapshots', () => {
    const h = setup();
    const before = h.c.getSnapshot();
    let calls = 0;
    const off = h.c.subscribe(() => calls++);
    h.c.toggleSubtitles();
    off();
    h.c.toggleSubtitles();
    expect(calls).toBe(1);
    expect(h.c.getSnapshot()).not.toBe(before);
    expect(before.showSubtitles).toBe(true);
  });
});
