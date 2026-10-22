import clsx from 'clsx';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useToastStore, type ToastVariant } from '@/stores/toast';

const STYLES: Record<ToastVariant, { box: string; Icon: typeof Info }> = {
  success: { box: 'border-emerald-200 text-emerald-800', Icon: CheckCircle2 },
  error: { box: 'border-red-200 text-red-800', Icon: XCircle },
  info: { box: 'border-sky-200 text-sky-800', Icon: Info },
};

export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2" aria-live="polite">
      {toasts.map((t) => {
        const { box, Icon } = STYLES[t.variant];
        return (
          <div
            key={t.id}
            className={clsx('pointer-events-auto flex items-start gap-3 rounded-lg border bg-white p-3 text-sm shadow-lg', box)}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="flex-1 text-slate-700">{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-slate-600" aria-label="Tutup">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
