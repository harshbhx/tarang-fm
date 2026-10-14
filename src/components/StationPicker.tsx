import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import type { Station, StationId } from '../../shared/types';
import { nativeLanguage } from './format';

interface StationPickerProps {
  stations: Station[];
  value: StationId;
  onChange: (id: StationId) => void;
  /** Preset keys on the radio body, or compact pills in the dock */
  variant: 'keys' | 'pills';
}

/** Accessible radiogroup of stations (arrow keys move between them). */
export default function StationPicker({ stations, value, onChange, variant }: StationPickerProps) {
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
      aria-label="Stations"
      onKeyDown={onKeyDown}
      className={variant === 'keys' ? 'grid grid-cols-3 gap-2 sm:gap-3' : 'flex gap-2 overflow-x-auto [scrollbar-width:none]'}
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
              <span className="text-fg-3 hidden font-mono text-xs tabular-nums sm:inline">{station.frequency}</span>
            </button>
          );
        }

        return (
          <button key={station.id} {...common} className="preset" style={{ '--led': station.accent } as CSSProperties}>
            <span className="preset-led" aria-hidden="true" />
            <span className="truncate text-[0.92rem] leading-tight font-semibold sm:text-[0.98rem]">{station.languageName}</span>
            <span className="text-fg-3 flex items-baseline gap-1.5 text-xs">
              <span lang={station.language} className="hidden truncate sm:inline">
                {nativeLanguage(station)}
              </span>
              <span className="font-mono tabular-nums">{station.frequency}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
