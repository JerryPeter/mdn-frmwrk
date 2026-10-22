import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArchiveRestore, Building2, Eye, Pencil, Plus, Power, PowerOff, Trash2 } from 'lucide-react';
import { companiesApi } from '@/api/companies';
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
import { useSession } from '@/stores/session';
import { toast } from '@/stores/toast';
import type { Company, CompanyListParams, CompanySortColumn } from '@/types/company';
import { CompanyFormDrawer, type FormMode } from './CompanyFormDrawer';

const MENU = 'UM_COMPANY';

type ConfirmAction = 'activate' | 'deactivate' | 'delete' | 'restore';

const CONFIRM_TEXT: Record<ConfirmAction, { title: string; label: string; variant: 'primary' | 'danger' }> = {
  activate: { title: 'Aktifkan company?', label: 'Ya, aktifkan', variant: 'primary' },
  deactivate: { title: 'Nonaktifkan company?', label: 'Ya, nonaktifkan', variant: 'danger' },
  delete: { title: 'Hapus company?', label: 'Ya, hapus', variant: 'danger' },
  restore: { title: 'Pulihkan company?', label: 'Ya, pulihkan', variant: 'primary' },
};

const SUCCESS_TEXT: Record<ConfirmAction, string> = {
  activate: 'diaktifkan',
  deactivate: 'dinonaktifkan',
  delete: 'dihapus',
  restore: 'dipulihkan',
};


export default function CompaniesPage() {
  const qc = useQueryClient();
  const activeCompanyId = useSession((s) => s.activeContext?.company_id);
  const canCreate = usePermission(MENU, 'CREATE');
  const canUpdate = usePermission(MENU, 'UPDATE');
  const canDelete = usePermission(MENU, 'DELETE');

  // Filter & sort
  const [search, setSearch] = useState('');
  const q = useDebounce(search.trim(), 300);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [sortBy, setSortBy] = useState<CompanySortColumn>('company_code');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const params: CompanyListParams = {
    page,
    page_size: pageSize,
    q,
    is_active: statusToParam(status),
    sort_by: sortBy,
    sort_dir: sortDir,
    include_deleted: includeDeleted,
  };

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['companies', params],
    queryFn: () => companiesApi.list(params),
    placeholderData: keepPreviousData,
  });
  const rows = data?.data ?? [];
  const total = data?.meta.total ?? 0;

  // Kembali ke halaman 1 bila filter berubah
  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  const handleSort = (column: CompanySortColumn, dir: SortDir) => {
    setSortBy(column);
    setSortDir(dir);
    setPage(1);
  };

  // Drawer form
  const [drawer, setDrawer] = useState<{ mode: FormMode; company: Company | null } | null>(null);

  // Konfirmasi aksi
  const [confirm, setConfirm] = useState<{ action: ConfirmAction; company: Company } | null>(null);
  const actionMutation = useMutation({
    mutationFn: ({ action, company }: { action: ConfirmAction; company: Company }) => {
      switch (action) {
        case 'activate':
          return companiesApi.setStatus(company.id, true);
        case 'deactivate':
          return companiesApi.setStatus(company.id, false);
        case 'delete':
          return companiesApi.remove(company.id);
        case 'restore':
          return companiesApi.restore(company.id);
      }
    },
    onSuccess: (_res, { action, company }) => {
      toast.success(`Company ${company.company_code} berhasil ${SUCCESS_TEXT[action]}`);
      setConfirm(null);
      void qc.invalidateQueries({ queryKey: ['companies'] });
      // Status company memengaruhi hak akses (BR-22)
      if (company.id === activeCompanyId) void qc.invalidateQueries({ queryKey: ['auth'] });
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
      setConfirm(null);
    },
  });

  const confirmMessage = (action: ConfirmAction, c: Company) => {
    const name = (
      <span className="font-medium text-slate-800">
        {c.company_code} – {c.company_name}
      </span>
    );
    const affectsSelf = c.id === activeCompanyId && (action === 'deactivate' || action === 'delete');
    return (
      <div className="space-y-3">
        <p>
          {action === 'delete' && <>Company {name} akan dihapus. Data tetap tersimpan dan dapat dipulihkan.</>}
          {action === 'deactivate' && <>Company {name} akan dinonaktifkan. Seluruh user kehilangan akses di company ini sampai diaktifkan kembali.</>}
          {action === 'activate' && <>Company {name} akan diaktifkan kembali.</>}
          {action === 'restore' && <>Company {name} akan dipulihkan dari status terhapus.</>}
        </p>
        {affectsSelf && (
          <Alert variant="warning" title="Company ini sedang Anda gunakan">
            Akses Anda pada konteks yang aktif sekarang akan ikut hilang.
          </Alert>
        )}
      </div>
    );
  };


  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Master Data</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Companies</h1>
          <p className="mt-1 text-sm text-slate-500">Daftar perusahaan yang dapat memakai aplikasi internal.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setDrawer({ mode: 'create', company: null })}>
            <Plus className="h-4 w-4" /> Tambah Company
          </Button>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
          <SearchInput
            value={search}
            onChange={resetPage(setSearch)}
            placeholder="Cari kode, nama, atau nama singkat..."
            label="Cari company"
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

        {/* Tabel */}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide">
              <tr>
                <SortableHeader label="Kode" column="company_code" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Nama" column="company_name" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left font-semibold text-slate-500">Kontak</th>
                <SortableHeader label="Status" column="is_active" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Terakhir diubah" column="updated_at" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-right font-semibold text-slate-500">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-4 py-4">
                      <div className="h-4 animate-pulse rounded bg-slate-100" />
                    </td>
                  </tr>
                ))}

              {!isLoading && rows.length === 0 && !error && (
                <tr>
                  <td colSpan={6} className="px-4 py-14 text-center">
                    <Building2 className="mx-auto h-10 w-10 text-slate-300" />
                    <p className="mt-3 font-medium text-slate-700">
                      {q || status !== 'all' ? 'Tidak ada company yang cocok dengan filter' : 'Belum ada company'}
                    </p>
                    {canCreate && !q && status === 'all' && (
                      <p className="mt-1 text-sm text-slate-500">Klik "Tambah Company" untuk membuat data pertama.</p>
                    )}
                  </td>
                </tr>
              )}

              {rows.map((c) => (
                <tr key={c.id} className={clsx('hover:bg-slate-50/70', c.is_deleted && 'bg-red-50/30 text-slate-400')}>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-slate-700">{c.company_code}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setDrawer({ mode: 'view', company: c })}
                      className="text-left font-medium text-slate-900 hover:text-brand-700 hover:underline"
                    >
                      {c.company_name}
                    </button>
                    {c.short_name && <p className="text-xs text-slate-500">{c.short_name}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.email || c.phone ? (
                      <>
                        {c.email && <p className="truncate">{c.email}</p>}
                        {c.phone && <p className="text-xs text-slate-500">{c.phone}</p>}
                      </>
                    ) : (
                      <span className="text-slate-300">–</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={rowStatus(c)} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                    <p>{formatDateTime(c.updated_at ?? c.created_at)}</p>
                    <p>{c.updated_by ?? c.created_by}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-0.5">
                      <IconButton title="Lihat detail" onClick={() => setDrawer({ mode: 'view', company: c })}>
                        <Eye className="h-4 w-4" />
                      </IconButton>
                      {c.is_deleted ? (
                        canUpdate && (
                          <IconButton title="Pulihkan" onClick={() => setConfirm({ action: 'restore', company: c })}>
                            <ArchiveRestore className="h-4 w-4" />
                          </IconButton>
                        )
                      ) : (
                        <>
                          {canUpdate && (
                            <IconButton title="Ubah" onClick={() => setDrawer({ mode: 'edit', company: c })}>
                              <Pencil className="h-4 w-4" />
                            </IconButton>
                          )}
                          {canUpdate &&
                            (c.is_active ? (
                              <IconButton title="Nonaktifkan" onClick={() => setConfirm({ action: 'deactivate', company: c })}>
                                <PowerOff className="h-4 w-4" />
                              </IconButton>
                            ) : (
                              <IconButton title="Aktifkan" onClick={() => setConfirm({ action: 'activate', company: c })}>
                                <Power className="h-4 w-4" />
                              </IconButton>
                            ))}
                          {canDelete && (
                            <IconButton title="Hapus" danger onClick={() => setConfirm({ action: 'delete', company: c })}>
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
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={resetPage(setPageSize)}
          />
        </div>
      </div>

      <CompanyFormDrawer
        open={!!drawer}
        mode={drawer?.mode ?? 'create'}
        company={drawer?.company ?? null}
        canUpdate={canUpdate}
        onClose={() => setDrawer(null)}
        onModeChange={(mode) => setDrawer((d) => (d ? { ...d, mode } : d))}
        onSaved={(saved, mode) => {
          toast.success(mode === 'create' ? `Company ${saved.company_code} berhasil dibuat` : `Company ${saved.company_code} berhasil diperbarui`);
          setDrawer(null);
          void qc.invalidateQueries({ queryKey: ['companies'] });
        }}
      />

      {confirm && (
        <ConfirmDialog
          open
          title={CONFIRM_TEXT[confirm.action].title}
          message={confirmMessage(confirm.action, confirm.company)}
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
