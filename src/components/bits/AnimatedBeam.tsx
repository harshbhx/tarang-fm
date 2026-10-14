/*
 * AnimatedBeam: the idea of Animated Beam from Magic UI (MIT), written for Tarang FM. An SVG path is drawn
 * between two elements in a shared container (a gentle curve), and a short bright comet runs along it on a
 * CSS animation, so the browser composites it with no JavaScript per frame. Geometry is remeasured when the
 * container resizes. `lit` dims or brightens the whole beam (a stage of the call pipeline that is active).
 */
import { useLayoutEffect, useState, type RefObject } from 'react';
import './AnimatedBeam.css';

interface AnimatedBeamProps {
  containerRef: RefObject<HTMLElement | null>;
  fromRef: RefObject<HTMLElement | null>;
  toRef: RefObject<HTMLElement | null>;
  /** Bulge of the curve in px (positive bends right/down, negative the other way) */
  curvature?: number;
  /** Seconds for one run of the comet */
  duration?: number;
  delay?: number;
  reverse?: boolean;
  color?: string;
  /** Dim track colour */
  track?: string;
  width?: number;
  lit?: boolean;
  startYOffset?: number;
  endYOffset?: number;
  startXOffset?: number;
  endXOffset?: number;
}

export default function AnimatedBeam({
  containerRef,
  fromRef,
  toRef,
  curvature = 0,
  duration = 3,
  delay = 0,
  reverse = false,
  color = '#ffd08a',
  track = 'rgb(255 240 220 / 0.14)',
  width = 1.5,
  lit = true,
  startYOffset = 0,
  endYOffset = 0,
  startXOffset = 0,
  endXOffset = 0,
}: AnimatedBeamProps) {
  const [d, setD] = useState('');
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    const from = fromRef.current;
    const to = toRef.current;
    if (!container || !from || !to) return;
    const measure = () => {
      const c = container.getBoundingClientRect();
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const ax = a.left - c.left + a.width / 2 + startXOffset;
      const ay = a.top - c.top + a.height / 2 + startYOffset;
      const bx = b.left - c.left + b.width / 2 + endXOffset;
      const by = b.top - c.top + b.height / 2 + endYOffset;
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      // The control point sits off the midpoint, perpendicular to the line
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const cx = mx + (-dy / len) * curvature;
      const cy = my + (dx / len) * curvature;
      setD(`M ${ax},${ay} Q ${cx},${cy} ${bx},${by}`);
      setSize({ w: c.width, h: c.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    ro.observe(from);
    ro.observe(to);
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [containerRef, fromRef, toRef, curvature, startXOffset, startYOffset, endXOffset, endYOffset]);

  if (!d) return null;
  return (
    <svg
      className="animated-beam"
      data-lit={lit}
      data-reverse={reverse || undefined}
      width={size.w}
      height={size.h}
      viewBox={`0 0 ${size.w} ${size.h}`}
      aria-hidden="true"
      style={{ '--beam-duration': `${duration}s`, '--beam-delay': `${delay}s`, '--beam-color': color, '--beam-track': track } as never}
    >
      <path d={d} className="animated-beam-track" strokeWidth={width} />
      <path d={d} className="animated-beam-comet" strokeWidth={width + 0.5} pathLength={1} />
    </svg>
  );
}
