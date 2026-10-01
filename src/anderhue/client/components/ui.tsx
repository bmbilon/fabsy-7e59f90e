import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, type LucideIcon } from 'lucide-react';
import { cx } from '../lib/cx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'quiet';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'sm' | 'icon';
  block?: boolean;
  busy?: boolean;
  icon?: LucideIcon;
  iconAfter?: LucideIcon;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', block, busy, icon: Icon, iconAfter: IconAfter, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx('ahc-btn', `ahc-btn--${variant}`, size === 'sm' && 'ahc-btn--sm', size === 'icon' && 'ahc-btn--icon', block && 'ahc-btn--block', className)}
      disabled={disabled || busy}
      data-busy={busy ? 'true' : undefined}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <LoaderCircle size={18} className="ahc-spin" aria-hidden="true" /> : Icon ? <Icon size={18} aria-hidden="true" /> : null}
      {children}
      {IconAfter && !busy ? <IconAfter size={18} aria-hidden="true" /> : null}
    </button>
  );
});

interface ButtonLinkProps extends LinkProps {
  variant?: Variant;
  size?: 'md' | 'sm';
  block?: boolean;
  icon?: LucideIcon;
  iconAfter?: LucideIcon;
}

export function ButtonLink({ variant = 'secondary', size = 'md', block, icon: Icon, iconAfter: IconAfter, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={cx('ahc-btn', `ahc-btn--${variant}`, size === 'sm' && 'ahc-btn--sm', block && 'ahc-btn--block', className)} {...rest}>
      {Icon ? <Icon size={18} aria-hidden="true" /> : null}
      {children}
      {IconAfter ? <IconAfter size={18} aria-hidden="true" /> : null}
    </Link>
  );
}

export interface ControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

interface FieldProps {
  id: string;
  label: ReactNode;
  optional?: boolean;
  hint?: ReactNode;
  /** Shown under the label instead of under the control. */
  hintFirst?: boolean;
  error?: string;
  className?: string;
  children: (control: ControlProps) => ReactNode;
}

/** Label, hint and error wiring for one control. */
export function Field({ id, label, optional, hint, hintFirst, error, className, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : '';
  const errorId = error ? `${id}-error` : '';
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  const hintNode = hint ? <p id={hintId} className={cx('ahc-hint', hintFirst ? '-mt-0.5 mb-2' : 'mt-1.5')}>{hint}</p> : null;
  return (
    <div className={className}>
      <label htmlFor={id} className="ahc-label">
        {label}
        {optional ? <span className="ahc-optional">(optional)</span> : null}
      </label>
      {hintFirst ? hintNode : null}
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      {hintFirst ? null : hintNode}
    </div>
  );
}

export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="ahc-error">
      <CircleAlert size={16} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

type Tone = 'error' | 'info' | 'success' | 'warn';
const TONE_ICON: Record<Tone, LucideIcon> = { error: CircleAlert, info: Info, success: CircleCheck, warn: TriangleAlert };

interface AlertProps {
  tone: Tone;
  title?: ReactNode;
  children?: ReactNode;
  icon?: LucideIcon;
  className?: string;
  /** Errors interrupt (role="alert"); everything else is announced politely. */
  live?: boolean;
  id?: string;
}

export function Alert({ tone, title, children, icon, className, live = true, id }: AlertProps) {
  const Icon = icon || TONE_ICON[tone];
  const role = live ? (tone === 'error' ? 'alert' : 'status') : undefined;
  return (
    <div id={id} role={role} className={cx('ahc-alert', `ahc-alert--${tone}`, 'ahc-fade', className)}>
      <Icon size={20} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title ? <p className="ahc-alert-title">{title}</p> : null}
        {children ? <div className={title ? 'mt-1' : undefined}>{children}</div> : null}
      </div>
    </div>
  );
}

export function Pill({ tone = 'default', children, className }: { tone?: 'default' | 'action' | 'closed' | 'success' | 'soon'; children: ReactNode; className?: string }) {
  return <span className={cx('ahc-pill', tone !== 'default' && `ahc-pill--${tone}`, className)}>{children}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cx('ahc-skel', className)} />;
}
