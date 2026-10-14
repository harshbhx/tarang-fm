/*
 * Adapted from NumberTicker in Magic UI (MIT License), https://github.com/magicuidesign/magicui.
 * Counts up once when scrolled into view; the real value is always in the accessible text.
 */
import { useEffect, useRef } from 'react';
import { useInView, useMotionValue, useReducedMotion, useSpring } from 'motion/react';

export function CountUp({ value, prefix = '' }: { value: number; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion() ?? false;
  const motionValue = useMotionValue(reduce ? value : 0);
  const spring = useSpring(motionValue, { damping: 40, stiffness: 120 });
  const inView = useInView(ref, { once: true, amount: 0.3 });

  useEffect(() => {
    if (inView) motionValue.set(value);
  }, [inView, motionValue, value]);

  useEffect(
    () =>
      spring.on('change', (latest) => {
        if (ref.current) ref.current.textContent = `${prefix}${Math.round(latest)}`;
      }),
    [spring, prefix],
  );

  return (
    <>
      <span ref={ref} aria-hidden="true">
        {prefix}
        {reduce ? value : 0}
      </span>
      <span className="lp-sr">
        {prefix}
        {value}
      </span>
    </>
  );
}
