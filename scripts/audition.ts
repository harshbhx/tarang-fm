/**
 * Voice audition: synthesizes a sample for each speaker ID, estimates its median pitch (F0)
 * and classifies the voice type so scripts can use correct grammatical gender.
 * Usage: npm run audition [-- id1 id2 ...]   (defaults to every ID in docs/VOICE-CASTING.md)
 * Output: tmp/audition/*.wav, results.json, index.html (open to listen)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const OUT = 'tmp/audition';
const SAMPLE_RATE = 24000;

const key = readFileSync('.dev.vars', 'utf8')
  .match(/^SARVAM_API_KEY=(.*)$/m)?.[1]
  ?.trim()
  .replace(/^["']|["']$/g, '');
if (!key) throw new Error('SARVAM_API_KEY missing in .dev.vars');

const SAMPLES: Record<string, { lang: string; text: string }> = {
  hi: { lang: 'hi-IN', text: 'नमस्ते दोस्तों! आप सुन रहे हैं तरंग FM, और आज की शाम बहुत खास है।' },
  en: { lang: 'en-IN', text: 'Hello friends! You are listening to Tarang FM, and tonight is going to be special.' },
  enhi: { lang: 'en-IN', text: 'Hello friends! You are listening to Tarang FM, aur aaj ki shaam ekdum special hai.' },
  mr: { lang: 'mr-IN', text: 'नमस्कार मित्रांनो! तुम्ही ऐकत आहात तरंग FM, आणि आजची संध्याकाळ खूप खास आहे.' },
  ta: { lang: 'ta-IN', text: 'வணக்கம் நண்பர்களே! நீங்கள் கேட்டுக் கொண்டிருப்பது தரங் FM.' },
  bn: { lang: 'bn-IN', text: 'নমস্কার বন্ধুরা! আপনি শুনছেন তরঙ্গ FM, আর আজকের সন্ধ্যাটা খুব বিশেষ।' },
  te: { lang: 'te-IN', text: 'నమస్కారం మిత్రులారా! మీరు వింటున్నది తరంగ్ FM.' },
  kn: { lang: 'kn-IN', text: 'ನಮಸ್ಕಾರ ಸ್ನೇಹಿತರೇ! ನೀವು ಕೇಳುತ್ತಿರುವುದು ತರಂಗ FM.' },
  pa: { lang: 'pa-IN', text: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ ਦੋਸਤੋ! ਤੁਸੀਂ ਸੁਣ ਰਹੇ ਹੋ ਤਰੰਗ FM.' },
  gu: { lang: 'gu-IN', text: 'નમસ્તે મિત્રો! તમે સાંભળી રહ્યા છો તરંગ FM.' },
};

function castIds(): string[] {
  const doc = readFileSync('docs/VOICE-CASTING.md', 'utf8');
  const ids = doc.match(/`[a-z]+_(?:hi|en|enhi|mr|ta|bn|te|kn|pa|gu)_[a-z_]+`/g) ?? [];
  return [...new Set(ids.map((s) => s.slice(1, -1)))].sort();
}

async function synth(speaker: string): Promise<Int16Array> {
  const lang = speaker.split('_')[1];
  const sample = SAMPLES[lang] ?? SAMPLES.hi;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch('https://api.sarvam.ai/text-to-speech/stream', {
      method: 'POST',
      headers: { 'api-subscription-key': key!, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'bulbul:v4-flash',
        text: sample.text,
        language_code: sample.lang,
        speaker,
        speech_sample_rate: SAMPLE_RATE,
        output_audio_codec: 'linear16',
        enable_preprocessing: true,
      }),
    });
    if (res.ok) {
      const buf = new Uint8Array(await res.arrayBuffer());
      return new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 2));
    }
    if (res.status !== 429 && res.status < 500) throw new Error(`${res.status} ${await res.text()}`);
    await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
  }
  throw new Error('retries exhausted');
}

/** Median F0 over voiced frames, via normalized autocorrelation (70–400 Hz). */
function medianF0(pcm: Int16Array): number | null {
  const frame = 960; // 40 ms
  const hop = 480;
  const minLag = Math.floor(SAMPLE_RATE / 400);
  const maxLag = Math.floor(SAMPLE_RATE / 70);
  const x = Float32Array.from(pcm, (v) => v / 32768);
  const f0s: number[] = [];
  for (let start = 0; start + frame + maxLag < x.length; start += hop) {
    let energy = 0;
    for (let i = 0; i < frame; i++) energy += x[start + i] ** 2;
    if (Math.sqrt(energy / frame) < 0.02) continue;
    let bestLag = 0;
    let best = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let num = 0;
      let e1 = 0;
      let e2 = 0;
      for (let i = 0; i < frame; i++) {
        const a = x[start + i];
        const b = x[start + i + lag];
        num += a * b;
        e1 += a * a;
        e2 += b * b;
      }
      const r = num / Math.sqrt(e1 * e2 + 1e-12);
      if (r > best) {
        best = r;
        bestLag = lag;
      }
    }
    if (best > 0.6 && bestLag) f0s.push(SAMPLE_RATE / bestLag);
  }
  if (f0s.length < 5) return null;
  f0s.sort((a, b) => a - b);
  return Math.round(f0s[Math.floor(f0s.length / 2)]);
}

function classify(f0: number | null): 'masculine' | 'feminine' | 'check-by-ear' {
  if (f0 === null) return 'check-by-ear';
  if (f0 < 158) return 'masculine';
  if (f0 > 172) return 'feminine';
  return 'check-by-ear';
}

function wav(pcm: Int16Array): Buffer {
  const data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SAMPLE_RATE, 24);
  h.writeUInt32LE(SAMPLE_RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const ids = process.argv.slice(2).length ? process.argv.slice(2) : castIds();
mkdirSync(OUT, { recursive: true });
const results: { speaker: string; f0: number | null; voiceType: string; error?: string }[] = [];

const queue = [...ids];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let speaker = queue.shift(); speaker; speaker = queue.shift()) {
      try {
        const pcm = await synth(speaker);
        writeFileSync(`${OUT}/${speaker}.wav`, wav(pcm));
        const f0 = medianF0(pcm);
        results.push({ speaker, f0, voiceType: classify(f0) });
      } catch (e) {
        results.push({ speaker, f0: null, voiceType: 'error', error: String(e).slice(0, 200) });
      }
      const r = results[results.length - 1];
      console.log(`${r.speaker.padEnd(36)} ${String(r.f0 ?? '-').padStart(4)} Hz  ${r.voiceType}${r.error ? '  ' + r.error : ''}`);
    }
  }),
);

results.sort((a, b) => a.speaker.localeCompare(b.speaker));
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
writeFileSync(
  `${OUT}/index.html`,
  `<!doctype html><meta charset="utf-8"><title>Audition</title><body style="font:14px system-ui;padding:16px">` +
    results
      .map((r) => `<p><b>${r.speaker}</b> · ${r.f0 ?? '-'} Hz · ${r.voiceType}<br><audio controls src="${r.speaker}.wav"></audio></p>`)
      .join('') +
    '</body>',
);
console.log(`\n${results.length} voices → ${OUT}/results.json, ${OUT}/index.html`);
