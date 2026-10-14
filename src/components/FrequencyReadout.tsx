import { useReducedMotion } from 'motion/react';
import type { Station } from '../../shared/types';
import DecryptedText from './bits/DecryptedText';
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
  const reduce = useReducedMotion() ?? false;
  return (
    <div className={`readout ${className}`}>
      <p className="freq" aria-hidden="true">
        <LedDisplay value={station.frequency} lit={lit} />
        <span className="freq-unit">MHz</span>
      </p>
      <div className="min-w-0">
        <p className="readout-name">
          {reduce ? (
            station.languageName
          ) : (
            // Remounts per station, so the name scrambles and locks in like a dial finding the signal
            <DecryptedText
              key={station.id}
              text={station.languageName}
              animateOn="view"
              sequential
              revealDirection="start"
              speed={60}
              maxIterations={12}
              characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
              encryptedClassName="readout-scramble"
            />
          )}
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
