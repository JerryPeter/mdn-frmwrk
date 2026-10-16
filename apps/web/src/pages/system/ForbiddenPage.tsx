import { Link } from 'react-router-dom';
import { ShieldX } from 'lucide-react';
import { StatusPage } from './StatusPage';

export default function ForbiddenPage({ embedded = false }: { embedded?: boolean }) {
  return (
    <StatusPage
      embedded={embedded}
      code="403"
      icon={<ShieldX className="h-8 w-8" />}
      title="Akses ditolak"
      message="Anda tidak memiliki izin untuk membuka halaman ini pada company dan aplikasi yang sedang aktif."
      actions={
        <>
          <Link to="/" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Ke beranda
          </Link>
          <Link
            to="/select-context"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Ganti konteks
          </Link>
        </>
      }
    />
  );
}
