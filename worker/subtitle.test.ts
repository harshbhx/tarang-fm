import { describe, expect, it } from 'vitest';
import { cleanSubtitle, hasProfanity, modelSubtitle, SUBTITLE_MAX_CHARS } from './subtitle';

describe('cleanSubtitle', () => {
  it('drops the subtitle when the translation contains profanity', () => {
    expect(
      cleanSubtitle('Hey Riya, what are you doing here in the middle of the night? Bitch... get back home.'),
    ).toBeUndefined();
    for (const bad of [
      'What the fuck is this',
      'This is BULLSHIT',
      'Oh shit, the bus left',
      'you bastard',
      'damn it',
      'Bloody hell, look at that',
      'wtf yaar',
      'what the f*ck',
      'sh*t happens',
      'abe chutiya',
      'bhenchod traffic',
      'behen chod',
      'madarchod',
    ]) {
      expect(hasProfanity(bad), bad).toBe(true);
      expect(cleanSubtitle(bad), bad).toBeUndefined();
    }
  });

  it('keeps clean and mildly rude subtitles', () => {
    for (const ok of [
      'You are listening to Tarang FM 91.1.',
      "Don't be an idiot, take your umbrella.",
      'That was a stupid idea, saala!',
      'Ashita and Dickens went to Scunthorpe for chutney.',
      'Mumbai traffic is classic, isn’t it?',
      'The assessment is due on Monday.',
    ]) {
      expect(hasProfanity(ok), ok).toBe(false);
      expect(cleanSubtitle(ok)).toBe(ok);
    }
  });

  it('returns undefined for missing or blank input', () => {
    expect(cleanSubtitle(undefined)).toBeUndefined();
    expect(cleanSubtitle('   ')).toBeUndefined();
  });
});

describe('modelSubtitle', () => {
  it('tidies a subtitle written with the line', () => {
    expect(modelSubtitle('  Hello   Harsh ,  welcome to Tarang FM! ')).toBe('Hello Harsh, welcome to Tarang FM!');
    expect(modelSubtitle('{name}, welcome back!')).toBe('welcome back!');
    expect(modelSubtitle('A call from {caller3} just came in.')).toBe('A call from just came in.');
  });

  it('drops profanity, blanks and subtitles that are not English', () => {
    expect(modelSubtitle('What the fuck is this traffic')).toBeUndefined();
    expect(modelSubtitle('')).toBeUndefined();
    expect(modelSubtitle(null)).toBeUndefined();
    expect(modelSubtitle('नमस्ते दोस्तों!')).toBeUndefined();
  });

  it('shortens a run-on subtitle at a word boundary', () => {
    const long = Array.from({ length: 40 }, () => 'and then the bus came').join(' ');
    const out = modelSubtitle(long)!;
    expect(out.length).toBeLessThanOrEqual(SUBTITLE_MAX_CHARS + 1);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/\s…$/);
  });
});
