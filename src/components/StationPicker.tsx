import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import type { Station, StationId } from '../../shared/types';
import { nativeLanguage } from './format';

interface StationPickerProps {
  stations: Station[];
  value: StationId;
  onChange: (id: StationId) => void;
  /** Mechanical preset keys on the radio body, or compact pills */
  variant: 'keys' | 'pills';
  className?: string;
}

/**
 * Accessible radiogroup of stations (arrow keys move between them). As preset keys, the
 * selected key latches down like a real push-button radio. Works for any number of stations.
 */
export default function StationPicker({ stations, value, onChange, variant, className = '' }: StationPickerProps) {
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, stations.findIndex((s) => s.id === value));

  const select = (id: StationId) => {
    if (id !== value) onChange(id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + stations.length) % stations.length;
    select(stations[next].id);
    items.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Station presets"
      onKeyDown={onKeyDown}
      className={`${variant === 'keys' ? 'presets' : 'pills'} ${className}`}
      style={{ '--count': stations.length } as CSSProperties}
    >
      {stations.map((station, i) => {
        const on = station.id === value;
        const common = {
          ref: (el: HTMLButtonElement | null) => {
            items.current[i] = el;
          },
          type: 'button' as const,
          role: 'radio',
          'aria-checked': on,
          'aria-label': `${station.languageName}, ${station.frequency} MHz`,
          tabIndex: on ? 0 : -1,
          onClick: () => select(station.id),
        };

        if (variant === 'pills') {
          return (
            <button key={station.id} {...common} className="pill" style={{ '--pill-accent': station.accent } as CSSProperties}>
              <span className="pill-dot" aria-hidden="true" />
              {station.languageName}
              <span className="text-fg-3 font-mono text-xs tabular-nums">{station.frequency}</span>
            </button>
          );
        }

        return (
          <button key={station.id} {...common} className="preset" style={{ '--led': station.accent } as CSSProperties}>
            <span className="preset-cap">
              <span className="preset-led" aria-hidden="true" />
              <span className="preset-name">{station.languageName}</span>
              <span className="preset-meta">
                <span lang={station.language} className="preset-native">
                  {nativeLanguage(station)}
                </span>
                <span className="preset-freq">{station.frequency}</span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
