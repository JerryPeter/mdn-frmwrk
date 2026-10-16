import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronDown, Home } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { useMenus } from '@/hooks/useAuth';
import { getErrorMessage } from '@/api/errors';
import { resolveIcon } from '@/lib/icons';
import type { MenuNode } from '@/types/auth';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  clsx(
    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
    isActive ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  );

/** Hanya menu is_visible = true yang tampil; menu tersembunyi tetap bisa diakses via route (FR-AUTH-04) */
function visibleChildren(nodes: MenuNode[] = []): MenuNode[] {
  return nodes.filter((n) => n.is_visible && (n.menu_type === 'PAGE' ? !!n.route_path : visibleChildren(n.children).length > 0));
}

function MenuGroup({ node, depth, onNavigate }: { node: MenuNode; depth: number; onNavigate?: () => void }) {
  const [open, setOpen] = useState(true);
  const Icon = resolveIcon(node.icon);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600"
        aria-expanded={open}
      >
        {depth === 0 && <Icon className="h-4 w-4" />}
        <span className="flex-1 text-left">{node.menu_name}</span>
        <ChevronDown className={clsx('h-3.5 w-3.5 transition-transform', !open && '-rotate-90')} />
      </button>
      {open && <MenuList nodes={node.children} depth={depth + 1} onNavigate={onNavigate} />}
    </li>
  );
}

function MenuList({ nodes, depth, onNavigate }: { nodes?: MenuNode[]; depth: number; onNavigate?: () => void }) {
  return (
    <ul className={clsx('space-y-0.5', depth > 0 && 'ml-3 border-l border-slate-200 pl-2')}>
      {visibleChildren(nodes).map((n) =>
        n.menu_type === 'GROUP' ? (
          <MenuGroup key={n.menu_code} node={n} depth={depth} onNavigate={onNavigate} />
        ) : (
          <li key={n.menu_code}>
            <NavLink to={n.route_path!} className={linkClass} onClick={onNavigate}>
              {n.menu_name}
            </NavLink>
          </li>
        ),
      )}
    </ul>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { data, isLoading, error } = useMenus();
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Menu utama">
      <NavLink to="/" end className={linkClass} onClick={onNavigate}>
        <Home className="h-4 w-4" /> Beranda
      </NavLink>
      <div className="mt-3">
        {isLoading && (
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400">
            <Spinner className="h-4 w-4" /> Memuat menu...
          </div>
        )}
        {error && <p className="px-3 py-2 text-sm text-red-600">{getErrorMessage(error)}</p>}
        {data && data.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">Tidak ada menu yang dapat diakses.</p>}
        {data && <MenuList nodes={data} depth={0} onNavigate={onNavigate} />}
      </div>
    </nav>
  );
}
