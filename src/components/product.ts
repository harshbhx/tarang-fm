/**
 * The radio as a product: full-screen listening, lock-screen and headset controls (Media Session),
 * keeping the screen awake while the show plays (Wake Lock), and keyboard shortcuts.
 * Every API here is optional: where a browser lacks one, the radio simply works without it.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

// ---- Full screen ------------------------------------------------------------------------------------

function fullscreenElement(): Element | null {
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function subscribeFullscreen(onChange: () => void): () => void {
  document.addEventListener('fullscreenchange', onChange);
  document.addEventListener('webkitfullscreenchange', onChange);
  return () => {
    document.removeEventListener('fullscreenchange', onChange);
    document.removeEventListener('webkitfullscreenchange', onChange);
  };
}

/** Whether this browser can put the page into real full screen (iPhone Safari cannot). */
export function canFullscreen(): boolean {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
}

/**
 * Full-screen listening. Uses the Fullscreen API where it exists; everywhere (iPhone included) it also
 * switches the page into an immersive radio-only view, so the toggle always does something visible.
 */
export function useFullscreen(): { immersive: boolean; native: boolean; toggle: () => void; exit: () => void } {
  const native = useSyncExternalStore(subscribeFullscreen, () => fullscreenElement() !== null, () => false);
  const [immersive, setImmersive] = useState(false);
  const wasNative = useRef(false);

  // Leaving real full screen (Esc, system gesture) also leaves the immersive view.
  useEffect(() => {
    if (wasNative.current && !native) setImmersive(false);
    wasNative.current = native;
  }, [native]);

  const exit = useCallback(() => {
    setImmersive(false);
    if (fullscreenElement()) {
      const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> | void };
      void (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.())?.catch?.(() => undefined);
    }
  }, []);

  const toggle = useCallback(() => {
    if (immersive || fullscreenElement()) {
      exit();
      return;
    }
    setImmersive(true);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
    try {
      const request = el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.();
      void request?.catch?.(() => undefined);
    } catch {
      /* the immersive view still applies */
    }
  }, [immersive, exit]);

  return { immersive: immersive || native, native, toggle, exit };
}

// ---- Media Session: lock screen, notification and headset buttons --------------------------------------

export interface NowPlayingInfo {
  title: string;
  artist: string;
  album: string;
}

export interface MediaHandlers {
  play: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
}

const ARTWORK: MediaImage[] = [
  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
];

/** Shows what's on air on the lock screen and wires play/pause and next/previous station to it. */
export function useMediaSession(info: NowPlayingInfo | null, playing: boolean, handlers: MediaHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    const bind = (action: MediaSessionAction, fn: (() => void) | null) => {
      try {
        session.setActionHandler(action, fn);
      } catch {
        /* action not supported here */
      }
    };
    bind('play', () => handlersRef.current.play());
    bind('pause', () => handlersRef.current.pause());
    bind('stop', () => handlersRef.current.pause());
    bind('nexttrack', () => handlersRef.current.next());
    bind('previoustrack', () => handlersRef.current.previous());
    return () => {
      for (const action of ['play', 'pause', 'stop', 'nexttrack', 'previoustrack'] as MediaSessionAction[]) bind(action, null);
    };
  }, []);

  const key = info ? `${info.title}|${info.artist}|${info.album}` : '';
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (!info) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
      return;
    }
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: info.title, artist: info.artist, album: info.album, artwork: ARTWORK });
    } catch {
      /* MediaMetadata missing */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !info) return;
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }, [playing, info]);
}

// ---- Wake Lock: keep the screen on while the radio plays -----------------------------------------------

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } };
    if (!active || !nav.wakeLock) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        lock = await nav.wakeLock!.request('screen');
      } catch {
        lock = null; // battery saver or denied: the radio still plays
      }
    };
    // The lock drops whenever the tab is hidden, so take it again on return.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}

// ---- Keyboard shortcuts -----------------------------------------------------------------------------------

export interface Shortcuts {
  togglePlay?: () => void;
  nextStation?: () => void;
  previousStation?: () => void;
  toggleFullscreen?: () => void;
  toggleSubtitles?: () => void;
}

/** True when a key press belongs to a text field or a focused control, not to the radio. */
function typingInto(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** Space/K play-pause, ←/→ (or J/L) change station, F full screen, C subtitles. */
export function useKeyboardShortcuts(shortcuts: Shortcuts, enabled: boolean): void {
  const ref = useRef(shortcuts);
  ref.current = shortcuts;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || typingInto(e.target)) return;
      const onControl = (e.target as HTMLElement | null)?.closest?.('button, a, [role="slider"], [role="radio"]');
      const s = ref.current;
      let handled = true;
      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          // Space on a focused button presses that button instead
          if (e.key === ' ' && onControl) return;
          s.togglePlay?.();
          break;
        case 'ArrowRight':
        case 'l':
        case 'L':
          if (onControl && e.key === 'ArrowRight') return;
          s.nextStation?.();
          break;
        case 'ArrowLeft':
        case 'j':
        case 'J':
          if (onControl && e.key === 'ArrowLeft') return;
          s.previousStation?.();
          break;
        case 'f':
        case 'F':
          s.toggleFullscreen?.();
          break;
        case 'c':
        case 'C':
          s.toggleSubtitles?.();
          break;
        default:
          handled = false;
      }
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
