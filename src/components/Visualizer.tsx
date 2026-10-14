/**
 * Visualizer: forked from ElevenLabs UI LiveWaveform (github.com/elevenlabs/ui,
 * apps/www/registry/elevenlabs-ui/ui/live-waveform.tsx). Copyright (c) 2025 Eleven Labs Inc. MIT License.
 * Changes for Tarang FM: draws frames pushed by the radio's shared analyser loop (`subscribe`)
 * instead of opening the microphone; static (mirrored) mode only.
 */
import { useEffect, useRef } from 'react';
import type { AudioFrameListener } from './hooks';

interface VisualizerProps {
  subscribe: (listener: AudioFrameListener) => () => void;
  barColor: string;
  /** Shimmer while there is no audio data yet (tuning, between lines) */
  processing?: boolean;
  barWidth?: number;
  barGap?: number;
  barRadius?: number;
  barHeight?: number;
  fadeEdges?: boolean;
  fadeWidth?: number;
  sensitivity?: number;
  /** Multiplies bar opacity (lower on the lit glass) */
  alpha?: number;
  height?: number | string;
  className?: string;
}

export default function Visualizer({
  subscribe,
  barColor,
  processing = false,
  barWidth = 3,
  barGap = 2,
  barRadius = 1.5,
  barHeight: baseBarHeight = 3,
  fadeEdges = true,
  fadeWidth = 32,
  sensitivity = 1.3,
  alpha = 1,
  height = 40,
  className = '',
}: VisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barsRef = useRef<number[]>([]);
  const timeRef = useRef(0);
  const sizeRef = useRef({ width: 0, height: 0 });
  const gradientCacheRef = useRef<CanvasGradient | null>(null);
  const optionsRef = useRef({ barColor, processing, barWidth, barGap, barRadius, baseBarHeight, fadeEdges, fadeWidth, sensitivity, alpha });
  const renderRef = useRef<AudioFrameListener>(() => undefined);

  useEffect(() => {
    optionsRef.current = { barColor, processing, barWidth, barGap, barRadius, baseBarHeight, fadeEdges, fadeWidth, sensitivity, alpha };
  });

  useEffect(() => {
    renderRef.current = (data) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const { width, height: h } = sizeRef.current;
      if (!canvas || !ctx || width === 0) return;
      const o = optionsRef.current;
      const step = o.barWidth + o.barGap;
      const barCount = Math.floor(width / step);
      const halfCount = Math.floor(barCount / 2);
      const next: number[] = [];

      if (data && data.length > 0) {
        const startFreq = Math.floor(data.length * 0.05);
        const endFreq = Math.floor(data.length * 0.4);
        const relevant = data.subarray(startFreq, endFreq);
        // Mirror the data for a symmetric display
        for (let i = halfCount - 1; i >= 0; i--) {
          const value = Math.min(1, ((relevant[Math.floor((i / halfCount) * relevant.length)] ?? 0) / 255) * o.sensitivity);
          next.push(Math.max(0.05, value));
        }
        for (let i = 0; i < halfCount; i++) {
          const value = Math.min(1, ((relevant[Math.floor((i / halfCount) * relevant.length)] ?? 0) / 255) * o.sensitivity);
          next.push(Math.max(0.05, value));
        }
      } else if (o.processing) {
        timeRef.current += 0.03;
        const time = timeRef.current;
        for (let i = 0; i < barCount; i++) {
          const normalizedPosition = (i - halfCount) / Math.max(1, halfCount);
          const centerWeight = 1 - Math.abs(normalizedPosition) * 0.4;
          const wave1 = Math.sin(time * 1.5 + normalizedPosition * 3) * 0.25;
          const wave2 = Math.sin(time * 0.8 - normalizedPosition * 2) * 0.2;
          const wave3 = Math.cos(time * 2 + normalizedPosition) * 0.15;
          next.push(Math.max(0.05, Math.min(1, (0.2 + wave1 + wave2 + wave3) * centerWeight)));
        }
      } else {
        for (let i = 0; i < barCount; i++) next.push(0.05);
      }

      const prev = barsRef.current;
      barsRef.current = next.map((v, i) => (prev[i] ?? v) + (v - (prev[i] ?? v)) * 0.55);

      ctx.clearRect(0, 0, width, h);
      const centerY = h / 2;
      ctx.fillStyle = o.barColor;
      for (let i = 0; i < barsRef.current.length; i++) {
        const value = barsRef.current[i] || 0.1;
        const x = i * step;
        const barHeight = Math.max(o.baseBarHeight, value * h * 0.8);
        const y = centerY - barHeight / 2;
        ctx.globalAlpha = (0.4 + value * 0.6) * o.alpha;
        if (o.barRadius > 0 && typeof ctx.roundRect === 'function') {
          ctx.beginPath();
          ctx.roundRect(x, y, o.barWidth, barHeight, o.barRadius);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, o.barWidth, barHeight);
        }
      }

      if (o.fadeEdges && o.fadeWidth > 0) {
        if (!gradientCacheRef.current) {
          const gradient = ctx.createLinearGradient(0, 0, width, 0);
          const fadePercent = Math.min(0.3, o.fadeWidth / width);
          gradient.addColorStop(0, 'rgba(255,255,255,1)');
          gradient.addColorStop(fadePercent, 'rgba(255,255,255,0)');
          gradient.addColorStop(1 - fadePercent, 'rgba(255,255,255,0)');
          gradient.addColorStop(1, 'rgba(255,255,255,1)');
          gradientCacheRef.current = gradient;
        }
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = gradientCacheRef.current;
        ctx.globalAlpha = 1;
        ctx.fillRect(0, 0, width, h);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
    };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const resizeObserver = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      canvas.getContext('2d')?.scale(dpr, dpr);
      gradientCacheRef.current = null;
      sizeRef.current = { width: rect.width, height: rect.height };
      renderRef.current(null, performance.now());
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => subscribe((data, now) => renderRef.current(data, now)), [subscribe]);

  return (
    <div ref={containerRef} className={`relative w-full ${className}`} style={{ height }} aria-hidden="true">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
