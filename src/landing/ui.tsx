import type { CSSProperties, ReactNode } from 'react';
import type { SamplePhase } from './useVoicePlayer';
import { PlayIcon, RetryIcon, StopIcon } from './icons';

export type Vars = CSSProperties & Record<`--${string}`, string>;

export function TuneButton({ onClick, label = 'Tune in now' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="lp-cta" onClick={onClick}>
      <span className="lp-cta-lamp" aria-hidden="true" />
      {label}
    </button>
  );
}

export function SectionHead({ id, title, children }: { id: string; title: string; children?: ReactNode }) {
  return (
    <div className="lp-head">
      <h2 id={id} className="lp-h2">
        {title}
      </h2>
      {children && <p className="lp-sub">{children}</p>}
    </div>
  );
}

/** A Bulbul persona or model ID, always in mono so it reads as the real API value. */
export function SpeakerId({ id, accent }: { id: string; accent?: string }) {
  return (
    <code className="lp-id" style={accent ? ({ '--st': accent } as Vars) : undefined}>
      {id}
    </code>
  );
}

export function PlayGlyph({ phase, size = 18 }: { phase: SamplePhase | 'idle'; size?: number }) {
  if (phase === 'loading') return <span className="lp-spin" aria-hidden="true" />;
  if (phase === 'playing') return <StopIcon size={size} />;
  if (phase === 'error') return <RetryIcon size={size} />;
  return <PlayIcon size={size} />;
}
