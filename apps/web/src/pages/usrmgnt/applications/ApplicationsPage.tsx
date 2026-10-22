import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AppWindow, ArchiveRestore, Eye, Lock, Pencil, Plus, Power, PowerOff, Trash2 } from 'lucide-react';
import { applicationsApi } from '@/api/applications';
import { getErrorMessage } from '@/api/errors';
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
import { resolveIcon } from '@/lib/icons';
import { toast } from '@/stores/toast';
import type { Application, ApplicationListParams, ApplicationSortColumn } from '@/types/application';
import { ApplicationFormDrawer, type FormMode } from './ApplicationFormDrawer';

const MENU = 'UM_APPLICATION';

type ConfirmAction = 'activate' | 'deactivate' | 'delete' | 'restore';

const CONFIRM_TEXT: Record<ConfirmAction, { title: string; label: string; variant: 'primary' | 'danger' }> = {
  activate: { title: 'Aktifkan aplikasi?', label: 'Ya, aktifkan', variant: 'primary' },
  deactivate: { title: 'Nonaktifkan aplikasi?', label: 'Ya, nonaktifkan', variant: 'danger' },
  delete: { title: 'Hapus aplikasi?', label: 'Ya, hapus', variant: 'danger' },
  restore: { title: 'Pulihkan aplikasi?', label: 'Ya, pulihkan', variant: 'primary' },
};

const SUCCESS_TEXT: Record<ConfirmAction, string> = {
  activate: 'diaktifkan',
  deactivate: 'dinonaktifkan',
  delete: 'dihapus',
  restore: 'dipulihkan',
};

export default function ApplicationsPage() {
  const qc = useQueryClient();
  const canCreate = usePermission(MENU, 'CREATE');
  const canUpdate = usePermission(MENU, 'UPDATE');
  const canDelete = usePermission(MENU, 'DELETE');

  // Filter & sort
  const [search, setSearch] = useState('');
  const q = useDebounce(search.trim(), 300);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [sortBy, setSortBy] = useState<ApplicationSortColumn>('sort_order');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const params: ApplicationListParams = {
    page,
    page_size: pageSize,
    q,
    is_active: statusToParam(status),
    sort_by: sortBy,
    sort_dir: sortDir,
    include_deleted: includeDeleted,
  };

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['applications', params],
    queryFn: () => applicationsApi.list(params),
    placeholderData: keepPreviousData,
  });
  const rows = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const nextSortOrder = rows.length ? Math.max(...rows.map((r) => r.sort_order)) + 1 : 1;

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };
  const handleSort = (column: ApplicationSortColumn, dir: SortDir) => {
    setSortBy(column);
    setSortDir(dir);
    setPage(1);
  };

  const [drawer, setDrawer] = useState<{ mode: FormMode; application: Application | null } | null>(null);
  const [confirm, setConfirm] = useState<{ action: ConfirmAction; application: Application } | null>(null);

  const actionMutation = useMutation({
    mutationFn: ({ action, application }: { action: ConfirmAction; application: Application }) => {
      switch (action) {
        case 'activate':
          return applicationsApi.setStatus(application.id, true);
        case 'deactivate':
          return applicationsApi.setStatus(application.id, false);
        case 'delete':
          return applicationsApi.remove(application.id);
        case 'restore':
          return applicationsApi.restore(application.id);
      }
    },
    onSuccess: (_res, { action, application }) => {
      toast.success(`Aplikasi ${application.app_code} berhasil ${SUCCESS_TEXT[action]}`);
      setConfirm(null);
      void qc.invalidateQueries({ queryKey: ['applications'] });
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
      setConfirm(null);
    },
  });

  const confirmMessage = (action: ConfirmAction, a: Application) => {
    const name = (
      <span className="font-medium text-slate-800">
        {a.app_code} – {a.app_name}
      </span>
    );
    switch (action) {
      case 'delete':
        return <>Aplikasi {name} akan dihapus. Data tetap tersimpan dan dapat dipulihkan.</>;
      case 'deactivate':
        return (
          <>
            Aplikasi {name} akan dinonaktifkan. Seluruh user kehilangan akses ke aplikasi ini di semua company sampai
            diaktifkan kembali.
          </>
        );
      case 'activate':
        return <>Aplikasi {name} akan diaktifkan kembali.</>;
      case 'restore':
        return <>Aplikasi {name} akan dipulihkan dari status terhapus.</>;
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Master Data</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Applications</h1>
          <p className="mt-1 text-sm text-slate-500">Daftar aplikasi internal yang hak aksesnya dikelola modul ini.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setDrawer({ mode: 'create', application: null })}>
            <Plus className="h-4 w-4" /> Tambah Aplikasi
          </Button>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
          <SearchInput
            value={search}
            onChange={resetPage(setSearch)}
            placeholder="Cari kode, nama, atau deskripsi..."
            label="Cari aplikasi"
          />
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
                <SortableHeader label="Urutan" column="sort_order" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="w-20" />
                <SortableHeader label="Kode" column="app_code" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Nama" column="app_name" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left font-semibold text-slate-500">Base URL</th>
                <SortableHeader label="Status" column="is_active" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Terakhir diubah" column="updated_at" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-right font-semibold text-slate-500">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-4 py-4">
                      <div className="h-4 animate-pulse rounded bg-slate-100" />
                    </td>
                  </tr>
                ))}

              {!isLoading && rows.length === 0 && !error && (
                <tr>
                  <td colSpan={7} className="px-4 py-14 text-center">
                    <AppWindow className="mx-auto h-10 w-10 text-slate-300" />
                    <p className="mt-3 font-medium text-slate-700">
                      {q || status !== 'all' ? 'Tidak ada aplikasi yang cocok dengan filter' : 'Belum ada aplikasi'}
                    </p>
                  </td>
                </tr>
              )}

              {rows.map((a) => {
                const Icon = resolveIcon(a.icon);
                return (
                  <tr key={a.id} className={clsx('hover:bg-slate-50/70', a.is_deleted && 'bg-red-50/30 text-slate-400')}>
                    <td className="px-4 py-3 tabular-nums text-slate-500">{a.sort_order}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-slate-700">{a.app_code}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => setDrawer({ mode: 'view', application: a })}
                            className="inline-flex items-center gap-1.5 text-left font-medium text-slate-900 hover:text-brand-700 hover:underline"
                          >
                            {a.app_name}
                            {a.is_protected && <Lock className="h-3.5 w-3.5 text-slate-400" aria-label="Aplikasi inti" />}
                          </button>
                          {a.description && <p className="line-clamp-1 max-w-md text-xs text-slate-500">{a.description}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{a.base_url || <span className="text-slate-300">–</span>}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={rowStatus(a)} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                      <p>{formatDateTime(a.updated_at ?? a.created_at)}</p>
                      <p>{a.updated_by ?? a.created_by}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-0.5">
                        <IconButton title="Lihat detail" onClick={() => setDrawer({ mode: 'view', application: a })}>
                          <Eye className="h-4 w-4" />
                        </IconButton>
                        {a.is_deleted ? (
                          canUpdate && (
                            <IconButton title="Pulihkan" onClick={() => setConfirm({ action: 'restore', application: a })}>
                              <ArchiveRestore className="h-4 w-4" />
                            </IconButton>
                          )
                        ) : (
                          <>
                            {canUpdate && (
                              <IconButton title="Ubah" onClick={() => setDrawer({ mode: 'edit', application: a })}>
                                <Pencil className="h-4 w-4" />
                              </IconButton>
                            )}
                            {/* Aplikasi inti (AD-01) tidak dapat dinonaktifkan/dihapus */}
                            {canUpdate &&
                              !a.is_protected &&
                              (a.is_active ? (
                                <IconButton title="Nonaktifkan" onClick={() => setConfirm({ action: 'deactivate', application: a })}>
                                  <PowerOff className="h-4 w-4" />
                                </IconButton>
                              ) : (
                                <IconButton title="Aktifkan" onClick={() => setConfirm({ action: 'activate', application: a })}>
                                  <Power className="h-4 w-4" />
                                </IconButton>
                              ))}
                            {canDelete && !a.is_protected && (
                              <IconButton title="Hapus" danger onClick={() => setConfirm({ action: 'delete', application: a })}>
                                <Trash2 className="h-4 w-4" />
                              </IconButton>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-200">
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={resetPage(setPageSize)} />
        </div>
      </div>

      <ApplicationFormDrawer
        open={!!drawer}
        mode={drawer?.mode ?? 'create'}
        application={drawer?.application ?? null}
        canUpdate={canUpdate}
        nextSortOrder={nextSortOrder}
        onClose={() => setDrawer(null)}
        onModeChange={(mode) => setDrawer((d) => (d ? { ...d, mode } : d))}
        onSaved={(saved, mode) => {
          toast.success(mode === 'create' ? `Aplikasi ${saved.app_code} berhasil dibuat` : `Aplikasi ${saved.app_code} berhasil diperbarui`);
          setDrawer(null);
          void qc.invalidateQueries({ queryKey: ['applications'] });
        }}
      />

      {confirm && (
        <ConfirmDialog
          open
          title={CONFIRM_TEXT[confirm.action].title}
          message={confirmMessage(confirm.action, confirm.application)}
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
