import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AppWindow, ChevronRight, ChevronsDownUp, ChevronsUpDown, EyeOff, FolderTree, RotateCcw, Save, ShieldCheck, Users } from 'lucide-react';
import { getErrorMessage } from '@/api/errors';
import { lookupsApi } from '@/api/lookups';
import { userGroupsApi } from '@/api/userGroups';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { Spinner } from '@/components/ui/Spinner';
import { usePermission } from '@/hooks/usePermission';
import { toast } from '@/stores/toast';
import type { LookupGroup, MatrixAction, MatrixRow, PermissionMatrix } from '@/types/group';
import { useGroupLookup } from '../shared/GroupPicker';

const MENU = 'UM_GROUP_PERM';

/** Sama dengan backend: SUPER_ADMIN wajib tetap memiliki permission ini */
const SUPER_ADMIN_REQUIRED = new Set(['UM_GROUP_PERM:READ', 'UM_GROUP_PERM:UPDATE']);

type CheckState = boolean | 'mixed';

/** Checkbox dengan dukungan indeterminate (sebagian tercentang) */
function Checkbox({
  state,
  onChange,
  disabled,
  label,
  title,
}: {
  state: CheckState;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  title?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'mixed';
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      title={title ?? label}
      checked={state === true}
      disabled={disabled}
      onChange={(e) => onChange(state === 'mixed' ? true : e.target.checked)}
      className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}

const stateOf = (ids: string[], selected: Set<string>): CheckState => {
  if (!ids.length) return false;
  const n = ids.filter((id) => selected.has(id)).length;
  return n === 0 ? false : n === ids.length ? true : 'mixed';
};

/** Tombol buka/tutup baris bertingkat */
function Toggle({ open, onClick, label, hidden }: { open: boolean; onClick: () => void; label: string; hidden?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={hidden}
      aria-expanded={open}
      aria-label={`${open ? 'Tutup' : 'Buka'} ${label}`}
      className={clsx('rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700', hidden && 'invisible')}
    >
      <ChevronRight className={clsx('h-4 w-4 transition-transform', open && 'rotate-90')} />
    </button>
  );
}

/** Indentasi per layer: aplikasi 0, group 1, menu 2+ (mengikuti pohon menu), action paling dalam */
const indent = (level: number) => ({ paddingLeft: `${0.75 + level * 1.5}rem` });

/** Seluruh baris turunan sebuah menu (berdasarkan urutan pohon & level) */
function descendants(rows: MatrixRow[], index: number) {
  const out: MatrixRow[] = [];
  for (let i = index + 1; i < rows.length && rows[i].level > rows[index].level; i++) out.push(rows[i]);
  return out;
}

const initialSet = (m: PermissionMatrix) =>
  new Set(m.rows.flatMap((r) => r.cells.filter((c) => c.granted).map((c) => c.menu_action_id)));

// ---------------------------------------------------------------------
// Layer 2–4: group → menu → action
// ---------------------------------------------------------------------
interface GroupBlockProps {
  group: LookupGroup;
  open: boolean;
  onToggle: () => void;
  canUpdate: boolean;
  /** Draft permission (menu_action_id); disimpan di halaman agar tidak hilang saat baris ditutup */
  draft: Set<string> | undefined;
  onDraftChange: (draft: Set<string> | undefined) => void;
  expandAllActions: boolean;
}

function GroupBlock({ group, open, onToggle, canUpdate, draft, onDraftChange, expandAllActions }: GroupBlockProps) {
  const qc = useQueryClient();
  const { data: matrix, isLoading, error, refetch } = useQuery({
    queryKey: ['group-permissions', group.id],
    queryFn: () => userGroupsApi.permissions(group.id),
    enabled: open || !!draft,
  });

  const initial = useMemo(() => (matrix ? initialSet(matrix) : new Set<string>()), [matrix]);
  const selected = draft ?? initial;
  const actionsByCode = useMemo(() => new Map<string, MatrixAction>((matrix?.actions ?? []).map((a) => [a.action_code, a])), [matrix]);

  // SUPER_ADMIN wajib mempertahankan UM_GROUP_PERM READ/UPDATE
  const locked = useMemo(() => {
    const ids = new Set<string>();
    if (matrix?.group.is_protected) {
      matrix.rows.forEach((r) =>
        r.cells.forEach((c) => SUPER_ADMIN_REQUIRED.has(`${r.menu_code}:${c.action_code}`) && ids.add(c.menu_action_id)),
      );
    }
    return ids;
  }, [matrix]);

  const editable = (rows: MatrixRow[]) => rows.flatMap((r) => r.cells.map((c) => c.menu_action_id)).filter((id) => !locked.has(id));

  const toggle = (ids: string[], checked: boolean) => {
    const next = new Set(selected);
    ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
    const same = next.size === initial.size && [...next].every((id) => initial.has(id));
    onDraftChange(same ? undefined : next);
  };

  const added = [...selected].filter((id) => !initial.has(id)).length;
  const removed = [...initial].filter((id) => !selected.has(id)).length;
  const dirty = added + removed > 0;

  const mutation = useMutation({
    mutationFn: () => userGroupsApi.savePermissions(group.id, [...selected]),
    onSuccess: (res) => {
      const c = res.changes ?? { added: 0, removed: 0 };
      toast.success(`Permission ${group.code} disimpan: ${c.added} ditambah, ${c.removed} dilepas`);
      qc.setQueryData(['group-permissions', group.id], res);
      onDraftChange(undefined);
      void qc.invalidateQueries({ queryKey: ['user-groups'] });
      // Bila Anda anggota group ini, menu & permission sesi ikut dimuat ulang (BR-22)
      void qc.invalidateQueries({ queryKey: ['auth'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // Layer 4 dibuka per menu halaman; "Tampilkan semua action" membuka seluruhnya
  const [openMenus, setOpenMenus] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!matrix) return;
    setOpenMenus(expandAllActions ? new Set(matrix.rows.filter((r) => r.cells.length).map((r) => r.menu_id)) : new Set());
  }, [expandAllActions, matrix]);
  const toggleMenu = (id: string) =>
    setOpenMenus((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const readOnly = !canUpdate;

  return (
    <>
      {/* Layer 2: group */}
      <tr className={clsx('border-b border-slate-100', open ? 'bg-brand-50/40' : 'hover:bg-slate-50')} data-testid={`group-${group.code}`}>
        <td className="py-2.5 pr-3" style={indent(1)}>
          <div className="flex items-center gap-2">
            <Toggle open={open} onClick={onToggle} label={`group ${group.name}`} />
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <button type="button" onClick={onToggle} className="min-w-0 text-left">
              <span className={clsx('block truncate font-medium', group.is_active ? 'text-slate-900' : 'text-slate-500')}>{group.name}</span>
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="font-mono">{group.code}</span>
                {!group.is_active && <span className="rounded bg-slate-100 px-1 text-[10px]">nonaktif</span>}
                {matrix?.group.is_protected && <span className="rounded bg-brand-50 px-1 text-[10px] font-medium text-brand-700">inti</span>}
              </span>
            </button>
          </div>
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1" title="Anggota terdampak">
            <Users className="h-3.5 w-3.5" /> {group.member_count} anggota
          </span>
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">
          {matrix ? (
            <>
              <span className="font-medium text-slate-800">{selected.size}</span> dari {matrix.summary.available} permission
            </>
          ) : (
            <span className="text-slate-400">Buka untuk melihat</span>
          )}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center justify-end gap-2">
            {dirty && (
              <span className="whitespace-nowrap rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800" data-testid={`pending-${group.code}`}>
                Belum disimpan: +{added} / −{removed}
              </span>
            )}
            {canUpdate && dirty && (
              <>
                <Button variant="secondary" size="sm" onClick={() => onDraftChange(undefined)} disabled={mutation.isPending}>
                  <RotateCcw className="h-3.5 w-3.5" /> Batal
                </Button>
                <Button size="sm" onClick={() => mutation.mutate()} loading={mutation.isPending}>
                  <Save className="h-3.5 w-3.5" /> Simpan
                </Button>
              </>
            )}
          </div>
        </td>
      </tr>

      {open && isLoading && (
        <tr className="border-b border-slate-100">
          <td colSpan={4} className="py-3 text-sm text-slate-500" style={indent(2)}>
            <span className="inline-flex items-center gap-2">
              <Spinner className="h-4 w-4" /> Memuat permission...
            </span>
          </td>
        </tr>
      )}
      {open && error && (
        <tr className="border-b border-slate-100">
          <td colSpan={4} className="py-3 pr-4" style={indent(2)}>
            <Alert variant="error" title="Gagal memuat permission">
              {getErrorMessage(error)}{' '}
              <button className="font-medium underline" onClick={() => refetch()}>
                Coba lagi
              </button>
            </Alert>
          </td>
        </tr>
      )}
      {open && matrix?.group.is_protected && canUpdate && (
        <tr className="border-b border-slate-100">
          <td colSpan={4} className="py-2 pr-4" style={indent(2)}>
            <Alert variant="info">Group inti: UM_GROUP_PERM READ dan UPDATE dikunci agar pengaturan hak akses tidak terkunci bagi seluruh admin.</Alert>
          </td>
        </tr>
      )}
      {open && matrix && matrix.rows.length === 0 && (
        <tr className="border-b border-slate-100">
          <td colSpan={4} className="py-4 text-sm text-slate-500" style={indent(2)}>
            <span className="inline-flex items-center gap-2">
              <FolderTree className="h-4 w-4" /> Aplikasi {group.app_code} belum memiliki menu. Tambahkan di halaman Menus.
            </span>
          </td>
        </tr>
      )}

      {/* Layer 3: menu (pohon) dan Layer 4: action di dalam menu */}
      {open &&
        matrix?.rows.map((r, i) => {
          const isFolder = r.menu_type === 'GROUP';
          const scope = isFolder ? descendants(matrix.rows, i) : [r];
          const scopeIds = editable(scope);
          const allIds = scope.flatMap((d) => d.cells.map((c) => c.menu_action_id));
          const grantedCount = allIds.filter((id) => selected.has(id)).length;
          const expandable = !isFolder && r.cells.length > 0;
          const menuOpen = openMenus.has(r.menu_id);
          const grantedCodes = r.cells.filter((c) => selected.has(c.menu_action_id)).map((c) => c.action_code);
          return (
            <Fragment key={r.menu_id}>
              <tr
                className={clsx('border-b border-slate-100', isFolder ? 'bg-slate-50/60' : 'hover:bg-slate-50/70')}
                data-testid={`menu-${group.code}-${r.menu_code}`}
              >
                <td className="py-2 pr-3" style={indent(2 + r.level)}>
                  <div className="flex items-center gap-2">
                    <Toggle open={menuOpen} onClick={() => toggleMenu(r.menu_id)} label={`action ${r.menu_name}`} hidden={!expandable} />
                    <Checkbox
                      state={stateOf(scopeIds, selected)}
                      onChange={(v) => toggle(scopeIds, v)}
                      disabled={readOnly || !scopeIds.length}
                      label={isFolder ? `Pilih semua di ${r.menu_name}` : `Pilih semua action ${r.menu_name}`}
                    />
                    <button
                      type="button"
                      className="min-w-0 text-left disabled:cursor-default"
                      onClick={() => toggleMenu(r.menu_id)}
                      disabled={!expandable}
                    >
                      <span
                        className={clsx('block truncate', isFolder ? 'font-semibold text-slate-800' : 'text-slate-900', !r.is_active && 'text-slate-400')}
                      >
                        {r.menu_name}
                      </span>
                      <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <span className="font-mono">{r.menu_code}</span>
                        {!r.is_active && <span className="rounded bg-slate-100 px-1 text-slate-500">nonaktif</span>}
                        {!r.is_visible && (
                          <span title="Tidak tampil di sidebar">
                            <EyeOff className="h-3 w-3" />
                          </span>
                        )}
                      </span>
                    </button>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-400">{isFolder ? 'Folder menu' : 'Halaman'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">
                  {allIds.length ? (
                    <>
                      <span className={clsx('font-medium', grantedCount ? 'text-slate-800' : 'text-slate-400')}>{grantedCount}</span> / {allIds.length} action
                    </>
                  ) : (
                    <span className="text-slate-400">Tanpa action</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {expandable && !menuOpen && grantedCodes.length > 0 && (
                    <span className="inline-flex flex-wrap justify-end gap-1">
                      {grantedCodes.map((code) => (
                        <span key={code} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                          {code}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
              </tr>

              {expandable && menuOpen && (
                <tr className="border-b border-slate-100 bg-slate-50/40">
                  <td colSpan={4} className="py-3 pr-4" style={indent(3 + r.level)}>
                    <ul className="flex flex-wrap gap-2" aria-label={`Action ${r.menu_name}`}>
                      {r.cells.map((c) => {
                        const action = actionsByCode.get(c.action_code);
                        const isLocked = locked.has(c.menu_action_id);
                        const checked = selected.has(c.menu_action_id);
                        const changed = checked !== initial.has(c.menu_action_id);
                        return (
                          <li key={c.menu_action_id}>
                            <label
                              title={isLocked ? 'Wajib dimiliki group SUPER_ADMIN' : action?.action_name}
                              className={clsx(
                                'flex min-w-[9.5rem] items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                                checked ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-white',
                                changed && 'ring-2 ring-amber-300',
                                readOnly || isLocked ? 'cursor-not-allowed' : 'cursor-pointer hover:border-brand-300',
                              )}
                            >
                              <Checkbox
                                state={checked}
                                onChange={(v) => toggle([c.menu_action_id], v)}
                                disabled={readOnly || isLocked}
                                label={`${r.menu_code}:${c.action_code}`}
                                title={isLocked ? 'Wajib dimiliki group SUPER_ADMIN' : `${r.menu_name} – ${action?.action_name ?? c.action_code}`}
                              />
                              <span className="min-w-0">
                                <span className="block font-mono text-xs font-semibold text-slate-800">{c.action_code}</span>
                                <span className="block truncate text-[11px] text-slate-500">
                                  {action?.action_name}
                                  {action && !action.is_active && ' · nonaktif'}
                                </span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
    </>
  );
}

// ---------------------------------------------------------------------
// Halaman: Layer 1 aplikasi
// ---------------------------------------------------------------------
export default function GroupPermissionsPage() {
  const canUpdate = usePermission(MENU, 'UPDATE');
  const [urlParams, setUrlParams] = useSearchParams();
  const { data: apps, isLoading: appsLoading } = useQuery({ queryKey: ['lookups', 'applications'], queryFn: () => lookupsApi.applications() });
  const groupsQuery = useGroupLookup();
  const groups = groupsQuery.data;

  const [appFilter, setAppFilter] = useState('');
  const [search, setSearch] = useState('');
  const [openApps, setOpenApps] = useState<Set<string>>(new Set());
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, Set<string>>>({});
  const [expandAllActions, setExpandAllActions] = useState(false);

  // Buka otomatis aplikasi + group dari ?group= (tautan dari halaman User Groups); default aplikasi pertama
  const focusId = urlParams.get('group');
  useEffect(() => {
    if (!groups?.length) return;
    const target = focusId ? groups.find((g) => g.id === focusId) : undefined;
    if (target) {
      setOpenApps((s) => new Set(s).add(target.application_id));
      setOpenGroups((s) => new Set(s).add(target.id));
    } else {
      setOpenApps((s) => (s.size ? s : new Set([groups[0].application_id])));
    }
  }, [groups, focusId]);

  const dirtyCount = Object.keys(drafts).length;
  useEffect(() => {
    if (!dirtyCount) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirtyCount]);

  const term = search.trim().toLowerCase();
  const sections = useMemo(
    () =>
      (apps ?? [])
        .filter((a) => !appFilter || a.id === appFilter)
        .map((a) => ({
          app: a,
          groups: (groups ?? []).filter(
            (g) => g.application_id === a.id && (!term || g.code.toLowerCase().includes(term) || g.name.toLowerCase().includes(term)),
          ),
        }))
        .filter((s) => !term || s.groups.length > 0),
    [apps, groups, appFilter, term],
  );

  const flip = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleGroup = (g: LookupGroup) => {
    flip(setOpenGroups, g.id);
    if (focusId === g.id) setUrlParams({}, { replace: true });
  };

  const setDraft = (groupId: string) => (d: Set<string> | undefined) =>
    setDrafts((prev) => {
      const next = { ...prev };
      if (d) next[groupId] = d;
      else delete next[groupId];
      return next;
    });

  const allAppsOpen = sections.length > 0 && sections.every((s) => openApps.has(s.app.id));
  const loading = appsLoading || groupsQuery.isLoading;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Access Control</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Group Permissions</h1>
        <p className="mt-1 text-sm text-slate-500">
          Buka aplikasi → group → menu, lalu centang action yang boleh dilakukan. Perubahan berlaku untuk seluruh anggota group setelah disimpan.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
          <select
            aria-label="Filter aplikasi"
            value={appFilter}
            onChange={(e) => {
              setAppFilter(e.target.value);
              if (e.target.value) setOpenApps((s) => new Set(s).add(e.target.value));
            }}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="">Semua aplikasi</option>
            {apps?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.code})
              </option>
            ))}
          </select>
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              // Pencarian membuka seluruh aplikasi agar group yang cocok terlihat
              if (v.trim()) setOpenApps(new Set((apps ?? []).map((a) => a.id)));
            }}
            placeholder="Cari group..."
            label="Cari group"
          />
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => setOpenApps(allAppsOpen ? new Set() : new Set(sections.map((s) => s.app.id)))}>
              {allAppsOpen ? <ChevronsDownUp className="h-4 w-4" /> : <ChevronsUpDown className="h-4 w-4" />}
              {allAppsOpen ? 'Tutup semua aplikasi' : 'Buka semua aplikasi'}
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={expandAllActions}
                onChange={(e) => setExpandAllActions(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Tampilkan semua action
            </label>
            {!canUpdate && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">Hanya lihat</span>}
          </div>
        </div>

        {dirtyCount > 0 && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800" data-testid="pending-summary">
            {dirtyCount} group memiliki perubahan yang belum disimpan. Simpan lewat tombol di baris group masing-masing.
          </div>
        )}

        {groupsQuery.error && (
          <div className="p-4">
            <Alert variant="error">{getErrorMessage(groupsQuery.error)}</Alert>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm" aria-label="Permission bertingkat">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-3 pr-3 text-left font-semibold" style={indent(0)}>
                  Aplikasi / Group / Menu / Action
                </th>
                <th className="w-36 px-3 py-3 text-left font-semibold">Keterangan</th>
                <th className="w-44 px-3 py-3 text-left font-semibold">Permission</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-sm text-slate-500">
                    <span className="inline-flex items-center gap-2">
                      <Spinner className="h-4 w-4" /> Memuat...
                    </span>
                  </td>
                </tr>
              )}
              {!loading && sections.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-14 text-center">
                    <ShieldCheck className="mx-auto h-10 w-10 text-slate-300" />
                    <p className="mt-3 font-medium text-slate-700">Tidak ada group yang cocok</p>
                  </td>
                </tr>
              )}
              {sections.map(({ app, groups: appGroups }) => {
                const open = openApps.has(app.id);
                const pending = appGroups.filter((g) => drafts[g.id]).length;
                return (
                  <Fragment key={app.id}>
                    {/* Layer 1: aplikasi */}
                    <tr className="border-b border-slate-200 bg-slate-100/70" data-testid={`app-${app.code}`}>
                      <td className="py-3 pr-3" style={indent(0)}>
                        <div className="flex items-center gap-2">
                          <Toggle open={open} onClick={() => flip(setOpenApps, app.id)} label={`aplikasi ${app.name}`} />
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
                            <AppWindow className="h-4 w-4" />
                          </span>
                          <button type="button" onClick={() => flip(setOpenApps, app.id)} className="text-left">
                            <span className="block font-semibold text-slate-900">{app.name}</span>
                            <span className="block font-mono text-xs text-slate-500">{app.code}</span>
                          </button>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">{appGroups.length} group</td>
                      <td className="px-3 py-3" />
                      <td className="px-3 py-3 text-right">
                        {pending > 0 && (
                          <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">{pending} group belum disimpan</span>
                        )}
                      </td>
                    </tr>
                    {open && appGroups.length === 0 && (
                      <tr className="border-b border-slate-100">
                        <td colSpan={4} className="py-3 text-sm text-slate-500" style={indent(1)}>
                          Belum ada group untuk aplikasi ini. Buat di halaman User Groups.
                        </td>
                      </tr>
                    )}
                    {open &&
                      appGroups.map((g) => (
                        <GroupBlock
                          key={g.id}
                          group={g}
                          open={openGroups.has(g.id)}
                          onToggle={() => toggleGroup(g)}
                          canUpdate={canUpdate}
                          draft={drafts[g.id]}
                          onDraftChange={setDraft(g.id)}
                          expandAllActions={expandAllActions}
                        />
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
