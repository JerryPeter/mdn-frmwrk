import { useEffect, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Lock, Pencil } from 'lucide-react';
import { applicationsApi } from '@/api/applications';
import { toApiError } from '@/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Modal';
import { StatusBadge, rowStatus } from '@/components/ui/StatusBadge';
import { TextAreaField } from '@/components/ui/TextAreaField';
import { TextField } from '@/components/ui/TextField';
import { formatDateTime } from '@/lib/format';
import { ICON_OPTIONS, resolveIcon } from '@/lib/icons';
import type { Application, ApplicationInput } from '@/types/application';

export type FormMode = 'create' | 'edit' | 'view';

/** State form: sort_order disimpan sebagai string agar input angka bisa dikosongkan saat mengetik */
type FormValues = Omit<ApplicationInput, 'sort_order'> & { sort_order: string };
type Field = keyof FormValues;
type Errors = Partial<Record<Field, string>>;

const EMPTY: FormValues = { app_code: '', app_name: '', description: '', base_url: '', icon: '', sort_order: '0' };

const MAX: Partial<Record<Field, number>> = { app_code: 30, app_name: 150, description: 2000, base_url: 500, icon: 100 };

function toValues(a?: Application | null): FormValues {
  if (!a) return EMPTY;
  return {
    app_code: a.app_code,
    app_name: a.app_name,
    description: a.description ?? '',
    base_url: a.base_url ?? '',
    icon: a.icon ?? '',
    sort_order: String(a.sort_order),
  };
}

/** Validasi inline, mengikuti aturan backend (PRD §8.5) */
function validate(v: FormValues): Errors {
  const e: Errors = {};
  if (!v.app_code.trim()) e.app_code = 'Kode aplikasi wajib diisi';
  else if (!/^[A-Z0-9_]+$/.test(v.app_code.trim())) e.app_code = 'Hanya boleh huruf, angka, dan underscore';
  if (!v.app_name.trim()) e.app_name = 'Nama aplikasi wajib diisi';
  const url = v.base_url.trim();
  if (url && !/^\/\S*$/.test(url) && !/^https?:\/\/\S+$/i.test(url)) {
    e.base_url = 'Isi dengan path (mis. /billcost) atau URL http(s)';
  }
  if (!/^\d+$/.test(v.sort_order.trim())) e.sort_order = 'Urutan harus bilangan bulat ≥ 0';
  else if (Number(v.sort_order) > 9999) e.sort_order = 'Urutan maksimal 9999';
  (Object.keys(MAX) as Field[]).forEach((f) => {
    if (!e[f] && v[f].trim().length > MAX[f]!) e[f] = `Maksimal ${MAX[f]} karakter`;
  });
  return e;
}

interface Props {
  open: boolean;
  mode: FormMode;
  application: Application | null;
  canUpdate: boolean;
  /** Urutan default untuk aplikasi baru (setelah urutan terbesar yang ada) */
  nextSortOrder: number;
  onClose: () => void;
  onModeChange: (mode: FormMode) => void;
  onSaved: (application: Application, mode: 'create' | 'edit') => void;
}

export function ApplicationFormDrawer({ open, mode, application, canUpdate, nextSortOrder, onClose, onModeChange, onSaved }: Props) {
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValues(mode === 'create' ? { ...EMPTY, sort_order: String(nextSortOrder) } : toValues(application));
      setErrors({});
      setFormError(null);
    }
  }, [open, mode, application, nextSortOrder]);

  const mutation = useMutation({
    mutationFn: (input: ApplicationInput) =>
      mode === 'create' ? applicationsApi.create(input) : applicationsApi.update(application!.id, input),
    onSuccess: (saved) => onSaved(saved, mode === 'create' ? 'create' : 'edit'),
    onError: (err) => {
      const apiErr = toApiError(err);
      const fieldErrors = Object.fromEntries(
        apiErr.details.filter((d) => d.field in EMPTY).map((d) => [d.field, d.message]),
      ) as Errors;
      if (Object.keys(fieldErrors).length) setErrors(fieldErrors);
      else setFormError(apiErr.message);
    },
  });

  const readOnly = mode === 'view';
  const set = (field: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = field === 'app_code' ? e.target.value.toUpperCase() : e.target.value;
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((er) => ({ ...er, [field]: undefined }));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const er = validate(values);
    setErrors(er);
    if (Object.keys(er).length) return;
    mutation.mutate({ ...values, sort_order: Number(values.sort_order) });
  };

  const title = mode === 'create' ? 'Tambah Aplikasi' : mode === 'edit' ? 'Ubah Aplikasi' : 'Detail Aplikasi';
  const PreviewIcon = resolveIcon(values.icon);
  // Nilai ikon lama yang tidak ada di daftar tetap ditampilkan sebagai pilihan
  const iconOptions =
    values.icon && !ICON_OPTIONS.some((o) => o.value === values.icon)
      ? [...ICON_OPTIONS, { value: values.icon, label: `${values.icon} (tidak dikenal)` }]
      : ICON_OPTIONS;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      busy={mutation.isPending}
      title={title}
      description={application && mode !== 'create' ? `${application.app_code} · ${application.app_name}` : 'Field bertanda * wajib diisi'}
      footer={
        readOnly ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Tutup
            </Button>
            {canUpdate && application && !application.is_deleted && (
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
            <Button type="submit" form="application-form" loading={mutation.isPending}>
              {mode === 'create' ? 'Simpan' : 'Simpan Perubahan'}
            </Button>
          </>
        )
      }
    >
      <form id="application-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert variant="error">{formError}</Alert>}
        {application?.is_protected && mode !== 'create' && (
          <Alert variant="info" title="Aplikasi inti">
            Aplikasi ini tidak dapat dihapus atau dinonaktifkan. Nama, deskripsi, ikon, dan urutan tetap dapat diubah.
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Kode *"
            value={values.app_code}
            onChange={set('app_code')}
            error={errors.app_code}
            maxLength={MAX.app_code}
            autoFocus={mode === 'create'}
            disabled={readOnly || mode === 'edit'}
            hint={mode === 'edit' ? 'Kode tidak dapat diubah' : 'Huruf besar, angka, _'}
          />
          <TextField
            className="sm:col-span-2"
            label="Nama aplikasi *"
            value={values.app_name}
            onChange={set('app_name')}
            error={errors.app_name}
            maxLength={MAX.app_name}
            autoFocus={mode === 'edit'}
            disabled={readOnly}
          />
        </div>

        <TextAreaField
          label="Deskripsi"
          value={values.description}
          onChange={set('description')}
          error={errors.description}
          maxLength={MAX.description}
          disabled={readOnly}
        />

        <TextField
          label="Base URL"
          value={values.base_url}
          onChange={set('base_url')}
          error={errors.base_url}
          maxLength={MAX.base_url}
          disabled={readOnly}
          placeholder="/nama-aplikasi atau https://..."
          hint="Path awal route aplikasi di frontend, atau alamat aplikasi eksternal"
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label htmlFor="app-icon" className="mb-1.5 block text-sm font-medium text-slate-700">
              Ikon
            </label>
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white" aria-hidden="true">
                <PreviewIcon className="h-5 w-5" />
              </span>
              <select
                id="app-icon"
                value={values.icon}
                onChange={set('icon')}
                disabled={readOnly}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-100"
              >
                <option value="">— Tanpa ikon —</option>
                {iconOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <TextField
            label="Urutan *"
            type="number"
            min={0}
            max={9999}
            value={values.sort_order}
            onChange={set('sort_order')}
            error={errors.sort_order}
            disabled={readOnly}
          />
        </div>

        {application && mode !== 'create' && (
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg bg-slate-50 p-4 text-xs">
            <dt className="text-slate-500">Status</dt>
            <dd className="flex items-center gap-2">
              <StatusBadge status={rowStatus(application)} />
              {application.is_protected && (
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <Lock className="h-3 w-3" /> Aplikasi inti
                </span>
              )}
            </dd>
            <dt className="text-slate-500">Dibuat</dt>
            <dd className="text-slate-700">
              {formatDateTime(application.created_at)} · {application.created_by}
            </dd>
            <dt className="text-slate-500">Diubah</dt>
            <dd className="text-slate-700">
              {application.updated_at ? `${formatDateTime(application.updated_at)} · ${application.updated_by ?? '–'}` : '–'}
            </dd>
            {application.is_deleted && (
              <>
                <dt className="text-slate-500">Dihapus</dt>
                <dd className="text-slate-700">
                  {formatDateTime(application.deleted_at)} · {application.deleted_by}
                </dd>
              </>
            )}
          </dl>
        )}
      </form>
    </Drawer>
  );
}
