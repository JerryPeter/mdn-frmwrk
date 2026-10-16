import type { ReactNode } from 'react';
import clsx from 'clsx';

interface StatusPageProps {
  code: string;
  icon: ReactNode;
  title: string;
  message: string;
  actions?: ReactNode;
  /** true bila dirender di dalam AppLayout (tanpa layar penuh) */
  embedded?: boolean;
}

export function StatusPage({ code, icon, title, message, actions, embedded }: StatusPageProps) {
  return (
    <div className={clsx('flex items-center justify-center px-4', embedded ? 'py-20' : 'min-h-screen bg-slate-50')}>
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
          {icon}
        </div>
        <p className="mt-5 text-sm font-semibold text-brand-600">{code}</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">{message}</p>
        {actions && <div className="mt-6 flex justify-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
