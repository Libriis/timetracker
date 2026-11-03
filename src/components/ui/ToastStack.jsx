import { Toaster as SonnerToaster, toast } from 'sonner';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

// Toasts (sonner). Mount <ToastStack /> once; call notify(msg, 'ok' | 'err' | 'info') anywhere.
export function notify(msg, type = 'info') {
  if (type === 'ok') return toast.success(msg);
  if (type === 'err') return toast.error(msg);
  return toast(msg);
}

export function ToastStack({ theme = 'light' }) {
  return (
    <SonnerToaster position="bottom-right" theme={theme} duration={4200} gap={8} visibleToasts={4}
      icons={{
        success: <CheckCircle2 className="size-4 text-free-text" />,
        error: <AlertCircle className="size-4 text-danger-text" />,
        info: <Info className="size-4 text-fg-subtle" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: 'pointer-events-auto flex w-[360px] max-w-[calc(100vw-32px)] items-start gap-2.5 rounded-xl border border-line bg-surface-raised px-4 py-3 text-sm text-fg shadow-lg',
          title: 'leading-5',
          description: 'text-fg-subtle',
          icon: 'mt-0.5 flex shrink-0',
          success: '',
          error: 'border-danger/30',
        },
      }} />
  );
}
