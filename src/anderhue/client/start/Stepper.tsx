import { STEPS, stepIndex, type StepId } from './intake';

interface StepperProps {
  current: StepId;
  /** Highest step index the person may jump to. */
  reachable: number;
  disabled?: boolean;
  onSelect: (step: StepId) => void;
}

export default function Stepper({ current, reachable, disabled, onSelect }: StepperProps) {
  const index = stepIndex(current);
  return (
    <nav aria-label="Steps" className="mt-6">
      <p className="ahc-stepper-count mb-1 text-sm font-semibold text-[color:var(--ah-ink-2)]">
        Step {index + 1} of {STEPS.length}
        <span className="font-normal text-[color:var(--ah-muted)]"> · {STEPS[index].label}</span>
      </p>
      <ol className="ahc-steps">
        {STEPS.map((step, position) => {
          const state = position < index ? 'done' : position === index ? 'current' : 'todo';
          const canGo = !disabled && position !== index && position <= reachable;
          return (
            <li key={step.id} className="ahc-step" data-state={state}>
              <button
                type="button"
                className="ahc-step-btn"
                disabled={!canGo}
                aria-current={state === 'current' ? 'step' : undefined}
                onClick={() => onSelect(step.id)}
              >
                <span className="ahc-step-bar" aria-hidden="true" />
                <span className="ahc-step-label">
                  <span className="ahc-step-num" aria-hidden="true">{position + 1}</span>
                  {step.label}
                  {state === 'done' ? <span className="sr-only"> (done)</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
