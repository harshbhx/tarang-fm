import { useCallback, useEffect, useRef, useState } from 'react';
import { createAudioEngine, type AudioEngine } from '../audio';
import { apiFetch } from '../radio/apiSession';
import type { StationId } from '../../shared/types';

export interface SampleRequest {
  id: string;
  station: StationId;
  speaker: string;
  text: string;
  pace: number;
  temperature: number;
}

export type SamplePhase = 'loading' | 'playing' | 'error';

export interface PlayerState {
  id: string | null;
  phase: SamplePhase | null;
  error?: string;
  /** Measured fetch-to-first-audio time per sample id */
  ttfa: Record<string, number>;
}

export interface VoicePlayer {
  state: PlayerState;
  toggle: (req: SampleRequest) => void;
  stop: () => void;
  analyser: () => AnalyserNode | null;
}

function errorText(status?: number): string {
  if (status === 429) return 'Too many plays at once. Try again in a minute.';
  return 'That voice did not come through. Tap to try again.';
}

/** One shared engine for every sample on the page; starting a sample stops the previous one. */
export function useVoicePlayer(external?: AudioEngine): VoicePlayer {
  const engineRef = useRef<AudioEngine | null>(external ?? null);
  const abortRef = useRef<AbortController | null>(null);
  const runRef = useRef(0);
  const activeRef = useRef(false);
  const [state, setState] = useState<PlayerState>({ id: null, phase: null, ttfa: {} });
  const stateRef = useRef(state);
  stateRef.current = state;

  const halt = useCallback(() => {
    runRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    if (activeRef.current) engineRef.current?.stopVoice(80);
    activeRef.current = false;
  }, []);

  const stop = useCallback(() => {
    halt();
    setState((s) => ({ ...s, id: null, phase: null, error: undefined }));
  }, [halt]);

  const toggle = useCallback(
    (req: SampleRequest) => {
      const current = stateRef.current;
      if (current.id === req.id && current.phase !== 'error') {
        stop();
        return;
      }
      halt();

      let created: AudioEngine;
      let unlocked: Promise<void>;
      try {
        created = engineRef.current ?? createAudioEngine();
        engineRef.current = created;
        unlocked = created.unlock();
      } catch {
        setState((s) => ({ ...s, id: req.id, phase: 'error', error: 'This browser cannot play audio.' }));
        return;
      }
      const engine = created;

      const run = runRef.current;
      const ac = new AbortController();
      abortRef.current = ac;
      activeRef.current = true;
      setState((s) => ({ ...s, id: req.id, phase: 'loading', error: undefined }));

      const startedAt = performance.now();
      const response = apiFetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          station: req.station,
          speaker: req.speaker,
          text: req.text,
          pace: req.pace,
          temperature: req.temperature,
        }),
        signal: ac.signal,
      });

      const live = () => run === runRef.current;
      void (async () => {
        let status: number | undefined;
        try {
          await unlocked;
          const res = await response;
          status = res.status;
          if (!live()) {
            res.body?.cancel().catch(() => undefined);
            return;
          }
          if (!res.ok) throw new Error(`TTS ${res.status}`);
          await engine.playStream(res, {
            fetchStartedAt: startedAt,
            onStart: () => {
              if (!live()) return;
              const ms = Math.round(performance.now() - startedAt);
              setState((s) => ({ ...s, phase: 'playing', ttfa: { ...s.ttfa, [req.id]: ms } }));
            },
          });
          if (!live()) return;
          activeRef.current = false;
          setState((s) => ({ ...s, id: null, phase: null }));
        } catch {
          if (!live() || ac.signal.aborted) return;
          activeRef.current = false;
          setState((s) => ({ ...s, id: req.id, phase: 'error', error: errorText(status) }));
        }
      })();
    },
    [halt, stop],
  );

  useEffect(() => halt, [halt]);

  const analyser = useCallback(() => engineRef.current?.analyser ?? null, []);

  return { state, toggle, stop, analyser };
}
