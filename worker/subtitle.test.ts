import { describe, expect, it } from 'vitest';
import { cleanSubtitle, hasProfanity } from './subtitle';

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
