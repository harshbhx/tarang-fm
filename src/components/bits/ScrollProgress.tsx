/*
 * ScrollProgress: the idea of Scroll Progress from Magic UI (MIT), written for Tarang FM as a signal-strength
 * bar: a thin amber line along the top of the page that fills as you read. Driven by Motion's scroll value,
 * which rides the browser's ScrollTimeline where it can, so it costs no JavaScript per frame.
 */
import { m, useReducedMotion, useScroll, useSpring } from 'motion/react';
import './ScrollProgress.css';

export default function ScrollProgress({ color = '#f2b25c' }: { color?: string }) {
  const { scrollYProgress } = useScroll();
  const reduce = useReducedMotion() ?? false;
  const eased = useSpring(scrollYProgress, { stiffness: 220, damping: 34, mass: 0.4 });
  return (
    <m.div
      className="scroll-progress"
      aria-hidden="true"
      style={{ scaleX: reduce ? scrollYProgress : eased, '--scroll-progress-color': color } as never}
    />
  );
}
