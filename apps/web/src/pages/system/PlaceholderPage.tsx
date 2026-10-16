import { useLocation } from 'react-router-dom';
import { CheckCircle2, Construction, Download, Pencil, Plus, Printer, Stamp, Trash2, Upload } from 'lucide-react';
import { PermissionGate } from '@/components/PermissionGate';
import { Button } from '@/components/ui/Button';
import { usePermissionSet } from '@/hooks/useAuth';
import { matchRoutePath } from '@/lib/menu';
import { pageRoutes } from '@/routes/registry';

/** Tombol standar dan action yang dibutuhkan (FR-AUTHZ-03) */
const TOOLBAR = [
  { action: 'CREATE', label: 'Tambah', Icon: Plus, variant: 'primary' as const },
  { action: 'UPDATE', label: 'Ubah', Icon: Pencil, variant: 'secondary' as const },
  { action: 'DELETE', label: 'Hapus', Icon: Trash2, variant: 'secondary' as const },
  { action: 'APPROVE', label: 'Approve', Icon: Stamp, variant: 'secondary' as const },
  { action: 'PRINT', label: 'Cetak', Icon: Printer, variant: 'secondary' as const },
  { action: 'EXPORT_EXCEL', label: 'Export', Icon: Download, variant: 'secondary' as const },
  { action: 'IMPORT_EXCEL', label: 'Import', Icon: Upload, variant: 'secondary' as const },
];

/**
 * Halaman sementara untuk menu yang belum dibangun. Menampilkan permission
 * yang dimiliki user pada menu ini sehingga alur hak akses dapat diverifikasi.
 */
export default function PlaceholderPage() {
  const { pathname } = useLocation();
  const route = pageRoutes.find((r) => matchRoutePath(r.path, pathname));
  const { data: perms } = usePermissionSet();
  if (!route) return null;

  const granted = [...(perms ?? [])]
    .filter((k) => k.startsWith(`${route.menuCode}:`))
    .map((k) => k.split(':')[1]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{route.menuCode}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{route.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {TOOLBAR.map(({ action, label, Icon, variant }) => (
            <PermissionGate key={action} menu={route.menuCode} action={action}>
              <Button variant={variant} size="sm" disabled title="Fitur dikerjakan pada tahap berikutnya">
                <Icon className="h-4 w-4" /> {label}
              </Button>
            </PermissionGate>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <Construction className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-3 font-medium text-slate-800">Halaman sedang dalam pengembangan</p>
        <p className="mt-1 text-sm text-slate-500">
          Struktur, routing, dan hak akses halaman ini sudah aktif. Isi halaman akan dibangun pada tahap berikutnya.
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-sm font-medium text-slate-800">Hak akses Anda pada menu ini</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {granted.map((a) => (
            <span
              key={a}
              className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> {a}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
