import clsx from 'clsx';

type Status = 'active' | 'inactive' | 'deleted' | 'locked';

const STYLES: Record<Status, { label: string; className: string }> = {
  active: { label: 'Aktif', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  inactive: { label: 'Nonaktif', className: 'bg-slate-100 text-slate-600 ring-slate-200' },
  deleted: { label: 'Terhapus', className: 'bg-red-50 text-red-700 ring-red-200' },
  locked: { label: 'Terkunci', className: 'bg-amber-50 text-amber-800 ring-amber-200' },
};

export function StatusBadge({ status }: { status: Status }) {
  const { label, className } = STYLES[status];
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', className)}>
      {label}
    </span>
  );
}

/** Status baris berdasarkan audit field standar */
export function rowStatus(row: { is_active: boolean; is_deleted: boolean }): Status {
  if (row.is_deleted) return 'deleted';
  return row.is_active ? 'active' : 'inactive';
}
