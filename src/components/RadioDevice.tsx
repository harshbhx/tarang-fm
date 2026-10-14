import { useEffect, useState, type ReactNode } from 'react';
import type { Station, StationId } from '../../shared/types';
import FrequencyReadout from './FrequencyReadout';
import OnAirLamp from './OnAirLamp';
import SpeakerGrille from './SpeakerGrille';
import StationPicker from './StationPicker';
import TunerDial, { type DialControl } from './TunerDial';
import TuningKnob from './TuningKnob';
import VuMeter from './VuMeter';
import { dialPct, nearestStation } from './format';
import { WaveMark } from './icons';

interface RadioDeviceProps {
  stations: Station[];
  station: Station;
  onStation: (id: StationId) => void;
  onAir: boolean;
  tuning: boolean;
  /** Backlight on */
  lit: boolean;
  /** During a show: shorter glass and tighter controls */
  compact: boolean;
  /** Behind the dial scale (visualizer) */
  dialChildren?: ReactNode;
}

/**
 * The hero object: a graphite radio with a full-width backlit dial on top, then the speaker
 * grille, VU meters, frequency readout, latching preset keys and the tuning knob.
 * The dial and knob share one needle position and snap to the nearest station.
 */
export default function RadioDevice({
  stations,
  station,
  onStation,
  onAir,
  tuning,
  lit,
  compact,
  dialChildren,
}: RadioDeviceProps) {
  const [drag, setDrag] = useState<number | null>(null);
  const [pending, setPending] = useState<StationId | null>(null);
  const byFreq = [...stations].sort((a, b) => Number(a.frequency) - Number(b.frequency));

  if (pending && pending === station.id) setPending(null);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setPending(null), 1500);
    return () => window.clearTimeout(timer);
  }, [pending]);

  const shown = stations.find((s) => s.id === (pending ?? station.id)) ?? station;
  const pct = drag ?? dialPct(Number(shown.frequency));
  const pointed = drag === null ? shown : nearestStation(stations, drag);

  const choose = (id: StationId) => {
    if (id === station.id) return;
    setPending(id);
    onStation(id);
  };

  const control: DialControl = {
    onDrag: setDrag,
    onRelease: () => {
      if (drag === null) return;
      const target = nearestStation(stations, drag);
      setDrag(null);
      choose(target.id);
    },
    onStep: (to) => {
      const index = byFreq.findIndex((s) => s.id === shown.id);
      const next =
        to === 'first' ? 0 : to === 'last' ? byFreq.length - 1 : Math.min(byFreq.length - 1, Math.max(0, index + to));
      choose(byFreq[next].id);
    },
  };

  return (
    <section aria-label="Radio" className="radio-body" data-compact={compact} data-lit={lit}>
      <span className="screw screw-tl" aria-hidden="true" />
      <span className="screw screw-tr" aria-hidden="true" />
      <span className="screw screw-bl" aria-hidden="true" />
      <span className="screw screw-br" aria-hidden="true" />

      <header className="radio-top">
        <p className="nameplate">
          <WaveMark width={20} height={20} className="nameplate-mark" />
          Tarang<span className="nameplate-fm">FM</span>
        </p>
        <OnAirLamp on={onAir} warming={tuning} />
      </header>

      <TunerDial
        stations={stations}
        value={shown.id}
        pct={pct}
        dragging={drag !== null}
        lit={lit}
        tuning={tuning}
        size={compact ? 'compact' : 'full'}
        control={control}
      >
        {dialChildren}
      </TunerDial>

      <div className="radio-controls">
        <SpeakerGrille className="radio-grille" />
        <div className="radio-vu">
          <VuMeter channel="l" lit={lit} />
          <VuMeter channel="r" lit={lit} className="vu-second" />
        </div>
        <FrequencyReadout station={pointed} lit={lit} className="radio-readout" />
        <StationPicker stations={stations} value={shown.id} onChange={choose} variant="keys" className="radio-presets" />
        <TuningKnob pct={pct} dragging={drag !== null} station={pointed} control={control} className="radio-knob" />
      </div>
    </section>
  );
}
