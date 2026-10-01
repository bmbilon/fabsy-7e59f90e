import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Link, type LinkProps } from 'react-router-dom';
import { Briefcase, Building2, CalendarClock, CarFront, EyeOff, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AREAS, stageDef, staffStageLabel, type PracticeArea } from './catalog';
import { formatTableDate } from './format';
import {
  KEY_DATE_SHORT, PORTAL_HOLD_HELP, PORTAL_HOLD_LABEL, REVIEW_LABELS, REVIEW_TONES, dateTone, outcomeLabel, relativeDays,
  type FieldSource, type KeyDate, type Reason, type ReviewStatus, type Tone,
} from './model';

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'gold' | 'danger';
type Size = 'md' | 'sm' | 'xs';

const buttonClass = (variant: Variant, size: Size, icon?: boolean, block?: boolean, className?: string) => cn(
  'ahs-btn', `ahs-btn-${variant}`, size !== 'md' && `ahs-btn-${size}`, icon && 'ahs-btn-icon', block && 'ahs-btn-block', className,
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: boolean;
  block?: boolean;
  busy?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, block, busy, className, children, disabled, type = 'button', ...props }, ref,
) {
  return <button ref={ref} type={type} className={buttonClass(variant, size, icon, block, className)}
    disabled={disabled || busy} aria-busy={busy || undefined} {...props}>
    {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
    {children}
  </button>;
});

export function ButtonLink({ variant = 'secondary', size = 'md', className, ...props }: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, false, false, className)} {...props} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} aria-hidden="true" />;
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

export function Field({ id, label, help, error, extra, className, children }: {
  id: string; label: ReactNode; help?: ReactNode; error?: string | null; extra?: ReactNode; className?: string; children: ReactNode;
}) {
  return <div className={cn('min-w-0', className)}>
    <div className="flex min-h-[18px] flex-wrap items-center gap-x-2 gap-y-1">
      <label htmlFor={id} className="ahs-label !mb-0">{label}</label>
      {extra}
    </div>
    <div className="mt-[5px]">{children}</div>
    {error ? <p id={`${id}-error`} className="ahs-error-text" role="alert">{error}</p>
      : help ? <p id={`${id}-help`} className="ahs-help">{help}</p> : null}
  </div>;
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { small?: boolean }>(
  function TextInput({ className, small, ...props }, ref) {
    return <input ref={ref} className={cn('ahs-input', small && 'ahs-input-sm', className)} {...props} />;
  },
);

export const SelectInput = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { small?: boolean }>(
  function SelectInput({ className, small, ...props }, ref) {
    return <select ref={ref} className={cn('ahs-select', small && 'ahs-select-sm', className)} {...props} />;
  },
);

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn('ahs-textarea', className)} {...props} />;
  },
);

// ---------------------------------------------------------------------------
// Chips, pills and tags
// ---------------------------------------------------------------------------

export function Chip({ tone = 'neutral', large, className, children, title }: {
  tone?: Tone; large?: boolean; className?: string; children: ReactNode; title?: string;
}) {
  return <span className={cn('ahs-chip', `ahs-tone-${tone}`, large && 'ahs-chip-lg', className)} title={title}>{children}</span>;
}

export function StagePill({ area, stage, outcome, large, className }: {
  area: PracticeArea; stage: string; outcome?: string | null; large?: boolean; className?: string;
}) {
  const def = stageDef(area, stage);
  const label = staffStageLabel(area, stage);
  const result = stage === 'closed' && outcome ? outcomeLabel(area, outcome) : '';
  return <span className={cn('ahs-pill', `ahs-phase-${def?.phase || 'received'}`, large && 'ahs-pill-lg', className)}
    title={result ? `${label} · ${result}` : label}>
    <span>{label}{result && <span className="font-medium opacity-80"> · {result}</span>}</span>
  </span>;
}

export function ReviewPill({ status, large }: { status: ReviewStatus; large?: boolean }) {
  return <Chip tone={REVIEW_TONES[status]} large={large}>{REVIEW_LABELS[status]}</Chip>;
}

export function AreaIcon({ area, className }: { area: PracticeArea; className?: string }) {
  const Icon = area === 'ltb' ? Building2 : area === 'traffic' ? CarFront : Briefcase;
  return <Icon className={className} aria-hidden="true" />;
}

export function AreaChip({ area, className }: { area: PracticeArea; className?: string }) {
  return <span className={cn('ahs-area', `ahs-area-${area}`, className)}>
    <AreaIcon area={area} />{AREAS[area].staffLabel}
  </span>;
}

export function ReasonChips({ reasons, max = 4, attentionOnly = false, className }: {
  reasons: Reason[]; max?: number; attentionOnly?: boolean; className?: string;
}) {
  const visible = (attentionOnly ? reasons.filter(reason => reason.attention) : reasons);
  if (!visible.length) return null;
  const shown = visible.slice(0, max);
  const more = visible.length - shown.length;
  return <span className={cn('flex flex-wrap items-center gap-1', className)}>
    {shown.map(reason => <Chip key={reason.key} tone={reason.tone}>{reason.label}</Chip>)}
    {more > 0 && <Chip tone="neutral" title={visible.slice(max).map(reason => reason.label).join(', ')}>+{more}</Chip>}
  </span>;
}

export function DateChip({ keyDate, days, today, short = true, large = false }: {
  keyDate: KeyDate; days: number | null; today?: string; short?: boolean; large?: boolean;
}) {
  const tone = dateTone(days);
  const relative = relativeDays(days);
  const label = short ? KEY_DATE_SHORT[keyDate.kind] : `${keyDate.label}${keyDate.estimate ? ' (estimate)' : ''}`;
  const text = `${label} ${formatTableDate(keyDate.date, today)}${relative ? ` · ${relative}` : ''}`;
  return <span className={cn('ahs-date', `ahs-tone-${tone}`, large && 'ahs-date-lg')}
    title={`${keyDate.label}${keyDate.estimate ? ' (estimate)' : ''}: ${keyDate.date}`}>
    <CalendarClock aria-hidden="true" />{text}{keyDate.estimate && short ? <span className="sr-only"> (estimate)</span> : null}
  </span>;
}

/**
 * A file held out of the client portal (portal_visible false). Inside a link
 * (board cards and rows) it carries the explanation as a title; on the file
 * page it is focusable and shows the explanation as a tooltip.
 */
export function PortalHoldBadge({ withTooltip = false, large = false, className }: {
  withTooltip?: boolean; large?: boolean; className?: string;
}) {
  const classes = cn('ahs-chip ahs-hold', large && 'ahs-chip-lg', className);
  if (!withTooltip) {
    return <span className={classes} title={PORTAL_HOLD_HELP}><EyeOff aria-hidden="true" /><span className="truncate">{PORTAL_HOLD_LABEL}</span></span>;
  }
  return <TooltipPrimitive.Provider delayDuration={150}>
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <span className={cn(classes, 'cursor-help')} tabIndex={0}>
          <EyeOff aria-hidden="true" />{PORTAL_HOLD_LABEL}
        </span>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side="bottom" align="start" sideOffset={6} collisionPadding={12} className="ahs-tooltip">
          {PORTAL_HOLD_HELP}
          <TooltipPrimitive.Arrow className="ahs-tooltip-arrow" width={10} height={5} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  </TooltipPrimitive.Provider>;
}

export function SourceTag({ source }: { source?: FieldSource }) {
  if (!source) return null;
  const label = source.source === 'document'
    ? `From ${source.kind?.replace(/_/g, ' ') || 'document'}${source.confidence === 'low' ? ' · low confidence' : ''}`
    : source.source === 'form' ? 'Typed by client' : 'Staff';
  const tone: Tone = source.confidence === 'low' ? 'warn' : source.source === 'document' ? 'info' : source.source === 'form' ? 'gold' : 'neutral';
  return <Chip tone={tone} className="!h-[18px] !px-1.5 !text-[10.5px]">{label}</Chip>;
}

export function Toggle({ checked, onCheckedChange, disabled, label, id }: {
  checked: boolean; onCheckedChange: (checked: boolean) => void; disabled?: boolean; label?: string; id?: string;
}) {
  return <SwitchPrimitive.Root id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={label}
    className="ahs-toggle">
    <SwitchPrimitive.Thumb className="ahs-toggle-thumb" />
  </SwitchPrimitive.Root>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ahs-kbd">{children}</kbd>;
}

// ---------------------------------------------------------------------------
// Cards, skeletons and empty states
// ---------------------------------------------------------------------------

export function Card({ className, children, labelledBy, id }: { className?: string; children: ReactNode; labelledBy?: string; id?: string }) {
  return <section id={id} className={cn('ahs-card min-w-0', className)} aria-labelledby={labelledBy}>{children}</section>;
}

export function CardHead({ id, title, sub, actions, icon }: {
  id?: string; title: ReactNode; sub?: ReactNode; actions?: ReactNode; icon?: ReactNode;
}) {
  return <header className="ahs-card-head">
    <div className="flex min-w-0 items-start gap-2.5">
      {icon && <span className="mt-0.5 text-[color:var(--ah-gold-600)] [&_svg]:h-4 [&_svg]:w-4" aria-hidden="true">{icon}</span>}
      <div className="min-w-0">
        <h2 id={id} className="ahs-card-title">{title}</h2>
        {sub && <p className="ahs-card-sub">{sub}</p>}
      </div>
    </div>
    {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
  </header>;
}

export function Skeleton({ className }: { className?: string }) {
  return <span className={cn('ahs-skel', className)} aria-hidden="true" />;
}

export function EmptyState({ icon, title, children, action, compact }: {
  icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode; compact?: boolean;
}) {
  return <div className={cn('flex flex-col items-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14')} role="status">
    {icon && <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--ah-ivory-200)] text-[color:var(--ah-gold-600)] [&_svg]:h-5 [&_svg]:w-5" aria-hidden="true">{icon}</span>}
    <p className="text-[15px] font-semibold text-[color:var(--ah-ink)]">{title}</p>
    {children && <div className="mt-1.5 max-w-md text-[13px] leading-relaxed text-[color:var(--ah-muted)]">{children}</div>}
    {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
  </div>;
}

export function CrestMark({ variant = 'gold', className }: { variant?: 'gold' | 'plum'; className?: string }) {
  const base = variant === 'gold' ? '/crest-mark-gold' : '/crest-mark';
  return <picture>
    <source srcSet={`${base}.webp`} type="image/webp" />
    <img src={`${base}.png`} alt="" aria-hidden="true" className={cn('object-contain', className)} width={256} height={256} />
  </picture>;
}

// ---------------------------------------------------------------------------
// Dialogs and sheets (Radix primitives, AnderHue styling)
// ---------------------------------------------------------------------------

export function StaffDialog({ open, onOpenChange, title, description, children, footer, wide, className, onSubmit, busy }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: ReactNode; description?: ReactNode;
  children: ReactNode; footer?: ReactNode; wide?: boolean; className?: string;
  onSubmit?: () => void; busy?: boolean;
}) {
  const content = <>
    <div className="ahs-dialog-head">
      <div className="min-w-0 flex-1">
        <DialogPrimitive.Title className="ahs-dialog-title">{title}</DialogPrimitive.Title>
        {description ? <DialogPrimitive.Description className="ahs-dialog-desc">{description}</DialogPrimitive.Description>
          : <DialogPrimitive.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</DialogPrimitive.Description>}
      </div>
      <DialogPrimitive.Close className="ahs-close" aria-label="Close" disabled={busy}><X /></DialogPrimitive.Close>
    </div>
    <div className="ahs-dialog-body">{children}</div>
    {footer && <div className="ahs-dialog-foot">{footer}</div>}
  </>;
  return <DialogPrimitive.Root open={open} onOpenChange={next => { if (!busy || next) onOpenChange(next); }}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="ahs-overlay" />
      <DialogPrimitive.Content className={cn('ahs-dialog', wide && 'ahs-dialog-wide', className)}
        onInteractOutside={event => { if (busy) event.preventDefault(); }}
        onOpenAutoFocus={event => {
          // Start on the field marked data-autofocus, else the first field in the body.
          const root = event.currentTarget as HTMLElement;
          const target = root.querySelector<HTMLElement>('[data-autofocus]')
            || root.querySelector<HTMLElement>('.ahs-dialog-body input:not([type="radio"]):not([disabled]), .ahs-dialog-body select:not([disabled]), .ahs-dialog-body textarea:not([disabled])');
          if (target) { event.preventDefault(); target.focus(); }
        }}>
        {onSubmit
          ? <form className="flex min-h-0 flex-1 flex-col" noValidate
            onSubmit={event => { event.preventDefault(); if (!busy) onSubmit(); }}
            onKeyDown={event => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !busy) { event.preventDefault(); onSubmit(); }
            }}>{content}</form>
          : content}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}

export function StaffSheet({ open, onOpenChange, side = 'right', title, description, actions, children, className, hideHeader }: {
  open: boolean; onOpenChange: (open: boolean) => void; side?: 'left' | 'right'; title: ReactNode; description?: ReactNode;
  actions?: ReactNode; children: ReactNode; className?: string; hideHeader?: boolean;
}) {
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="ahs-overlay" />
      <DialogPrimitive.Content className={cn('ahs-sheet', side === 'right' ? 'ahs-sheet-right' : 'ahs-sheet-left', className)}>
        {hideHeader ? <>
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{description || (typeof title === 'string' ? title : '')}</DialogPrimitive.Description>
        </> : <div className="flex items-start gap-3 border-b border-[color:var(--ahs-line-soft)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <DialogPrimitive.Title className="truncate text-[15px] font-semibold text-[color:var(--ah-plum-950)]">{title}</DialogPrimitive.Title>
            {description ? <DialogPrimitive.Description className="mt-0.5 truncate text-[12.5px] text-[color:var(--ah-muted)]">{description}</DialogPrimitive.Description>
              : <DialogPrimitive.Description className="sr-only">{typeof title === 'string' ? title : 'Panel'}</DialogPrimitive.Description>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
          <DialogPrimitive.Close className="ahs-close !m-0" aria-label="Close"><X /></DialogPrimitive.Close>
        </div>}
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}

export function ConfirmDialog({ open, onOpenChange, title, children, confirmLabel, danger, busy, onConfirm }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; children: ReactNode;
  confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void;
}) {
  return <StaffDialog open={open} onOpenChange={onOpenChange} title={title} busy={busy} onSubmit={onConfirm}
    footer={<>
      <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Keep as is</Button>
      <Button type="submit" variant={danger ? 'danger' : 'primary'} busy={busy}>{confirmLabel}</Button>
    </>}>
    <div className="text-[13.5px] leading-relaxed text-[color:var(--ah-ink-2)]">{children}</div>
  </StaffDialog>;
}
