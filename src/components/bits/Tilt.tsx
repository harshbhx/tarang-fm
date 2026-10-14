/*
 * Tilt: the idea of Tilted Card from React Bits (MIT + Commons Clause), written for Tarang FM with Motion
 * springs. The child leans a few degrees toward the pointer, like a radio on a shelf catching the light, and
 * levels out when the pointer leaves. Mouse and pen only, off under reduced motion, and the children stay
 * fully interactive (the transform is on a wrapper).
 */
import { m, useReducedMotion, useSpring } from 'motion/react';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

interface TiltProps {
  children: ReactNode;
  /** Maximum lean, degrees */
  max?: number;
  /** Perspective distance, px */
  perspective?: number;
  className?: string;
  style?: CSSProperties;
}

export default function Tilt({ children, max = 4, perspective = 1400, className, style }: TiltProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;
  const rx = useSpring(0, { stiffness: 140, damping: 20, mass: 0.8 });
  const ry = useSpring(0, { stiffness: 140, damping: 20, mass: 0.8 });

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce || !window.matchMedia?.('(hover: hover)').matches) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      ry.set(px * 2 * max);
      rx.set(-py * 2 * max);
    };
    const onLeave = () => {
      rx.set(0);
      ry.set(0);
    };
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [max, reduce, rx, ry]);

  return (
    <div className={className} style={{ perspective: `${perspective}px`, ...style }}>
      <m.div ref={ref} style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }}>
        {children}
      </m.div>
    </div>
  );
}
