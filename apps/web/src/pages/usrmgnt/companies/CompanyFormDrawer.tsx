import { useEffect, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { companiesApi } from '@/api/companies';
import { toApiError } from '@/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Modal';
import { StatusBadge, rowStatus } from '@/components/ui/StatusBadge';
import { TextAreaField } from '@/components/ui/TextAreaField';
import { TextField } from '@/components/ui/TextField';
import { formatDateTime } from '@/lib/format';
import type { Company, CompanyInput } from '@/types/company';

export type FormMode = 'create' | 'edit' | 'view';
type Field = keyof CompanyInput;
type Errors = Partial<Record<Field, string>>;

const EMPTY: CompanyInput = {
  company_code: '',
  company_name: '',
  short_name: '',
  tax_number: '',
  address: '',
  phone: '',
  email: '',
  logo_url: '',
};

const MAX: Record<Field, number> = {
  company_code: 20,
  company_name: 200,
  short_name: 50,
  tax_number: 30,
  address: 2000,
  phone: 30,
  email: 150,
  logo_url: 500,
};

function toInput(c?: Company | null): CompanyInput {
  if (!c) return EMPTY;
  return {
    company_code: c.company_code,
    company_name: c.company_name,
    short_name: c.short_name ?? '',
    tax_number: c.tax_number ?? '',
    address: c.address ?? '',
    phone: c.phone ?? '',
    email: c.email ?? '',
    logo_url: c.logo_url ?? '',
  };
}

/** Validasi inline, mengikuti aturan backend (PRD §8.4) */
function validate(v: CompanyInput): Errors {
  const e: Errors = {};
  if (!v.company_code.trim()) e.company_code = 'Kode company wajib diisi';
  else if (!/^[A-Z0-9_]+$/.test(v.company_code.trim())) e.company_code = 'Hanya boleh huruf, angka, dan underscore';
  if (!v.company_name.trim()) e.company_name = 'Nama company wajib diisi';
  if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = 'Format email tidak valid';
  if (v.logo_url.trim() && !/^https?:\/\/\S+$/i.test(v.logo_url.trim())) e.logo_url = 'Format URL tidak valid (awali dengan http:// atau https://)';
  (Object.keys(MAX) as Field[]).forEach((f) => {
    if (!e[f] && v[f].trim().length > MAX[f]) e[f] = `Maksimal ${MAX[f]} karakter`;
  });
  return e;
}

interface Props {
  open: boolean;
  mode: FormMode;
  company: Company | null;
  canUpdate: boolean;
  onClose: () => void;
  onModeChange: (mode: FormMode) => void;
  onSaved: (company: Company, mode: 'create' | 'edit') => void;
}

export function CompanyFormDrawer({ open, mode, company, canUpdate, onClose, onModeChange, onSaved }: Props) {
  const [values, setValues] = useState<CompanyInput>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValues(toInput(mode === 'create' ? null : company));
      setErrors({});
      setFormError(null);
    }
  }, [open, mode, company]);

  const mutation = useMutation({
    mutationFn: (input: CompanyInput) =>
      mode === 'create' ? companiesApi.create(input) : companiesApi.update(company!.id, input),
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
  const set = (field: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = field === 'company_code' ? e.target.value.toUpperCase() : e.target.value;
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((er) => ({ ...er, [field]: undefined }));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const er = validate(values);
    setErrors(er);
    if (Object.keys(er).length) return;
    mutation.mutate(values);
  };

  const title = mode === 'create' ? 'Tambah Company' : mode === 'edit' ? 'Ubah Company' : 'Detail Company';
  const field = (name: Field, label: string, extra: Partial<React.ComponentProps<typeof TextField>> = {}) => (
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

  return (
    <Drawer
      open={open}
      onClose={onClose}
      busy={mutation.isPending}
      title={title}
      description={company && mode !== 'create' ? `${company.company_code} · ${company.company_name}` : 'Field bertanda * wajib diisi'}
      footer={
        readOnly ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Tutup
            </Button>
            {canUpdate && company && !company.is_deleted && (
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
            <Button type="submit" form="company-form" loading={mutation.isPending}>
              {mode === 'create' ? 'Simpan' : 'Simpan Perubahan'}
            </Button>
          </>
        )
      }
    >
      <form id="company-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert variant="error">{formError}</Alert>}

        <div className="grid gap-4 sm:grid-cols-3">
          {field('company_code', 'Kode *', {
            className: 'sm:col-span-1',
            autoFocus: mode === 'create',
            disabled: readOnly || mode === 'edit',
            hint: mode === 'edit' ? 'Kode tidak dapat diubah' : 'Huruf besar, angka, _',
          })}
          {field('company_name', 'Nama company *', { className: 'sm:col-span-2', autoFocus: mode === 'edit' })}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {field('short_name', 'Nama singkat')}
          {field('tax_number', 'NPWP')}
        </div>
        <TextAreaField
          label="Alamat"
          value={values.address}
          onChange={set('address')}
          error={errors.address}
          readOnly={readOnly}
          disabled={readOnly}
          maxLength={MAX.address}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {field('phone', 'Telepon', { type: 'tel' })}
          {field('email', 'Email', { type: 'email' })}
        </div>
        {field('logo_url', 'URL logo', { type: 'url', placeholder: 'https://...' })}

        {company && mode !== 'create' && (
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg bg-slate-50 p-4 text-xs">
            <dt className="text-slate-500">Status</dt>
            <dd>
              <StatusBadge status={rowStatus(company)} />
            </dd>
            <dt className="text-slate-500">Dibuat</dt>
            <dd className="text-slate-700">
              {formatDateTime(company.created_at)} · {company.created_by}
            </dd>
            <dt className="text-slate-500">Diubah</dt>
            <dd className="text-slate-700">
              {company.updated_at ? `${formatDateTime(company.updated_at)} · ${company.updated_by ?? '–'}` : '–'}
            </dd>
            {company.is_deleted && (
              <>
                <dt className="text-slate-500">Dihapus</dt>
                <dd className="text-slate-700">
                  {formatDateTime(company.deleted_at)} · {company.deleted_by}
                </dd>
              </>
            )}
          </dl>
        )}
      </form>
    </Drawer>
  );
}
