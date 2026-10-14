import type { Station } from '../../shared/types';
import LedDisplay from './LedDisplay';

/** Amber dot-matrix frequency window, with the station name, native name and tagline. */
export default function FrequencyReadout({
  station,
  lit,
  className = '',
}: {
  station: Station;
  lit: boolean;
  className?: string;
}) {
  return (
    <div className={`readout ${className}`}>
      <p className="freq" aria-hidden="true">
        <LedDisplay value={station.frequency} lit={lit} />
        <span className="freq-unit">MHz</span>
      </p>
      <div className="min-w-0">
        <p className="readout-name">
          {station.languageName}
          <span lang={station.language} className="readout-native">
            {station.nativeName}
          </span>
        </p>
        <p lang={station.language} className="readout-tagline">
          {station.tagline}
        </p>
      </div>
      <p className="sr-only" aria-live="polite">
        {`${station.languageName}, ${station.frequency} MHz`}
      </p>
    </div>
  );
}
