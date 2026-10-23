import { createElement } from 'react';
import * as ToastPrimitives from '@radix-ui/react-toast';
import { toast } from '@/hooks/use-toast';
import type { ToastActionElement } from '@/components/ui/toast';

export function notifySuccess(title: string, description?: string) {
  return toast({ title, description });
}

export function notifyError(title: string, description?: string) {
  return toast({ title, description, variant: 'destructive', duration: 8000 });
}

/** Success toast with one action button (for example Undo). */
export function notifyWithAction(input: {
  title: string; description?: string; actionLabel: string; altText: string; onAction: () => void; duration?: number;
}) {
  return toast({
    title: input.title,
    description: input.description,
    duration: input.duration ?? 15_000,
    action: createElement(ToastPrimitives.Action, {
      altText: input.altText,
      className: 'ahs-toast-action',
      onClick: input.onAction,
    }, input.actionLabel) as unknown as ToastActionElement,
  });
}
