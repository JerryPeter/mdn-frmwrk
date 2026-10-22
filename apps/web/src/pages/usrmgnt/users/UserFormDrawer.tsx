import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, Pencil, ShieldCheck, X } from 'lucide-react';
import { getErrorMessage, toApiError } from '@/api/errors';
import { usersApi } from '@/api/users';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { MembershipStatusBadge } from '@/components/ui/MembershipStatusBadge';
import { Drawer } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { StatusBadge, rowStatus } from '@/components/ui/StatusBadge';
import { TextField } from '@/components/ui/TextField';
import { formatDate, formatDateTime } from '@/lib/format';
import { PASSWORD_RULES, lowerFirst, validatePassword } from '@/lib/password';
import type { User, UserInput, UserWithPassword } from '@/types/user';

export type FormMode = 'create' | 'edit' | 'view';
type Tab = 'profile' | 'access';
type Field = keyof UserInput | 'password';
type Errors = Partial<Record<Field, string>>;

const EMPTY: UserInput = { username: '', email: '', full_name: '', employee_no: '', phone: '' };

const MAX: Record<keyof UserInput, number> = { username: 100, email: 150, full_name: 200, employee_no: 30, phone: 30 };

function toInput(u?: User | null): UserInput {
  if (!u) return EMPTY;
  return { username: u.username, email: u.email, full_name: u.full_name, employee_no: u.employee_no ?? '', phone: u.phone ?? '' };
}

/** Validasi inline, mengikuti aturan backend (PRD §8.9) */
function validate(v: UserInput, password: string | null): Errors {
  const e: Errors = {};
  const username = v.username.trim();
  if (!username) e.username = 'Username wajib diisi';
  else if (username.length < 3) e.username = 'Minimal 3 karakter';
  else if (!/^[a-z0-9._]+$/.test(username)) e.username = 'Hanya huruf kecil, angka, titik, dan underscore';
  if (!v.email.trim()) e.email = 'Email wajib diisi';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = 'Format email tidak valid';
  if (!v.full_name.trim()) e.full_name = 'Nama lengkap wajib diisi';
  (Object.keys(MAX) as Array<keyof UserInput>).forEach((f) => {
    if (!e[f] && v[f].trim().length > MAX[f]) e[f] = `Maksimal ${MAX[f]} karakter`;
  });
  if (password !== null) {
    const violations = validatePassword(password);
    if (violations.length) e.password = `Belum memenuhi: ${violations.map(lowerFirst).join(', ')}`;
  }
  return e;
}

/** Tab "Akses": keanggotaan group (company, aplikasi, group, masa berlaku, status) */
function AccessTab({ user }: { user: User }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['users', user.id, 'memberships'],
    queryFn: () => usersApi.memberships(user.id),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Spinner className="h-4 w-4" /> Memuat hak akses...
      </div>
    );
  }
  if (error) return <Alert variant="error">{getErrorMessage(error)}</Alert>;
  if (!data?.length) {
    return (
      <div className="py-10 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-3 font-medium text-slate-700">Belum menjadi anggota group mana pun</p>
        <p className="mt-1 text-sm text-slate-500">Tambahkan user ke group di halaman Group Members.</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="min-w-full text-sm" aria-label="Keanggotaan group">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Company</th>
            <th className="px-3 py-2 text-left font-semibold">Aplikasi / Group</th>
            <th className="px-3 py-2 text-left font-semibold">Masa berlaku</th>
            <th className="px-3 py-2 text-left font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((m) => (
              <tr key={m.id}>
                <td className="px-3 py-2.5">
                  <p className="font-mono text-xs font-semibold text-slate-700">{m.company.code}</p>
                  <p className="text-xs text-slate-500">{m.company.name}</p>
                </td>
                <td className="px-3 py-2.5">
                  <p className="text-slate-900">{m.group.name}</p>
                  <p className="text-xs text-slate-500">
                    <span className="font-mono">{m.application.code}</span> · <span className="font-mono">{m.group.code}</span>
                  </p>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">
                  {formatDate(m.valid_from)} – {m.valid_to ? formatDate(m.valid_to) : 'seterusnya'}
                </td>
                <td className="px-3 py-2.5">
                  <MembershipStatusBadge status={m.status} />
                </td>
              </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface Props {
  open: boolean;
  mode: FormMode;
  user: User | null;
  canUpdate: boolean;
  onClose: () => void;
  onModeChange: (mode: FormMode) => void;
  onSaved: (user: User | UserWithPassword, mode: 'create' | 'edit') => void;
}

export function UserFormDrawer({ open, mode, user, canUpdate, onClose, onModeChange, onSaved }: Props) {
  const [values, setValues] = useState<UserInput>(EMPTY);
  const [manualPassword, setManualPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('profile');

  useEffect(() => {
    if (open) {
      setValues(toInput(mode === 'create' ? null : user));
      setManualPassword(false);
      setPassword('');
      setErrors({});
      setFormError(null);
      setTab('profile');
    }
  }, [open, mode, user]);

  const mutation = useMutation({
    mutationFn: (input: UserInput): Promise<User | UserWithPassword> =>
      mode === 'create'
        ? usersApi.create({ ...input, password: manualPassword ? password : null })
        : usersApi.update(user!.id, input),
    onSuccess: (saved) => onSaved(saved, mode === 'create' ? 'create' : 'edit'),
    onError: (err) => {
      const apiErr = toApiError(err);
      const known = new Set<string>([...Object.keys(EMPTY), 'password']);
      const fieldErrors: Errors = {};
      apiErr.details.forEach((d) => {
        if (known.has(d.field) && !fieldErrors[d.field as Field]) fieldErrors[d.field as Field] = d.message;
      });
      if (Object.keys(fieldErrors).length) setErrors(fieldErrors);
      else setFormError(apiErr.message);
    },
  });

  const readOnly = mode === 'view';
  const set = (field: keyof UserInput) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = field === 'username' ? e.target.value.toLowerCase() : e.target.value;
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((er) => ({ ...er, [field]: undefined }));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const er = validate(values, mode === 'create' && manualPassword ? password : null);
    setErrors(er);
    if (Object.keys(er).length) return;
    mutation.mutate(values);
  };

  const title = mode === 'create' ? 'Tambah User' : mode === 'edit' ? 'Ubah User' : 'Detail User';
  const field = (name: keyof UserInput, label: string, extra: Partial<React.ComponentProps<typeof TextField>> = {}) => (
    <TextField
      label={label}
      name={name}
      value={values[name]}
      onChange={set(name)}
      error={errors[name]}
      readOnly={readOnly}
      disabled={readOnly}
      maxLength={MAX[name]}
      {...extra}
    />
  );

  // User terhapus tidak memiliki keanggotaan aktif, tab Akses tidak ditampilkan
  const showTabs = mode === 'view' && user && !user.is_deleted;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      busy={mutation.isPending}
      wide={!!showTabs && tab === 'access'}
      title={title}
      description={user && mode !== 'create' ? `${user.username} · ${user.full_name}` : 'Field bertanda * wajib diisi'}
      footer={
        readOnly ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Tutup
            </Button>
            {canUpdate && user && !user.is_deleted && (
              <Button onClick={() => onModeChange('edit')}>
                <Pencil className="h-4 w-4" /> Ubah
              </Button>
            )}
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
              Batal
            </Button>
            <Button type="submit" form="user-form" loading={mutation.isPending}>
              {mode === 'create' ? 'Simpan' : 'Simpan Perubahan'}
            </Button>
          </>
        )
      }
    >
      {showTabs && (
        <div className="-mt-1 mb-5 flex gap-1 border-b border-slate-200" role="tablist" aria-label="Detail user">
          {(
            [
              ['profile', 'Profil'],
              ['access', `Akses (${user.membership_count})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={clsx(
                '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
                tab === key ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {showTabs && tab === 'access' ? (
        <AccessTab user={user} />
      ) : (
        <form id="user-form" onSubmit={onSubmit} noValidate className="space-y-4">
          {formError && <Alert variant="error">{formError}</Alert>}

          {field('username', 'Username *', {
            autoFocus: mode === 'create',
            disabled: readOnly || mode === 'edit',
            autoComplete: 'off',
            hint: mode === 'create' ? '3–100 karakter: huruf kecil, angka, titik, underscore' : mode === 'edit' ? 'Username tidak dapat diubah' : undefined,
          })}
          {field('full_name', 'Nama lengkap *', { autoFocus: mode === 'edit' })}
          {field('email', 'Email *', { type: 'email', autoComplete: 'off' })}
          <div className="grid gap-4 sm:grid-cols-2">
            {field('employee_no', 'Nomor karyawan (NIK)')}
            {field('phone', 'Telepon', { type: 'tel' })}
          </div>

          {mode === 'create' && (
            <fieldset className="space-y-3 rounded-lg border border-slate-200 p-4">
              <legend className="px-1 text-sm font-medium text-slate-700">Password awal</legend>
              <p className="text-xs text-slate-500">Auth provider: LOCAL. User wajib mengganti password saat login pertama.</p>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="password-mode"
                  checked={!manualPassword}
                  onChange={() => {
                    setManualPassword(false);
                    setErrors((er) => ({ ...er, password: undefined }));
                  }}
                  className="mt-0.5 h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span>
                  <span className="font-medium text-slate-800">Bangkitkan otomatis</span>
                  <span className="block text-xs text-slate-500">Password acak ditampilkan sekali setelah disimpan</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="password-mode"
                  checked={manualPassword}
                  onChange={() => setManualPassword(true)}
                  className="mt-0.5 h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="font-medium text-slate-800">Tentukan sendiri</span>
              </label>
              {manualPassword && (
                <div className="space-y-2 pl-6">
                  <TextField
                    label="Password"
                    type="password"
                    value={password}
                    autoComplete="new-password"
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setErrors((er) => ({ ...er, password: undefined }));
                    }}
                    error={errors.password}
                    maxLength={100}
                  />
                  <ul className="grid gap-1 text-xs sm:grid-cols-2">
                    {PASSWORD_RULES.map((r) => {
                      const ok = r.test(password);
                      return (
                        <li key={r.key} className={clsx('flex items-center gap-1.5', ok ? 'text-emerald-700' : 'text-slate-500')}>
                          {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                          {r.label}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </fieldset>
          )}

          {user && mode !== 'create' && (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg bg-slate-50 p-4 text-xs">
              <dt className="text-slate-500">Status</dt>
              <dd className="flex flex-wrap gap-1.5">
                <StatusBadge status={rowStatus(user)} />
                {user.is_locked && <StatusBadge status="locked" />}
              </dd>
              <dt className="text-slate-500">Auth provider</dt>
              <dd className="font-mono text-slate-700">{user.auth_provider}</dd>
              {user.is_locked && (
                <>
                  <dt className="text-slate-500">Terkunci sejak</dt>
                  <dd className="text-slate-700">{formatDateTime(user.locked_at)}</dd>
                </>
              )}
              <dt className="text-slate-500">Gagal login</dt>
              <dd className="text-slate-700">{user.failed_login_count} kali berturut-turut</dd>
              <dt className="text-slate-500">Login terakhir</dt>
              <dd className="text-slate-700">{user.last_login_at ? formatDateTime(user.last_login_at) : 'Belum pernah login'}</dd>
              <dt className="text-slate-500">Password diubah</dt>
              <dd className="text-slate-700">
                {formatDateTime(user.password_changed_at)}
                {user.must_change_password && <span className="ml-1.5 text-amber-700">(wajib ganti saat login)</span>}
              </dd>
              <dt className="text-slate-500">Dibuat</dt>
              <dd className="text-slate-700">
                {formatDateTime(user.created_at)} · {user.created_by}
              </dd>
              <dt className="text-slate-500">Diubah</dt>
              <dd className="text-slate-700">
                {user.updated_at ? `${formatDateTime(user.updated_at)} · ${user.updated_by ?? '–'}` : '–'}
              </dd>
              {user.is_deleted && (
                <>
                  <dt className="text-slate-500">Dihapus</dt>
                  <dd className="text-slate-700">
                    {formatDateTime(user.deleted_at)} · {user.deleted_by}
                  </dd>
                </>
              )}
            </dl>
          )}
        </form>
      )}
    </Drawer>
  );
}
