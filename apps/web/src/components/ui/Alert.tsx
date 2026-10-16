import type { ReactNode } from 'react';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

type Variant = 'error' | 'warning' | 'success' | 'info';

const STYLES: Record<Variant, { box: string; Icon: typeof Info }> = {
  error: { box: 'border-red-200 bg-red-50 text-red-800', Icon: XCircle },
  warning: { box: 'border-amber-200 bg-amber-50 text-amber-800', Icon: AlertTriangle },
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-800', Icon: CheckCircle2 },
  info: { box: 'border-sky-200 bg-sky-50 text-sky-800', Icon: Info },
};

export function Alert({ variant = 'info', title, children }: { variant?: Variant; title?: string; children?: ReactNode }) {
  const { box, Icon } = STYLES[variant];
  return (
    <div role={variant === 'error' ? 'alert' : 'status'} className={clsx('flex gap-3 rounded-lg border p-3 text-sm', box)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={clsx(title && 'mt-0.5')}>{children}</div>}
      </div>
    </div>
  );
}
