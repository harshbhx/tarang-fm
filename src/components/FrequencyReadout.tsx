import type { Station } from '../../shared/types';
import NumberTicker from './NumberTicker';

/** Station name and tagline beside a big frequency that rolls between stations. */
export default function FrequencyReadout({ station, className = '' }: { station: Station; className?: string }) {
  return (
    <div className={`flex items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0 pb-0.5">
        <p className="text-lg leading-snug font-semibold">
          {station.languageName}{' '}
          <span lang={station.language} className="text-fg-2 font-normal">
            {station.nativeName}
          </span>
        </p>
        <p lang={station.language} className="text-fg-3 mt-0.5 truncate text-sm">
          {station.tagline}
        </p>
      </div>
      <p className="freq shrink-0" aria-hidden="true">
        <NumberTicker value={Number(station.frequency)} startValue={88} decimalPlaces={1} stiffness={140} damping={22} />
        <span className="freq-unit">MHz</span>
      </p>
      <p className="sr-only" aria-live="polite">
        {`${station.languageName}, ${station.frequency} MHz`}
      </p>
    </div>
  );
}
