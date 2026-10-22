import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { X } from 'lucide-react';

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Cegah tutup lewat Esc/klik luar saat proses berjalan */
  busy?: boolean;
}

function useEscape(open: boolean, onClose: () => void, busy?: boolean) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    document.addEventListener('keydown', handler);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, busy]);
}

/** Dialog di tengah layar (konfirmasi, form pendek) */
export function Modal({ open, onClose, title, description, children, footer, busy, wide }: OverlayProps & { wide?: boolean }) {
  useEscape(open, onClose, busy);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => !busy && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        className={clsx('relative max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-xl', wide ? 'max-w-2xl' : 'max-w-md')}
      >
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {description && <div className="mt-2 text-sm text-slate-600">{description}</div>}
        {children}
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Panel geser dari kanan (form tambah/ubah, detail) */
export function Drawer({ open, onClose, title, description, children, footer, busy, wide }: OverlayProps & { wide?: boolean }) {
  useEscape(open, onClose, busy);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={() => !busy && onClose()} />
      <aside
        role="dialog"
        aria-modal="true"
        className={clsx('absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-xl', wide ? 'max-w-2xl' : 'max-w-lg')}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">{footer}</footer>}
      </aside>
    </div>,
    document.body,
  );
}
