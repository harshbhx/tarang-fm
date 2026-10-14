import { useCallback, useEffect, useRef, type CSSProperties } from 'react';
import { CALL_MAX_SECONDS } from '../../shared/constants';
import type { RadioStatus } from '../radio/state';
import ShinyText from './ShinyText';
import { Eq, MicIcon } from './icons';

interface CallButtonProps {
  status: RadioStatus;
  /** Whole seconds left while recording */
  secondsLeft: number;
  /** RJ's first name, e.g. 'Sunny' */
  rjName: string;
  onStart: () => void;
  onEnd: () => void;
  onCancel?: () => void;
}

type Look = 'off' | 'ready' | 'live' | 'busy' | 'onair';

function lookFor(status: RadioStatus): Look {
  if (status === 'call_recording') return 'live';
  if (status === 'call_thinking') return 'busy';
  if (status === 'call_on_air') return 'onair';
  if (status === 'playing' || status === 'paused') return 'ready';
  return 'off';
}

/**
 * Push-to-talk. Press and hold (pointer with capture, or Space/Enter when focused) to record;
 * release to send. A window-level release and blur also end the call, so it never sticks on.
 * Esc cancels. Reads `--mic` (0..1) from an ancestor for the two level rings.
 */
export default function CallButton({ status, secondsLeft, rjName, onStart, onEnd, onCancel }: CallButtonProps) {
  const pressing = useRef(false);
  const detach = useRef<(() => void) | null>(null);
  const latest = useRef({ status, onStart, onEnd, onCancel });

  useEffect(() => {
    latest.current = { status, onStart, onEnd, onCancel };
  });

  const release = useCallback((cancel: boolean) => {
    if (!pressing.current) return;
    pressing.current = false;
    detach.current?.();
    detach.current = null;
    const { status: now, onEnd: send, onCancel: abort } = latest.current;
    // The recorder already stopped at the time limit and the call was sent.
    if (now === 'call_thinking' || now === 'call_on_air') return;
    if (cancel) abort?.();
    else send();
  }, []);

  const end = useCallback(() => release(false), [release]);

  const begin = () => {
    const { status: now, onStart: start } = latest.current;
    if (pressing.current || (now !== 'playing' && now !== 'paused')) return;
    pressing.current = true;
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('blur', end);
    detach.current = () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('blur', end);
    };
    start();
  };

  useEffect(() => () => detach.current?.(), []);

  const look = lookFor(status);
  const detail = {
    off: status === 'tuning' ? 'Available once the show starts' : 'Tune in first',
    ready: `${rjName} answers live, ${CALL_MAX_SECONDS} s max`,
    live: secondsLeft > 0 ? `${secondsLeft} s left` : "Time's up, release to send",
    busy: 'On air in a moment',
    onair: `${rjName} is answering you`,
  }[look];
  const announce =
    look === 'live' && (secondsLeft === 10 || secondsLeft === 5 || secondsLeft <= 3) ? `${secondsLeft} seconds left` : '';

  return (
    <>
      <button
        type="button"
        className="call-btn"
        data-state={look}
        disabled={look === 'off' || look === 'busy' || look === 'onair'}
        aria-describedby="call-hint"
        style={{ '--call-seconds': `${CALL_MAX_SECONDS}s` } as CSSProperties}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Capture is best effort; the window listeners still catch the release.
          }
          begin();
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onBlur={end}
        onKeyDown={(event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            if (!event.repeat) begin();
          } else if (event.key === 'Escape') {
            release(true);
          }
        }}
        onKeyUp={(event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            end();
          }
        }}
        onClick={(event) => event.preventDefault()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <span className="call-mic" aria-hidden="true">
          <span className="call-pulse" />
          <span className="call-pulse" />
          <svg className="call-ring" viewBox="0 0 56 56">
            <circle className="call-ring-track" cx="28" cy="28" r="26" pathLength={100} />
            <circle className="call-ring-progress" cx="28" cy="28" r="26" pathLength={100} />
          </svg>
          {look === 'busy' ? <Eq /> : <MicIcon width={22} height={22} />}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-base leading-tight font-semibold lg:text-[1.05rem]">
            {look === 'live' ? (
              'Release to send'
            ) : look === 'busy' ? (
              <ShinyText text="RJ is listening…" color="#a1a1a1" shineColor="#ffffff" speed={1.8} />
            ) : look === 'onair' ? (
              'On air'
            ) : (
              'Hold to talk to the RJ'
            )}
          </span>
          <span className="text-[0.8rem] leading-snug tabular-nums opacity-75">{detail}</span>
        </span>
      </button>
      <span id="call-hint" className="sr-only">
        Press and hold to record a call to the RJ, then release to send it. With a keyboard, hold Space or Enter.
        Escape cancels.
      </span>
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </>
  );
}
