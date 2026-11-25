import { forwardRef, type ReactNode } from 'react';

interface StepHeadingProps {
  title: ReactNode;
  intro?: ReactNode;
}

/** Step title that receives focus when the step changes, so keyboard and screen reader users land in the right place. */
const StepHeading = forwardRef<HTMLHeadingElement, StepHeadingProps>(function StepHeading({ title, intro }, ref) {
  return (
    <header>
      <h2 id="step-title" ref={ref} tabIndex={-1} className="ah-display text-[25px] sm:text-[28px]">{title}</h2>
      {intro ? <p className="mt-2 text-[16px] leading-relaxed text-[color:var(--ah-ink-2)]">{intro}</p> : null}
    </header>
  );
});

export default StepHeading;
