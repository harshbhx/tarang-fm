/*
 * TextReveal: the idea of Text Reveal from Magic UI (MIT), written for Tarang FM. A tall section pins one
 * paragraph in the middle of the screen and lights it up word by word as you scroll through, like a signal
 * coming in. The words are real text at every moment (only their opacity changes), and reduced motion shows
 * the whole paragraph at once.
 */
import { m, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react';
import { useRef, type ReactNode } from 'react';
import './TextReveal.css';

interface TextRevealProps {
  text: string;
  className?: string;
  /** Height of the scroll run, in viewport heights */
  run?: number;
  /** Rendered before the paragraph inside the pinned frame (a kicker, a lamp) */
  children?: ReactNode;
  /** Words to colour differently, matched case-insensitively without punctuation */
  accent?: string[];
}

function Word({ progress, range, children, accent }: { progress: MotionValue<number>; range: [number, number]; children: string; accent: boolean }) {
  const opacity = useTransform(progress, range, [0.14, 1]);
  return (
    <m.span className="text-reveal-word" data-accent={accent || undefined} style={{ opacity }}>
      {children}
    </m.span>
  );
}

export default function TextReveal({ text, className = '', run = 1.8, children, accent = [] }: TextRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.9', 'end 0.6'] });
  const words = text.split(' ');
  const lit = new Set(accent.map((w) => w.toLowerCase()));
  const key = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

  return (
    <div ref={ref} className={`text-reveal ${className}`} style={{ '--text-reveal-run': `${run * 100}vh` } as never}>
      <div className="text-reveal-frame">
        {children}
        <p className="text-reveal-text">
          {words.map((word, i) => {
            const start = i / words.length;
            const end = start + 1 / words.length;
            return reduce ? (
              <span key={i} className="text-reveal-word" data-accent={lit.has(key(word)) || undefined}>
                {word}{' '}
              </span>
            ) : (
              <Word key={i} progress={scrollYProgress} range={[start, end]} accent={lit.has(key(word))}>
                {`${word} `}
              </Word>
            );
          })}
        </p>
      </div>
    </div>
  );
}
