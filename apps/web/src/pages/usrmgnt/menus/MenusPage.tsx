import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  ArchiveRestore,
  ChevronsDownUp,
  ChevronsUpDown,
  FileText,
  Folder,
  FolderPlus,
  Info,
  ListTree,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Trash2,
} from 'lucide-react';
import { getErrorMessage } from '@/api/errors';
import { lookupsApi } from '@/api/lookups';
import { menusApi } from '@/api/menus';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SearchInput } from '@/components/ui/SearchInput';
import { Spinner } from '@/components/ui/Spinner';
import { StatusBadge, rowStatus } from '@/components/ui/StatusBadge';
import { usePermission } from '@/hooks/usePermission';
import { formatDateTime } from '@/lib/format';
import { resolveIcon } from '@/lib/icons';
import { pageRoutes } from '@/routes/registry';
import { useSession } from '@/stores/session';
import { toast } from '@/stores/toast';
import type { AdminMenuNode } from '@/types/menu';
import { MenuActionsPanel } from './MenuActionsPanel';
import { MenuFormDrawer } from './MenuFormDrawer';
import { MenuTreeView } from './MenuTreeView';
import { filterTree, findNode, flatten } from './menuTree';

const MENU = 'UM_MENU';
type ConfirmAction = 'activate' | 'deactivate' | 'delete' | 'restore';

const CONFIRM_TEXT: Record<ConfirmAction, { title: string; label: string; variant: 'primary' | 'danger'; done: string }> = {
  activate: { title: 'Aktifkan menu?', label: 'Ya, aktifkan', variant: 'primary', done: 'diaktifkan' },
  deactivate: { title: 'Nonaktifkan menu?', label: 'Ya, nonaktifkan', variant: 'danger', done: 'dinonaktifkan' },
  delete: { title: 'Hapus menu?', label: 'Ya, hapus', variant: 'danger', done: 'dihapus' },
  restore: { title: 'Pulihkan menu?', label: 'Ya, pulihkan', variant: 'primary', done: 'dipulihkan' },
};

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 text-slate-800">{children}</dd>
    </>
  );
}

export default function MenusPage() {
  const qc = useQueryClient();
  const activeAppId = useSession((s) => s.activeContext?.application_id);
  const canCreate = usePermission(MENU, 'CREATE');
  const canUpdate = usePermission(MENU, 'UPDATE');
  const canDelete = usePermission(MENU, 'DELETE');

  // Aplikasi terpilih disimpan di URL (?app=KODE) agar tetap setelah reload
  const [params, setParams] = useSearchParams();
  const { data: apps, isLoading: appsLoading } = useQuery({ queryKey: ['lookups', 'applications'], queryFn: lookupsApi.applications });
  const appCode = params.get('app') ?? apps?.[0]?.code ?? '';
  const app = apps?.find((a) => a.code === appCode);

  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'detail' | 'actions'>('detail');

  const { data: tree, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['menu-tree', app?.id, includeDeleted],
    queryFn: () => menusApi.tree(app!.id, includeDeleted),
    enabled: !!app,
  });

  // Semua GROUP terbuka saat aplikasi pertama kali dimuat
  useEffect(() => {
    if (tree) setExpanded((prev) => (prev.size ? prev : new Set(flatten(tree).filter((n) => n.menu_type === 'GROUP').map((n) => n.id))));
  }, [tree]);
  useEffect(() => {
    setSelectedId(null);
    setExpanded(new Set());
  }, [app?.id]);

  const visibleTree = useMemo(() => filterTree(tree ?? [], search.trim()), [tree, search]);
  const selected = findNode(tree ?? [], selectedId) ?? null;
  const parent = selected?.parent_id ? findNode(tree ?? [], selected.parent_id) : undefined;
  useEffect(() => {
    if (selected?.menu_type !== 'PAGE') setTab('detail');
  }, [selected?.menu_type]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['menu-tree'] });
    // Perubahan menu aplikasi aktif memengaruhi sidebar & permission sesi ini
    if (app?.id === activeAppId) void qc.invalidateQueries({ queryKey: ['auth'] });
  };

  const [drawer, setDrawer] = useState<{ mode: 'create' | 'edit'; parentId: string | null } | null>(null);
  const [confirm, setConfirm] = useState<{ action: ConfirmAction; node: AdminMenuNode } | null>(null);

  // Untuk pesan konfirmasi hapus PAGE: berapa group yang izinnya ikut dicabut
  const { data: selectedActions } = useQuery({
    queryKey: ['menu-actions', selected?.id],
    queryFn: () => menusApi.actions(selected!.id),
    enabled: !!selected && selected.menu_type === 'PAGE' && !selected.is_deleted,
  });

  const actionMutation = useMutation({
    mutationFn: ({ action, node }: { action: ConfirmAction; node: AdminMenuNode }) => {
      switch (action) {
        case 'activate':
          return menusApi.setStatus(node.id, true);
        case 'deactivate':
          return menusApi.setStatus(node.id, false);
        case 'delete':
          return menusApi.remove(node.id);
        case 'restore':
          return menusApi.restore(node.id);
      }
    },
    onSuccess: (_res, { action, node }) => {
      toast.success(`Menu ${node.menu_code} berhasil ${CONFIRM_TEXT[action].done}`);
      setConfirm(null);
      if (action === 'delete' && !includeDeleted) setSelectedId(null);
      void qc.invalidateQueries({ queryKey: ['menu-actions', node.id] });
      invalidate();
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
      setConfirm(null);
    },
  });

  const confirmMessage = (action: ConfirmAction, n: AdminMenuNode) => {
    const name = (
      <span className="font-medium text-slate-800">
        {n.menu_code} – {n.menu_name}
      </span>
    );
    const groupPerms = (selectedActions?.menu_id === n.id ? selectedActions.items : []).reduce((sum, a) => sum + a.group_count, 0);
    switch (action) {
      case 'delete':
        return n.menu_type === 'PAGE' ? (
          <div className="space-y-3">
            <p>Menu {name} beserta action-nya akan dihapus. Data tetap tersimpan dan dapat dipulihkan bersama action-nya.</p>
            {groupPerms > 0 && (
              <Alert variant="warning">{groupPerms} izin group pada menu ini ikut dicabut, dan akan kembali bila menu dipulihkan.</Alert>
            )}
          </div>
        ) : (
          <>Menu GROUP {name} akan dihapus. Data tetap tersimpan dan dapat dipulihkan.</>
        );
      case 'deactivate':
        return n.menu_type === 'GROUP' ? (
          <>Menu {name} dan seluruh isinya akan disembunyikan dari sidebar sampai diaktifkan kembali.</>
        ) : (
          <>Menu {name} akan dinonaktifkan. Seluruh user kehilangan akses ke halaman ini sampai diaktifkan kembali.</>
        );
      case 'activate':
        return <>Menu {name} akan diaktifkan kembali.</>;
      case 'restore':
        return <>Menu {name} akan dipulihkan dari status terhapus{n.menu_type === 'PAGE' ? ', beserta action dan izin group yang terhapus bersamanya' : ''}.</>;
    }
  };

  const allGroupIds = flatten(tree ?? []).filter((n) => n.menu_type === 'GROUP').map((n) => n.id);
  // route_path menu harus persis sama dengan route di registry frontend (PRD §10)
  const routeRegistered = selected?.route_path ? pageRoutes.some((r) => r.path === selected.route_path) : true;
  const SelectedIcon = selected ? resolveIcon(selected.icon, selected.menu_type === 'GROUP' ? Folder : FileText) : FileText;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Master Data</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Menus</h1>
          <p className="mt-1 text-sm text-slate-500">Struktur menu setiap aplikasi beserta action yang tersedia di tiap halaman.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="menu-app" className="text-sm text-slate-600">
            Aplikasi
          </label>
          <select
            id="menu-app"
            value={appCode}
            onChange={(e) => setParams({ app: e.target.value }, { replace: true })}
            disabled={appsLoading}
            className="h-10 min-w-[14rem] rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {apps?.map((a) => (
              <option key={a.id} value={a.code}>
                {a.name} ({a.code})
              </option>
            ))}
          </select>
          {canCreate && app && (
            <Button onClick={() => setDrawer({ mode: 'create', parentId: null })}>
              <Plus className="h-4 w-4" /> Tambah Menu
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Pohon menu */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="space-y-3 border-b border-slate-200 p-4">
            <SearchInput value={search} onChange={setSearch} placeholder="Cari kode, nama, atau route..." label="Cari menu" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => setExpanded(new Set(allGroupIds))}>
                  <ChevronsUpDown className="h-4 w-4" /> Buka semua
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setExpanded(new Set())}>
                  <ChevronsDownUp className="h-4 w-4" /> Tutup semua
                </Button>
              </div>
              <div className="flex items-center gap-3">
                {isFetching && !isLoading && <Spinner className="h-4 w-4 text-slate-400" />}
                {canUpdate && (
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={includeDeleted}
                      onChange={(e) => setIncludeDeleted(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    Tampilkan yang terhapus
                  </label>
                )}
              </div>
            </div>
          </div>

          <div className="max-h-[calc(100vh-18rem)] min-h-[16rem] overflow-y-auto p-3">
            {(isLoading || appsLoading) && (
              <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
                <Spinner className="h-4 w-4" /> Memuat menu...
              </div>
            )}
            {error && (
              <Alert variant="error" title="Gagal memuat menu">
                {getErrorMessage(error)}{' '}
                <button className="font-medium underline" onClick={() => refetch()}>
                  Coba lagi
                </button>
              </Alert>
            )}
            {tree && visibleTree.length === 0 && (
              <div className="py-12 text-center">
                <ListTree className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-700">{search ? 'Tidak ada menu yang cocok' : 'Aplikasi ini belum punya menu'}</p>
              </div>
            )}
            {tree && (
              <MenuTreeView
                nodes={visibleTree}
                selectedId={selectedId}
                expanded={expanded}
                forceExpand={!!search.trim()}
                onSelect={setSelectedId}
                onToggle={(id) =>
                  setExpanded((s) => {
                    const next = new Set(s);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
              />
            )}
          </div>
        </section>

        {/* Panel detail */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          {!selected ? (
            <div className="flex h-full min-h-[20rem] flex-col items-center justify-center p-8 text-center">
              <ListTree className="h-10 w-10 text-slate-300" />
              <p className="mt-3 font-medium text-slate-700">Pilih menu di sebelah kiri</p>
              <p className="mt-1 text-sm text-slate-500">Detail menu dan action yang tersedia akan tampil di sini.</p>
            </div>
          ) : (
            <>
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <SelectedIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold text-slate-900">{selected.menu_name}</h2>
                    <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono">{selected.menu_code}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">{selected.menu_type}</span>
                      <StatusBadge status={rowStatus(selected)} />
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selected.is_deleted ? (
                    canUpdate && (
                      <Button variant="secondary" size="sm" onClick={() => setConfirm({ action: 'restore', node: selected })}>
                        <ArchiveRestore className="h-4 w-4" /> Pulihkan
                      </Button>
                    )
                  ) : (
                    <>
                      {canCreate && selected.menu_type === 'GROUP' && (
                        <Button variant="secondary" size="sm" onClick={() => setDrawer({ mode: 'create', parentId: selected.id })}>
                          <FolderPlus className="h-4 w-4" /> Sub-menu
                        </Button>
                      )}
                      {canUpdate && (
                        <Button variant="secondary" size="sm" onClick={() => setDrawer({ mode: 'edit', parentId: selected.parent_id })}>
                          <Pencil className="h-4 w-4" /> Ubah
                        </Button>
                      )}
                      {canUpdate &&
                        (selected.is_active ? (
                          <Button variant="secondary" size="sm" onClick={() => setConfirm({ action: 'deactivate', node: selected })}>
                            <PowerOff className="h-4 w-4" /> Nonaktifkan
                          </Button>
                        ) : (
                          <Button variant="secondary" size="sm" onClick={() => setConfirm({ action: 'activate', node: selected })}>
                            <Power className="h-4 w-4" /> Aktifkan
                          </Button>
                        ))}
                      {canDelete && (
                        <Button variant="secondary" size="sm" onClick={() => setConfirm({ action: 'delete', node: selected })} className="hover:!border-red-300 hover:!text-red-600">
                          <Trash2 className="h-4 w-4" /> Hapus
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </header>

              {selected.menu_type === 'PAGE' && !selected.is_deleted && (
                <div className="flex gap-1 border-b border-slate-200 px-5" role="tablist">
                  {(['detail', 'actions'] as const).map((t) => (
                    <button
                      key={t}
                      role="tab"
                      aria-selected={tab === t}
                      onClick={() => setTab(t)}
                      className={clsx(
                        '-mb-px border-b-2 px-3 py-2.5 text-sm font-medium',
                        tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800',
                      )}
                    >
                      {t === 'detail' ? 'Detail' : `Action (${selected.actions.length})`}
                    </button>
                  ))}
                </div>
              )}

              <div className="p-5">
                {tab === 'actions' && selected.menu_type === 'PAGE' && !selected.is_deleted ? (
                  <MenuActionsPanel menuId={selected.id} canUpdate={canUpdate} onSaved={invalidate} />
                ) : (
                  <div className="space-y-4">
                    {selected.menu_type === 'PAGE' && !routeRegistered && (
                      <Alert variant="info" title="Route belum punya halaman di frontend">
                        Menu ini akan tampil di sidebar, tetapi membuka halaman 404 sampai route <span className="font-mono">{selected.route_path}</span> didaftarkan di
                        aplikasi frontend.
                      </Alert>
                    )}
                    <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2.5 text-sm">
                      <DetailRow label="Parent">{parent ? `${parent.menu_name} (${parent.menu_code})` : <span className="text-slate-400">Tingkat teratas</span>}</DetailRow>
                      {selected.menu_type === 'PAGE' && (
                        <DetailRow label="Route">
                          <span className="break-all font-mono text-xs">{selected.route_path}</span>
                        </DetailRow>
                      )}
                      <DetailRow label="Urutan">{selected.sort_order}</DetailRow>
                      <DetailRow label="Sidebar">
                        {selected.is_visible ? 'Tampil' : <span className="text-slate-500">Tersembunyi (hanya lewat route)</span>}
                      </DetailRow>
                      {selected.menu_type === 'PAGE' && (
                        <DetailRow label="Action">
                          <span className="flex flex-wrap gap-1">
                            {selected.actions.map((a) => (
                              <span key={a} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-600">
                                {a}
                              </span>
                            ))}
                          </span>
                        </DetailRow>
                      )}
                      {selected.menu_type === 'GROUP' && (
                        <DetailRow label="Isi">{selected.children.length} sub-menu</DetailRow>
                      )}
                    </dl>
                    <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1.5 rounded-lg bg-slate-50 p-4 text-xs">
                      <DetailRow label="Dibuat">
                        {formatDateTime(selected.created_at)} · {selected.created_by}
                      </DetailRow>
                      <DetailRow label="Diubah">
                        {selected.updated_at ? `${formatDateTime(selected.updated_at)} · ${selected.updated_by ?? '–'}` : '–'}
                      </DetailRow>
                      {selected.is_deleted && (
                        <DetailRow label="Dihapus">
                          {formatDateTime(selected.deleted_at)} · {selected.deleted_by}
                        </DetailRow>
                      )}
                    </dl>
                    {selected.menu_type === 'PAGE' && (
                      <p className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Info className="h-3.5 w-3.5" /> Hak akses group per action diatur di halaman Group Permissions.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {app && (
        <MenuFormDrawer
          open={!!drawer}
          mode={drawer?.mode ?? 'create'}
          applicationId={app.id}
          tree={tree ?? []}
          menu={drawer?.mode === 'edit' ? selected : null}
          initialParentId={drawer?.parentId ?? null}
          onClose={() => setDrawer(null)}
          onSaved={(saved, mode) => {
            toast.success(mode === 'create' ? `Menu ${saved.menu_code} berhasil dibuat` : `Menu ${saved.menu_code} berhasil diperbarui`);
            setDrawer(null);
            setSelectedId(saved.id);
            if (saved.parent_id) setExpanded((s) => new Set(s).add(saved.parent_id!));
            invalidate();
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          open
          title={CONFIRM_TEXT[confirm.action].title}
          message={confirmMessage(confirm.action, confirm.node)}
          confirmLabel={CONFIRM_TEXT[confirm.action].label}
          variant={CONFIRM_TEXT[confirm.action].variant}
          loading={actionMutation.isPending}
          onConfirm={() => actionMutation.mutate(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
