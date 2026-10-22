import clsx from 'clsx';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

export type SortDir = 'asc' | 'desc';

interface SortableHeaderProps<K extends string> {
  label: string;
  column: K;
  sortBy: K;
  sortDir: SortDir;
  onSort: (column: K, dir: SortDir) => void;
  className?: string;
}

/** Header tabel yang bisa diklik untuk mengurutkan (sort server-side) */
export function SortableHeader<K extends string>({ label, column, sortBy, sortDir, onSort, className }: SortableHeaderProps<K>) {
  const active = sortBy === column;
  const Icon = !active ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={clsx('px-4 py-3 text-left', className)} aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(column, active && sortDir === 'asc' ? 'desc' : 'asc')}
        className={clsx('inline-flex items-center gap-1 font-semibold hover:text-slate-900', active ? 'text-slate-900' : 'text-slate-500')}
      >
        {label}
        <Icon className={clsx('h-3.5 w-3.5', !active && 'opacity-40')} />
      </button>
    </th>
  );
}
