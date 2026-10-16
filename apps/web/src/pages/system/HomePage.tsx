import { Link } from 'react-router-dom';
import { ArrowRight, Building2 } from 'lucide-react';
import { getErrorMessage } from '@/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { useMenus } from '@/hooks/useAuth';
import { resolveIcon } from '@/lib/icons';
import { useSession } from '@/stores/session';
import type { MenuNode } from '@/types/auth';

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('id-ID', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Jakarta' }).format(new Date()));
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

function visiblePages(nodes: MenuNode[] = []): MenuNode[] {
  return nodes.flatMap((n) =>
    n.menu_type === 'PAGE' ? (n.is_visible && n.route_path && !n.route_path.includes(':') ? [n] : []) : visiblePages(n.children),
  );
}

export default function HomePage() {
  const user = useSession((s) => s.user);
  const ctx = useSession((s) => s.activeContext);
  const { data: menus, isLoading, error } = useMenus();

  return (
    <div className="mx-auto max-w-5xl">
      <div className="rounded-2xl bg-gradient-to-r from-brand-700 to-brand-900 p-6 text-white sm:p-8">
        <p className="text-sm text-brand-200">{greeting()},</p>
        <h1 className="mt-1 text-2xl font-semibold">{user?.full_name}</h1>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm ring-1 ring-white/20">
          <Building2 className="h-4 w-4" />
          {ctx?.company_name ?? ctx?.company_code} · {ctx?.app_name ?? ctx?.app_code}
        </div>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Menu yang dapat Anda akses</h2>

      {isLoading && (
        <div className="flex items-center gap-2 py-10 text-slate-500">
          <Spinner /> Memuat menu...
        </div>
      )}
      {error && <Alert variant="error">{getErrorMessage(error)}</Alert>}

      {menus && (
        <div className="space-y-6">
          {menus.map((group) => {
            const pages = group.menu_type === 'PAGE' ? visiblePages([group]) : visiblePages(group.children);
            if (!pages.length) return null;
            const Icon = resolveIcon(group.icon);
            return (
              <section key={group.menu_code}>
                <p className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Icon className="h-4 w-4 text-slate-400" /> {group.menu_name}
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {pages.map((p) => (
                    <Link
                      key={p.menu_code}
                      to={p.route_path!}
                      className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:border-brand-300 hover:shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-slate-900">{p.menu_name}</p>
                        <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
                      </div>
                      <p className="mt-2 flex flex-wrap gap-1">
                        {(p.actions ?? []).map((a) => (
                          <span key={a} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                            {a}
                          </span>
                        ))}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
