import { useRef } from 'react';
import { useInView } from 'motion/react';
import { CALL_CHAIN } from './data';
import { MicIcon } from './icons';
import { SpeakerId, type Vars } from './ui';

/**
 * The call-in signal chain. When it scrolls into view a pulse runs node to node once,
 * showing the order the call travels in. Swappable for another pipeline diagram.
 */
export default function CallChain() {
  const ref = useRef<HTMLOListElement>(null);
  const seen = useInView(ref, { amount: 0.5, once: true });

  return (
    <ol ref={ref} className="lp-chain" data-run={seen}>
      {CALL_CHAIN.map((step, i) => (
        <li key={step.key} className="lp-chain-step" style={{ '--i': String(i) } as Vars}>
          <span className="lp-chain-node" aria-hidden="true">
            {i === 0 ? <MicIcon size={16} /> : i}
          </span>
          <div className="lp-chain-text">
            <h3 className="lp-h3">{step.title}</h3>
            <p>{step.body}</p>
            {step.model && <SpeakerId id={step.model} />}
          </div>
        </li>
      ))}
    </ol>
  );
}
