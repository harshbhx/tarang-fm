import { useState } from 'react';
import type { LiveLine } from '../../../shared/live';

const HISTORY_MAX = 6;

interface Track {
  key: string;
  last?: LiveLine;
  history: LiveLine[];
}

/**
 * Lines that have played on this station since you joined, oldest first (the one on air is
 * not included). Starts over when `key` changes (another station, or leaving the show). */
export function useAiredLines(current: LiveLine | undefined, key: string): LiveLine[] {
  const [track, setTrack] = useState<Track>({ key, last: current, history: [] });

  if (track.key !== key) {
    setTrack({ key, last: current, history: [] });
  } else if (current && current.id !== track.last?.id) {
    const history = track.last ? [...track.history, track.last].slice(-HISTORY_MAX) : track.history;
    setTrack({ key, last: current, history });
  }

  if (track.key !== key) return [];
  // Between lines, the one that just finished joins the history straight away.
  return !current && track.last ? [...track.history, track.last].slice(-HISTORY_MAX) : track.history;
}
