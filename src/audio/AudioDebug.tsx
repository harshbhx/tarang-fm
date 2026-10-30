import { useEffect, useRef, useState } from 'react';
import { STATIONS } from '../../shared/stations';
import { createAudioEngine, createRecorder } from './index';
import { apiFetch } from '../radio/apiSession';

const engine = createAudioEngine();
const recorder = createRecorder();

const TEST_LINE = {
  station: 'hi',
  speaker: 'simran_hi_news_breaking',
  text: 'नमस्ते! आप सुन रहे हैं तरंग FM।',
  pace: 1,
  temperature: 0.5,
};

/** Wraps bytes in a stream that trickles odd-sized chunks, like a slow network. */
function trickle(bytes: Uint8Array, chunk = 4801, delayMs = 40): ReadableStream<Uint8Array> {
  let at = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (at >= bytes.length) {
        controller.close();
        return;
      }
      await new Promise((r) => setTimeout(r, at === 0 ? 150 : delayMs));
      controller.enqueue(bytes.slice(at, at + chunk));
      at += chunk;
    },
  });
}

/** 2.5 s gliding tone as 24 kHz Int16LE, optionally behind a streaming WAV header. */
function syntheticPcm(asWav: boolean): Uint8Array {
  const rate = 24000;
  const n = Math.round(rate * 2.5);
  const header = asWav ? 44 : 0;
  const out = new Uint8Array(header + n * 2);
  const view = new DataView(out.buffer);
  if (asWav) {
    const tag = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
    tag(0, 'RIFF');
    view.setUint32(4, 0xffffffff, true);
    tag(8, 'WAVE');
    tag(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    tag(36, 'data');
    view.setUint32(40, 0xffffffff, true);
  }
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const f = 330 + 220 * (i / n);
    phase += (2 * Math.PI * f) / rate;
    const env = Math.min(1, i / 600, (n - i) / 600);
    view.setInt16(header + i * 2, Math.round(Math.sin(phase) * 0.4 * env * 32767), true);
  }
  return out;
}

function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-14 text-neutral-400">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded bg-neutral-800">
        <div className="h-full bg-emerald-400 transition-[width] duration-75" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="w-10 text-right tabular-nums text-neutral-400">{value.toFixed(2)}</span>
    </div>
  );
}

export default function AudioDebug() {
  const [log, setLog] = useState<string[]>([]);
  const [stats, setStats] = useState<string>('–');
  const [mic, setMic] = useState(0);
  const [out, setOut] = useState(0);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [accent, setAccent] = useState(STATIONS[0]?.accent ?? '');
  const buf = useRef<Float32Array<ArrayBuffer> | null>(null);

  const note = (msg: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()}  ${msg}`, ...l].slice(0, 40));

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setMic(recorder.recording ? recorder.level() : 0);
      const a = engine.analyser;
      if (a) {
        if (!buf.current || buf.current.length !== a.fftSize) buf.current = new Float32Array(a.fftSize);
        a.getFloatTimeDomainData(buf.current);
        let peak = 0;
        for (const v of buf.current) peak = Math.max(peak, Math.abs(v));
        setOut(peak);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => () => {
    if (clipUrl) URL.revokeObjectURL(clipUrl);
  }, [clipUrl]);

  const play = async (label: string, getRes: () => Promise<Response>) => {
    const fetchStartedAt = performance.now();
    try {
      const res = await getRes();
      if (!res.ok) {
        note(`${label}: HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
        return;
      }
      note(`${label}: streaming (${res.headers.get('content-type') ?? 'no content-type'})`);
      const r = await engine.playStream(res, { fetchStartedAt, onStart: () => note(`${label}: first sample`) });
      setStats(`TTFA ${r.ttfaMs} ms · duration ${r.durationMs} ms`);
      note(`${label}: done, TTFA ${r.ttfaMs} ms, ${r.durationMs} ms`);
    } catch (e) {
      note(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const playTestLine = () =>
    play('tts', () =>
      apiFetch('/api/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(TEST_LINE),
      }),
    );

  const playSynthetic = (asWav: boolean) =>
    play(asWav ? 'synthetic wav' : 'synthetic pcm', async () => new Response(trickle(syntheticPcm(asWav))));

  const playFile = (file: File | undefined) => {
    if (!file) return;
    void play(file.name, async () => new Response(trickle(new Uint8Array(await file.arrayBuffer()), 12001, 60)));
  };

  const recordThree = async () => {
    try {
      await recorder.start();
      note('recording 3 s…');
      await engine.silence(3000);
      const blob = await recorder.stop();
      note(`recorded ${blob.size} bytes (${blob.type || 'unknown type'})`);
      setClipUrl(URL.createObjectURL(blob));
    } catch (e) {
      note(`record: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const run = (label: string, fn: () => Promise<void> | void) => async () => {
    try {
      await fn();
      note(`${label}: ok`);
    } catch (e) {
      note(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const btn = 'rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 active:bg-neutral-600';

  return (
    <main className="min-h-dvh bg-neutral-950 p-4 text-neutral-100">
      <div className="mx-auto max-w-2xl space-y-5">
        <h1 className="text-lg font-semibold">Audio engine debug</h1>

        <section className="flex flex-wrap gap-2">
          <button className={`${btn} bg-emerald-700 hover:bg-emerald-600`} onClick={run('unlock', () => engine.unlock())}>
            Unlock
          </button>
          <button className={btn} onClick={playTestLine}>
            Play test line
          </button>
          <button className={btn} onClick={() => playSynthetic(false)}>
            Synthetic PCM
          </button>
          <button className={btn} onClick={() => playSynthetic(true)}>
            Synthetic WAV
          </button>
          <label className={`${btn} cursor-pointer`}>
            Play .pcm/.wav file
            <input type="file" accept=".pcm,.wav,audio/*" className="hidden" onChange={(e) => playFile(e.target.files?.[0])} />
          </label>
          <button className={btn} onClick={run('stop voice', () => engine.stopVoice(150))}>
            Stop voice
          </button>
        </section>

        <section className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-md bg-neutral-800 px-2 py-2 text-sm"
            value={accent}
            onChange={(e) => setAccent(e.target.value)}
          >
            {STATIONS.map((s) => (
              <option key={s.id} value={s.accent}>
                {s.id} {s.accent}
              </option>
            ))}
          </select>
          <button className={btn} onClick={run('music start', () => engine.music.start(accent))}>
            Music start
          </button>
          <button className={btn} onClick={run('music stop', () => engine.music.stop())}>
            Music stop
          </button>
        </section>

        <section className="flex flex-wrap gap-2">
          <button className={btn} onClick={run('sting', () => engine.sfx.sting())}>
            Sting
          </button>
          <button className={btn} onClick={run('call tone', () => engine.sfx.callTone())}>
            Call tone
          </button>
          <button className={btn} onClick={run('static', () => engine.sfx.tuneStatic(700))}>
            Static
          </button>
          <button className={btn} onClick={recordThree}>
            Record 3 s
          </button>
          <button className={btn} onClick={run('cancel rec', () => recorder.cancel())}>
            Cancel rec
          </button>
        </section>

        <section className="space-y-2 rounded-lg bg-neutral-900 p-3">
          <div className="text-sm tabular-nums">{stats}</div>
          <Meter label="mic" value={mic} />
          <Meter label="output" value={Math.min(1, out)} />
          {clipUrl && <audio className="w-full" src={clipUrl} controls autoPlay />}
        </section>

        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-neutral-900 p-3 text-xs text-neutral-300">
          {log.join('\n') || 'Press Unlock first.'}
        </pre>
      </div>
    </main>
  );
}
