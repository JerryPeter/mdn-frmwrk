import { useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { ArrowLeftRight, Building2, Menu, X } from 'lucide-react';
import clsx from 'clsx';
import { resolveIcon } from '@/lib/icons';
import { useSession } from '@/stores/session';
import { Sidebar } from './Sidebar';
import { UserMenu } from './UserMenu';

export function AppLayout() {
  const ctx = useSession((s) => s.activeContext);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const AppIcon = resolveIcon(ctx?.app_icon);

  const brand = (
    <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
        <AppIcon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{ctx?.app_name ?? ctx?.app_code}</p>
        <p className="text-xs text-slate-500">MODENA Framework</p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        {brand}
        <Sidebar />
      </aside>

      {/* Sidebar tablet/mobile (drawer) */}
      <div className={clsx('fixed inset-0 z-40 lg:hidden', !drawerOpen && 'pointer-events-none')}>
        <div
          className={clsx('absolute inset-0 bg-slate-900/40 transition-opacity', drawerOpen ? 'opacity-100' : 'opacity-0')}
          onClick={() => setDrawerOpen(false)}
        />
        <aside
          className={clsx(
            'absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl transition-transform',
            drawerOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <button
            className="absolute right-3 top-5 rounded-md p-1 text-slate-400 hover:bg-slate-100"
            onClick={() => setDrawerOpen(false)}
            aria-label="Tutup menu"
          >
            <X className="h-5 w-5" />
          </button>
          {brand}
          <Sidebar onNavigate={() => setDrawerOpen(false)} />
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Buka menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="hidden font-semibold text-slate-900 sm:inline">{ctx?.app_name ?? ctx?.app_code}</span>
            <span className="hidden text-slate-300 sm:inline">/</span>
            <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{ctx?.company_name ?? ctx?.company_code}</span>
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/select-context"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              title="Ganti company / aplikasi"
            >
              <ArrowLeftRight className="h-4 w-4" />
              <span className="hidden sm:inline">Ganti konteks</span>
            </Link>
            <UserMenu />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
