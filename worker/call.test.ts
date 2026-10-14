import { describe, expect, it } from 'vitest';
import type { CallMeta } from '../shared/schemas';
import { STATION_BY_ID } from '../shared/stations';
import type { Station } from '../shared/types';
import { handleCall, startCall } from './call';
import type { Sarvam } from './sarvam';
import { Timings } from './timing';

const hindi = STATION_BY_ID.hi as Station;
const meta: CallMeta = { station: 'hi', listener: { name: 'Priya', localTime: '18:30', daypart: 'evening' } };

/** A fake Sarvam whose Translate only answers when `release()` is called. */
function fakeSarvam(transcript: string) {
  let release = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  let translations = 0;
  const sarvam = {
    transcribe: async () => ({ transcript, languageCode: 'hi-IN' }),
    transliterate: async (t: string) => (t === 'Priya' ? 'प्रिया' : t),
    chatJson: async () => ({
      intent: 'story_request',
      lines: [{ text: 'अरे वाह {name}! आपकी भूतिया कहानी अभी आ रही है।', delivery: 'excited' }],
      nickname: null,
      story_theme: 'भूतिया हवेली',
    }),
    translate: async (t: string) => {
      translations += 1;
      await gate;
      return `EN(${t})`;
    },
  } as unknown as Sarvam;
  return { sarvam, release: () => release(), translations: () => translations };
}

const audio = new Blob([new Uint8Array(10)], { type: 'audio/webm' });

describe('call-in with Translate off the critical path', () => {
  it('returns the reply before the subtitles are ready', async () => {
    const f = fakeSarvam('एक भूतिया कहानी सुनाओ');
    const { response, subtitles } = await startCall(f.sarvam, hindi, meta, audio, 'call.webm', new Timings());
    // Translate is still blocked, yet the reply is ready to speak
    expect(response.intent).toBe('story_request');
    expect(response.theme).toBe('भूतिया हवेली');
    expect(response.reply.text).toBe('अरे वाह प्रिया! आपकी भूतिया कहानी अभी आ रही है।');
    expect(response.reply.en).toBeUndefined();
    expect(response.transcriptEn).toBeUndefined();
    // The caller's subtitle started while the model was writing
    expect(f.translations()).toBe(2);

    f.release();
    expect(await subtitles).toEqual({
      transcriptEn: 'EN(एक भूतिया कहानी सुनाओ)',
      replyEn: 'EN(अरे वाह प्रिया! आपकी भूतिया कहानी अभी आ रही है।)',
    });
  });

  it('still returns one complete object for clients that do not stream', async () => {
    const f = fakeSarvam('एक भूतिया कहानी सुनाओ');
    f.release();
    const full = await handleCall(f.sarvam, hindi, meta, audio, 'call.webm', new Timings());
    expect(full.transcriptEn).toBe('EN(एक भूतिया कहानी सुनाओ)');
    expect(full.reply.en).toBe('EN(अरे वाह प्रिया! आपकी भूतिया कहानी अभी आ रही है।)');
  });

  it('answers a caller in distress with the fixed reply, never the model', async () => {
    const f = fakeSarvam('मैं अब जीना नहीं चाहता');
    const { response } = await startCall(f.sarvam, hindi, meta, audio, 'call.webm', new Timings());
    expect(response.intent).toBe('care');
    expect(response.reply.text).toContain('14416');
    expect(f.translations()).toBe(0);
  });
});
