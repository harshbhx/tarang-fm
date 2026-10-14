import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...rest }: IconProps): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    'aria-hidden': true,
    focusable: false,
    ...rest,
  };
}

export function PlayIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 5.6v12.8c0 .8.9 1.3 1.6.9l10-6.4c.6-.4.6-1.3 0-1.7l-10-6.4C8.9 4.3 8 4.8 8 5.6Z" fill="currentColor" />
    </svg>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" />
    </svg>
  );
}

export function RetryIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v3.7h3.7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="9" y="3" width="6" height="11.5" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function WaveMark(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M2 12c1.6 0 1.6-5 3.2-5s1.6 10 3.2 10 1.6-13 3.2-13 1.6 16 3.2 16 1.6-10 3.2-10S19.6 12 22 12"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GitHubIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        fill="currentColor"
        d="M12 2.2a9.8 9.8 0 0 0-3.1 19.1c.5.1.7-.2.7-.5v-1.7c-2.7.6-3.3-1.3-3.3-1.3-.5-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.2-.2-4.5-1.1-4.5-4.9 0-1.1.4-2 1-2.7-.1-.2-.4-1.2.1-2.6 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 4.9 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.6.6.7 1 1.6 1 2.7 0 3.8-2.3 4.7-4.5 4.9.4.3.7.9.7 1.8v2.7c0 .3.2.6.7.5A9.8 9.8 0 0 0 12 2.2Z"
      />
    </svg>
  );
}
