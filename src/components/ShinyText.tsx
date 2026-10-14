/**
 * ShinyText: adapted from React Bits (https://reactbits.dev, github.com/DavidHDev/react-bits).
 * Copyright (c) 2026 David Haz. MIT + Commons Clause License Condition v1.0.
 * Changes for Tarang FM: trimmed to the loop trigger used here (no pointer follow / hover).
 */
import { useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';

type Easing = 'smooth' | 'linear' | 'snappy';

export interface ShinyTextProps {
  text?: string;
  children?: ReactNode;
  color?: string;
  shineColor?: string;
  speed?: number;
  delay?: number;
  angle?: number;
  shineWidth?: number;
  softness?: number;
  direction?: 'left' | 'right';
  easing?: Easing;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}

interface Settings {
  color: string;
  shineColor: string;
  speed: number;
  delay: number;
  angle: number;
  shineWidth: number;
  softness: number;
  sign: number;
  ease: (t: number) => number;
  disabled: boolean;
}

const EASINGS: Record<Easing, (t: number) => number> = {
  linear: (t) => t,
  smooth: (t) => 0.5 - Math.cos(Math.PI * t) / 2,
  snappy: (t) => (t < 0.5 ? 16 * Math.pow(t, 5) : 1 - Math.pow(-2 * t + 2, 5) / 2),
};
const FALLOFF = [0, 0.2, 0.4, 0.6, 0.8, 1];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

let paint: CanvasRenderingContext2D | null = null;

const parseColor = (value: string): number[] | null => {
  if (typeof document === 'undefined') return null;
  if (!paint) paint = document.createElement('canvas').getContext('2d');
  if (!paint) return null;
  paint.fillStyle = '#000000';
  paint.fillStyle = value;
  const resolved = String(paint.fillStyle);
  if (resolved.startsWith('#')) {
    return [1, 3, 5].map((i) => parseInt(resolved.slice(i, i + 2), 16)).concat(1);
  }
  const parts = resolved.match(/[\d.]+/g);
  if (!parts || parts.length < 3) return null;
  return [Number(parts[0]), Number(parts[1]), Number(parts[2]), parts.length > 3 ? Number(parts[3]) : 1];
};

const blend = (from: number[], to: number[], amount: number) => {
  const channel = (a: number, b: number) =>
    Math.round(Math.pow(Math.pow(a / 255, 2.2) * (1 - amount) + Math.pow(b / 255, 2.2) * amount, 1 / 2.2) * 255);
  const alpha = from[3] * (1 - amount) + to[3] * amount;
  if (alpha <= 0) return 'rgba(0, 0, 0, 0)';
  const weigh = (a: number, b: number) => (a * from[3] * (1 - amount) + b * to[3] * amount) / alpha;
  const r = from[3] === to[3] ? channel(from[0], to[0]) : Math.round(weigh(from[0], to[0]));
  const g = from[3] === to[3] ? channel(from[1], to[1]) : Math.round(weigh(from[1], to[1]));
  const b = from[3] === to[3] ? channel(from[2], to[2]) : Math.round(weigh(from[2], to[2]));
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 1000) / 1000})`;
};

const ShinyText = ({
  text,
  children,
  color = '#b5b5b5',
  shineColor = '#ffffff',
  speed = 2,
  delay = 0,
  angle = 120,
  shineWidth = 40,
  softness = 0.8,
  direction = 'left',
  easing = 'smooth',
  disabled = false,
  className = '',
  style,
}: ShinyTextProps) => {
  const rootRef = useRef<HTMLSpanElement>(null);
  const settingsRef = useRef<Settings | null>(null);
  const syncRef = useRef<(() => void) | null>(null);
  const content = children ?? text;

  settingsRef.current = {
    color,
    shineColor,
    speed: Math.max(0.1, speed),
    delay: Math.max(0, delay),
    angle,
    shineWidth: clamp(shineWidth, 2, 200),
    softness: clamp(softness, 0, 1),
    sign: direction === 'right' ? 1 : -1,
    ease: EASINGS[easing] ?? EASINGS.smooth,
    disabled,
  };

  useEffect(() => {
    syncRef.current?.();
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const state = { pos: null as number | null, phase: 'idle', from: 0, to: 0, start: 0, duration: 1, resume: 0, visible: true, colors: '' };
    let base: number[] | null = null;
    let shine: number[] | null = null;
    let raf = 0;
    let timer = 0;
    let alive = true;

    const extent = () => settingsRef.current!.shineWidth / 2 + 2;
    const entry = () => (settingsRef.current!.sign > 0 ? -extent() : 100 + extent());
    const exit = () => (settingsRef.current!.sign > 0 ? 100 + extent() : -extent());

    const gradient = (pos: number, fill: number[]) => {
      const s = settingsRef.current!;
      const half = s.shineWidth / 2;
      const core = half * (1 - s.softness);
      const fade = half - core;
      const stops: [number, number][] = [];
      for (const side of [-1, 1]) {
        for (const f of FALLOFF) {
          const at = pos + side * (core + fade * (1 - f));
          stops.push([at, f * f * (3 - 2 * f)]);
        }
      }
      stops.sort((a, b) => a[0] - b[0]);
      const list = stops.map(([at, amount]) => `${blend(fill, shine!, amount)} ${at.toFixed(2)}%`);
      return `linear-gradient(${s.angle}deg, ${blend(fill, shine!, 0)} 0%, ${list.join(', ')}, ${blend(fill, shine!, 0)} 100%)`;
    };

    const draw = () => {
      const s = settingsRef.current!;
      const key = `${s.color}|${s.shineColor}`;
      if (key !== state.colors) {
        state.colors = key;
        base = parseColor(s.color);
        shine = parseColor(s.shineColor);
      }
      if (!base || !shine || state.pos === null || s.disabled) {
        root.style.backgroundImage = `linear-gradient(${s.color}, ${s.color})`;
        return;
      }
      root.style.backgroundImage = gradient(state.pos, base);
    };

    const sweep = (from: number, to: number, now: number) => {
      const s = settingsRef.current!;
      const span = Math.abs(exit() - entry()) || 1;
      state.phase = 'sweep';
      state.from = from;
      state.to = to;
      state.start = now;
      state.duration = s.speed * 1000 * Math.max(0.15, Math.abs(to - from) / span);
    };

    const wake = () => {
      if (raf || !alive) return;
      window.clearTimeout(timer);
      timer = 0;
      raf = requestAnimationFrame(tick);
    };

    const tick = (now: number) => {
      raf = 0;
      if (!alive) return;
      const s = settingsRef.current!;
      if (s.disabled || reduce) {
        state.pos = null;
        state.phase = 'idle';
        draw();
        return;
      }
      if (state.phase === 'sweep') {
        const t = clamp((now - state.start) / state.duration, 0, 1);
        state.pos = state.from + (state.to - state.from) * s.ease(t);
        draw();
        if (t < 1) {
          raf = requestAnimationFrame(tick);
          return;
        }
        state.phase = 'wait';
        state.resume = now + s.delay * 1000;
      }
      if (state.phase === 'wait') {
        if (!state.visible) return;
        if (now < state.resume) {
          window.clearTimeout(timer);
          timer = window.setTimeout(wake, state.resume - now);
          return;
        }
        sweep(entry(), exit(), now);
        raf = requestAnimationFrame(tick);
        return;
      }
      if (state.phase === 'idle' && state.visible) {
        sweep(entry(), exit(), now);
        raf = requestAnimationFrame(tick);
      }
    };

    const observer = new IntersectionObserver((entries) => {
      state.visible = entries.some((item) => item.isIntersecting);
      if (state.visible) wake();
    });
    observer.observe(root);

    syncRef.current = () => {
      draw();
      wake();
    };
    draw();
    wake();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      observer.disconnect();
      syncRef.current = null;
    };
  }, []);

  return (
    <span
      ref={rootRef}
      className={`relative inline-block bg-no-repeat [background-size:100%_100%] bg-clip-text [-webkit-background-clip:text] [-webkit-text-fill-color:transparent] ${className}`}
      style={{ backgroundImage: `linear-gradient(${color}, ${color})`, ...style }}
    >
      {content}
    </span>
  );
};

export default ShinyText;
