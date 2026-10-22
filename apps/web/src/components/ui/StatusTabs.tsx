import clsx from 'clsx';

export type StatusFilter = 'all' | 'active' | 'inactive';

const TABS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'Semua' },
  { key: 'active', label: 'Aktif' },
  { key: 'inactive', label: 'Nonaktif' },
];

/** Filter status Semua / Aktif / Nonaktif untuk tabel master */
export function StatusTabs({ value, onChange }: { value: StatusFilter; onChange: (value: StatusFilter) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="tablist" aria-label="Filter status">
      {TABS.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={clsx(
            'rounded-md px-3 py-1.5 text-sm transition',
            value === t.key ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Ubah filter tab menjadi parameter `is_active` API */
export const statusToParam = (s: StatusFilter) => (s === 'all' ? undefined : s === 'active');
