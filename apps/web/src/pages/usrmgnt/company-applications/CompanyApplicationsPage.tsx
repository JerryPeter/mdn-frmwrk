import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AppWindow, Building2, Users } from 'lucide-react';
import { companyApplicationsApi, type CompanyApplicationItem } from '@/api/companyApplications';
import { getErrorMessage } from '@/api/errors';
import { lookupsApi } from '@/api/lookups';
import { Alert } from '@/components/ui/Alert';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SearchInput } from '@/components/ui/SearchInput';
import { Spinner } from '@/components/ui/Spinner';
import { Switch } from '@/components/ui/Switch';
import { usePermission } from '@/hooks/usePermission';
import { formatDateTime } from '@/lib/format';
import { resolveIcon } from '@/lib/icons';
import { useSession } from '@/stores/session';
import { toast } from '@/stores/toast';

const MENU = 'UM_COMPANY_APP';

/** PRD §8.6: pilih company → daftar aplikasi dengan toggle */
export default function CompanyApplicationsPage() {
  const qc = useQueryClient();
  const activeCompanyId = useSession((s) => s.activeContext?.company_id);
  const canCreate = usePermission(MENU, 'CREATE');
  const canDelete = usePermission(MENU, 'DELETE');

  // Company terpilih disimpan di URL (?company=KODE)
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const { data: companies, isLoading: companiesLoading, error: companiesError } = useQuery({
    queryKey: ['lookups', 'companies'],
    queryFn: () => lookupsApi.companies(),
  });
  const companyCode = params.get('company') ?? companies?.[0]?.code ?? '';
  const company = companies?.find((c) => c.code === companyCode);
  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (companies ?? []).filter((c) => !q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
  }, [companies, search]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['company-apps', company?.id],
    queryFn: () => companyApplicationsApi.list(company!.id),
    enabled: !!company,
  });
  const assignedCount = data?.items.filter((i) => i.is_assigned).length ?? 0;

  const [pending, setPending] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<CompanyApplicationItem | null>(null);

  const mutation = useMutation({
    mutationFn: ({ item, assign }: { item: CompanyApplicationItem; assign: boolean }) =>
      assign ? companyApplicationsApi.assign(company!.id, item.application_id) : companyApplicationsApi.unassign(company!.id, item.application_id),
    onMutate: ({ item }) => setPending(item.application_id),
    onSuccess: (_res, { item, assign }) => {
      toast.success(
        assign
          ? `${item.app_name} ditambahkan ke ${company!.code}`
          : `${item.app_name} dilepas dari ${company!.code}`,
      );
      setConfirm(null);
      void qc.invalidateQueries({ queryKey: ['company-apps', company!.id] });
      if (company!.id === activeCompanyId) void qc.invalidateQueries({ queryKey: ['auth'] });
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
      setConfirm(null);
    },
    onSettled: () => setPending(null),
  });

  const onToggle = (item: CompanyApplicationItem, next: boolean) => {
    if (next) mutation.mutate({ item, assign: true });
    else setConfirm(item);
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Access Control</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Company Applications</h1>
        <p className="mt-1 text-sm text-slate-500">
          Tentukan aplikasi yang dimiliki setiap company. User hanya dapat diberi akses aplikasi yang dimiliki company-nya.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        {/* Daftar company */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <SearchInput value={search} onChange={setSearch} placeholder="Cari company..." label="Cari company" />
          </div>
          <div className="max-h-[calc(100vh-16rem)] overflow-y-auto p-2">
            {companiesLoading && (
              <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
                <Spinner className="h-4 w-4" /> Memuat company...
              </div>
            )}
            {companiesError && <Alert variant="error">{getErrorMessage(companiesError)}</Alert>}
            {companies && filteredCompanies.length === 0 && <p className="p-4 text-sm text-slate-500">Tidak ada company yang cocok.</p>}
            <ul className="space-y-0.5" aria-label="Daftar company">
              {filteredCompanies.map((c) => {
                const active = c.code === companyCode;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      aria-current={active ? 'true' : undefined}
                      onClick={() => setParams({ company: c.code }, { replace: true })}
                      className={clsx(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                        active ? 'bg-brand-50 ring-1 ring-inset ring-brand-200' : 'hover:bg-slate-50',
                      )}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                        <Building2 className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-900">{c.name}</span>
                        <span className="block font-mono text-xs text-slate-500">{c.code}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Aplikasi milik company */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          {!company ? (
            <div className="flex min-h-[20rem] flex-col items-center justify-center p-8 text-center">
              <Building2 className="h-10 w-10 text-slate-300" />
              <p className="mt-3 font-medium text-slate-700">Pilih company di sebelah kiri</p>
            </div>
          ) : (
            <>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{company.name}</h2>
                  <p className="text-sm text-slate-500">
                    <span className="font-mono">{company.code}</span>
                    {data && (
                      <>
                        {' '}
                        · {assignedCount} dari {data.items.length} aplikasi dimiliki
                      </>
                    )}
                  </p>
                </div>
              </header>

              <div className="p-5">
                {isLoading && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Spinner className="h-4 w-4" /> Memuat aplikasi...
                  </div>
                )}
                {error && (
                  <Alert variant="error" title="Gagal memuat aplikasi">
                    {getErrorMessage(error)}{' '}
                    <button className="font-medium underline" onClick={() => refetch()}>
                      Coba lagi
                    </button>
                  </Alert>
                )}
                {data && data.items.length === 0 && (
                  <div className="py-10 text-center">
                    <AppWindow className="mx-auto h-10 w-10 text-slate-300" />
                    <p className="mt-3 text-sm text-slate-600">Belum ada aplikasi terdaftar.</p>
                  </div>
                )}
                {data && (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {data.items.map((item) => {
                      const Icon = resolveIcon(item.icon);
                      const inUse = item.is_assigned && item.member_count > 0;
                      // Toggle on butuh CREATE; toggle off butuh DELETE dan tidak boleh sedang dipakai
                      const allowed = item.is_assigned ? canDelete && !inUse : canCreate && item.is_active;
                      const reason = item.is_assigned
                        ? !canDelete
                          ? 'Anda tidak memiliki hak akses untuk melepas aplikasi'
                          : inUse
                            ? `Masih dipakai ${item.member_count} keanggotaan group. Hapus keanggotaannya terlebih dahulu.`
                            : undefined
                        : !canCreate
                          ? 'Anda tidak memiliki hak akses untuk menambah aplikasi'
                          : !item.is_active
                            ? 'Aplikasi sedang nonaktif'
                            : undefined;
                      return (
                        <li key={item.application_id} className="flex items-center gap-4 px-4 py-3">
                          <span
                            className={clsx(
                              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                              item.is_assigned ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-400',
                            )}
                          >
                            <Icon className="h-5 w-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2">
                              <span className={clsx('font-medium', item.is_assigned ? 'text-slate-900' : 'text-slate-600')}>{item.app_name}</span>
                              <span className="font-mono text-xs text-slate-400">{item.app_code}</span>
                              {!item.is_active && (
                                <span className="rounded bg-slate-100 px-1.5 text-[10px] font-medium text-slate-600">Aplikasi nonaktif</span>
                              )}
                            </p>
                            {item.is_assigned ? (
                              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                                <span>
                                  Ditambahkan {formatDateTime(item.assigned_at)} · {item.assigned_by}
                                </span>
                                {item.member_count > 0 && (
                                  <span className="inline-flex items-center gap-1">
                                    <Users className="h-3.5 w-3.5" /> {item.member_count} keanggotaan group
                                  </span>
                                )}
                              </p>
                            ) : (
                              <p className="mt-0.5 text-xs text-slate-400">Belum dimiliki company ini</p>
                            )}
                          </div>
                          <Switch
                            checked={item.is_assigned}
                            onChange={(next) => onToggle(item, next)}
                            label={`${item.app_name} untuk ${company.code}`}
                            disabled={!allowed}
                            loading={pending === item.application_id}
                            title={reason}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
                {data?.items.some((i) => i.is_assigned && i.member_count > 0) && (canDelete || canCreate) && (
                  <p className="mt-3 text-xs text-slate-500">
                    Aplikasi yang masih dipakai keanggotaan group tidak dapat dilepas. Hapus dulu keanggotaannya di halaman Group Members.
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={!!confirm}
        title="Lepas aplikasi dari company?"
        message={
          confirm && company ? (
            <>
              Aplikasi <span className="font-medium text-slate-800">{confirm.app_name}</span> tidak lagi dimiliki{' '}
              <span className="font-medium text-slate-800">{company.name}</span>. User di company ini tidak dapat diberi akses ke aplikasi tersebut sampai
              ditambahkan kembali.
            </>
          ) : null
        }
        confirmLabel="Ya, lepas"
        variant="danger"
        loading={mutation.isPending}
        onConfirm={() => confirm && mutation.mutate({ item: confirm, assign: false })}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
