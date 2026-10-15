import type { CSSProperties, ReactNode } from 'react';
import BlurText from '../components/bits/BlurText';
import ClickSpark from '../components/bits/ClickSpark';
import { Ripple } from '../components/bits/MagicUi';
import type { SamplePhase } from './useVoicePlayer';
import { PlayIcon, RetryIcon, StopIcon } from './icons';

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

/** How every section opens: a mono kicker, the title blurring in word by word, one line under it. */
export function SectionHead({ id, title, kicker, children }: { id: string; title: string; kicker?: string; children?: ReactNode }) {
  return (
    <div className="lp-open">
      {kicker && <p className="lp-kicker">{kicker}</p>}
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

/** Rings that pulse out from the studio phone, like a line that is ringing. */
export function RingingPhone({ children }: { children: ReactNode }) {
  return (
    <span className="lp-phone-icon">
      <Ripple size={40} step={20} rings={3} opacity={0.3} color="var(--lp-amber-hi, #ffd38a)" />
      {children}
    </span>
  );
}
