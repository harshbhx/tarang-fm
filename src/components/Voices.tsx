import { m } from 'motion/react';
import type { Station } from '../../shared/types';
import SpeakerChip from './SpeakerChip';
import { castVoices } from './format';

interface VoicesOnAirProps {
  station: Station;
  /** Every V4 speaker heard this session */
  heard: ReadonlySet<string>;
  /** Speaker of the current line */
  current?: string;
  className?: string;
}

/** The station's voice roster; each Bulbul v4 voice pops in once it has been heard. */
export function VoicesOnAir({ station, heard, current, className = '' }: VoicesOnAirProps) {
  const voices = castVoices(station);
  const heardHere = voices.filter((v) => heard.has(v.speaker)).length;

  return (
    <section aria-labelledby="voices-title" className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="voices-title" className="text-sm font-medium">
          Voices on air
        </h2>
        <p className="text-fg-3 font-mono text-xs tabular-nums">
          {heardHere}/{voices.length} heard
          {heard.size > heardHere ? `, ${heard.size} this session` : ''}
        </p>
      </div>
      <ul key={station.id} className="voices-strip mt-3">
        {voices.map((voice, i) => {
          const on = heard.has(voice.speaker);
          return (
            <m.li
              key={voice.speaker}
              className="flex shrink-0 flex-col gap-1.5"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.35, ease: 'easeOut' }}
            >
              <m.span
                key={on ? 'heard' : 'waiting'}
                className="inline-flex"
                initial={on ? { scale: 0.82, opacity: 0.3 } : false}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 18 }}
              >
                <SpeakerChip id={voice.speaker} dim={!on} speaking={voice.speaker === current} />
              </m.span>
              <span className={`text-xs ${on ? 'text-fg-2' : 'text-fg-3'}`}>
                {voice.roles.join(', ')}
                <span className="sr-only">{on ? ', heard' : ', not heard yet'}</span>
              </span>
            </m.li>
          );
        })}
      </ul>
    </section>
  );
}
