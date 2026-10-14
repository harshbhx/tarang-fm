import { useEffect, useRef } from 'react';

interface DialBandProps {
  /** One pass of the band, e.g. "मराठी 94.3  ✦  தமிழ் 98.3  ✦ …" */
  text: string;
  /** Accessible description of the band */
  label: string;
  /** Base speed, px per frame */
  speed?: number;
  /** Extra px per frame per px of page scroll in the last frame (the band races with a flick) */
  scrollBoost?: number;
  maxBoost?: number;
}

/**
 * The printed scale of a radio, scrolling past: every station in its own script. The track is moved with
 * a single transform (compositor only, no layout or paint per frame), pauses off screen and in hidden tabs,
 * holds still under reduced motion, and speeds up with the page's scroll velocity (the idea of Scroll
 * Velocity from React Bits). Replaces an SVG textPath marquee, which re-laid out Indic text every frame.
 */
export default function DialBand({ text, label, speed = 0.6, scrollBoost = 0.1, maxBoost = 9 }: DialBandProps) {
  const jacket = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const unit = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const host = jacket.current;
    const el = track.current;
    if (!host || !el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduce) return;
    let period = 0;
    const measure = () => {
      period = unit.current?.getBoundingClientRect().width ?? 0;
    };
    measure();
    void document.fonts?.ready.then(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);

    let x = 0;
    let frame = 0;
    let visible = true;
    let lastY = window.scrollY;
    let boost = 0;
    const step = () => {
      frame = 0;
      if (!visible || document.hidden) return;
      const y = window.scrollY;
      boost = boost * 0.86 + Math.min(maxBoost, Math.abs(y - lastY) * scrollBoost) * 0.14;
      lastY = y;
      x -= speed + boost;
      if (period && x <= -period) x += period;
      el.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
      frame = requestAnimationFrame(step);
    };
    const wake = () => {
      if (!frame && visible && !document.hidden) frame = requestAnimationFrame(step);
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      wake();
    });
    io.observe(host);
    document.addEventListener('visibilitychange', wake);
    wake();
    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', wake);
    };
  }, [speed, scrollBoost, maxBoost, text]);

  return (
    <div ref={jacket} className="lp-band" role="img" aria-label={label}>
      <div ref={track} className="lp-band-track" aria-hidden="true">
        <span ref={unit} className="lp-band-unit">
          {text}
        </span>
        <span className="lp-band-unit">{text}</span>
        <span className="lp-band-unit">{text}</span>
      </div>
    </div>
  );
}
