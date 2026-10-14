/**
 * SplitFlapText: adapted from React Bits (https://reactbits.dev, github.com/DavidHDev/react-bits).
 * Copyright (c) 2026 David Haz. MIT + Commons Clause License Condition v1.0.
 * Changes for Tarang FM: flips to a new `text` when the prop changes (radio board style), sizing
 * the board to each label;
 * styles live in index.css. Latin labels only.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes } from 'react';
import { useReducedMotion } from './hooks';

type TileState = {
  current: string;
  next: string;
  flipping: boolean;
  tick: number;
};

type AnimationPlan = {
  index: number;
  from: string;
  target: string;
  sequence: string[];
  start: number;
  step: number;
  done: boolean;
};

type TileUpdate = {
  index: number;
  current: string;
  next: string;
  done: boolean;
};

export interface SplitFlapTextProps extends HTMLAttributes<HTMLDivElement> {
  text: string;
  flipDuration?: number;
  stagger?: number;
  charset?: 'alpha' | 'alphanumeric' | 'numeric' | (string & {});
  flipsPerChar?: number;
  tileColor?: string;
  textColor?: string;
  tileRadius?: number | string;
  gap?: number | string;
  fontSize?: number | string;
  padTo?: number;
}

const CHARSETS: Record<string, string> = {
  alpha: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  numeric: '0123456789',
};

const toCssUnit = (value: number | string) => (typeof value === 'number' ? `${value}px` : value);

const resolveCharset = (charset: SplitFlapTextProps['charset']) => {
  if (charset && CHARSETS[charset]) return CHARSETS[charset];
  return typeof charset === 'string' && charset.length > 0 ? charset : CHARSETS.alphanumeric;
};

const normalizePhrase = (phrase: string, width: number) => String(phrase ?? '').padEnd(width, ' ').slice(0, width);

const createTiles = (phrase: string): TileState[] =>
  phrase.split('').map((char) => ({ current: char, next: char, flipping: false, tick: 0 }));

const sampleChar = (charset: string) => charset.charAt(Math.floor(Math.random() * charset.length)) || ' ';

const buildSequence = (target: string, flips: number, charset: string) => {
  const steps: string[] = [];
  for (let i = 0; i < flips; i += 1) steps.push(sampleChar(charset));
  steps.push(target);
  return steps;
};

const SplitFlapText = ({
  text,
  flipDuration = 0.07,
  stagger = 0.03,
  charset = 'alpha',
  flipsPerChar = 4,
  tileColor = '#1d1814',
  textColor = '#fbedcd',
  tileRadius = 3,
  gap = 2,
  fontSize = 13,
  padTo = 0,
  className = '',
  style = {},
  ...props
}: SplitFlapTextProps) => {
  const prefersReducedMotion = useReducedMotion();
  const rafRef = useRef<number | null>(null);
  const currentTextRef = useRef('');

  const width = Math.max(1, Math.ceil(Number(padTo) || 0), text.length);
  const target = useMemo(() => normalizePhrase(text, width), [text, width]);
  const [tiles, setTiles] = useState<TileState[]>(() => createTiles(target));

  useEffect(() => {
    let cancelled = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    const previous = currentTextRef.current;
    if (!previous || prefersReducedMotion) {
      currentTextRef.current = target;
      setTiles(createTiles(target));
      return undefined;
    }
    if (previous === target) return undefined;

    // Flip across the wider of the two labels, then settle to exactly the new label's width.
    const span = Math.max(previous.length, target.length);
    const from = normalizePhrase(previous, span);
    const to = normalizePhrase(target, span);
    setTiles(createTiles(from));

    const safeFlipMs = Math.max(40, flipDuration * 1000);
    const safeStaggerMs = Math.max(0, stagger * 1000);
    const activeCharset = resolveCharset(charset);
    const plans = to
      .split('')
      .map<AnimationPlan | null>((targetChar, index) => {
        const fromChar = from[index] || ' ';
        if (fromChar === targetChar) return null;
        return {
          index,
          from: fromChar,
          target: targetChar,
          sequence: buildSequence(targetChar, Math.max(0, Math.floor(flipsPerChar)), activeCharset),
          start: index * safeStaggerMs,
          step: -1,
          done: false,
        };
      })
      .filter((plan): plan is AnimationPlan => plan !== null);

    const startedAt = performance.now();
    const updateTiles = (updates: TileUpdate[]) => {
      setTiles((previous) => {
        const nextTiles = [...previous];
        updates.forEach((update) => {
          const tile = nextTiles[update.index];
          if (!tile) return;
          nextTiles[update.index] = {
            current: update.current,
            next: update.next,
            flipping: !update.done,
            tick: tile.tick + 1,
          };
        });
        return nextTiles;
      });
    };

    const tick = (now: number) => {
      if (cancelled) return;
      const elapsed = now - startedAt;
      const updates: TileUpdate[] = [];
      let shouldContinue = false;
      plans.forEach((plan) => {
        const localElapsed = elapsed - plan.start;
        if (localElapsed < 0) {
          shouldContinue = true;
          return;
        }
        const step = Math.floor(localElapsed / safeFlipMs);
        if (step < plan.sequence.length) {
          shouldContinue = true;
          if (step !== plan.step) {
            plan.step = step;
            updates.push({
              index: plan.index,
              current: step === 0 ? plan.from : plan.sequence[step - 1],
              next: plan.sequence[step],
              done: false,
            });
          }
        } else if (!plan.done) {
          plan.done = true;
          updates.push({ index: plan.index, current: plan.target, next: plan.target, done: true });
        }
      });
      if (updates.length > 0) updateTiles(updates);
      if (shouldContinue) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        setTiles(createTiles(target));
      }
    };

    currentTextRef.current = target;
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      setTiles(createTiles(target));
    };
  }, [target, flipDuration, stagger, flipsPerChar, charset, prefersReducedMotion]);

  const componentStyle: CSSProperties & Record<string, string | number | undefined> = {
    '--split-flap-tile-color': tileColor,
    '--split-flap-text-color': textColor,
    '--split-flap-radius': toCssUnit(tileRadius),
    '--split-flap-gap': toCssUnit(gap),
    '--split-flap-font-size': toCssUnit(fontSize),
    '--split-flap-flip-duration': `${Math.max(0.04, flipDuration)}s`,
    ...style,
  };

  return (
    <div
      className={`split-flap-text inline-flex items-center whitespace-pre select-none ${className}`.trim()}
      style={componentStyle}
      role="img"
      aria-label={text.trim() || undefined}
      {...props}
    >
      {tiles.map((tile, index) => (
        <span className="split-flap-text__tile" aria-hidden="true" key={`${index}-${tiles.length}`}>
          <span className="split-flap-text__half split-flap-text__half--top">
            <span className="split-flap-text__char">{tile.current === ' ' ? ' ' : tile.current}</span>
          </span>
          <span className="split-flap-text__half split-flap-text__half--bottom">
            <span className="split-flap-text__char">{tile.flipping ? tile.next : tile.current}</span>
          </span>
          {tile.flipping && (
            <>
              <span className="split-flap-text__flap split-flap-text__flap--front" key={`front-${index}-${tile.tick}`}>
                <span className="split-flap-text__char">{tile.current === ' ' ? ' ' : tile.current}</span>
              </span>
              <span className="split-flap-text__flap split-flap-text__flap--back" key={`back-${index}-${tile.tick}`}>
                <span className="split-flap-text__char">{tile.next === ' ' ? ' ' : tile.next}</span>
              </span>
            </>
          )}
        </span>
      ))}
    </div>
  );
};

export default SplitFlapText;
