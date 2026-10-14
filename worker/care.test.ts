import { describe, expect, it } from 'vitest';
import { careReply, soundsLikeCrisis } from './care';

describe('care safety net', () => {
  it('catches self-harm talk in every station language and English', () => {
    for (const t of [
      'सच बताऊँ तो मुझे अब जीने का मन नहीं करता',
      'I just want to die',
      'मला आता जगायचं नाही',
      'મને હવે જીવવું નથી',
      'எனக்கு வாழ விருப்பம் இல்லை',
      'আমার আর বাঁচতে ইচ্ছে করে না',
    ]) expect(soundsLikeCrisis(t)).toBe(true);
  });

  it('leaves ordinary calls alone', () => {
    for (const t of ['आज तीसरी बार चाय पी रहा हूँ', 'एक भूतिया कहानी सुनाओ', 'I am dying to hear the next story!']) expect(soundsLikeCrisis(t)).toBe(false);
  });

  it('always names the free helpline', () => {
    for (const id of ['hi', 'mr', 'ta', 'bn', 'gu', 'en'] as const) expect(careReply(id)).toContain('14416');
  });
});
