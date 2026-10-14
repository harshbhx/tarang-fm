import type { ReactNode } from 'react';
import type { Station, StationId } from '../../shared/types';
import FrequencyReadout from './FrequencyReadout';
import NumberTicker from './NumberTicker';
import OnAirLamp from './OnAirLamp';
import StationPicker from './StationPicker';
import TunerDial from './TunerDial';
import { WaveMark } from './icons';

interface RadioDeviceProps {
  stations: Station[];
  station: Station;
  onStation: (id: StationId) => void;
  onAir: boolean;
  tuning: boolean;
  /** Backlight on */
  lit: boolean;
  /** Playing layout: shorter glass; on phones the preset keys move to the dock */
  compact: boolean;
  /** Behind the dial scale (visualizer) */
  dialChildren?: ReactNode;
  /** Under the presets (the Tune in key) */
  children?: ReactNode;
}

/** The hero object: graphite radio body with lamp, backlit dial, readout and preset keys. */
export default function RadioDevice({
  stations,
  station,
  onStation,
  onAir,
  tuning,
  lit,
  compact,
  dialChildren,
  children,
}: RadioDeviceProps) {
  return (
    <section aria-label="Radio" className="radio-body">
      <div className="relative flex items-center justify-between gap-3 px-1 pb-3">
        <p className="wordmark">
          <WaveMark width={22} height={22} className="text-accent" />
          Tarang FM
        </p>
        <div className="flex items-center gap-3">
          {compact ? (
            <p className="text-fg-2 flex items-baseline gap-1.5 text-sm sm:hidden">
              {station.languageName}
              <NumberTicker
                value={Number(station.frequency)}
                startValue={88}
                decimalPlaces={1}
                stiffness={140}
                damping={22}
                className="text-fg font-mono"
              />
            </p>
          ) : null}
          <OnAirLamp on={onAir} warming={tuning} />
        </div>
      </div>

      <TunerDial stations={stations} value={station.id} onChange={onStation} lit={lit} tuning={tuning} compact={compact}>
        {dialChildren}
      </TunerDial>

      <div className={`relative mt-4 px-1 ${compact ? 'hidden sm:block' : ''}`}>
        <FrequencyReadout station={station} />
      </div>

      <div className={`relative mt-4 ${compact ? 'hidden lg:block' : ''}`}>
        <StationPicker stations={stations} value={station.id} onChange={onStation} variant="keys" />
      </div>

      {children ? <div className="relative mt-4">{children}</div> : null}
    </section>
  );
}
