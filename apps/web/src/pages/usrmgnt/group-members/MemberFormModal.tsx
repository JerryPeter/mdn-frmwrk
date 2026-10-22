import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, UserRound, X } from 'lucide-react';
import { toApiError } from '@/api/errors';
import { lookupsApi, type LookupUser } from '@/api/lookups';
import { userGroupsApi } from '@/api/userGroups';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { Switch } from '@/components/ui/Switch';
import { TextField } from '@/components/ui/TextField';
import { useDebounce } from '@/hooks/useDebounce';
import { todayISO } from '@/lib/format';
import type { GroupMember, LookupGroup } from '@/types/group';

type Field = 'user_id' | 'company_id' | 'valid_from' | 'valid_to';
type Errors = Partial<Record<Field, string>>;

const SELECT_CLASS =
  'h-10 w-full rounded-lg border bg-white px-3 text-sm focus:outline-none focus:ring-2 disabled:bg-slate-100';

/** Pencarian user aktif (GET /lookups/users?q=) */
function UserSearch({ value, onChange, error }: { value: LookupUser | null; onChange: (u: LookupUser | null) => void; error?: string }) {
  const [term, setTerm] = useState('');
  const q = useDebounce(term.trim(), 250);
  const { data, isFetching } = useQuery({
    queryKey: ['lookups', 'users', q],
    queryFn: () => lookupsApi.users(q),
    enabled: !value,
  });

  if (value) {
    return (
      <div>
        <p className="mb-1.5 text-sm font-medium text-slate-700">User *</p>
        <div className="flex items-center gap-3 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2">
          <UserRound className="h-4 w-4 text-slate-400" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{value.name}</p>
            <p className="truncate text-xs text-slate-500">
              <span className="font-mono">{value.code}</span> · {value.email}
            </p>
          </div>
          <button type="button" onClick={() => onChange(null)} className="rounded p-1 text-slate-400 hover:bg-slate-200" aria-label="Ganti user">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <TextField
        label="User *"
        placeholder="Cari username, nama, atau email..."
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        error={error}
        autoFocus
        autoComplete="off"
      />
      <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200" aria-label="Hasil pencarian user">
        {isFetching && !data && (
          <li className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500">
            <Spinner className="h-4 w-4" /> Mencari...
          </li>
        )}
        {data?.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Tidak ada user aktif yang cocok</li>}
        {data?.map((u) => (
          <li key={u.id}>
            <button type="button" onClick={() => onChange(u)} className="w-full px-3 py-2 text-left hover:bg-slate-50">
              <span className="block text-sm text-slate-900">{u.name}</span>
              <span className="block text-xs text-slate-500">
                <span className="font-mono">{u.code}</span> · {u.email}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface Props {
  open: boolean;
  group: LookupGroup;
  /** null = tambah anggota */
  member: GroupMember | null;
  onClose: () => void;
  onSaved: (member: GroupMember, mode: 'create' | 'edit') => void;
}

/** Tambah/ubah anggota group (PRD §8.11); ubah hanya masa berlaku & status */
export function MemberFormModal({ open, group, member, onClose, onSaved }: Props) {
  const mode = member ? 'edit' : 'create';
  const [user, setUser] = useState<LookupUser | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [validFrom, setValidFrom] = useState(todayISO());
  const [validTo, setValidTo] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setUser(null);
    setCompanyId('');
    setValidFrom(member?.valid_from ?? todayISO());
    setValidTo(member?.valid_to ?? '');
    setIsActive(member?.is_active ?? true);
    setErrors({});
    setFormError(null);
  }, [open, member]);

  // Dropdown hanya company yang memiliki aplikasi group (PRD §8.11)
  const { data: companies, isLoading: companiesLoading } = useQuery({
    queryKey: ['lookups', 'companies', group.application_id],
    queryFn: () => lookupsApi.companies(group.application_id),
    enabled: open && mode === 'create',
  });

  const mutation = useMutation({
    mutationFn: () =>
      member
        ? userGroupsApi.updateMember(group.id, member.id, { valid_from: validFrom, valid_to: validTo || null, is_active: isActive })
        : userGroupsApi.addMember(group.id, { user_id: user!.id, company_id: companyId, valid_from: validFrom, valid_to: validTo || null }),
    onSuccess: (saved) => onSaved(saved, mode),
    onError: (err) => {
      const apiErr = toApiError(err);
      const fieldErrors: Errors = {};
      apiErr.details.forEach((d) => {
        if (['user_id', 'company_id', 'valid_from', 'valid_to'].includes(d.field)) fieldErrors[d.field as Field] = d.message;
      });
      // Pesan bisnis (mis. company tanpa aplikasi, duplikat) ditampilkan utuh di atas form
      setFormError(apiErr.message);
      setErrors(fieldErrors);
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const er: Errors = {};
    if (mode === 'create' && !user) er.user_id = 'User wajib dipilih';
    if (mode === 'create' && !companyId) er.company_id = 'Company wajib dipilih';
    if (!validFrom) er.valid_from = 'Berlaku mulai wajib diisi';
    if (validFrom && validTo && validTo < validFrom) er.valid_to = 'Tidak boleh sebelum berlaku mulai';
    setErrors(er);
    if (!Object.keys(er).length) mutation.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={mutation.isPending}
      title={mode === 'create' ? 'Tambah Anggota' : 'Ubah Anggota'}
      description={
        <>
          Group <span className="font-medium text-slate-800">{group.name}</span> ({group.app_code} · {group.code})
        </>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Batal
          </Button>
          <Button type="submit" form="member-form" loading={mutation.isPending}>
            {mode === 'create' ? 'Tambahkan' : 'Simpan Perubahan'}
          </Button>
        </>
      }
    >
      <form id="member-form" onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
        {formError && <Alert variant="error">{formError}</Alert>}

        {member ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg bg-slate-50 p-3 text-sm">
            <dt className="text-slate-500">User</dt>
            <dd className="text-slate-800">
              {member.user.full_name} <span className="font-mono text-xs text-slate-500">({member.user.username})</span>
            </dd>
            <dt className="text-slate-500">Company</dt>
            <dd className="text-slate-800">
              {member.company.name} <span className="font-mono text-xs text-slate-500">({member.company.code})</span>
            </dd>
          </dl>
        ) : (
          <>
            <UserSearch
              value={user}
              onChange={(u) => {
                setUser(u);
                setErrors((er) => ({ ...er, user_id: undefined }));
              }}
              error={errors.user_id}
            />
            <div>
              <label htmlFor="member-company" className="mb-1.5 block text-sm font-medium text-slate-700">
                Company *
              </label>
              <select
                id="member-company"
                value={companyId}
                onChange={(e) => {
                  setCompanyId(e.target.value);
                  setErrors((er) => ({ ...er, company_id: undefined }));
                }}
                disabled={companiesLoading}
                className={clsx(
                  SELECT_CLASS,
                  errors.company_id ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100',
                )}
              >
                <option value="">— Pilih company —</option>
                {companies?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
              {errors.company_id ? (
                <p className="mt-1 text-xs text-red-600">{errors.company_id}</p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">Hanya company yang memiliki aplikasi {group.app_code}</p>
              )}
            </div>
          </>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Berlaku mulai *"
            type="date"
            value={validFrom}
            onChange={(e) => {
              setValidFrom(e.target.value);
              setErrors((er) => ({ ...er, valid_from: undefined }));
            }}
            error={errors.valid_from}
          />
          <TextField
            label="Berlaku sampai"
            type="date"
            value={validTo}
            min={validFrom || undefined}
            onChange={(e) => {
              setValidTo(e.target.value);
              setErrors((er) => ({ ...er, valid_to: undefined }));
            }}
            error={errors.valid_to}
            hint="Kosongkan bila tanpa batas"
          />
        </div>

        {member && (
          <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <div>
              <p className="text-sm font-medium text-slate-800">Keanggotaan aktif</p>
              <p className="text-xs text-slate-500">Nonaktifkan untuk mencabut akses sementara tanpa menghapus</p>
            </div>
            <Switch checked={isActive} onChange={setIsActive} label="Keanggotaan aktif" />
          </div>
        )}

        {mode === 'create' && user && companyId && (
          <p className="flex items-center gap-1.5 text-xs text-emerald-700">
            <Check className="h-3.5 w-3.5" /> {user.code} akan mendapat hak akses group ini di company terpilih
          </p>
        )}
      </form>
    </Modal>
  );
}
