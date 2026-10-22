import clsx from 'clsx';
import type { MembershipStatus } from '@/types/user';

const STYLES: Record<MembershipStatus, { label: string; className: string; hint: string }> = {
  active: { label: 'Berlaku', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200', hint: 'Hak akses sedang berlaku' },
  upcoming: { label: 'Belum berlaku', className: 'bg-sky-50 text-sky-700 ring-sky-200', hint: 'Berlaku mulai belum tercapai' },
  expired: { label: 'Kedaluwarsa', className: 'bg-slate-100 text-slate-600 ring-slate-200', hint: 'Berlaku sampai sudah lewat' },
  inactive: { label: 'Nonaktif', className: 'bg-slate-100 text-slate-600 ring-slate-200', hint: 'Keanggotaan dinonaktifkan' },
  suspended: {
    label: 'Tidak berlaku',
    className: 'bg-amber-50 text-amber-800 ring-amber-200',
    hint: 'User, group, company, atau aplikasinya sedang nonaktif/terkunci',
  },
};

/** Status keanggotaan group (BR-10) */
export function MembershipStatusBadge({ status }: { status: MembershipStatus }) {
  const s = STYLES[status];
  return (
    <span title={s.hint} className={clsx('inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', s.className)}>
      {s.label}
    </span>
  );
}
