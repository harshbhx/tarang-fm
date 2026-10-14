import { describe, expect, it } from 'vitest';
import { cleanText, processLines, splitLine } from './text';

describe('cleanText', () => {
  it('keeps a clean Hindi line as is', () => {
    expect(cleanText('आप सुन रहे हैं तरंग FM 91.1!', 'hi-IN')).toBe('आप सुन रहे हैं तरंग FM 91.1!');
  });

  it('adds a danda for Hindi and Bangla and a full stop for Tamil', () => {
    expect(cleanText('नमस्ते दोस्तों', 'hi-IN')).toBe('नमस्ते दोस्तों।');
    expect(cleanText('নমস্কার বন্ধুরা', 'bn-IN')).toBe('নমস্কার বন্ধুরা।');
    expect(cleanText('வணக்கம் நண்பர்களே', 'ta-IN')).toBe('வணக்கம் நண்பர்களே.');
  });

  it('strips markdown but keeps the words', () => {
    expect(cleanText('**धमाकेदार** ऑफर, सिर्फ़ `आज`', 'hi-IN')).toBe('धमाकेदार ऑफर, सिर्फ़ आज।');
    expect(cleanText('# Breaking: [खबर](https://x.y) आई', 'hi-IN')).toBe('Breaking: खबर आई।');
  });

  it('removes stage directions in brackets and asterisks', () => {
    expect(cleanText('(हंसते हुए) अरे वाह! [music] *laughs* क्या बात है', 'hi-IN')).toBe('अरे वाह! क्या बात है।');
    expect(cleanText('<pause> சரி, கேளுங்க', 'ta-IN')).toBe('சரி, கேளுங்க.');
  });

  it('removes emojis without breaking Bengali joiners', () => {
    expect(cleanText('দারুণ খবর 🎉🔥!', 'bn-IN')).toBe('দারুণ খবর!');
    const rafar = 'র‍্যাব';
    expect(cleanText(`${rafar} এসেছে 👍🏽`, 'bn-IN')).toBe(`${rafar} এসেছে।`);
  });

  it('strips whole-line quotes and speaker labels', () => {
    expect(cleanText('"चलो चलते हैं।"', 'hi-IN')).toBe('चलो चलते हैं।');
    expect(cleanText('RJ: “Good morning जम्मू!”', 'hi-IN')).toBe('Good morning जम्मू!');
    expect(cleanText('char_a: ठहरो!', 'hi-IN')).toBe('ठहरो!');
  });

  it('collapses whitespace and tidies punctuation', () => {
    expect(cleanText('  अरे   भाई  ,  सुनो  !!  ', 'hi-IN')).toBe('अरे भाई, सुनो!');
    expect(cleanText('— तो फिर,', 'hi-IN')).toBe('तो फिर।');
  });

  it('merges doubled sentence punctuation', () => {
    expect(cleanText('আজকের খবর এখানেই শেষ।!', 'bn-IN')).toBe('আজকের খবর এখানেই শেষ!');
    expect(cleanText('पार्टी बनेगी!।', 'hi-IN')).toBe('पार्टी बनेगी!');
    expect(cleanText('सच में?। हाँ।.', 'hi-IN')).toBe('सच में? हाँ।');
    expect(cleanText('Wow!. Okay...', 'ta-IN')).toBe('Wow! Okay...');
  });

  it('keeps ellipses and decimals', () => {
    expect(cleanText('तरंग FM 91.1… बने रहिए', 'hi-IN')).toBe('तरंग FM 91.1… बने रहिए।');
    expect(cleanText('रुको...', 'hi-IN')).toBe('रुको...');
  });

  it('returns empty for lines with no words', () => {
    expect(cleanText('(music)', 'hi-IN')).toBe('');
    expect(cleanText('🎵🎶 ...', 'hi-IN')).toBe('');
    expect(cleanText('   ', 'ta-IN')).toBe('');
  });
});

describe('splitLine', () => {
  it('leaves short lines alone', () => {
    expect(splitLine('छोटी लाइन।')).toEqual(['छोटी लाइन।']);
  });

  it('splits long lines at sentence boundaries within the limit', () => {
    const s = 'यह एक वाक्य है जो थोड़ा लंबा है।';
    const text = Array.from({ length: 12 }, () => s).join(' ');
    const parts = splitLine(text, 100);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) {
      expect(p.length).toBeLessThanOrEqual(100);
      expect(p.endsWith('।')).toBe(true);
    }
    expect(parts.join(' ')).toBe(text);
  });

  it('does not split inside decimals', () => {
    const text = `${'क'.repeat(60)} FM 91.1 पर ${'ख'.repeat(60)}। ${'ग'.repeat(80)}।`;
    const parts = splitLine(text, 140);
    expect(parts[0]).toContain('91.1');
  });

  it('falls back to commas and then spaces for very long sentences', () => {
    const clause = 'बहुत लंबी बात चल रही है';
    const text = `${Array.from({ length: 15 }, () => clause).join(', ')}।`;
    const parts = splitLine(text, 120);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(120);
    expect(parts.join(' ')).toBe(text);

    const words = `${Array.from({ length: 60 }, () => 'शब्द').join(' ')}।`;
    for (const p of splitLine(words, 50)) expect(p.length).toBeLessThanOrEqual(50);
  });
});

describe('processLines', () => {
  it('drops disallowed roles and empty lines', () => {
    const out = processLines(
      [
        { role: 'rj', text: 'नमस्ते!' },
        { role: 'news', text: 'यह नहीं आना चाहिए।' },
        { role: 'rj', text: '(music)' },
      ],
      ['rj'],
      'rj_link',
      'hi-IN',
    );
    expect(out).toEqual([{ role: 'rj', text: 'नमस्ते!' }]);
  });

  it('maps unknown Kahani roles to the narrator and splits long lines', () => {
    const long = Array.from({ length: 10 }, () => 'कहानी आगे बढ़ती है और रात गहरी होती जाती है।').join(' ');
    const out = processLines([{ role: 'rj', text: long }], ['narrator', 'char_a'], 'kahani', 'hi-IN');
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((l) => l.role === 'narrator' && l.text.length <= 220)).toBe(true);
  });
});
