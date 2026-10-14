import type { CSSProperties } from 'react';
import { useReducedMotion } from './hooks';

interface CaptionTextProps {
  text: string;
  /** BCP-47 tag (hi-IN, ta-IN, bn-IN, …) so the right script font and shaping apply */
  lang: string;
  size?: 'lg' | 'sm';
  className?: string;
}

/** Rough Bulbul speaking rate, used to pace the word reveal (no word timings are available) */
const MS_PER_CHAR = 68;
/** Reveal words slightly ahead of the voice so reading never lags listening */
const LEAD = 0.82;
const MIN_WORD_MS = 160;

interface Word {
  text: string;
  start: number;
  dur: number;
}

/** Split on whitespace only (conjuncts and matras stay intact) and spread the estimated line time by length. */
function timeWords(text: string): Word[] {
  const words = text.split(/\s+/).filter(Boolean);
  const total = text.length * MS_PER_CHAR * LEAD;
  const chars = words.reduce((sum, w) => sum + w.length + 1, 0) || 1;
  let at = 0;
  return words.map((w) => {
    const dur = Math.max(MIN_WORD_MS, ((w.length + 1) / chars) * total);
    const word = { text: w, start: at, dur };
    at += dur;
    return word;
  });
}

/**
 * A spoken line in native script, revealed word by word at an estimated speaking pace, with a
 * thin accent underline sweeping under the word being said (karaoke). Transform and opacity
 * only; the whole line simply fades in under reduced motion.
 */
export default function CaptionText({ text, lang, size = 'lg', className = '' }: CaptionTextProps) {
  const reduced = useReducedMotion();
  const classes = `caption-text ${size === 'sm' ? 'caption-text-sm' : ''} ${className}`;

  if (reduced) {
    return (
      <p key={text} lang={lang} className={`${classes} fade-in`}>
        {text}
      </p>
    );
  }

  const words = timeWords(text);
  return (
    <p key={text} lang={lang} className={`${classes} karaoke`}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, i) => (
          <span key={i}>
            <span
              className="kw"
              style={{ '--d': `${Math.round(word.start)}ms`, '--w': `${Math.round(word.dur)}ms` } as CSSProperties}
            >
              {word.text}
            </span>
            {i < words.length - 1 ? ' ' : null}
          </span>
        ))}
      </span>
    </p>
  );
}
