import { PlayIcon } from './icons';

/**
 * Shown when the listening cap paused the show: a forgotten tab stops writing and voicing new segments.
 * One tap picks the show up where it stopped.
 */
export default function StillListening({ onResume }: { onResume: () => void }) {
  return (
    <aside className="care" role="status" aria-live="polite" aria-label="Show paused">
      <span className="care-glow" aria-hidden="true" />
      <div className="care-body">
        <p className="care-title">Still listening?</p>
        <p className="care-text">We paused the show after a few quiet minutes, so the studio isn&rsquo;t on air for an empty room.</p>
        <button type="button" className="care-call" onClick={onResume}>
          <PlayIcon width={16} height={16} aria-hidden="true" /> Keep listening
        </button>
      </div>
    </aside>
  );
}
