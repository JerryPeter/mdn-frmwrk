import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  ArchiveRestore,
  Download,
  Eye,
  KeyRound,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react';
import { getErrorMessage } from '@/api/errors';
import { usersApi } from '@/api/users';
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
import type { AuthProvider, User, UserListParams, UserSortColumn, UserWithPassword } from '@/types/user';
import { ImportUsersModal } from './ImportUsersModal';
import { PasswordRevealModal } from './PasswordRevealModal';
import { UserFormDrawer, type FormMode } from './UserFormDrawer';

const MENU = 'UM_USER';

type ConfirmAction = 'activate' | 'deactivate' | 'lock' | 'unlock' | 'reset' | 'delete' | 'restore';

const CONFIRM_TEXT: Record<ConfirmAction, { title: string; label: string; variant: 'primary' | 'danger' }> = {
  activate: { title: 'Aktifkan user?', label: 'Ya, aktifkan', variant: 'primary' },
  deactivate: { title: 'Nonaktifkan user?', label: 'Ya, nonaktifkan', variant: 'danger' },
  lock: { title: 'Kunci user?', label: 'Ya, kunci', variant: 'danger' },
  unlock: { title: 'Buka kunci user?', label: 'Ya, buka kunci', variant: 'primary' },
  reset: { title: 'Reset password?', label: 'Ya, reset', variant: 'danger' },
  delete: { title: 'Hapus user?', label: 'Ya, hapus', variant: 'danger' },
  restore: { title: 'Pulihkan user?', label: 'Ya, pulihkan', variant: 'primary' },
};

const SUCCESS_TEXT: Record<ConfirmAction, string> = {
  activate: 'diaktifkan',
  deactivate: 'dinonaktifkan',
  lock: 'dikunci',
  unlock: 'dibuka kuncinya',
  reset: 'direset password-nya',
  delete: 'dihapus',
  restore: 'dipulihkan',
};

type LockFilter = 'all' | 'locked' | 'unlocked';

const SELECT_CLASS =
  'h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';

export default function UsersPage() {
  const qc = useQueryClient();
  const selfId = useSession((s) => s.user?.id);
  const canCreate = usePermission(MENU, 'CREATE');
  const canUpdate = usePermission(MENU, 'UPDATE');
  const canDelete = usePermission(MENU, 'DELETE');
  const canExport = usePermission(MENU, 'EXPORT_EXCEL');
  const canImport = usePermission(MENU, 'IMPORT_EXCEL');

  // Filter & sort
  const [search, setSearch] = useState('');
  const q = useDebounce(search.trim(), 300);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [lockFilter, setLockFilter] = useState<LockFilter>('all');
  const [provider, setProvider] = useState<AuthProvider | ''>('');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [sortBy, setSortBy] = useState<UserSortColumn>('username');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const filter: Omit<UserListParams, 'page' | 'page_size'> = {
    q,
    is_active: statusToParam(status),
    is_locked: lockFilter === 'all' ? undefined : lockFilter === 'locked',
    auth_provider: provider || undefined,
    sort_by: sortBy,
    sort_dir: sortDir,
    include_deleted: includeDeleted,
  };
  const params: UserListParams = { ...filter, page, page_size: pageSize };
  const filtered = !!q || status !== 'all' || lockFilter !== 'all' || !!provider;

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['users', params],
    queryFn: () => usersApi.list(params),
    placeholderData: keepPreviousData,
  });
  const rows = data?.data ?? [];
  const total = data?.meta.total ?? 0;

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  const handleSort = (column: UserSortColumn, dir: SortDir) => {
    setSortBy(column);
    setSortDir(dir);
    setPage(1);
  };

  const refresh = () => void qc.invalidateQueries({ queryKey: ['users'] });

  // Drawer, password sekali tampil, import
  const [drawer, setDrawer] = useState<{ mode: FormMode; user: User | null } | null>(null);
  const [reveal, setReveal] = useState<{ title: string; username: string; password: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // Export mengikuti filter list
  const exportMutation = useMutation({
    mutationFn: () => usersApi.exportExcel(filter),
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // Konfirmasi aksi
  const [confirm, setConfirm] = useState<{ action: ConfirmAction; user: User } | null>(null);
  const actionMutation = useMutation({
    mutationFn: ({ action, user }: { action: ConfirmAction; user: User }): Promise<unknown> => {
      switch (action) {
        case 'activate':
          return usersApi.setStatus(user.id, true);
        case 'deactivate':
          return usersApi.setStatus(user.id, false);
        case 'lock':
          return usersApi.lock(user.id);
        case 'unlock':
          return usersApi.unlock(user.id);
        case 'reset':
          return usersApi.resetPassword(user.id);
        case 'delete':
          return usersApi.remove(user.id);
        case 'restore':
          return usersApi.restore(user.id);
      }
    },
    onSuccess: (res, { action, user }) => {
      setConfirm(null);
      refresh();
      if (action === 'reset') {
        const pwd = (res as UserWithPassword).generated_password;
        if (pwd) setReveal({ title: 'Password berhasil direset', username: user.username, password: pwd });
        return;
      }
      let message = `User ${user.username} berhasil ${SUCCESS_TEXT[action]}`;
      if (action === 'restore') {
        const restored = (res as { restored_memberships?: number }).restored_memberships ?? 0;
        if (restored) message += ` beserta ${restored} keanggotaan group`;
      }
      toast.success(message);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
      setConfirm(null);
    },
  });

  const confirmMessage = (action: ConfirmAction, u: User) => {
    const name = (
      <span className="font-medium text-slate-800">
        {u.username} – {u.full_name}
      </span>
    );
    return (
      <p>
        {action === 'delete' && (
          <>
            User {name} akan dihapus beserta {u.membership_count} keanggotaan group-nya dan seluruh sesinya diakhiri. Data dapat dipulihkan.
          </>
        )}
        {action === 'deactivate' && <>User {name} akan dinonaktifkan dan langsung keluar dari seluruh sesi aktif.</>}
        {action === 'activate' && <>User {name} akan diaktifkan kembali.</>}
        {action === 'lock' && <>User {name} akan dikunci dan tidak dapat login sampai kuncinya dibuka.</>}
        {action === 'unlock' && <>Kunci user {name} akan dibuka dan hitungan gagal login direset.</>}
        {action === 'reset' && (
          <>
            Password user {name} akan diganti dengan password acak. Seluruh sesi user diakhiri dan user wajib mengganti password saat login.
          </>
        )}
        {action === 'restore' && <>User {name} akan dipulihkan beserta keanggotaan group yang terhapus bersamanya.</>}
      </p>
    );
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Master Data</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Users</h1>
          <p className="mt-1 text-sm text-slate-500">Akun pengguna aplikasi internal. Hak akses diatur lewat keanggotaan group.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canExport && (
            <Button variant="secondary" onClick={() => exportMutation.mutate()} loading={exportMutation.isPending}>
              <Download className="h-4 w-4" /> Export
            </Button>
          )}
          {canImport && (
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" /> Import
            </Button>
          )}
          {canCreate && (
            <Button onClick={() => setDrawer({ mode: 'create', user: null })}>
              <Plus className="h-4 w-4" /> Tambah User
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
          <SearchInput
            value={search}
            onChange={resetPage(setSearch)}
            placeholder="Cari username, nama, email, NIK..."
            label="Cari user"
          />
          <StatusTabs value={status} onChange={resetPage(setStatus)} />
          <select
            aria-label="Filter kunci"
            value={lockFilter}
            onChange={(e) => resetPage(setLockFilter)(e.target.value as LockFilter)}
            className={SELECT_CLASS}
          >
            <option value="all">Semua status kunci</option>
            <option value="locked">Terkunci</option>
            <option value="unlocked">Tidak terkunci</option>
          </select>
          <select
            aria-label="Filter auth provider"
            value={provider}
            onChange={(e) => resetPage(setProvider)(e.target.value as AuthProvider | '')}
            className={SELECT_CLASS}
          >
            <option value="">Semua provider</option>
            <option value="LOCAL">LOCAL</option>
            <option value="LDAP">LDAP</option>
            <option value="SSO">SSO</option>
          </select>
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
                <SortableHeader label="Username" column="username" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Nama" column="full_name" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Email" column="email" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Provider" column="auth_provider" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Status" column="is_active" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Login terakhir" column="last_login_at" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
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
                    <UserRound className="mx-auto h-10 w-10 text-slate-300" />
                    <p className="mt-3 font-medium text-slate-700">{filtered ? 'Tidak ada user yang cocok dengan filter' : 'Belum ada user'}</p>
                  </td>
                </tr>
              )}

              {rows.map((u) => {
                const isSelf = u.id === selfId;
                return (
                  <tr key={u.id} className={clsx('hover:bg-slate-50/70', u.is_deleted && 'bg-red-50/30 text-slate-400')}>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-slate-700">{u.username}</span>
                      {isSelf && <span className="ml-1.5 rounded bg-brand-50 px-1.5 text-[10px] font-medium text-brand-700">Anda</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setDrawer({ mode: 'view', user: u })}
                        className="text-left font-medium text-slate-900 hover:text-brand-700 hover:underline"
                      >
                        {u.full_name}
                      </button>
                      <p className="text-xs text-slate-500">
                        {u.employee_no ?? 'Tanpa NIK'} · {u.membership_count} akses
                      </p>
                    </td>
                    <td className="max-w-[16rem] truncate px-4 py-3 text-slate-600">{u.email}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{u.auth_provider}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge status={rowStatus(u)} />
                        {u.is_locked && !u.is_deleted && <StatusBadge status="locked" />}
                      </div>
                      {u.must_change_password && !u.is_deleted && <p className="mt-0.5 text-[11px] text-amber-700">Wajib ganti password</p>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                      {u.last_login_at ? formatDateTime(u.last_login_at) : 'Belum pernah'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-0.5">
                        <IconButton title="Lihat detail" onClick={() => setDrawer({ mode: 'view', user: u })}>
                          <Eye className="h-4 w-4" />
                        </IconButton>
                        {u.is_deleted ? (
                          canUpdate && (
                            <IconButton title="Pulihkan" onClick={() => setConfirm({ action: 'restore', user: u })}>
                              <ArchiveRestore className="h-4 w-4" />
                            </IconButton>
                          )
                        ) : (
                          <>
                            {canUpdate && (
                              <IconButton title="Ubah" onClick={() => setDrawer({ mode: 'edit', user: u })}>
                                <Pencil className="h-4 w-4" />
                              </IconButton>
                            )}
                            {canUpdate && !isSelf && u.auth_provider === 'LOCAL' && (
                              <IconButton title="Reset password" onClick={() => setConfirm({ action: 'reset', user: u })}>
                                <KeyRound className="h-4 w-4" />
                              </IconButton>
                            )}
                            {canUpdate &&
                              (u.is_locked ? (
                                <IconButton title="Buka kunci" onClick={() => setConfirm({ action: 'unlock', user: u })}>
                                  <LockOpen className="h-4 w-4" />
                                </IconButton>
                              ) : (
                                !isSelf && (
                                  <IconButton title="Kunci" onClick={() => setConfirm({ action: 'lock', user: u })}>
                                    <Lock className="h-4 w-4" />
                                  </IconButton>
                                )
                              ))}
                            {canUpdate &&
                              (u.is_active ? (
                                !isSelf && (
                                  <IconButton title="Nonaktifkan" onClick={() => setConfirm({ action: 'deactivate', user: u })}>
                                    <PowerOff className="h-4 w-4" />
                                  </IconButton>
                                )
                              ) : (
                                <IconButton title="Aktifkan" onClick={() => setConfirm({ action: 'activate', user: u })}>
                                  <Power className="h-4 w-4" />
                                </IconButton>
                              ))}
                            {canDelete && !isSelf && (
                              <IconButton title="Hapus" danger onClick={() => setConfirm({ action: 'delete', user: u })}>
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

      <UserFormDrawer
        open={!!drawer}
        mode={drawer?.mode ?? 'create'}
        user={drawer?.user ?? null}
        canUpdate={canUpdate}
        onClose={() => setDrawer(null)}
        onModeChange={(mode) => setDrawer((d) => (d ? { ...d, mode } : d))}
        onSaved={(saved, mode) => {
          setDrawer(null);
          refresh();
          const pwd = 'generated_password' in saved ? saved.generated_password : null;
          if (mode === 'create' && pwd) {
            setReveal({ title: `User ${saved.username} berhasil dibuat`, username: saved.username, password: pwd });
          } else {
            toast.success(mode === 'create' ? `User ${saved.username} berhasil dibuat` : `User ${saved.username} berhasil diperbarui`);
          }
        }}
      />

      {reveal && <PasswordRevealModal open {...reveal} onClose={() => setReveal(null)} />}

      <ImportUsersModal open={importOpen} onClose={() => setImportOpen(false)} onImported={refresh} />

      {confirm && (
        <ConfirmDialog
          open
          title={CONFIRM_TEXT[confirm.action].title}
          message={confirmMessage(confirm.action, confirm.user)}
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
