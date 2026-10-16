import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeft, Building2, ChevronRight, LogOut } from 'lucide-react';
import { getErrorMessage } from '@/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useContexts, useSessionActions } from '@/hooks/useAuth';
import { AuthLayout } from '@/layouts/AuthLayout';
import { resolveIcon } from '@/lib/icons';
import { useSession } from '@/stores/session';
import { toast } from '@/stores/toast';
import type { AccessContext } from '@/types/auth';

export default function SelectContextPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const user = useSession((s) => s.user);
  const active = useSession((s) => s.activeContext);
  const { data: contexts, isLoading, error, refetch } = useContexts();
  const { selectContext, logout } = useSessionActions();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const autoSelected = useRef(false);

  const grouped = useMemo(() => {
    const map = new Map<string, { code: string; name: string; apps: AccessContext[] }>();
    for (const c of contexts ?? []) {
      const g = map.get(c.company_id) ?? { code: c.company_code, name: c.company_name ?? c.company_code, apps: [] };
      g.apps.push(c);
      map.set(c.company_id, g);
    }
    return [...map.values()];
  }, [contexts]);

  const choose = async (ctx: AccessContext) => {
    setPendingKey(`${ctx.company_id}|${ctx.application_id}`);
    try {
      const switching = !!active;
      await selectContext(ctx);
      if (switching) toast.success(`Beralih ke ${ctx.app_name ?? ctx.app_code} · ${ctx.company_code}`);
      // Saat berganti konteks, halaman sebelumnya belum tentu tersedia → ke beranda
      navigate(switching ? '/' : from || '/', { replace: true });
    } catch (err) {
      toast.error(getErrorMessage(err));
      setPendingKey(null);
    }
  };

  // FR-AUTH-03: bila hanya ada satu konteks, pilih otomatis
  useEffect(() => {
    if (!autoSelected.current && !active && contexts?.length === 1) {
      autoSelected.current = true;
      void choose(contexts[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contexts, active]);

  return (
    <AuthLayout wide>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          {active && (
            <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
              <ArrowLeft className="h-4 w-4" /> Kembali ke aplikasi
            </Link>
          )}
          <h1 className="text-2xl font-semibold text-slate-900">Pilih company dan aplikasi</h1>
          <p className="mt-1 text-sm text-slate-500">
            Halo, <span className="font-medium text-slate-700">{user?.full_name}</span>. Pilih konteks kerja Anda.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await logout();
            navigate('/login', { replace: true });
          }}
        >
          <LogOut className="h-4 w-4" /> Keluar
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
          <Spinner /> Memuat akses...
        </div>
      )}

      {error && (
        <Alert variant="error" title="Gagal memuat daftar akses">
          {getErrorMessage(error)}{' '}
          <button className="font-medium underline" onClick={() => refetch()}>
            Coba lagi
          </button>
        </Alert>
      )}

      {contexts && contexts.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <Building2 className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 font-medium text-slate-800">Anda belum memiliki akses</p>
          <p className="mt-1 text-sm text-slate-500">
            Akun Anda belum terdaftar di group mana pun. Hubungi administrator untuk mendapatkan akses.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {grouped.map((company) => (
          <section key={company.code} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <header className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{company.name}</p>
                <p className="text-xs text-slate-500">{company.code}</p>
              </div>
            </header>
            <ul className="space-y-2">
              {company.apps.map((ctx) => {
                const key = `${ctx.company_id}|${ctx.application_id}`;
                const Icon = resolveIcon(ctx.app_icon);
                const isActive = active?.company_id === ctx.company_id && active?.application_id === ctx.application_id;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      disabled={!!pendingKey}
                      onClick={() => choose(ctx)}
                      className={clsx(
                        'group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition',
                        isActive
                          ? 'border-brand-300 bg-brand-50'
                          : 'border-slate-200 hover:border-brand-300 hover:bg-brand-50/50',
                        'disabled:cursor-wait disabled:opacity-70',
                      )}
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{ctx.app_name ?? ctx.app_code}</p>
                        <p className="text-xs text-slate-500">
                          {ctx.app_code}
                          {isActive && <span className="ml-2 font-medium text-brand-700">· Sedang aktif</span>}
                        </p>
                      </div>
                      {pendingKey === key ? (
                        <Spinner className="h-4 w-4 text-brand-600" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </AuthLayout>
  );
}
