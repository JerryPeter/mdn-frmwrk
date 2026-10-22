import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Pencil, Plus, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { getErrorMessage } from '@/api/errors';
import { userGroupsApi } from '@/api/userGroups';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { IconButton } from '@/components/ui/IconButton';
import { MembershipStatusBadge } from '@/components/ui/MembershipStatusBadge';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { SortableHeader, type SortDir } from '@/components/ui/SortableHeader';
import { Spinner } from '@/components/ui/Spinner';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermission } from '@/hooks/usePermission';
import { formatDate } from '@/lib/format';
import { useSession } from '@/stores/session';
import { toast } from '@/stores/toast';
import type { GroupMember, MemberListParams, MemberSortColumn } from '@/types/group';
import { GroupPicker, useGroupLookup } from '../shared/GroupPicker';
import { MemberFormModal } from './MemberFormModal';

const MENU = 'UM_GROUP_MEMBER';

/** PRD §8.11: pilih group → daftar anggota */
export default function GroupMembersPage() {
  const qc = useQueryClient();
  const selfId = useSession((s) => s.user?.id);
  const canCreate = usePermission(MENU, 'CREATE');
  const canUpdate = usePermission(MENU, 'UPDATE');
  const canDelete = usePermission(MENU, 'DELETE');

  // Group terpilih disimpan di URL (?group=ID)
  const [urlParams, setUrlParams] = useSearchParams();
  const groupsQuery = useGroupLookup();
  const groups = groupsQuery.data;
  const groupId = urlParams.get('group') ?? groups?.[0]?.id;
  const group = groups?.find((g) => g.id === groupId);

  const [search, setSearch] = useState('');
  const q = useDebounce(search.trim(), 300);
  const [sortBy, setSortBy] = useState<MemberSortColumn>('username');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const params: MemberListParams = { page, page_size: pageSize, q, sort_by: sortBy, sort_dir: sortDir };
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['group-members', group?.id, params],
    queryFn: () => userGroupsApi.members(group!.id, params),
    enabled: !!group,
    placeholderData: keepPreviousData,
  });
  const rows = data?.data ?? [];
  const total = data?.meta.total ?? 0;

  const selectGroup = (id: string) => {
    setUrlParams({ group: id }, { replace: true });
    setSearch('');
    setPage(1);
  };

  const handleSort = (column: MemberSortColumn, dir: SortDir) => {
    setSortBy(column);
    setSortDir(dir);
    setPage(1);
  };

  const refresh = (member?: GroupMember) => {
    void qc.invalidateQueries({ queryKey: ['group-members'] });
    void qc.invalidateQueries({ queryKey: ['lookups', 'user-groups'] });
    void qc.invalidateQueries({ queryKey: ['user-groups'] });
    // Keanggotaan sendiri berubah → muat ulang menu & permission sesi (BR-22)
    if (member && member.user.id === selfId) void qc.invalidateQueries({ queryKey: ['auth'] });
  };

  const [form, setForm] = useState<{ member: GroupMember | null } | null>(null);
  const [toDelete, setToDelete] = useState<GroupMember | null>(null);
  const deleteMutation = useMutation({
    mutationFn: (m: GroupMember) => userGroupsApi.removeMember(group!.id, m.id),
    onSuccess: (_res, m) => {
      toast.success(`${m.user.username} dihapus dari group ${group!.code} (${m.company.code})`);
      setToDelete(null);
      refresh(m);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
      setToDelete(null);
    },
  });

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Access Control</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Group Members</h1>
        <p className="mt-1 text-sm text-slate-500">Anggota group per company beserta masa berlakunya. Hak akses user mengikuti group yang diikutinya.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <GroupPicker
          groups={groups}
          isLoading={groupsQuery.isLoading}
          error={groupsQuery.error}
          selectedId={group?.id}
          onSelect={(g) => selectGroup(g.id)}
        />

        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
          {!group ? (
            <div className="flex min-h-[20rem] flex-col items-center justify-center p-8 text-center">
              <ShieldCheck className="h-10 w-10 text-slate-300" />
              <p className="mt-3 font-medium text-slate-700">{groupsQuery.isLoading ? 'Memuat...' : 'Pilih group di sebelah kiri'}</p>
            </div>
          ) : (
            <>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-slate-900">{group.name}</h2>
                  <p className="text-sm text-slate-500">
                    <span className="font-mono">
                      {group.app_code} · {group.code}
                    </span>
                    {data && <> · {total} anggota</>}
                    {!group.is_active && <span className="ml-2 rounded bg-amber-50 px-1.5 text-xs text-amber-800">Group nonaktif: anggota tidak mendapat akses</span>}
                  </p>
                </div>
                {canCreate && (
                  <Button onClick={() => setForm({ member: null })}>
                    <Plus className="h-4 w-4" /> Tambah Anggota
                  </Button>
                )}
              </header>

              <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
                <SearchInput
                  value={search}
                  onChange={(v) => {
                    setSearch(v);
                    setPage(1);
                  }}
                  placeholder="Cari username, nama, email..."
                  label="Cari anggota"
                />
                {isFetching && !isLoading && <Spinner className="h-4 w-4 text-slate-400" />}
              </div>

              {error && (
                <div className="p-4">
                  <Alert variant="error" title="Gagal memuat anggota">
                    {getErrorMessage(error)}{' '}
                    <button className="font-medium underline" onClick={() => refetch()}>
                      Coba lagi
                    </button>
                  </Alert>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm" aria-label="Anggota group">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide">
                    <tr>
                      <SortableHeader label="User" column="username" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                      <SortableHeader label="Company" column="company_code" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                      <SortableHeader label="Berlaku mulai" column="valid_from" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                      <SortableHeader label="Sampai" column="valid_to" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                      <th className="px-4 py-3 text-left font-semibold text-slate-500">Status</th>
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
                          <UserPlus className="mx-auto h-10 w-10 text-slate-300" />
                          <p className="mt-3 font-medium text-slate-700">{q ? 'Tidak ada anggota yang cocok' : 'Group ini belum memiliki anggota'}</p>
                        </td>
                      </tr>
                    )}
                    {rows.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">{m.user.full_name}</p>
                          <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                            <span className="font-mono">{m.user.username}</span>
                            {m.user.is_locked && (
                              <span className="inline-flex items-center gap-0.5 text-amber-700">
                                <Lock className="h-3 w-3" /> terkunci
                              </span>
                            )}
                            {!m.user.is_active && <span className="text-slate-500">· user nonaktif</span>}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <p className="font-mono text-xs font-semibold text-slate-700">{m.company.code}</p>
                          <p className="text-xs text-slate-500">{m.company.name}</p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(m.valid_from)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {m.valid_to ? formatDate(m.valid_to) : <span className="text-slate-400">Tanpa batas</span>}
                        </td>
                        <td className="px-4 py-3">
                          <MembershipStatusBadge status={m.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-0.5">
                            {canUpdate && (
                              <IconButton title="Ubah" onClick={() => setForm({ member: m })}>
                                <Pencil className="h-4 w-4" />
                              </IconButton>
                            )}
                            {canDelete && (
                              <IconButton title="Hapus" danger onClick={() => setToDelete(m)}>
                                <Trash2 className="h-4 w-4" />
                              </IconButton>
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
                  onPageSizeChange={(v) => {
                    setPageSize(v);
                    setPage(1);
                  }}
                />
              </div>
            </>
          )}
        </section>
      </div>

      {group && form && (
        <MemberFormModal
          open
          group={group}
          member={form.member}
          onClose={() => setForm(null)}
          onSaved={(saved, mode) => {
            toast.success(
              mode === 'create'
                ? `${saved.user.username} ditambahkan ke group ${group.code} (${saved.company.code})`
                : `Keanggotaan ${saved.user.username} berhasil diperbarui`,
            );
            setForm(null);
            refresh(saved);
          }}
        />
      )}

      {toDelete && group && (
        <ConfirmDialog
          open
          title="Hapus anggota group?"
          message={
            <>
              <span className="font-medium text-slate-800">{toDelete.user.full_name}</span> ({toDelete.user.username}) akan dikeluarkan dari group{' '}
              <span className="font-medium text-slate-800">{group.name}</span> untuk company {toDelete.company.code}. Hak akses dari keanggotaan ini
              langsung hilang.
            </>
          }
          confirmLabel="Ya, hapus"
          variant="danger"
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(toDelete)}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
