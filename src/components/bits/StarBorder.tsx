/*
 * StarBorder: the idea of Star Border from React Bits (MIT + Commons Clause), written for Tarang FM in CSS
 * alone. A bright star runs the exact outline of the wrapped element on an offset-path, trailing three
 * fading sparks, with a slow twinkle; the browser animates it off the main thread. Under reduced motion the
 * star rests at the top edge.
 */
import type { CSSProperties, ReactNode } from 'react';
import './StarBorder.css';

interface StarBorderProps {
  children: ReactNode;
  color?: string;
  /** Seconds per lap */
  duration?: number;
  /** Corner radius of the wrapped element, px */
  radius?: number;
  className?: string;
  style?: CSSProperties;
}

export default function StarBorder({ children, color = '#ffd08a', duration = 6, radius = 14, className = '', style }: StarBorderProps) {
  return (
    <div
      className={`star-border ${className}`}
      style={{ '--star-color': color, '--star-duration': `${duration}s`, '--star-radius': `${radius}px`, ...style } as CSSProperties}
    >
      <span className="star-border-track" aria-hidden="true">
        <span className="star-border-spark" style={{ animationDelay: `calc(var(--star-duration) * -0.03)` }} />
        <span className="star-border-spark" style={{ animationDelay: `calc(var(--star-duration) * -0.02)` }} />
        <span className="star-border-spark" style={{ animationDelay: `calc(var(--star-duration) * -0.01)` }} />
        <span className="star-border-star" />
      </span>
      {children}
    </div>
  );
}
