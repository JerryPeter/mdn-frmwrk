import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { FullPageSpinner, Spinner } from '@/components/ui/Spinner';
import { usePermissionSet } from '@/hooks/useAuth';
import ForbiddenPage from '@/pages/system/ForbiddenPage';
import { useSession } from '@/stores/session';

/** Wajib login. Menyimpan path asal agar bisa kembali setelah login. */
export function RequireAuth() {
  const status = useSession((s) => s.status);
  const location = useLocation();
  if (status === 'loading') return <FullPageSpinner label="Memulihkan sesi..." />;
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

/** BR-17: user dengan must_change_password hanya boleh ke /change-password */
export function RequirePasswordChanged() {
  const mustChange = useSession((s) => s.user?.must_change_password);
  const location = useLocation();
  if (mustChange) return <Navigate to="/change-password" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Wajib memiliki konteks aktif (company + aplikasi) */
export function RequireContext() {
  const ctx = useSession((s) => s.activeContext);
  const location = useLocation();
  if (!ctx) return <Navigate to="/select-context" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** FR-AUTHZ-03: halaman tanpa permission READ → tampilkan 403 */
export function RequireMenuAccess({ menuCode, children }: { menuCode: string; children: ReactNode }) {
  const { data, isLoading } = usePermissionSet();
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-slate-500">
        <Spinner /> Memeriksa hak akses...
      </div>
    );
  }
  if (!data?.has(`${menuCode}:READ`)) return <ForbiddenPage embedded />;
  return <>{children}</>;
}
