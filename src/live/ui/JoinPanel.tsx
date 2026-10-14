import { useState, type FormEvent } from 'react';
import BlurText from '../../components/bits/BlurText';
import ClickSpark from '../../components/bits/ClickSpark';
import StationPicker from '../../components/StationPicker';
import { LIVE_NAME_MAX } from '../../../shared/live';
import type { Station, StationId } from '../../../shared/types';
import { onAppLink } from './navigate';
import { PeopleIcon } from './icons';

/** Sparks in the station's warm amber, like the tune-in key. */
const JOIN_SPARKS = ['#ffd38a', '#ff9a4d', '#ff6b2c'];

interface JoinPanelProps {
  stations: Station[];
  station: Station;
  /** Listeners already on this station, when known before joining */
  listening: number;
  /** The studio has this station switched off (joining still works: you wait for the show) */
  offAir?: boolean;
  /** Prefill for the name field (read once when the form appears) */
  initialName: string;
  online: boolean;
  onStation: (id: StationId) => void;
  /** Runs inside the submit click so audio can start */
  onJoin: (name: string) => void;
}

/** Name entry for the shared show: who you are, which station, then "Join live". */
export default function JoinPanel({
  stations,
  station,
  listening,
  offAir = false,
  initialName,
  online,
  onStation,
  onJoin,
}: JoinPanelProps) {
  const [name, setName] = useState(() => initialName.slice(0, LIVE_NAME_MAX));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onJoin(name.trim());
  };

  return (
    <section aria-labelledby="join-title" className="tune-panel live-join">
      <div className="tune-copy">
        <p className="live-eyebrow">
          <span className="live-eyebrow-dot" aria-hidden="true" />
          Listen together <span className="live-beta">Beta</span>
        </p>
        <BlurText as="h1" id="join-title" className="display-lg mt-3" text="Listen together, live" delay={60} />
        <p className="tune-lede">Everyone tuned in hears the same show. The RJ will welcome you on air.</p>
        {listening > 0 ? (
          <p className="live-count-hint">
            <PeopleIcon width={16} height={16} />
            <span>
              <strong className="text-fg tabular-nums">{listening}</strong> listening to {station.languageName}{' '}
              {station.frequency} right now
            </span>
          </p>
        ) : null}
        {offAir ? (
          <p className="live-off-air-hint" role="status">
            <span className="live-off-air-dot" aria-hidden="true" />
            <span>
              <strong className="text-fg font-medium">Off air right now.</strong> Join anyway and you&rsquo;ll hear the show
              the moment the studio starts it.
            </span>
          </p>
        ) : null}
      </div>

      <form onSubmit={submit} className="tune-form live-join-form">
        <label className="flex flex-col gap-2">
          <span className="text-fg-2 text-sm">What should the RJ call you?</span>
          <input
            className="field"
            type="text"
            name="live-name"
            value={name}
            maxLength={LIVE_NAME_MAX}
            autoComplete="given-name"
            enterKeyHint="go"
            placeholder="Your first name"
            aria-describedby="live-name-hint"
            onChange={(event) => setName(event.target.value)}
          />
          <span id="live-name-hint" className="text-fg-3 text-xs">
            Leave it blank and the RJ will just call you dost.
          </span>
        </label>

        <div role="group" aria-labelledby="live-station-label" className="flex flex-col gap-2">
          <span className="text-fg-2 text-sm" id="live-station-label">
            Station
          </span>
          <StationPicker stations={stations} value={station.id} onChange={onStation} variant="pills" className="live-stations" />
        </div>

        <ClickSpark
          sparkColor={JOIN_SPARKS}
          sparkCount={10}
          sparkRadius={40}
          sparkSize={10}
          duration={520}
          glow={0.6}
          className="tune-spark"
          style={{ height: 'auto' }}
        >
          <button type="submit" className="tune-btn live-join-btn">
            <span className="live-join-lamp" aria-hidden="true" />
            Join live
            <span className="live-join-station">
              {station.languageName} {station.frequency}
            </span>
          </button>
        </ClickSpark>

        {online ? (
          <p className="tune-hint">
            <span className="tune-hint-dot" aria-hidden="true" />
            Sound on. You join mid-show, in sync with everyone else.
          </p>
        ) : (
          <p className="tune-hint" data-tone="warn" role="status">
            <span className="tune-hint-dot" aria-hidden="true" />
            You&rsquo;re offline. Connect to the internet to join.
          </p>
        )}
        <p className="tune-studio">
          Prefer a show just for you?{' '}
          <a href="/listen" onClick={onAppLink}>
            Listen solo
          </a>{' '}
          and call in to the RJ.
        </p>
      </form>
    </section>
  );
}
