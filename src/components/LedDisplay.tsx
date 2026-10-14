import { useEffect, useState } from 'react';
import { useReducedMotion } from './hooks';

/** 5×7 dot-matrix glyphs, rows top to bottom. */
const GLYPHS: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['0', '0', '0', '0', '0', '0', '1'],
};

const ROWS = 7;
const SCAN_STEPS = 3;
const SCAN_MS = 70;

function columns(text: string): string[][] {
  // One blank column between glyphs
  const cols: string[][] = [];
  [...text].forEach((ch, i) => {
    const glyph = GLYPHS[ch] ?? GLYPHS[' '];
    if (i > 0) cols.push(Array(ROWS).fill('0'));
    for (let c = 0; c < glyph[0].length; c++) cols.push(glyph.map((row) => row[c]));
  });
  return cols;
}

function randomDigits(template: string): string {
  return [...template].map((ch) => (/\d/.test(ch) ? String(Math.floor(Math.random() * 10)) : ch)).join('');
}

interface LedDisplayProps {
  /** e.g. '91.1'; right-aligned in `width` characters */
  value: string;
  /** Characters including the dot, e.g. 5 for '106.1' */
  width?: number;
  lit: boolean;
  className?: string;
}

/**
 * Amber dot-matrix frequency window. Unlit dots stay faintly visible; on a change the digits
 * scan briefly, like a tuner seeking, then lock (static under reduced motion).
 */
export default function LedDisplay({ value, width = 5, lit, className = '' }: LedDisplayProps) {
  const target = value.padStart(width, ' ');
  const reduced = useReducedMotion();
  const [scan, setScan] = useState<{ for: string; text: string } | null>(null);

  useEffect(() => {
    if (reduced) return;
    let step = 0;
    let id = 0;
    const tick = () => {
      step += 1;
      if (step > SCAN_STEPS) {
        setScan(null);
        return;
      }
      setScan({ for: target, text: randomDigits(target) });
      id = window.setTimeout(tick, SCAN_MS);
    };
    id = window.setTimeout(tick, 0);
    return () => window.clearTimeout(id);
  }, [target, reduced]);

  const shown = scan && scan.for === target ? scan.text : target;
  const cols = columns(shown);
  const w = cols.length;

  return (
    <span className={`led ${className}`} data-lit={lit} aria-hidden="true">
      <svg viewBox={`0 0 ${w} ${ROWS}`} className="led-dots" preserveAspectRatio="xMidYMid meet">
        {cols.map((col, x) =>
          col.map((on, y) => (
            <circle key={`${x}-${y}`} cx={x + 0.5} cy={y + 0.5} r={0.36} className={on === '1' ? 'led-on' : 'led-off'} />
          )),
        )}
      </svg>
    </span>
  );
}
