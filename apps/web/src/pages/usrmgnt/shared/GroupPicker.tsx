import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ShieldCheck, Users } from 'lucide-react';
import { getErrorMessage } from '@/api/errors';
import { lookupsApi } from '@/api/lookups';
import { Alert } from '@/components/ui/Alert';
import { SearchInput } from '@/components/ui/SearchInput';
import { Spinner } from '@/components/ui/Spinner';
import type { LookupGroup } from '@/types/group';

/** Data pemilih group (dipakai bersama oleh halaman Group Members & Group Permissions) */
export function useGroupLookup() {
  return useQuery({ queryKey: ['lookups', 'user-groups'], queryFn: () => lookupsApi.userGroups() });
}

interface Props {
  groups: LookupGroup[] | undefined;
  isLoading: boolean;
  error: unknown;
  selectedId: string | undefined;
  onSelect: (group: LookupGroup) => void;
}

/** Panel kiri: filter aplikasi + pencarian + daftar group dikelompokkan per aplikasi */
export function GroupPicker({ groups, isLoading, error, selectedId, onSelect }: Props) {
  const [search, setSearch] = useState('');
  const [appId, setAppId] = useState('');

  const apps = useMemo(() => {
    const map = new Map<string, { id: string; code: string; name: string }>();
    (groups ?? []).forEach((g) => map.set(g.application_id, { id: g.application_id, code: g.app_code, name: g.app_name }));
    return [...map.values()];
  }, [groups]);

  const sections = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = (groups ?? []).filter(
      (g) =>
        (!appId || g.application_id === appId) &&
        (!term || g.code.toLowerCase().includes(term) || g.name.toLowerCase().includes(term)),
    );
    return apps
      .map((a) => ({ app: a, items: list.filter((g) => g.application_id === a.id) }))
      .filter((s) => s.items.length > 0);
  }, [groups, apps, appId, search]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="space-y-2 border-b border-slate-200 p-4">
        <select
          aria-label="Filter aplikasi group"
          value={appId}
          onChange={(e) => setAppId(e.target.value)}
          className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">Semua aplikasi</option>
          {apps.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.code})
            </option>
          ))}
        </select>
        <SearchInput value={search} onChange={setSearch} placeholder="Cari group..." label="Cari group" />
      </div>
      <div className="max-h-[calc(100vh-18rem)] overflow-y-auto p-2">
        {isLoading && (
          <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
            <Spinner className="h-4 w-4" /> Memuat group...
          </div>
        )}
        {!!error && <Alert variant="error">{getErrorMessage(error)}</Alert>}
        {groups && sections.length === 0 && <p className="p-4 text-sm text-slate-500">Tidak ada group yang cocok.</p>}
        <nav aria-label="Daftar group">
          {sections.map(({ app, items }) => (
            <div key={app.id} className="mb-2">
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {app.name} <span className="font-mono">({app.code})</span>
              </p>
              <ul className="space-y-0.5">
                {items.map((g) => {
                  const active = g.id === selectedId;
                  return (
                    <li key={g.id}>
                      <button
                        type="button"
                        aria-current={active ? 'true' : undefined}
                        onClick={() => onSelect(g)}
                        className={clsx(
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                          active ? 'bg-brand-50 ring-1 ring-inset ring-brand-200' : 'hover:bg-slate-50',
                        )}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                          <ShieldCheck className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={clsx('block truncate text-sm font-medium', g.is_active ? 'text-slate-900' : 'text-slate-500')}>
                            {g.name}
                          </span>
                          <span className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="font-mono">{g.code}</span>
                            {!g.is_active && <span className="rounded bg-slate-100 px-1 text-[10px]">nonaktif</span>}
                          </span>
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-400" title={`${g.member_count} anggota`}>
                          <Users className="h-3.5 w-3.5" />
                          {g.member_count}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </section>
  );
}
