import { Link } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import { StatusPage } from './StatusPage';

export default function NotFoundPage({ embedded = false }: { embedded?: boolean }) {
  return (
    <StatusPage
      embedded={embedded}
      code="404"
      icon={<FileQuestion className="h-8 w-8" />}
      title="Halaman tidak ditemukan"
      message="Alamat yang Anda buka tidak tersedia atau sudah dipindahkan."
      actions={
        <Link to="/" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Ke beranda
        </Link>
      }
    />
  );
}
