import type { SVGProps } from 'react';
import type { SegmentType } from '../../shared/types';

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="9" y="2.5" width="6" height="11.5" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
    </Svg>
  );
}

export function PhoneIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5.2 3.5h3.1l1.6 4.2-2.1 1.3a11.5 11.5 0 0 0 7.2 7.2l1.3-2.1 4.2 1.6v3.1a2 2 0 0 1-2.2 2A17.5 17.5 0 0 1 3.2 5.7a2 2 0 0 1 2-2.2Z" />
    </Svg>
  );
}

export function WifiOffIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 3l18 18M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 4.2-2.4M19 12.9a10 10 0 0 0-2.6-1.8M2 9.3a15 15 0 0 1 4.4-2.7M22 9.3A15 15 0 0 0 11 5.1" />
      <circle cx="12" cy="19.5" r="0.9" fill="currentColor" />
    </Svg>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <Svg strokeWidth={3} {...props}>
      <path d="M8.5 5v14M15.5 5v14" />
    </Svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Svg fill="currentColor" stroke="none" {...props}>
      <path d="M7 4.6v14.8a1 1 0 0 0 1.53.85l11.7-7.4a1 1 0 0 0 0-1.7L8.53 3.75A1 1 0 0 0 7 4.6Z" />
    </Svg>
  );
}

export function RetryIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 3.5v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20.5v-5h5" />
    </Svg>
  );
}

export function SubtitlesIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
      <path d="M6.5 15h4M13 15h4.5M6.5 11.5h11" />
    </Svg>
  );
}

export function BoltIcon(props: IconProps) {
  return (
    <Svg fill="currentColor" stroke="none" {...props}>
      <path d="M13.2 2.2 4.6 13.1a.6.6 0 0 0 .47.97H11l-1.1 7.6c-.08.6.69.92 1.06.44l8.5-10.9a.6.6 0 0 0-.47-.97H13l1.2-7.6c.1-.6-.68-.92-1.05-.45Z" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg strokeWidth={2} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function WaveMark(props: IconProps) {
  return (
    <Svg viewBox="0 0 32 32" strokeWidth={2.8} {...props}>
      <path d="M3 17c2.7-6.5 5.4-6.5 8.1 0s5.4 6.5 8.1 0 5.4-6.5 8.1 0" />
    </Svg>
  );
}

export function SegmentIcon({ type, ...props }: IconProps & { type: SegmentType }) {
  switch (type) {
    case 'station_id':
      return (
        <Svg {...props}>
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
          <path d="M8.4 8.4a5 5 0 0 0 0 7.2M15.6 8.4a5 5 0 0 1 0 7.2M5.5 5.5a9.2 9.2 0 0 0 0 13M18.5 5.5a9.2 9.2 0 0 1 0 13" />
        </Svg>
      );
    case 'rj_link':
      return (
        <Svg {...props}>
          <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
          <path d="M4 15.5A2.5 2.5 0 0 1 6.5 13H8v7H6.5A2.5 2.5 0 0 1 4 17.5zM20 15.5a2.5 2.5 0 0 0-2.5-2.5H16v7h1.5a2.5 2.5 0 0 0 2.5-2.5z" />
        </Svg>
      );
    case 'news':
      return (
        <Svg {...props}>
          <path d="M4 5h12.5v14H6a2 2 0 0 1-2-2zM16.5 9H20v8a2 2 0 0 1-2 2" />
          <path d="M7.5 9h5.5M7.5 12.5h5.5M7.5 16h3.5" />
        </Svg>
      );
    case 'ad_break':
      return (
        <Svg {...props}>
          <path d="M3.5 10v4h3l9 5V5l-9 5zM6.5 14l1.4 5.5h2.6L9.4 15" />
          <path d="M19 9.5a3.5 3.5 0 0 1 0 5" />
        </Svg>
      );
    case 'kahani':
      return (
        <Svg {...props}>
          <path d="M3 5.5h6a3 3 0 0 1 3 3V20a2 2 0 0 0-2-2H3zM21 5.5h-6a3 3 0 0 0-3 3V20a2 2 0 0 1 2-2h7z" />
        </Svg>
      );
  }
}

/** Animated "something is happening" bars. */
export function Eq({ className = '' }: { className?: string }) {
  return (
    <span className={`eq ${className}`} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}
