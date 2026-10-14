import { useEffect, useRef } from 'react';
import { LeaveIcon, SoundOffIcon, SoundOnIcon } from './icons';

interface LiveDockProps {
  muted: boolean;
  /** Everyone tuned in, you included */
  listening: number;
  yourName?: string;
  onToggleMute: () => void;
  onLeave: () => void;
}

/** Fixed bottom controls: mute, who's listening (jumps to the list), leave. */
export default function LiveDock({ muted, listening, yourName, onToggleMute, onLeave }: LiveDockProps) {
  const dockRef = useRef<HTMLElement>(null);

  // Publish the dock's height as --dock-h so captions and the welcome banner sit above it.
  useEffect(() => {
    const dock = dockRef.current;
    const host = dock?.closest<HTMLElement>('.radio');
    if (!dock || !host) return;
    const update = () => host.style.setProperty('--dock-h', `${Math.ceil(dock.getBoundingClientRect().height)}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(dock);
    return () => {
      observer.disconnect();
      host.style.removeProperty('--dock-h');
    };
  }, []);

  return (
    <section ref={dockRef} aria-label="Controls" className="dock">
      <div className="dock-inner">
        <button
          type="button"
          className="icon-btn"
          aria-pressed={muted}
          aria-label="Mute"
          title={muted ? 'Unmute' : 'Mute'}
          data-attention={muted}
          onClick={onToggleMute}
        >
          {muted ? <SoundOffIcon /> : <SoundOnIcon />}
        </button>

        <a href="#presence" className="live-dock-who">
          <span className="live-dock-count">
            <span className="live-dock-dot" aria-hidden="true" />
            <span className="truncate">
              <span className="tabular-nums">{listening}</span> listening<span className="sr-only"> together</span>
            </span>
          </span>
          <span className="live-dock-sub">
            {muted ? 'Muted' : yourName ? `You're in as ${yourName}` : 'In sync with everyone'}
          </span>
        </a>

        <button type="button" className="icon-btn live-leave" onClick={onLeave}>
          <LeaveIcon width={18} height={18} />
          Leave
        </button>
      </div>
    </section>
  );
}
