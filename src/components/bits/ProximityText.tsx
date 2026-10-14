/*
 * ProximityText: the idea of Variable Proximity from React Bits (https://reactbits.dev, MIT + Commons Clause),
 * written fresh for Tarang FM. Letters near the pointer gain weight and width through the font's variable axes
 * (Anek: wght and wdth), like a dial needle warming the glass it passes. No React render per frame: the loop
 * writes font-variation-settings straight to the spans, runs only while the pointer is near, and reduced motion
 * (or a touch screen) leaves the text as set.
 */
import { useEffect, useRef, type ElementType } from 'react';

export interface Axes {
  wght: number;
  wdth: number;
}

interface ProximityTextProps {
  text: string;
  as?: ElementType;
  className?: string;
  /** Pointer distance (px) at which a letter starts to react */
  radius?: number;
  /** Resting axes, matching the element's CSS weight and stretch */
  from?: Axes;
  /** Axes right under the pointer */
  to?: Axes;
}

const settings = (a: Axes) => `"wght" ${a.wght.toFixed(0)}, "wdth" ${a.wdth.toFixed(1)}`;

export default function ProximityText({
  text,
  as: Tag = 'span',
  className,
  radius = 130,
  from = { wght: 650, wdth: 86 },
  to = { wght: 800, wdth: 112 },
}: ProximityTextProps) {
  const root = useRef<HTMLElement | null>(null);
  const words = text.split(' ');

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !window.matchMedia?.('(hover: hover)').matches;
    if (still) return;
    const letters = Array.from(el.querySelectorAll<HTMLSpanElement>('[data-letter]'));
    if (!letters.length) return;

    let px = -1e4;
    let py = -1e4;
    let frame = 0;
    const rest = settings(from);
    // Each letter eases toward its target, so the swell has some give rather than snapping
    const level = new Float32Array(letters.length);

    const step = () => {
      frame = 0;
      let moving = false;
      const r2 = radius * radius;
      for (let i = 0; i < letters.length; i++) {
        const box = letters[i].getBoundingClientRect();
        const dx = px - (box.left + box.width / 2);
        const dy = py - (box.top + box.height / 2);
        const d2 = dx * dx + dy * dy;
        const target = d2 >= r2 ? 0 : 1 - Math.sqrt(d2) / radius;
        const eased = target * target * (3 - 2 * target);
        const next = level[i] + (eased - level[i]) * 0.28;
        if (Math.abs(next - level[i]) > 0.002 || target > 0) moving = true;
        level[i] = next;
        letters[i].style.fontVariationSettings =
          next < 0.004 ? rest : settings({ wght: from.wght + (to.wght - from.wght) * next, wdth: from.wdth + (to.wdth - from.wdth) * next });
      }
      if (moving) frame = requestAnimationFrame(step);
    };
    const wake = () => {
      if (!frame) frame = requestAnimationFrame(step);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      px = e.clientX;
      py = e.clientY;
      const box = el.getBoundingClientRect();
      const near = px > box.left - radius && px < box.right + radius && py > box.top - radius && py < box.bottom + radius;
      if (near || level.some((v) => v > 0)) wake();
    };
    const onLeave = () => {
      px = -1e4;
      py = -1e4;
      wake();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      for (const l of letters) l.style.fontVariationSettings = '';
    };
  }, [text, radius, from, to]);

  return (
    <Tag ref={root} className={className}>
      <span className="prox-sr">{text}</span>
      <span aria-hidden="true">
        {words.map((word, w) => (
          <span key={`${w}-${word}`} className="prox-word">
            {Array.from(word).map((ch, i) => (
              <span key={i} data-letter className="prox-letter">
                {ch}
              </span>
            ))}
            {w < words.length - 1 ? ' ' : ''}
          </span>
        ))}
      </span>
    </Tag>
  );
}
