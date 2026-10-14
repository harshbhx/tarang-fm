import type { Station } from '../../shared/types';
import OnAirLamp from './OnAirLamp';
import TunerDial from './TunerDial';
import { WaveMark } from './icons';

interface CompactDialBarProps {
  visible: boolean;
  stations: Station[];
  station: Station;
  onAir: boolean;
  tuning: boolean;
  lit: boolean;
}

/**
 * Sticky slim dial that slides in once the radio scrolls away, so the needle stays in view
 * during a show. The whole bar is one button that brings the full radio back.
 */
export default function CompactDialBar({ visible, stations, station, onAir, tuning, lit }: CompactDialBarProps) {
  return (
    <div className="dialbar" data-visible={visible} inert={!visible}>
      <button
        type="button"
        className="dialbar-inner"
        aria-label={`Back to the radio: ${station.languageName} ${station.frequency} MHz`}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <WaveMark width={18} height={18} className="dialbar-mark" />
        <TunerDial stations={stations} value={station.id} lit={lit} tuning={tuning} size="mini" className="dialbar-dial" />
        <span className="dialbar-freq" aria-hidden="true">
          {station.frequency}
        </span>
        <OnAirLamp on={onAir} warming={tuning} size="sm" />
      </button>
    </div>
  );
}
