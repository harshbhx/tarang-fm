import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { CALL_MAX_SECONDS } from '../../shared/constants';
import type { Caption } from '../radio/state';

const MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeMotion(onChange: () => void): () => void {
  const mq = window.matchMedia(MOTION_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(MOTION_QUERY).matches,
    () => false,
  );
}

export type AudioFrameListener = (data: Uint8Array | null, now: number) => void;

/**
 * The single analyser loop. While `active`, reads the master analyser each frame
 * (fftSize 256, byte frequency data), writes the smoothed voice-band level to `--level`
 * on `target` (never React state) and hands the frame to subscribers such as the
 * visualizer. Stops while the tab is hidden; ~10 fps and no level pulse under reduced motion.
 */
export function useAudioPulse(
  getAnalyser: () => AnalyserNode | null,
  target: RefObject<HTMLElement | null>,
  active: boolean,
  reduced: boolean,
): (listener: AudioFrameListener) => () => void {
  const listeners = useRef(new Set<AudioFrameListener>());
  const getAnalyserRef = useRef(getAnalyser);

  useEffect(() => {
    getAnalyserRef.current = getAnalyser;
  });

  const subscribe = useCallback((listener: AudioFrameListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    if (!active) {
      el.style.setProperty('--level', '0');
      listeners.current.forEach((listener) => listener(null, performance.now()));
      return;
    }
    let data = new Uint8Array(128);
    let raf = 0;
    let lastTick = 0;
    let level = 0;
    let shown = -1;
    const minGap = reduced ? 100 : 0;

    const tick = (now: number) => {
      raf = 0;
      if (document.hidden) return;
      raf = requestAnimationFrame(tick);
      if (minGap && now - lastTick < minGap) return;
      lastTick = now;
      const analyser = getAnalyserRef.current();
      let frame: Uint8Array | null = null;
      if (analyser) {
        if (analyser.fftSize !== 256) analyser.fftSize = 256;
        if (data.length !== analyser.frequencyBinCount) data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        frame = data;
        const from = Math.floor(data.length * 0.05);
        const to = Math.max(from + 1, Math.floor(data.length * 0.4));
        let sum = 0;
        for (let i = from; i < to; i++) sum += data[i];
        const next = Math.min(1, (sum / (to - from) / 255) * 1.6);
        level += (next - level) * (next > level ? 0.5 : 0.12);
      } else {
        level *= 0.9;
      }
      const rounded = reduced ? 0 : Math.round(level * 100) / 100;
      if (rounded !== shown) {
        shown = rounded;
        el.style.setProperty('--level', String(rounded));
      }
      listeners.current.forEach((listener) => listener(frame, now));
    };

    const onVisibility = () => {
      if (!document.hidden && !raf) raf = requestAnimationFrame(tick);
    };
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      el.style.setProperty('--level', '0');
    };
  }, [active, reduced, target]);

  return subscribe;
}

/**
 * While `active`, polls the mic level every frame and writes `--mic` (0..1) onto `target`
 * so the call meters animate without re-rendering. Returns whole seconds left in the call.
 */
export function useMicMeter(
  active: boolean,
  getLevel: () => number,
  target: RefObject<HTMLElement | null>,
): number {
  const [secondsLeft, setSecondsLeft] = useState(CALL_MAX_SECONDS);
  const getLevelRef = useRef(getLevel);

  useEffect(() => {
    getLevelRef.current = getLevel;
  });

  useEffect(() => {
    const el = target.current;
    if (!active || !el) return;
    const started = performance.now();
    let id = 0;
    let shown = -1;
    let smooth = 0;
    const tick = (now: number) => {
      const raw = Math.min(1, Math.max(0, getLevelRef.current() || 0));
      smooth = raw > smooth ? raw : smooth * 0.82 + raw * 0.18;
      el.style.setProperty('--mic', smooth.toFixed(3));
      const left = Math.max(0, Math.ceil(CALL_MAX_SECONDS - (now - started) / 1000));
      if (left !== shown) {
        shown = left;
        setSecondsLeft(left);
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(id);
      el.style.setProperty('--mic', '0');
      setSecondsLeft(CALL_MAX_SECONDS);
    };
  }, [active, target]);

  return secondsLeft;
}

/** Every V4 speaker heard this session (grows as captions arrive; never shrinks). */
export function useHeardVoices(caption: Caption | undefined, history: Caption[]): ReadonlySet<string> {
  const [heard, setHeard] = useState<ReadonlySet<string>>(() => new Set());
  const spoken = [...history, ...(caption ? [caption] : [])]
    .filter((c) => c.role !== 'caller' && c.speaker)
    .map((c) => c.speaker);
  const missing = spoken.filter((speaker) => !heard.has(speaker));
  if (missing.length > 0) setHeard(new Set([...heard, ...missing]));
  return heard;
}

const COACH_KEY = 'tarang:coach-call';

function coachSeen(): boolean {
  try {
    return window.localStorage.getItem(COACH_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * One-time hint. Becomes visible the first time `ready` is true (and was never dismissed
 * before on this device); hides itself after `ms`.
 */
export function useCoachMark(ready: boolean, ms = 9000): [boolean, () => void] {
  const [state, setState] = useState<'waiting' | 'showing' | 'done'>(() => (coachSeen() ? 'done' : 'waiting'));

  const dismiss = useCallback(() => {
    setState('done');
    try {
      window.localStorage.setItem(COACH_KEY, '1');
    } catch {
      // Storage can be unavailable (private mode); the hint simply shows again next visit.
    }
  }, []);

  if (state === 'waiting' && ready) setState('showing');

  useEffect(() => {
    if (state !== 'showing') return;
    const timer = window.setTimeout(dismiss, ms);
    return () => window.clearTimeout(timer);
  }, [state, ms, dismiss]);

  return [state === 'showing', dismiss];
}

/**
 * When `key` changes (a new caption or reply), scroll just enough that `ref` sits above the fixed
 * dock (`--dock-h` on an ancestor). Skips when the element is off screen, i.e. the listener has
 * scrolled away on purpose.
 */
export function useKeepInView(ref: RefObject<HTMLElement | null>, key: string, reduced: boolean): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || !key) return;
    const id = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const viewport = window.innerHeight;
      if (rect.bottom < 0 || rect.top > viewport) return;
      const dock = Number.parseFloat(getComputedStyle(el).getPropertyValue('--dock-h')) || 0;
      const overflow = rect.bottom - (viewport - dock - 16);
      const delta = Math.min(overflow, rect.top - 16);
      if (overflow > 0 && delta > 0) window.scrollBy({ top: delta, behavior: reduced ? 'auto' : 'smooth' });
    });
    return () => cancelAnimationFrame(id);
  }, [ref, key, reduced]);
}
