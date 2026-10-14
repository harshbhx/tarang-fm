import { describe, expect, it } from 'vitest';
import type { CallMeta } from '../shared/schemas';
import { STATION_BY_ID } from '../shared/stations';
import type { Station } from '../shared/types';
import { fitReply, handleCall, startCall } from './call';
import { careReplyEn } from './care';
import { fallbacksFor } from './fallbacks';
import type { ChatMessage, Sarvam } from './sarvam';
import { Timings } from './timing';

const hindi = STATION_BY_ID.hi as Station;
const meta: CallMeta = { station: 'hi', listener: { name: 'Priya', localTime: '18:30', daypart: 'evening' } };
const withSubtitles: CallMeta = { ...meta, subtitles: true };

/** A fake Sarvam that records what the model was asked; Translate must never be called. */
function fakeSarvam(transcript: string, reply: Record<string, unknown> | (() => never) = {}) {
  const chats: { messages: ChatMessage[]; schema: Record<string, unknown> }[] = [];
  let translations = 0;
  const sarvam = {
    transcribe: async () => ({ transcript, languageCode: 'hi-IN' }),
    transliterate: async (t: string) => t.replace(/Priya/g, 'प्रिया'),
    chatJson: async (messages: ChatMessage[], schema: Record<string, unknown>) => {
      chats.push({ messages, schema });
      if (typeof reply === 'function') return reply();
      return {
        caller_en: 'Tell me a ghost story.',
        intent: 'story_request',
        lines: [{ text: 'अरे वाह {name}! आपकी भूतिया कहानी अभी आ रही है।', delivery: 'excited', en: 'Wow {name}! Your ghost story is coming right up.' }],
        nickname: null,
        story_theme: 'भूतिया हवेली',
        ...reply,
      };
    },
    translate: async () => {
      translations += 1;
      return 'TRANSLATED';
    },
  } as unknown as Sarvam;
  const prompt = () => chats.map((c) => c.messages.map((m) => m.content).join('\n')).join('\n');
  return { sarvam, chats, prompt, translations: () => translations };
}

const audio = new Blob([new Uint8Array(10)], { type: 'audio/webm' });

describe('call-in subtitles written with the reply', () => {
  it('has the subtitles ready with the reply, from the same model response', async () => {
    const f = fakeSarvam('एक भूतिया कहानी सुनाओ');
    const { response, subtitles } = await startCall(f.sarvam, hindi, withSubtitles, audio, 'call.webm', new Timings());
    expect(response.intent).toBe('story_request');
    expect(response.theme).toBe('भूतिया हवेली');
    expect(response.reply.text).toBe('अरे वाह प्रिया! आपकी भूतिया कहानी अभी आ रही है।');
    // Line 1 of the stream stays as it was; the subtitles go in line 2
    expect(response.reply.en).toBeUndefined();
    expect(subtitles).toEqual({ transcriptEn: 'Tell me a ghost story.', replyEn: 'Wow Priya! Your ghost story is coming right up.' });
    expect(f.chats).toHaveLength(1);
    expect(f.translations()).toBe(0);
    expect(f.prompt()).toContain('caller_en');
    const schema = f.chats[0].schema as { required: string[]; properties: { caller_en?: unknown; lines: { items: { properties: object } } } };
    expect(schema.required).toContain('caller_en');
    expect(schema.properties.caller_en).toEqual({ type: 'string' });
    expect(schema.properties.lines.items.properties).toHaveProperty('en', { type: 'string' });
  });

  it('still returns one complete object for clients that do not stream', async () => {
    const f = fakeSarvam('एक भूतिया कहानी सुनाओ');
    const full = await handleCall(f.sarvam, hindi, withSubtitles, audio, 'call.webm', new Timings());
    expect(full.transcriptEn).toBe('Tell me a ghost story.');
    expect(full.reply.en).toBe('Wow Priya! Your ghost story is coming right up.');
  });

  it('asks for no subtitles when they are off, and sends none', async () => {
    for (const m of [meta, { ...meta, subtitles: false }]) {
      const f = fakeSarvam('एक भूतिया कहानी सुनाओ');
      const { response, subtitles } = await startCall(f.sarvam, hindi, m, audio, 'call.webm', new Timings());
      expect(subtitles).toEqual({});
      expect(response.reply.en).toBeUndefined();
      expect(f.translations()).toBe(0);
      expect(f.prompt()).not.toMatch(/subtitle|caller_en/i);
      expect(f.prompt()).not.toContain('"en"');
      const schema = f.chats[0].schema as { required: string[]; properties: { lines: { items: { properties: object } } } };
      expect(schema.required).not.toContain('caller_en');
      expect(schema.properties).not.toHaveProperty('caller_en');
      expect(schema.properties.lines.items.properties).not.toHaveProperty('en');
    }
  });

  it('drops a profane subtitle', async () => {
    const f = fakeSarvam('कहानी सुनाओ', { caller_en: 'Tell me a damn story.' });
    const { subtitles } = await startCall(f.sarvam, hindi, withSubtitles, audio, 'call.webm', new Timings());
    expect(subtitles).toEqual({ replyEn: 'Wow Priya! Your ghost story is coming right up.' });
  });

  it('subtitles the fixed replies with their hand-written English', async () => {
    const down = fakeSarvam('हैलो सनी', () => {
      throw new Error('model down');
    });
    const thanks = await startCall(down.sarvam, hindi, withSubtitles, audio, 'call.webm', new Timings());
    expect(thanks.subtitles).toEqual({ replyEn: fallbacksFor('hi').callThanksEn });

    const silent = await startCall(fakeSarvam('').sarvam, hindi, withSubtitles, audio, 'call.webm', new Timings());
    expect(silent.response.intent).toBe('retry');
    expect(silent.subtitles).toEqual({ replyEn: fallbacksFor('hi').lineNotClearEn });
    expect((await startCall(fakeSarvam('').sarvam, hindi, meta, audio, 'call.webm', new Timings())).subtitles).toEqual({});
  });

  it('answers a caller in distress with the fixed reply, never the model', async () => {
    const f = fakeSarvam('मैं अब जीना नहीं चाहता');
    const { response, subtitles } = await startCall(f.sarvam, hindi, withSubtitles, audio, 'call.webm', new Timings());
    expect(response.intent).toBe('care');
    expect(response.reply.text).toContain('14416');
    expect(response.reply.en).toBe(careReplyEn());
    expect(subtitles).toEqual({});
    expect(f.chats).toHaveLength(0);
    expect(f.translations()).toBe(0);
  });
});

describe('fitReply', () => {
  it('keeps whole lines while they fit, so the subtitle matches what is said', () => {
    const a = { text: 'अ'.repeat(120), en: 'First.' };
    const b = { text: 'ब'.repeat(90), en: 'Second.' };
    const c = { text: 'क'.repeat(40), en: 'Third.' };
    expect(fitReply([a, b, c])).toEqual({ text: `${a.text} ${b.text}`, en: 'First. Second.' });
    expect(fitReply([a, c])).toEqual({ text: `${a.text} ${c.text}`, en: 'First. Third.' });
    expect(fitReply([])).toEqual({ text: '', en: '' });
  });

  it('cuts a first line that is too long on its own', () => {
    const long = Array.from({ length: 12 }, () => 'आज शाम बहुत सुहानी है।').join(' ');
    const out = fitReply([{ text: long, en: 'A lovely evening.' }]);
    expect(out.text.length).toBeLessThanOrEqual(220);
    expect(out.en).toBe('A lovely evening.');
  });
});
