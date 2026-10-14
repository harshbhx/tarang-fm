import { useReducedMotion } from 'motion/react';
import TextEffect from './TextEffect';

interface CaptionTextProps {
  text: string;
  /** BCP-47 tag (hi-IN, ta-IN, bn-IN) so the right script font and shaping apply */
  lang: string;
  size?: 'lg' | 'sm';
  className?: string;
}

const MS_PER_CHAR = 70;
const MAX_WORD_STAGGER_S = 0.09;
const WHOLE_LINE_OVER_WORDS = 20;

/**
 * A spoken line in native script, revealed word by word with a soft blur-in, roughly in step
 * with the voice. Words are split on whitespace only so conjuncts and matras stay intact.
 */
export default function CaptionText({ text, lang, size = 'lg', className = '' }: CaptionTextProps) {
  const reduced = useReducedMotion();
  const wordCount = text.split(/(\s+)/).filter((part) => part.trim()).length;
  const estimatedMs = text.length * MS_PER_CHAR;
  const stagger = Math.min(MAX_WORD_STAGGER_S, (estimatedMs * 0.8) / Math.max(1, wordCount) / 1000);
  const wholeLine = wordCount > WHOLE_LINE_OVER_WORDS;

  return (
    <TextEffect
      key={text}
      as="p"
      lang={lang}
      per={wholeLine ? 'line' : 'word'}
      preset={reduced || wholeLine ? 'fade' : 'blur'}
      containerTransition={{ staggerChildren: wholeLine ? 0 : stagger }}
      segmentTransition={{ duration: wholeLine ? 0.4 : 0.35, ease: 'easeOut' }}
      className={`caption-text ${size === 'sm' ? 'caption-text-sm' : ''} ${className}`}
    >
      {text}
    </TextEffect>
  );
}
