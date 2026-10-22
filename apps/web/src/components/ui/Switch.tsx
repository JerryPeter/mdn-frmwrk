import clsx from 'clsx';
import { Spinner } from './Spinner';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  loading?: boolean;
  title?: string;
}

/** Toggle on/off (role="switch"); `label` dipakai sebagai label aksesibilitas */
export function Switch({ checked, onChange, label, disabled, loading, title }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled || loading}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
        checked ? 'bg-brand-600' : 'bg-slate-300',
        (disabled || loading) && 'cursor-not-allowed opacity-50',
      )}
    >
      <span
        className={clsx(
          'inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      >
        {loading && <Spinner className="h-3 w-3 text-slate-400" />}
      </span>
    </button>
  );
}
