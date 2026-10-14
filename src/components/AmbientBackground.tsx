import { useEffect, useRef } from 'react';
import { useReducedMotion } from './hooks';

interface AmbientBackgroundProps {
  /** Station accent colour (hex) */
  accent: string;
  /** Drifts and breathes while the show is live; otherwise holds a dim still frame */
  active: boolean;
}

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6);
  const n = parseInt(full, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const WARM: Rgb = [255, 150, 70];
const FPS = 24;
const IDLE_GLOW = 0.6;

/**
 * The dark room: soft light in the station accent spills from behind and under the radio body,
 * breathing slowly and pulsing with the `--level` the audio loop writes on the `.radio` root.
 * Drawn on a tiny canvas the browser scales up (smooth and cheap on phones), under a fine CSS grain.
 */
export default function AmbientBackground({ accent, active }: AmbientBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef<Rgb>(hexToRgb(accent));
  const activeRef = useRef(active);
  const wakeRef = useRef<() => void>(() => undefined);
  const reduced = useReducedMotion();

  useEffect(() => {
    targetRef.current = hexToRgb(accent);
    activeRef.current = active;
    wakeRef.current();
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const host = canvas.closest<HTMLElement>('.radio');
    const color: Rgb = [...targetRef.current];
    let width = 0;
    let height = 0;
    let time = Math.random() * 100;
    let glow = activeRef.current ? 1 : IDLE_GLOW;
    let raf = 0;
    let last = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = 120;
      height = Math.max(40, Math.round((120 * rect.height) / Math.max(1, rect.width)));
      canvas.width = width;
      canvas.height = height;
    };

    /** Elliptical light: `sx`/`sy` stretch a circle of radius `r` centred on (x, y). */
    const blob = (x: number, y: number, r: number, rgb: Rgb, alpha: number, sx = 1, sy = 1) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(sx, sy);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`);
      g.addColorStop(0.5, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha * 0.45})`);
      g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(-width / sx, -height / sy, (width * 2) / sx, (height * 2) / sy);
      ctx.restore();
    };

    const draw = (now: number) => {
      raf = 0;
      if (document.hidden) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / FPS;
      if (last && now - last < 1000 / FPS - 2) {
        raf = requestAnimationFrame(draw);
        return;
      }
      last = now;
      const live = activeRef.current;
      if (live && !reduced) time += dt;
      const target = targetRef.current;
      let settling = false;
      for (let i = 0; i < 3; i++) {
        const delta = target[i] - color[i];
        color[i] += delta * 0.08;
        if (Math.abs(delta) > 0.5) settling = true;
      }
      const goal = live ? 1 : IDLE_GLOW;
      glow += (goal - glow) * 0.06;
      if (Math.abs(goal - glow) > 0.01) settling = true;
      const level = reduced ? 0 : Number.parseFloat(host?.style.getPropertyValue('--level') || '0') || 0;

      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#050403';
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';
      const t = time;
      // Anchor the light to the radio body wherever the layout puts it (and as the page scrolls).
      const box = host?.querySelector<HTMLElement>('.radio-body')?.getBoundingClientRect();
      const vw = Math.max(1, window.innerWidth);
      const vh = Math.max(1, window.innerHeight);
      const cx = box ? ((box.left + box.width / 2) / vw) * width : width / 2;
      const cy = box ? ((box.top + box.height * 0.55) / vh) * height : height * 0.25;
      const size = box ? (Math.max(box.width, box.height) / vw) * width : width * 0.6;
      const breathe = 0.5 + 0.5 * Math.sin(t * 0.55);
      const core = (0.15 + 0.06 * breathe + level * 0.1) * glow;
      blob(cx + size * 0.04 * Math.sin(t * 0.21), cy, size * 0.95, color, core, 1.25, 1);
      blob(cx, cy + (box ? (box.height / vh) * height * 0.55 : height * 0.15), size * 0.9, color, core * 0.75, 1.7, 0.55);
      blob(cx - size * 0.35 + size * 0.1 * Math.sin(t * 0.13 + 1), cy + size * 0.2, size * 0.7, WARM, 0.06 * glow);
      blob(width * (0.8 + 0.08 * Math.sin(t * 0.09 + 2)), height * (0.7 + 0.1 * Math.sin(t * 0.08 + 1)), width * 0.5, color, 0.05 * glow);
      ctx.globalCompositeOperation = 'source-over';

      if ((live && !reduced) || settling) raf = requestAnimationFrame(draw);
      else last = 0;
    };

    const wake = () => {
      if (!raf && !document.hidden) raf = requestAnimationFrame(draw);
    };
    wakeRef.current = wake;

    resize();
    const observer = new ResizeObserver(() => {
      resize();
      wake();
    });
    observer.observe(canvas);
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('scroll', wake, { passive: true });
    window.addEventListener('resize', wake);
    wake();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('scroll', wake);
      window.removeEventListener('resize', wake);
      wakeRef.current = () => undefined;
    };
  }, [reduced]);

  return (
    <div aria-hidden="true" className="ambient">
      <canvas ref={canvasRef} />
    </div>
  );
}
