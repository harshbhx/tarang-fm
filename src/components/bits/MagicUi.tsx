/*
 * BorderBeam and Ripple: adapted from Magic UI (MIT License), https://github.com/magicuidesign/magicui.
 * Changes for Tarang FM: plain CSS (src/components/bits/MagicUi.css) instead of Tailwind utility classes,
 * and both hold still under reduced motion.
 */
import { m, useReducedMotion } from 'motion/react';
import type { CSSProperties } from 'react';
import './MagicUi.css';

type Vars = CSSProperties & Record<`--${string}`, string>;

/** A short light that travels around the border of its (position: relative, rounded) parent. */
export function BorderBeam({
  size = 90,
  duration = 7,
  delay = 0,
  colorFrom = '#ffb347',
  colorTo = '#ff3b2f',
  borderWidth = 1.5,
}: {
  size?: number;
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
  borderWidth?: number;
}) {
  const reduce = useReducedMotion() ?? false;
  return (
    <div className="mui-beam" aria-hidden="true" style={{ '--beam-width': `${borderWidth}px` } as Vars}>
      <m.div
        className="mui-beam-light"
        style={
          {
            width: size,
            offsetPath: `rect(0 auto auto 0 round ${size}px)`,
            '--beam-from': colorFrom,
            '--beam-to': colorTo,
          } as Vars
        }
        initial={{ offsetDistance: '0%' }}
        animate={reduce ? { offsetDistance: '12%' } : { offsetDistance: ['0%', '100%'] }}
        transition={reduce ? { duration: 0 } : { repeat: Infinity, ease: 'linear', duration, delay: -delay }}
      />
    </div>
  );
}

/** Concentric rings pulsing out from the centre of the (position: relative) parent, like a ringing phone. */
export function Ripple({
  size = 56,
  step = 26,
  rings = 4,
  opacity = 0.32,
  color = 'var(--accent, #ffb347)',
}: {
  size?: number;
  step?: number;
  rings?: number;
  opacity?: number;
  color?: string;
}) {
  return (
    <div className="mui-ripple" aria-hidden="true" style={{ '--ripple-color': color } as Vars}>
      {Array.from({ length: rings }, (_, i) => (
        <span
          key={i}
          className="mui-ripple-ring"
          style={
            {
              width: size + i * step,
              height: size + i * step,
              opacity: Math.max(0.04, opacity - i * (opacity / (rings + 1))),
              animationDelay: `${i * 0.12}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
