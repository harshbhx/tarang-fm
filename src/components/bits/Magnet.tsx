/*
 * Magnet: the idea of Magnet from React Bits (MIT + Commons Clause), written for Tarang FM with Motion springs.
 * The wrapped element drifts toward the pointer once it comes within `reach` px and settles back when it
 * leaves. Mouse and pen only (a finger has nothing to attract), and reduced motion turns it off.
 */
import { m, useReducedMotion, useSpring } from 'motion/react';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

interface MagnetProps {
  children: ReactNode;
  /** Pointer distance from the element's edge at which the pull begins */
  reach?: number;
  /** How far the element moves, as a fraction of the pointer's offset from its centre */
  strength?: number;
  /** Cap on the movement, px */
  limit?: number;
  className?: string;
  style?: CSSProperties;
}

export default function Magnet({ children, reach = 90, strength = 0.32, limit = 16, className, style }: MagnetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;
  const x = useSpring(0, { stiffness: 260, damping: 22, mass: 0.6 });
  const y = useSpring(0, { stiffness: 260, damping: 22, mass: 0.6 });

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce || !window.matchMedia?.('(hover: hover)').matches) return;
    let active = false;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const outsideX = Math.max(r.left - e.clientX, e.clientX - r.right, 0);
      const outsideY = Math.max(r.top - e.clientY, e.clientY - r.bottom, 0);
      const near = Math.hypot(outsideX, outsideY) < reach;
      if (near) {
        const clamp = (v: number) => Math.max(-limit, Math.min(limit, v));
        x.set(clamp((e.clientX - cx) * strength));
        y.set(clamp((e.clientY - cy) * strength));
        if (!active) {
          active = true;
          el.dataset.magnetActive = 'true';
        }
      } else if (active) {
        active = false;
        delete el.dataset.magnetActive;
        x.set(0);
        y.set(0);
      }
    };
    const onLeave = () => {
      active = false;
      delete el.dataset.magnetActive;
      x.set(0);
      y.set(0);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, [reach, strength, limit, reduce, x, y]);

  return (
    <m.div ref={ref} className={className} style={{ display: 'inline-flex', x, y, ...style }}>
      {children}
    </m.div>
  );
}
