import * as ToastPrimitives from '@radix-ui/react-toast';
import { X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/** Toast stack for the staff workspace: bottom right on desktop, bottom on phones. */
export default function StaffToaster() {
  const { toasts } = useToast();
  return <ToastPrimitives.Provider swipeDirection="right" duration={6000} label="Notifications">
    {toasts.map(({ id, title, description, action, variant, className: _className, ...props }) =>
      <ToastPrimitives.Root key={id} {...props} className="ahs-toast" data-variant={variant || 'default'}>
        <div className="min-w-0 flex-1">
          {title && <ToastPrimitives.Title className="ahs-toast-title">{title}</ToastPrimitives.Title>}
          {description && <ToastPrimitives.Description className="ahs-toast-desc">{description}</ToastPrimitives.Description>}
        </div>
        {action}
        <ToastPrimitives.Close className="ahs-toast-close" aria-label="Dismiss notification">
          <X className="h-4 w-4" aria-hidden="true" />
        </ToastPrimitives.Close>
      </ToastPrimitives.Root>)}
    <ToastPrimitives.Viewport className="fixed bottom-0 right-0 z-[100] m-0 flex w-full list-none flex-col gap-2 p-3 outline-none sm:bottom-5 sm:right-5 sm:max-w-[420px] sm:p-0" />
  </ToastPrimitives.Provider>;
}
