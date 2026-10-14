import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CallMeta, SegmentRequest } from '../../shared/schemas';
import { getStation } from '../../shared/stations';
import type { CallResponse, Line, PhoneCall, PhoneRecentResponse, Segment, StationId } from '../../shared/types';
import type { AudioEngine, PlayResult, Recorder } from '../audio/types';
import { readCallStream, type LiveCallResponse } from './api';
import { RadioController, producerPlan, toDedication, type RadioApi, type RadioTimings } from './controller';

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

function harness(extraTimings: Partial<RadioTimings> = {}) {
  const engine = new FakeEngine();
  const recorder = new FakeRecorder();
  const requests: SegmentRequest[] = [];
  const aborted: string[] = [];
  const tts: string[] = [];
  const calls: CallMeta[] = [];
  const failSegment = new Set<string>();
  const failTts = new Set<string>();
  /** Studio call ids the fake worker leaves out of its script */
  const skipDedications = new Set<string>();
  let segDelay = 3;
  let callDelay = 5;
  let callResponse: LiveCallResponse = {
    transcript: 'ek sher ki kahani sunao',
    transcriptEn: 'tell me a story about a tiger',
    intent: 'story_request',
    theme: 'tiger',
    reply: rjLine('hi', 'reply-text'),
  };
  let n = 0;
  const phone = { calls: [] as PhoneCall[], polls: 0, inFlight: 0, maxInFlight: 0 };

  const api: RadioApi = {
    getPhoneRecent: async (signal?: AbortSignal): Promise<PhoneRecentResponse> => {
      phone.polls += 1;
      phone.inFlight += 1;
      phone.maxInFlight = Math.max(phone.maxInFlight, phone.inFlight);
      try {
        await delay(1);
        if (signal?.aborted) throw abortError();
        return { number: '+917965854148', calls: [...phone.calls] };
      } finally {
        phone.inFlight -= 1;
      }
    },
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
        summary: `${req.type} ${n} aired`,
        ...(req.type === 'news' ? { mood: 'heavy' as const } : {}),
        ...(req.dedications?.length ? { dedicated: req.dedications.map((d) => d.id).filter((id) => !skipDedications.has(id)) } : {}),
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
      phonePollMs: 20,
      ...extraTimings,
    },
  });
  return {
    c,
    phone,
    engine,
    recorder,
    requests,
    aborted,
    tts,
    calls,
    failSegment,
    failTts,
    skipDedications,
    setSegDelay: (ms: number) => (segDelay = ms),
    setCallDelay: (ms: number) => (callDelay = ms),
    setCallResponse: (r: LiveCallResponse) => (callResponse = r),
  };
}

const HI_ID = getStation('hi').stationIdText;
const TA_ID = getStation('ta').stationIdText;

let active: ReturnType<typeof harness> | null = null;
function setup(extraTimings: Partial<RadioTimings> = {}) {
  active = harness(extraTimings);
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

  it('pauses a show nobody touched and asks "Still listening?"', async () => {
    const h = setup({ listenCapMs: 120 });
    await h.c.tuneIn();
    await waitFor(() => expect(h.c.getSnapshot().status).toBe('paused'));
    expect(h.c.getSnapshot().capped).toBe(true);
    const played = h.engine.played.length;
    const requested = h.requests.length;
    await delay(60);
    expect(h.engine.played.length).toBe(played);
    expect(h.requests.length).toBe(requested);
    h.c.resume();
    expect(h.c.getSnapshot().capped).toBe(false);
    expect(h.c.getSnapshot().status).toBe('playing');
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

describe('streamed call responses', () => {
  const chunked = (...parts: string[]) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        const enc = new TextEncoder();
        for (const p of parts) c.enqueue(enc.encode(p));
        c.close();
      },
    });

  it('hands over the reply from line 1 and the subtitles from line 2, across chunk boundaries', async () => {
    const reply = { transcript: 'नमस्ते', intent: 'chat', reply: rjLine('hi', 'जवाब') };
    const body = JSON.stringify(reply);
    const res = await readCallStream(chunked(body.slice(0, 10), `${body.slice(10)}\n{"subti`, 'tles":{"replyEn":"Answer"}}\n'));
    expect(res.reply.text).toBe('जवाब');
    expect(await res.subtitles).toEqual({ replyEn: 'Answer' });
  });

  it('resolves empty subtitles when the stream ends after the reply', async () => {
    const res = await readCallStream(chunked(`${JSON.stringify({ transcript: '', intent: 'retry', reply: rjLine('hi', 'x') })}\n`));
    expect(await res.subtitles).toEqual({});
  });
});

describe('RadioController call-in', () => {
  it('speaks the reply before its subtitles arrive, then fills them in', async () => {
    const h = setup();
    let release: (s: { transcriptEn?: string; replyEn?: string }) => void = () => {};
    const subtitles = new Promise<{ transcriptEn?: string; replyEn?: string }>((resolve) => (release = resolve));
    const { en: _en, ...bare } = rjLine('hi', 'reply-text');
    h.setCallResponse({ transcript: 'नमस्ते सनी', intent: 'chat', reply: bare, subtitles });
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
    await waitFor(() => expect(h.engine.played).toContain('reply-text'));
    expect(h.c.getSnapshot().call?.replyEn).toBeUndefined();

    release({ transcriptEn: 'Hello Sunny', replyEn: 'The reply' });
    await waitFor(() => expect(h.c.getSnapshot().call?.replyEn).toBe('The reply'));
    const s = h.c.getSnapshot();
    const caps = [...s.history, s.caption];
    expect(caps.find((c) => c?.role === 'caller')?.en).toBe('Hello Sunny');
    expect(caps.find((c) => c?.text === 'reply-text')?.en).toBe('The reply');
  });

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

function phoneCall(id: string, patch: Partial<PhoneCall> = {}): PhoneCall {
  return {
    id,
    at: new Date().toISOString(),
    name: 'Priya',
    city: 'Vadodara',
    maskedNumber: '+91 ••••• 4148',
    type: 'dedication',
    message: 'मम्मी को जन्मदिन की ढेर सारी शुभकामनाएँ!',
    ...patch,
  };
}

const rjLinks = (h: ReturnType<typeof harness>) => h.requests.filter((r) => r.type === 'rj_link');

describe('RadioController studio phone line', () => {
  it('sends a call to the RJ link as structured data, without the number', () => {
    expect(toDedication(phoneCall('a'))).toEqual({
      id: 'a',
      name: 'Priya',
      city: 'Vadodara',
      type: 'dedication',
      message: 'मम्मी को जन्मदिन की ढेर सारी शुभकामनाएँ!',
    });
    const bare = toDedication(phoneCall('b', { name: '  ', city: undefined, message: 'x'.repeat(400), type: 'story_request', theme: 'ghosts' }));
    expect(bare).toEqual({ id: 'b', type: 'story_request', message: 'x'.repeat(220), theme: 'ghosts' });
    expect(JSON.stringify(bare)).not.toContain('4148');
  });

  it('polls only while tuned in, with a single poller across station switches', async () => {
    const h = setup();
    h.phone.calls = [phoneCall('call-1')];
    expect(h.phone.polls).toBe(0);
    await h.c.tuneIn();
    await waitFor(() => expect(h.c.getSnapshot().phone?.calls.map((c) => c.id)).toEqual(['call-1']));
    expect(h.c.getSnapshot().phone?.number).toBe('+917965854148');

    await waitFor(() => expect(h.phone.polls).toBeGreaterThanOrEqual(3));
    h.c.setStation('ta');
    h.c.setStation('bn');
    const before = h.phone.polls;
    await delay(150);
    // ~20 ms apart: at most ~7 polls in 150 ms (two pollers would make ~14), and polling never stops
    expect(h.phone.polls - before).toBeGreaterThanOrEqual(1);
    expect(h.phone.polls - before).toBeLessThanOrEqual(9);
    expect(h.phone.maxInFlight).toBe(1);

    h.c.pause();
    await waitFor(() => expect(h.c.getSnapshot().status).toBe('paused'));
    const paused = h.phone.polls;
    await delay(80);
    expect(h.phone.polls).toBe(paused);
    expect(h.c.getSnapshot().phone?.calls).toHaveLength(1);

    h.c.resume();
    await waitFor(() => expect(h.phone.polls).toBeGreaterThan(paused));
    expect(h.phone.maxInFlight).toBe(1);
  });

  const dedicationIds = (r: SegmentRequest) => (r.dedications ?? []).map((d) => d.id);

  it('reads every studio call in one RJ link only, oldest first', async () => {
    const h = setup();
    h.phone.calls = [
      phoneCall('call-3', { name: 'Arjun', city: 'Pune', message: 'Play something for my team' }),
      phoneCall('call-2', { name: undefined, city: 'Surat', message: 'Hello Sunny' }),
      phoneCall('call-1'),
    ];
    await h.c.tuneIn();
    await waitFor(() => expect(rjLinks(h).length).toBeGreaterThanOrEqual(2));

    const [first, second] = rjLinks(h);
    expect(dedicationIds(first)).toEqual(['call-1', 'call-2']);
    expect(dedicationIds(second)).toEqual(['call-3']);
    // Phone calls no longer ride along as free text, and only RJ links carry them
    expect(h.requests.every((r) => !r.recentCalls)).toBe(true);
    expect(h.requests.filter((r) => r.type !== 'rj_link').every((r) => !r.dedications)).toBe(true);

    // A new call arrives between polls: the next RJ link reads it, and nothing is read twice
    h.phone.calls = [phoneCall('call-4', { name: 'Meena', city: 'Indore', message: 'Hi!' }), ...h.phone.calls];
    await waitFor(() => expect(rjLinks(h).length).toBeGreaterThanOrEqual(4));
    const later = rjLinks(h).slice(2).map(dedicationIds);
    expect(later[0]).toEqual(['call-4']);
    expect(later[1]).toEqual([]);
  });

  it('tracks each call from up next to on air to aired', async () => {
    const h = setup();
    h.phone.calls = [phoneCall('call-1')];
    const seen = new Set<string>();
    h.c.subscribe(() => {
      const status = h.c.getSnapshot().phoneStatus['call-1'];
      if (status) seen.add(status);
    });
    await h.c.tuneIn();
    await waitFor(() => expect(h.c.getSnapshot().phoneStatus['call-1']).toBe('aired'));
    expect([...seen]).toEqual(['up_next', 'on_air', 'aired']);
  });

  it('puts a call the script left out back in the queue for the next RJ link', async () => {
    const h = setup();
    h.phone.calls = [phoneCall('call-1')];
    h.skipDedications.add('call-1');
    await h.c.tuneIn();
    await waitFor(() => expect(rjLinks(h).length).toBeGreaterThanOrEqual(2));
    expect(h.c.getSnapshot().phoneStatus['call-1']).toBeUndefined();
    h.skipDedications.delete('call-1');
    await waitFor(() => expect(h.c.getSnapshot().phoneStatus['call-1']).toBe('aired'));
    expect(rjLinks(h).filter((r) => dedicationIds(r).includes('call-1')).length).toBeGreaterThanOrEqual(2);
  });

  it('keeps a call queued when its RJ link fails', async () => {
    const h = setup();
    h.phone.calls = [phoneCall('call-1')];
    h.failSegment.add('rj_link');
    await h.c.tuneIn();
    // The first RJ link (and its retry) failed, so the show skipped to the news
    await waitFor(() => expect(h.engine.played).toContain('hi:news:0'));
    expect(h.engine.played).not.toContain('hi:rj_link:0');
    h.failSegment.delete('rj_link');
    await waitFor(() => expect(h.engine.played).toContain('hi:rj_link:0'));
    const ids = rjLinks(h).map(dedicationIds);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(ids.every((d) => d[0] === 'call-1')).toBe(true);
  });

  it("gives a studio caller's story theme to the next Kahani", async () => {
    const h = setup();
    h.phone.calls = [phoneCall('call-1', { type: 'story_request', theme: 'भूतिया हवेली', message: 'एक भूतिया कहानी!' })];
    await h.c.tuneIn();
    await waitFor(() => expect(h.requests.some((r) => r.type === 'kahani')).toBe(true));
    const kahanis = h.requests.filter((r) => r.type === 'kahani');
    expect(kahanis[0].theme).toBe('भूतिया हवेली');
    await waitFor(() => expect(h.requests.filter((r) => r.type === 'kahani').length).toBeGreaterThanOrEqual(2));
    expect(h.requests.filter((r) => r.type === 'kahani')[1].theme).toBeUndefined();
  });
});

describe('RadioController producer and show log', () => {
  it("sends the night's earlier stories with each Kahani request, so none repeats", async () => {
    const h = setup();
    await h.c.tuneIn();
    await waitFor(() => expect(h.requests.filter((r) => r.type === 'kahani').length).toBeGreaterThanOrEqual(3));
    const kahanis = h.requests.filter((r) => r.type === 'kahani');
    expect(kahanis[0].recentStories).toBeUndefined();
    // Prefetch writes the next story while the current one plays, so the log can trail by one
    const later = kahanis.slice(2).map((r) => r.recentStories ?? []);
    expect(later.every((log) => log.length >= 1 && log.every((s) => /^kahani \d+ aired$/.test(s)))).toBe(true);
  });

  it('rotates producer settings without back-to-back catchphrases', () => {
    const always = () => 0;
    const never = () => 0.99;
    expect(producerPlan(0, false, always)).toEqual({ firstLink: true, greetListener: true, useCatchphrase: true, bit: 'any' });
    expect(producerPlan(1, true, always)).toEqual({ firstLink: false, greetListener: false, useCatchphrase: false, bit: 'any' });
    expect(producerPlan(4, false, never)).toEqual({ firstLink: false, greetListener: true, useCatchphrase: false, bit: 'none' });
    expect(producerPlan(3, false, never).greetListener).toBe(false);
  });

  it('sends the show log, producer and previous mood with each RJ link', async () => {
    const h = setup();
    await h.c.tuneIn();
    await waitFor(() => expect(h.requests.filter((r) => r.type === 'rj_link').length).toBeGreaterThanOrEqual(2));
    const [first, second] = h.requests.filter((r) => r.type === 'rj_link');
    expect(first.producer?.firstLink).toBe(true);
    expect(first.producer?.greetListener).toBe(true);
    expect(second.producer?.firstLink).toBe(false);
    expect(second.producer?.greetListener).toBe(false);
    expect(first.producer?.useCatchphrase && second.producer?.useCatchphrase).toBe(false);
    expect(first.listener.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(first.listener.weekday).toBeGreaterThanOrEqual(0);
    expect(second.showLog?.length).toBeGreaterThan(0);
    expect(second.showLog?.length).toBeLessThanOrEqual(4);
    expect(second.showLog?.map((e) => e.type)).toContain('news');
    expect(second.showLog?.every((e) => e.summary.endsWith('aired'))).toBe(true);
    const afterNews = h.requests.find((r) => r.type === 'ad_break');
    expect(afterNews?.moodAfterPrevious).toBe('heavy');
  });

  it('sends the show log with a call and shows the helpline after a care call', async () => {
    const h = setup();
    h.setCallResponse({ transcript: 'bahut akela lag raha hai', intent: 'care', reply: rjLine('hi', 'care-reply') });
    let called = false;
    h.engine.onPlay = (text) => {
      if (text === 'hi:news:0' && !called) {
        called = true;
        void h.c.startCall();
      }
    };
    await h.c.tuneIn();
    await waitFor(() => expect(h.c.getSnapshot().status).toBe('call_recording'));
    await delay(25);
    await h.c.endCall();
    await waitFor(() => expect(h.c.getSnapshot().helpline).toEqual({ name: 'Tele-MANAS', number: '14416' }));
    expect(h.calls[0].showLog?.map((e) => e.type)).toEqual(['rj_link', 'news']);
    h.c.setStation('ta');
    expect(h.c.getSnapshot().helpline).toBeUndefined();
  });
});
