/**
 * BlurText: adapted from React Bits (https://reactbits.dev, github.com/DavidHDev/react-bits).
 * Copyright (c) 2026 David Haz. MIT + Commons Clause License Condition v1.0.
 * Changes for Tarang FM: renders any element (so headings stay headings), screen readers get the whole
 * phrase once instead of word by word, words keep normal wrapping, and reduced motion shows the text at once.
 */
import { m, useReducedMotion, type Transition } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type ElementType } from 'react';

type BlurTextProps = {
  text: string;
  as?: ElementType;
  id?: string;
  className?: string;
  /** Milliseconds between words */
  delay?: number;
  direction?: 'top' | 'bottom';
  threshold?: number;
  rootMargin?: string;
  stepDuration?: number;
};

export default function BlurText({
  text,
  as: Tag = 'p',
  id,
  className = '',
  delay = 70,
  direction = 'bottom',
  threshold = 0.2,
  rootMargin = '0px 0px -8% 0px',
  stepDuration = 0.32,
}: BlurTextProps) {
  const words = text.split(' ');
  const reduce = useReducedMotion() ?? false;
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin, reduce]);

  const from = useMemo(() => ({ filter: 'blur(10px)', opacity: 0, y: direction === 'top' ? -24 : 24 }), [direction]);
  const keyframes = useMemo(
    () => ({
      filter: ['blur(10px)', 'blur(4px)', 'blur(0px)'],
      opacity: [0, 0.6, 1],
      y: [from.y, direction === 'top' ? 3 : -3, 0],
    }),
    [from.y, direction],
  );

  return (
    <Tag ref={ref} id={id} className={className} aria-label={text}>
      {words.map((word, i) => {
        const transition: Transition = { duration: stepDuration * 2, times: [0, 0.5, 1], delay: (i * delay) / 1000 };
        return (
          <m.span
            key={`${word}-${i}`}
            aria-hidden="true"
            initial={reduce ? false : from}
            animate={reduce || inView ? keyframes : from}
            transition={reduce ? { duration: 0 } : transition}
            style={{ display: 'inline-block', willChange: 'transform, filter, opacity' }}
          >
            {word}
            {i < words.length - 1 ? ' ' : ''}
          </m.span>
        );
      })}
    </Tag>
  );
}
