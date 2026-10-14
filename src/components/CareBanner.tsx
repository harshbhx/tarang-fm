import { useState } from 'react';
import { CloseIcon } from './icons';

export type Helpline = { name: string; number: string };

/**
 * A calm note shown when a caller sounded low. The RJ has already said a few kind words on air; this keeps the
 * helpline one tap away. Dismissible, and polite to screen readers (no alarm styling, no focus grab).
 */
export default function CareBanner({ helpline }: { helpline: Helpline }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const tel = helpline.number.replace(/[^\d+]/g, '');

  return (
    <aside className="care" role="status" aria-live="polite" aria-label="Support helpline">
      <span className="care-glow" aria-hidden="true" />
      <div className="care-body">
        <p className="care-title">You&rsquo;re not alone.</p>
        <p className="care-text">
          Talk to someone now. {helpline.name} {helpline.number} is free, 24&times;7 and confidential.
        </p>
        <a className="care-call" href={`tel:${tel}`}>
          Call {helpline.name} {helpline.number}
        </a>
      </div>
      <button type="button" className="care-close" aria-label="Dismiss helpline note" onClick={() => setOpen(false)}>
        <CloseIcon width={14} height={14} />
      </button>
    </aside>
  );
}
