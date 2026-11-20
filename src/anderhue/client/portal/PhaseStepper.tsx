import { Check } from 'lucide-react';
import { PHASES, phaseIndex, type Phase } from '../catalog';

/** Received, Fee and retainer, In progress, Closed, with the current phase highlighted. */
export default function PhaseStepper({ phase }: { phase: Phase }) {
  const current = Math.max(0, phaseIndex(phase));
  return (
    <ol className="ahc-phases" aria-label="Progress of your file">
      {PHASES.map((item, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'todo';
        return (
          <li key={item.value} className="ahc-phase" data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="ahc-phase-dot" aria-hidden="true">{state === 'done' ? <Check size={14} strokeWidth={3} /> : null}</span>
            <span>{item.label}</span>
            {state !== 'todo' ? <span className="sr-only">{state === 'done' ? ', done' : ', current stage'}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
