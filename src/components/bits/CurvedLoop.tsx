/**
 * CurvedLoop: adapted from React Bits (https://reactbits.dev, github.com/DavidHDev/react-bits).
 * Copyright (c) 2026 David Haz. MIT + Commons Clause License Condition v1.0.
 * Changes for Tarang FM: the offset lives in a ref (no React render per frame), the loop pauses while
 * off screen or in a hidden tab, reduced motion holds it still, and the text is hidden from screen readers
 * (pass `label` for the accessible name).
 */
import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from 'react';
import './CurvedLoop.css';

interface CurvedLoopProps {
  marqueeText: string;
  /** Accessible description of the band */
  label: string;
  speed?: number;
  className?: string;
  curveAmount?: number;
  direction?: 'left' | 'right';
  interactive?: boolean;
}

export default function CurvedLoop({
  marqueeText,
  label,
  speed = 1,
  className,
  curveAmount = 300,
  direction = 'left',
  interactive = true,
}: CurvedLoopProps) {
  const text = useMemo(() => `${marqueeText.replace(/\s+$/, '')} `, [marqueeText]);
  const measureRef = useRef<SVGTextElement | null>(null);
  const textPathRef = useRef<SVGTextPathElement | null>(null);
  const jacketRef = useRef<HTMLDivElement | null>(null);
  const [spacing, setSpacing] = useState(0);
  const uid = useId().replace(/:/g, '');
  const pathId = `curve-${uid}`;
  const pathD = `M-100,40 Q500,${40 + curveAmount} 1540,40`;

  const offsetRef = useRef(0);
  const dragRef = useRef(false);
  const lastXRef = useRef(0);
  const dirRef = useRef<'left' | 'right'>(direction);
  const velRef = useRef(0);
  const [dragging, setDragging] = useState(false);

  const totalText = spacing ? Array(Math.ceil(1800 / spacing) + 2).fill(text).join('') : text;
  const ready = spacing > 0;

  useEffect(() => {
    const measure = () => {
      if (measureRef.current) setSpacing(measureRef.current.getComputedTextLength());
    };
    measure();
    // Web fonts change the text's length once they load
    void document.fonts?.ready.then(measure);
  }, [text, className]);

  const place = (value: number) => {
    let next = value;
    if (next <= -spacing) next += spacing;
    if (next > 0) next -= spacing;
    offsetRef.current = next;
    textPathRef.current?.setAttribute('startOffset', `${next}px`);
  };

  useEffect(() => {
    if (!spacing) return;
    place(-spacing);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduce) return;
    let frame = 0;
    let visible = true;
    const step = () => {
      frame = 0;
      if (!visible || document.hidden) return;
      if (!dragRef.current) place(offsetRef.current + (dirRef.current === 'right' ? speed : -speed));
      frame = requestAnimationFrame(step);
    };
    const wake = () => {
      if (!frame && visible && !document.hidden) frame = requestAnimationFrame(step);
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      wake();
    });
    if (jacketRef.current) io.observe(jacketRef.current);
    document.addEventListener('visibilitychange', wake);
    wake();
    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      document.removeEventListener('visibilitychange', wake);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spacing, speed]);

  const onPointerDown = (e: PointerEvent) => {
    if (!interactive) return;
    dragRef.current = true;
    setDragging(true);
    lastXRef.current = e.clientX;
    velRef.current = 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!interactive || !dragRef.current) return;
    const dx = e.clientX - lastXRef.current;
    lastXRef.current = e.clientX;
    velRef.current = dx;
    place(offsetRef.current + dx);
  };

  const endDrag = () => {
    if (!interactive || !dragRef.current) return;
    dragRef.current = false;
    setDragging(false);
    if (velRef.current !== 0) dirRef.current = velRef.current > 0 ? 'right' : 'left';
  };

  return (
    <div
      ref={jacketRef}
      className="curved-loop-jacket"
      role="img"
      aria-label={label}
      style={{ visibility: ready ? 'visible' : 'hidden', cursor: interactive ? (dragging ? 'grabbing' : 'grab') : 'auto' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={endDrag}
    >
      <svg className="curved-loop-svg" viewBox="0 0 1440 120" aria-hidden="true">
        <text ref={measureRef} xmlSpace="preserve" className={className} style={{ visibility: 'hidden', opacity: 0, pointerEvents: 'none' }}>
          {text}
        </text>
        <defs>
          <path id={pathId} d={pathD} fill="none" stroke="transparent" />
        </defs>
        {ready && (
          <text xmlSpace="preserve" className={className}>
            <textPath ref={textPathRef} href={`#${pathId}`} startOffset={`${offsetRef.current}px`} xmlSpace="preserve">
              {totalText}
            </textPath>
          </text>
        )}
      </svg>
    </div>
  );
}
