/**
 * API spike: verifies the open questions in docs/TECH-SPEC.md §11 against the live Sarvam API.
 * Usage: npm run spike   (reads SARVAM_API_KEY from .dev.vars, writes tmp/spike/*)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const API = 'https://api.sarvam.ai';
const OUT = 'tmp/spike';

const key = readFileSync('.dev.vars', 'utf8')
  .match(/^SARVAM_API_KEY=(.*)$/m)?.[1]
  ?.trim()
  .replace(/^["']|["']$/g, '');
if (!key) throw new Error('SARVAM_API_KEY missing in .dev.vars');

const headers = { 'api-subscription-key': key, 'Content-Type': 'application/json' };
mkdirSync(OUT, { recursive: true });

type Result = Record<string, unknown>;

async function tts(name: string, body: Record<string, unknown>): Promise<Result> {
  const t0 = performance.now();
  const res = await fetch(`${API}/text-to-speech/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'bulbul:v4-flash',
      speech_sample_rate: 24000,
      enable_preprocessing: true,
      ...body,
    }),
  });
  if (!res.ok) return { name, status: res.status, error: (await res.text()).slice(0, 500) };

  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let firstByteMs = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!firstByteMs) firstByteMs = performance.now() - t0;
    chunks.push(value);
  }
  const buf = Buffer.concat(chunks);
  const ext = body.output_audio_codec === 'wav' ? 'wav' : 'pcm';
  writeFileSync(`${OUT}/${name}.${ext}`, buf);
  return {
    name,
    status: res.status,
    contentType: res.headers.get('content-type'),
    ttfbMs: Math.round(firstByteMs),
    totalMs: Math.round(performance.now() - t0),
    bytes: buf.length,
    chunks: chunks.length,
    head: buf.subarray(0, 4).toString('latin1'),
    headHex: buf.subarray(0, 48).toString('hex'),
    approxSeconds: ext === 'pcm' ? +(buf.length / 48000).toFixed(2) : undefined,
  };
}

async function chat(): Promise<Result> {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'lines'],
    properties: {
      title: { type: 'string' },
      lines: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['role', 'text'],
          properties: { role: { enum: ['ad_announcer', 'ad_customer'] }, text: { type: 'string' } },
        },
      },
    },
  };
  const t0 = performance.now();
  const res = await fetch(`${API}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'sarvam-105b',
      reasoning_effort: null,
      max_tokens: 800,
      temperature: 0.9,
      response_format: { type: 'json_schema', json_schema: { name: 'segment', schema, strict: true } },
      messages: [
        {
          role: 'system',
          content:
            'You write scripts for a Hindi FM radio station. Write only in Hindi (Devanagari); English words may stay in Latin script. Output JSON matching the schema.',
        },
        { role: 'user', content: 'Write one funny 4-line fictional radio ad for an imaginary chai product.' },
      ],
    }),
  });
  const ms = Math.round(performance.now() - t0);
  const text = await res.text();
  if (!res.ok) return { name: 'chat_json_schema', status: res.status, ms, error: text.slice(0, 600) };
  const data = JSON.parse(text);
  const content: string = data.choices?.[0]?.message?.content ?? '';
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    /* recorded below */
  }
  return {
    name: 'chat_json_schema',
    status: res.status,
    ms,
    parsedOk: parsed !== null,
    usage: data.usage,
    finish: data.choices?.[0]?.finish_reason,
    hasReasoning: Boolean(data.choices?.[0]?.message?.reasoning_content),
    content: content.slice(0, 700),
  };
}

async function stt(file: string, mode: string): Promise<Result> {
  const form = new FormData();
  form.append('file', new Blob([readFileSync(file)], { type: 'audio/wav' }), 'sample.wav');
  form.append('model', 'saaras:v4');
  form.append('language_code', 'hi-IN');
  form.append('mode', mode);
  const t0 = performance.now();
  const res = await fetch(`${API}/speech-to-text`, {
    method: 'POST',
    headers: { 'api-subscription-key': key! },
    body: form,
  });
  const ms = Math.round(performance.now() - t0);
  const text = await res.text();
  return { name: `stt_${mode}`, status: res.status, ms, body: text.slice(0, 400) };
}

async function rss(hl: string): Promise<Result> {
  const res = await fetch(`https://news.google.com/rss?hl=${hl}&gl=IN&ceid=IN:${hl}`);
  const xml = await res.text();
  const titles = [...xml.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>/g)].map((m) => m[1]);
  return { name: `rss_${hl}`, status: res.status, items: titles.length, first: titles[0]?.slice(0, 120) };
}

const hiText = 'नमस्ते! आप सुन रहे हैं तरंग FM. आज मौसम बहुत सुहाना है, और हमारे पास आपके लिए 3 बड़ी खबरें हैं।';
const results: Result[] = [];
const run = async (p: Promise<Result>) => {
  const r = await p.catch((e: unknown) => ({ error: String(e) }));
  results.push(r);
  console.log(JSON.stringify(r));
};

await run(tts('hi_linear16', { text: hiText, language_code: 'hi-IN', speaker: 'simran_hi_news_breaking', output_audio_codec: 'linear16' }));
await run(tts('hi_wav', { text: hiText, language_code: 'hi-IN', speaker: 'simran_hi_news_breaking', output_audio_codec: 'wav' }));
await run(tts('hi_pitch_loudness', { text: hiText, language_code: 'hi-IN', speaker: 'simran_hi_news_breaking', output_audio_codec: 'linear16', pitch: 0.2, loudness: 1.6 }));
await run(tts('hi_temperature_0_95', { text: hiText, language_code: 'hi-IN', speaker: 'shubh_hi_stories_dramatic', output_audio_codec: 'linear16', temperature: 0.95 }));
await run(tts('ta_vetri_ads', { text: 'நீங்கள் கேட்டுக் கொண்டிருப்பது தரங் FM 98.3!', language_code: 'ta-IN', speaker: 'vetri_ta_ads', output_audio_codec: 'linear16' }));
await run(tts('bn_bappa', { text: 'আপনি শুনছেন তরঙ্গ FM 102.7… মনের কথা, মনের সুরে!', language_code: 'bn-IN', speaker: 'bappa_bn_conversation', output_audio_codec: 'linear16' }));
await run(tts('cross_hi_voice_tamil_text', { text: 'நீங்கள் கேட்டுக் கொண்டிருப்பது தரங் FM!', language_code: 'ta-IN', speaker: 'shubh_hi_stories_dramatic', output_audio_codec: 'linear16' }));
await run(tts('enhi_voice_en_lang', { text: 'Hey Mumbai! You are listening to Tarang FM, aur aaj ka mood ekdum mast hai.', language_code: 'en-IN', speaker: 'simran_enhi_companion', output_audio_codec: 'linear16' }));
await run(chat());
await run(stt(`${OUT}/hi_wav.wav`, 'codemix'));
await run(stt(`${OUT}/hi_wav.wav`, 'transcribe'));
for (const hl of ['hi', 'ta', 'bn']) await run(rss(hl));

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log(`\nSaved ${OUT}/results.json`);
