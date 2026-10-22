import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArchiveRestore, Copy, Eye, Pencil, Plus, Power, PowerOff, ShieldCheck, Trash2, Users } from 'lucide-react';
import { getErrorMessage } from '@/api/errors';
import { lookupsApi } from '@/api/lookups';
import { userGroupsApi } from '@/api/userGroups';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { IconButton } from '@/components/ui/IconButton';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { SortableHeader, type SortDir } from '@/components/ui/SortableHeader';
import { Spinner } from '@/components/ui/Spinner';
import { StatusBadge, rowStatus } from '@/components/ui/StatusBadge';
import { StatusTabs, statusToParam, type StatusFilter } from '@/components/ui/StatusTabs';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermission } from '@/hooks/usePermission';
import { formatDateTime } from '@/lib/format';
import { toast } from '@/stores/toast';
import type { GroupListParams, GroupSortColumn, UserGroup } from '@/types/group';
import { GroupFormDrawer, type FormMode } from './GroupFormDrawer';

const MENU = 'UM_GROUP';

type ConfirmAction = 'activate' | 'deactivate' | 'delete' | 'restore';

const CONFIRM_TEXT: Record<ConfirmAction, { title: string; label: string; variant: 'primary' | 'danger' }> = {
  activate: { title: 'Aktifkan group?', label: 'Ya, aktifkan', variant: 'primary' },
  deactivate: { title: 'Nonaktifkan group?', label: 'Ya, nonaktifkan', variant: 'danger' },
  delete: { title: 'Hapus group?', label: 'Ya, hapus', variant: 'danger' },
  restore: { title: 'Pulihkan group?', label: 'Ya, pulihkan', variant: 'primary' },
};

const SUCCESS_TEXT: Record<ConfirmAction, string> = {
  activate: 'diaktifkan',
  deactivate: 'dinonaktifkan',
  delete: 'dihapus',
  restore: 'dipulihkan',
};

const SELECT_CLASS =
  'h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';

export default function UserGroupsPage() {
  const qc = useQueryClient();
  const canCreate = usePermission(MENU, 'CREATE');
  const canUpdate = usePermission(MENU, 'UPDATE');
  const canDelete = usePermission(MENU, 'DELETE');
  const canSeeMembers = usePermission('UM_GROUP_MEMBER', 'READ');
  const canSeePermissions = usePermission('UM_GROUP_PERM', 'READ');

  // Filter aplikasi disimpan di URL (?app=KODE)
  const [urlParams, setUrlParams] = useSearchParams();
  const { data: apps = [] } = useQuery({ queryKey: ['lookups', 'applications'], queryFn: () => lookupsApi.applications() });
  const appCode = urlParams.get('app') ?? '';
  const app = apps.find((a) => a.code === appCode);

  const [search, setSearch] = useState('');
  const q = useDebounce(search.trim(), 300);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [sortBy, setSortBy] = useState<GroupSortColumn>('group_code');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const params: GroupListParams = {
    page,
    page_size: pageSize,
    q,
    is_active: statusToParam(status),
    application_id: app?.id,
    sort_by: sortBy,
    sort_dir: sortDir,
    include_deleted: includeDeleted,
  };

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['user-groups', params],
    queryFn: () => userGroupsApi.list(params),
    placeholderData: keepPreviousData,
    // Tunggu daftar aplikasi agar filter ?app= tidak sempat diabaikan
    enabled: !appCode || apps.length > 0,
  });
  const rows = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const filtered = !!q || status !== 'all' || !!appCode;

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  const handleSort = (column: GroupSortColumn, dir: SortDir) => {
    setSortBy(column);
    setSortDir(dir);
    setPage(1);
  };

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['user-groups'] });
    void qc.invalidateQueries({ queryKey: ['lookups', 'user-groups'] });
  };

  const [drawer, setDrawer] = useState<{ mode: FormMode; group: UserGroup | null } | null>(null);

  const [confirm, setConfirm] = useState<{ action: ConfirmAction; group: UserGroup } | null>(null);
  const actionMutation = useMutation({
    mutationFn: ({ action, group }: { action: ConfirmAction; group: UserGroup }): Promise<unknown> => {
      switch (action) {
        case 'activate':
          return userGroupsApi.setStatus(group.id, true);
        case 'deactivate':
          return userGroupsApi.setStatus(group.id, false);
        case 'delete':
          return userGroupsApi.remove(group.id);
        case 'restore':
          return userGroupsApi.restore(group.id);
      }
    },
    onSuccess: (res, { action, group }) => {
      let message = `Group ${group.group_code} berhasil ${SUCCESS_TEXT[action]}`;
      const restored = (res as { restored_permissions?: number }).restored_permissions;
      if (action === 'restore' && restored) message += ` beserta ${restored} permission`;
      toast.success(message);
      setConfirm(null);
      refresh();
      // Status group memengaruhi hak akses anggotanya, bisa termasuk Anda (BR-22)
      void qc.invalidateQueries({ queryKey: ['auth'] });
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
      setConfirm(null);
    },
  });

  const confirmMessage = (action: ConfirmAction, g: UserGroup) => {
    const name = (
      <span className="font-medium text-slate-800">
        {g.app_code} · {g.group_code} – {g.group_name}
      </span>
    );
    return (
      <p>
        {action === 'delete' && <>Group {name} akan dihapus beserta {g.permission_count} permission-nya. Data dapat dipulihkan.</>}
        {action === 'deactivate' && <>Group {name} akan dinonaktifkan. {g.member_count} anggotanya langsung kehilangan hak akses dari group ini.</>}
        {action === 'activate' && <>Group {name} akan diaktifkan kembali.</>}
        {action === 'restore' && <>Group {name} akan dipulihkan beserta permission yang terhapus bersamanya.</>}
      </p>
    );
  };

  const deleteBlocked = (g: UserGroup) =>
    g.is_protected ? 'Group inti tidak dapat dihapus' : g.member_count > 0 ? `Masih memiliki ${g.member_count} anggota` : undefined;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Access Control</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">User Groups</h1>
          <p className="mt-1 text-sm text-slate-500">Group per aplikasi. Hak akses diberikan ke group, lalu user menjadi anggota group per company.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setDrawer({ mode: 'create', group: null })}>
            <Plus className="h-4 w-4" /> Tambah Group
          </Button>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
          <select
            aria-label="Filter aplikasi"
            value={appCode}
            onChange={(e) => {
              setUrlParams(e.target.value ? { app: e.target.value } : {}, { replace: true });
              setPage(1);
            }}
            className={SELECT_CLASS}
          >
            <option value="">Semua aplikasi</option>
            {apps.map((a) => (
              <option key={a.id} value={a.code}>
                {a.name} ({a.code})
              </option>
            ))}
          </select>
          <SearchInput value={search} onChange={resetPage(setSearch)} placeholder="Cari kode, nama, deskripsi..." label="Cari group" />
          <StatusTabs value={status} onChange={resetPage(setStatus)} />
          {canUpdate && (
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={includeDeleted}
                onChange={(e) => resetPage(setIncludeDeleted)(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Tampilkan yang terhapus
            </label>
          )}
          {isFetching && !isLoading && <Spinner className="h-4 w-4 text-slate-400" />}
        </div>

        {error && (
          <div className="p-4">
            <Alert variant="error" title="Gagal memuat data">
              {getErrorMessage(error)}{' '}
              <button className="font-medium underline" onClick={() => refetch()}>
                Coba lagi
              </button>
            </Alert>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide">
              <tr>
                <SortableHeader label="Kode" column="group_code" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Nama" column="group_name" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left font-semibold text-slate-500">Aplikasi</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-500">Anggota</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-500">Permission</th>
                <SortableHeader label="Status" column="is_active" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Terakhir diubah" column="updated_at" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-right font-semibold text-slate-500">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="px-4 py-4">
                      <div className="h-4 animate-pulse rounded bg-slate-100" />
                    </td>
                  </tr>
                ))}

              {!isLoading && rows.length === 0 && !error && (
                <tr>
                  <td colSpan={8} className="px-4 py-14 text-center">
                    <ShieldCheck className="mx-auto h-10 w-10 text-slate-300" />
                    <p className="mt-3 font-medium text-slate-700">{filtered ? 'Tidak ada group yang cocok dengan filter' : 'Belum ada group'}</p>
                  </td>
                </tr>
              )}

              {rows.map((g) => (
                <tr key={g.id} className={clsx('hover:bg-slate-50/70', g.is_deleted && 'bg-red-50/30 text-slate-400')}>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-slate-700">{g.group_code}</span>
                    {g.is_protected && <span className="ml-1.5 rounded bg-brand-50 px-1.5 text-[10px] font-medium text-brand-700">Inti</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setDrawer({ mode: 'view', group: g })}
                      className="text-left font-medium text-slate-900 hover:text-brand-700 hover:underline"
                    >
                      {g.group_name}
                    </button>
                    {g.description && <p className="line-clamp-1 text-xs text-slate-500">{g.description}</p>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    <span className="font-mono text-xs">{g.app_code}</span>
                    {!g.app_is_active && <span className="ml-1.5 rounded bg-slate-100 px-1.5 text-[10px] text-slate-600">nonaktif</span>}
                  </td>
                  <td className="px-4 py-3">
                    {canSeeMembers && !g.is_deleted ? (
                      <Link to={`/usrmgnt/group-members?group=${g.id}`} className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                        <Users className="h-3.5 w-3.5" /> {g.member_count}
                      </Link>
                    ) : (
                      g.member_count
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {canSeePermissions && !g.is_deleted ? (
                      <Link to={`/usrmgnt/group-permissions?group=${g.id}`} className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                        <ShieldCheck className="h-3.5 w-3.5" /> {g.permission_count}
                      </Link>
                    ) : (
                      g.permission_count
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={rowStatus(g)} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                    <p>{formatDateTime(g.updated_at ?? g.created_at)}</p>
                    <p>{g.updated_by ?? g.created_by}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-0.5">
                      <IconButton title="Lihat detail" onClick={() => setDrawer({ mode: 'view', group: g })}>
                        <Eye className="h-4 w-4" />
                      </IconButton>
                      {g.is_deleted ? (
                        canUpdate && (
                          <IconButton title="Pulihkan" onClick={() => setConfirm({ action: 'restore', group: g })}>
                            <ArchiveRestore className="h-4 w-4" />
                          </IconButton>
                        )
                      ) : (
                        <>
                          {canUpdate && (
                            <IconButton title="Ubah" onClick={() => setDrawer({ mode: 'edit', group: g })}>
                              <Pencil className="h-4 w-4" />
                            </IconButton>
                          )}
                          {canCreate && (
                            <IconButton title="Duplikat" onClick={() => setDrawer({ mode: 'duplicate', group: g })}>
                              <Copy className="h-4 w-4" />
                            </IconButton>
                          )}
                          {canUpdate &&
                            (g.is_active ? (
                              !g.is_protected && (
                                <IconButton title="Nonaktifkan" onClick={() => setConfirm({ action: 'deactivate', group: g })}>
                                  <PowerOff className="h-4 w-4" />
                                </IconButton>
                              )
                            ) : (
                              <IconButton title="Aktifkan" onClick={() => setConfirm({ action: 'activate', group: g })}>
                                <Power className="h-4 w-4" />
                              </IconButton>
                            ))}
                          {canDelete && !g.is_protected && (
                            <IconButton
                              title={deleteBlocked(g) ? `Hapus (${deleteBlocked(g)})` : 'Hapus'}
                              danger
                              disabled={!!deleteBlocked(g)}
                              onClick={() => setConfirm({ action: 'delete', group: g })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-200">
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={resetPage(setPageSize)} />
        </div>
      </div>

      <GroupFormDrawer
        open={!!drawer}
        mode={drawer?.mode ?? 'create'}
        group={drawer?.group ?? null}
        apps={apps}
        defaultAppId={app?.id ?? ''}
        canUpdate={canUpdate}
        onClose={() => setDrawer(null)}
        onModeChange={(mode) => setDrawer((d) => (d ? { ...d, mode } : d))}
        onSaved={(saved, mode) => {
          const verb = mode === 'create' ? 'dibuat' : mode === 'duplicate' ? `dibuat dengan ${saved.permission_count} permission` : 'diperbarui';
          toast.success(`Group ${saved.group_code} berhasil ${verb}`);
          setDrawer(null);
          refresh();
        }}
      />

      {confirm && (
        <ConfirmDialog
          open
          title={CONFIRM_TEXT[confirm.action].title}
          message={confirmMessage(confirm.action, confirm.group)}
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
