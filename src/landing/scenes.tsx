import type { JSX, ReactNode } from 'react';

/**
 * Six scene illustrations, one per chapter of “an evening on the radio”, drawn as a set: single-weight line
 * art (1.6, round caps and joins) in `currentColor` so the page can tint them, with a few amber fills for
 * what is lit or on air and the lamp red for lamps only. Each one is a 120×120 viewBox, legible at 56px.
 */

export interface SceneProps {
  /** Rendered width and height in px; the drawing itself is a 120×120 viewBox. */
  size?: number;
  className?: string;
  /** Accessible name. Without one the drawing is decorative and hidden from assistive tech. */
  title?: string;
}

export type SceneKey = 'tunein' | 'name' | 'city' | 'kahani' | 'callin' | 'studio';

const STROKE = 1.6;
const AMBER = 'var(--lp-amber, #f2b25c)';
const LAMP = 'var(--lp-lamp, #ff4b36)';

function Scene({ size = 96, className, title, children }: SceneProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      className={className}
      focusable={false}
      {...(title ? { role: 'img' } : { 'aria-hidden': true })}
    >
      {title ? <title>{title}</title> : null}
      <g stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  );
}

/** Tune in: the dial glass, the needle settled on a frequency, the pilot lamp lit between the knobs. */
export function SceneTuneIn(props: SceneProps) {
  return (
    <Scene {...props}>
      <rect x="16" y="24" width="88" height="44" rx="8" />
      <path d="M28 52h64" />
      <path d="M28 52v-8M36 52v-4M44 52v-8M52 52v-4M60 52v-8M68 52v-4M76 52v-8M84 52v-4M92 52v-8" />
      <rect x="74.8" y="32" width="2.4" height="28" rx="1.2" fill={AMBER} stroke="none" />
      <circle cx="40" cy="88" r="8" />
      <path d="M40 82v3" />
      <circle cx="80" cy="88" r="8" />
      <path d="M84.2 83.8l-2.1 2.1" />
      <circle cx="60" cy="88" r="3.6" fill={LAMP} stroke="none" />
    </Scene>
  );
}

/** Your name: the studio mic on its arm, headphones hung beside it, the voice going out. */
export function SceneName(props: SceneProps) {
  return (
    <Scene {...props}>
      <path d="M14 21v10M14 26h26l20 14v6" />
      <path d="M28 26v8M16 46a12 12 0 0 1 24 0" />
      <rect x="11" y="46" width="10" height="12" rx="4" />
      <rect x="35" y="46" width="10" height="12" rx="4" />
      <path d="M48 58v-2a12 12 0 0 1 24 0v2Z" fill={AMBER} stroke="none" />
      <rect x="48" y="46" width="24" height="40" rx="12" />
      <path d="M48 58h24M54 51v4M60 50v6M66 51v4" />
      <path d="M85 32a32 32 0 0 1 0 40M99 28a46 46 0 0 1 0 48" stroke={AMBER} />
    </Scene>
  );
}

/** Your city: a skyline at dusk, the sun half down, a mast on the tallest roof sending the news out. */
export function SceneCity(props: SceneProps) {
  return (
    <Scene {...props}>
      <path d="M14 96a10 10 0 0 1 20 0Z" fill={AMBER} stroke="none" />
      <path d="M12 96h28v-52h16v52h4v-28h20v28h4v-40h8v40h4v-16h8v16h4" />
      <path d="M48 44v-16" />
      <circle cx="48" cy="26" r="2.2" fill={AMBER} stroke="none" />
      <path d="M54 18a10 10 0 0 1 0 16M60 13a18 18 0 0 1 0 26" stroke={AMBER} />
      <g fill={AMBER} stroke="none">
        <rect x="44" y="52" width="3" height="3" rx="0.6" />
        <rect x="49" y="52" width="3" height="3" rx="0.6" />
        <rect x="44" y="60" width="3" height="3" rx="0.6" />
        <rect x="49" y="60" width="3" height="3" rx="0.6" />
        <rect x="66" y="76" width="3" height="3" rx="0.6" />
        <rect x="71" y="76" width="3" height="3" rx="0.6" />
        <rect x="86" y="64" width="3" height="3" rx="0.6" />
      </g>
    </Scene>
  );
}

/** Kahani Corner: an old lantern with a small flame, hung under a haveli arch. */
export function SceneKahani(props: SceneProps) {
  return (
    <Scene {...props}>
      <path
        d="M20 64a13 13 0 0 1 3-16a13 13 0 0 1 8-14a13 13 0 0 1 12-10a24 24 0 0 0 17-12a24 24 0 0 0 17 12a13 13 0 0 1 12 10a13 13 0 0 1 8 14a13 13 0 0 1 3 16M20 64v24M100 64v24"
        opacity="0.5"
      />
      <path d="M60 12v21" />
      <circle cx="60" cy="36" r="3" />
      <path d="M46 48l14-8 14 8" />
      <rect x="48" y="48" width="24" height="36" rx="4" />
      <path d="M46 84h28M60 84v4" />
      <path d="M60 58c-3.5 5-6 8-6 12a6 6 0 0 0 12 0c0-4-2.5-7-6-12Z" fill={AMBER} stroke="none" />
    </Scene>
  );
}

/** Call in: the push-to-talk button, what you say going out, the reply coming back. */
export function SceneCallIn(props: SceneProps) {
  return (
    <Scene {...props}>
      <circle cx="60" cy="60" r="28" />
      <rect x="55" y="42" width="10" height="22" rx="5" fill={AMBER} />
      <path d="M48 58a12 12 0 0 0 24 0M60 70v6M53 76h14" />
      <path d="M90 40a36 36 0 0 1 0 40M98 38a44 44 0 0 1 0 44" />
      <path d="M24 44a28 28 0 0 1 0 32M16 40a36 36 0 0 1 0 40" stroke={AMBER} />
    </Scene>
  );
}

/** The studio line: a desk telephone with a short coiled cord, ringing. */
export function SceneStudioLine(props: SceneProps) {
  return (
    <Scene {...props}>
      <path d="M32 36a9 9 0 0 0 0 18c6-2 10-4 16-4h24c6 0 10 2 16 4a9 9 0 0 0 0-18c-6 2-10 4-16 4H48c-6 0-10-2-16-4Z" />
      <path d="M44 50v10M76 50v10" />
      <path d="M38 60h44q4 0 5 4l8 24q1 4-3 4H28q-4 0-3-4l8-24q1-4 5-4Z" />
      <circle cx="60" cy="76" r="10" />
      <circle cx="60" cy="76" r="3.2" fill={AMBER} stroke="none" />
      <path d="M23 45c-5 0-5 6 0 6s5 6 0 6s-5 6 0 6s5 6 0 6s-5 6 0 6s5 6 0 6s-5 6 0 6" />
      <path d="M26 30a16 16 0 0 0-9 9M94 30a16 16 0 0 1 9 9" stroke={AMBER} />
    </Scene>
  );
}

export const SCENES: Record<SceneKey, (props: SceneProps) => JSX.Element> = {
  tunein: SceneTuneIn,
  name: SceneName,
  city: SceneCity,
  kahani: SceneKahani,
  callin: SceneCallIn,
  studio: SceneStudioLine,
};
