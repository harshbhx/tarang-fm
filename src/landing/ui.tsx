import type { CSSProperties, ReactNode } from 'react';
import BlurText from '../components/bits/BlurText';
import ClickSpark from '../components/bits/ClickSpark';
import { Ripple } from '../components/bits/MagicUi';
import { STUDIO_NUMBER, STUDIO_NUMBER_DISPLAY } from '../../shared/constants';
import type { SamplePhase } from './useVoicePlayer';
import { PhoneIcon, PlayIcon, RetryIcon, StopIcon } from './icons';

export type Vars = CSSProperties & Record<`--${string}`, string>;

/** Amber sparks when a listener switches the radio on. */
export const SPARK_COLORS = ['#ffd38a', '#f2b25c', '#ff6b2c'];

export function TuneButton({ onClick, label = 'Tune in now' }: { onClick: () => void; label?: string }) {
  return (
    <ClickSpark sparkColor={SPARK_COLORS} sparkCount={10} sparkRadius={34} sparkSize={9} duration={520} glow={0.6} className="lp-spark" style={{ width: 'auto', height: 'auto' }}>
      <button type="button" className="lp-cta" onClick={onClick}>
        <span className="lp-cta-lamp" aria-hidden="true" />
        {label}
      </button>
    </ClickSpark>
  );
}

export function SectionHead({ id, title, children }: { id: string; title: string; children?: ReactNode }) {
  return (
    <div className="lp-head">
      <BlurText as="h2" id={id} className="lp-h2" text={title} />
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

export const STUDIO_LANGUAGES = 'Hindi, Marathi, Gujarati, Tamil, Bangla or English';

/** The studio phone line as a tap-to-call link (dials on a phone). */
export function StudioCall({ variant = 'line' }: { variant?: 'line' | 'button' }) {
  if (variant === 'button') {
    return (
      <a className="lp-ghost lp-studio-btn" href={`tel:${STUDIO_NUMBER}`}>
        <PhoneIcon size={18} />
        Call the studio: <span className="lp-studio-number">{STUDIO_NUMBER_DISPLAY}</span>
      </a>
    );
  }
  return (
    <a className="lp-phone" href={`tel:${STUDIO_NUMBER}`}>
      <span className="lp-phone-icon" aria-hidden="true">
        <Ripple size={36} step={18} rings={3} opacity={0.3} color="var(--lp-amber-hi, #ffd38a)" />
        <PhoneIcon size={18} />
      </span>
      <span className="lp-phone-text">
        <span className="lp-phone-title">
          Call the studio: <span className="lp-studio-number">{STUDIO_NUMBER_DISPLAY}</span>
        </span>
        <span className="lp-phone-sub">
          From any phone. Talk to RJ Sunny in {STUDIO_LANGUAGES}, and your dedication is read on the live show.
        </span>
      </span>
    </a>
  );
}
