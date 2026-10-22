import { useEffect, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Lock, Pencil } from 'lucide-react';
import { actionsApi } from '@/api/actions';
import { toApiError } from '@/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Modal';
import { StatusBadge, rowStatus } from '@/components/ui/StatusBadge';
import { TextAreaField } from '@/components/ui/TextAreaField';
import { TextField } from '@/components/ui/TextField';
import { formatDateTime } from '@/lib/format';
import type { Action, ActionInput } from '@/types/action';

export type FormMode = 'create' | 'edit' | 'view';

/** sort_order disimpan sebagai string agar input angka bisa dikosongkan saat mengetik */
type FormValues = Omit<ActionInput, 'sort_order'> & { sort_order: string };
type Field = keyof FormValues;
type Errors = Partial<Record<Field, string>>;

const EMPTY: FormValues = { action_code: '', action_name: '', description: '', is_default: false, sort_order: '0' };
const MAX = { action_code: 30, action_name: 100, description: 2000 } as const;

/** READ wajib tetap default agar setiap menu PAGE baru punya READ (AD-05) */
const REQUIRED_DEFAULT = 'READ';

function toValues(a?: Action | null): FormValues {
  if (!a) return EMPTY;
  return {
    action_code: a.action_code,
    action_name: a.action_name,
    description: a.description ?? '',
    is_default: a.is_default,
    sort_order: String(a.sort_order),
  };
}

/** Validasi inline, mengikuti aturan backend (PRD §8.7) */
function validate(v: FormValues): Errors {
  const e: Errors = {};
  if (!v.action_code.trim()) e.action_code = 'Kode action wajib diisi';
  else if (!/^[A-Z_]+$/.test(v.action_code.trim())) e.action_code = 'Hanya boleh huruf dan underscore';
  else if (v.action_code.trim().length > MAX.action_code) e.action_code = `Maksimal ${MAX.action_code} karakter`;
  if (!v.action_name.trim()) e.action_name = 'Nama action wajib diisi';
  else if (v.action_name.trim().length > MAX.action_name) e.action_name = `Maksimal ${MAX.action_name} karakter`;
  if (v.description.trim().length > MAX.description) e.description = `Maksimal ${MAX.description} karakter`;
  if (!/^\d+$/.test(v.sort_order.trim())) e.sort_order = 'Urutan harus bilangan bulat ≥ 0';
  else if (Number(v.sort_order) > 9999) e.sort_order = 'Urutan maksimal 9999';
  return e;
}

interface Props {
  open: boolean;
  mode: FormMode;
  action: Action | null;
  canUpdate: boolean;
  nextSortOrder: number;
  onClose: () => void;
  onModeChange: (mode: FormMode) => void;
  onSaved: (action: Action, mode: 'create' | 'edit') => void;
}

export function ActionFormDrawer({ open, mode, action, canUpdate, nextSortOrder, onClose, onModeChange, onSaved }: Props) {
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValues(mode === 'create' ? { ...EMPTY, sort_order: String(nextSortOrder) } : toValues(action));
      setErrors({});
      setFormError(null);
    }
  }, [open, mode, action, nextSortOrder]);

  const mutation = useMutation({
    mutationFn: (input: ActionInput) => (mode === 'create' ? actionsApi.create(input) : actionsApi.update(action!.id, input)),
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
  const defaultLocked = action?.action_code === REQUIRED_DEFAULT;
  const set = (field: Exclude<Field, 'is_default'>) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = field === 'action_code' ? e.target.value.toUpperCase() : e.target.value;
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

  const title = mode === 'create' ? 'Tambah Action' : mode === 'edit' ? 'Ubah Action' : 'Detail Action';
  // Perubahan is_default pada action yang sudah ada tidak berlaku mundur
  const defaultChanged = mode === 'edit' && action && values.is_default !== action.is_default;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      busy={mutation.isPending}
      title={title}
      description={action && mode !== 'create' ? `${action.action_code} · ${action.action_name}` : 'Field bertanda * wajib diisi'}
      footer={
        readOnly ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Tutup
            </Button>
            {canUpdate && action && !action.is_deleted && (
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
            <Button type="submit" form="action-form" loading={mutation.isPending}>
              {mode === 'create' ? 'Simpan' : 'Simpan Perubahan'}
            </Button>
          </>
        )
      }
    >
      <form id="action-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert variant="error">{formError}</Alert>}
        {action?.is_builtin && mode !== 'create' && (
          <Alert variant="info" title="Action utama">
            Action ini tidak dapat dihapus atau dinonaktifkan. Nama, deskripsi, dan urutan tetap dapat diubah.
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Kode *"
            value={values.action_code}
            onChange={set('action_code')}
            error={errors.action_code}
            maxLength={MAX.action_code}
            autoFocus={mode === 'create'}
            disabled={readOnly || mode === 'edit'}
            hint={mode === 'edit' ? 'Kode tidak dapat diubah' : 'Huruf besar dan _, mis. APPROVE'}
          />
          <TextField
            className="sm:col-span-2"
            label="Nama action *"
            value={values.action_name}
            onChange={set('action_name')}
            error={errors.action_name}
            maxLength={MAX.action_name}
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
          className="sm:w-1/3"
          label="Urutan *"
          type="number"
          min={0}
          max={9999}
          value={values.sort_order}
          onChange={set('sort_order')}
          error={errors.sort_order}
          disabled={readOnly}
        />

        <div className="rounded-lg border border-slate-200 p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={values.is_default}
              onChange={(e) => {
                const checked = e.target.checked;
                setValues((v) => ({ ...v, is_default: checked }));
                setErrors((er) => ({ ...er, is_default: undefined }));
              }}
              disabled={readOnly || defaultLocked}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50"
              aria-describedby="is-default-help"
            />
            <span>
              <span className="block text-sm font-medium text-slate-800">Action default</span>
              <span id="is-default-help" className="mt-0.5 block text-xs text-slate-500">
                Otomatis dipasang ke setiap menu PAGE yang dibuat setelah ini.
                {defaultLocked && ' READ wajib selalu menjadi default agar setiap menu baru dapat dibuka.'}
              </span>
            </span>
          </label>
          {errors.is_default && <p className="mt-2 text-xs text-red-600">{errors.is_default}</p>}
          {defaultChanged && (
            <div className="mt-3">
              <Alert variant="warning">
                Perubahan ini hanya berlaku untuk menu baru. Menu yang sudah ada tidak berubah; atur action-nya lewat halaman Menus.
              </Alert>
            </div>
          )}
        </div>

        {action && mode !== 'create' && (
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg bg-slate-50 p-4 text-xs">
            <dt className="text-slate-500">Status</dt>
            <dd className="flex items-center gap-2">
              <StatusBadge status={rowStatus(action)} />
              {action.is_builtin && (
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <Lock className="h-3 w-3" /> Action utama
                </span>
              )}
            </dd>
            <dt className="text-slate-500">Dibuat</dt>
            <dd className="text-slate-700">
              {formatDateTime(action.created_at)} · {action.created_by}
            </dd>
            <dt className="text-slate-500">Diubah</dt>
            <dd className="text-slate-700">
              {action.updated_at ? `${formatDateTime(action.updated_at)} · ${action.updated_by ?? '–'}` : '–'}
            </dd>
            {action.is_deleted && (
              <>
                <dt className="text-slate-500">Dihapus</dt>
                <dd className="text-slate-700">
                  {formatDateTime(action.deleted_at)} · {action.deleted_by}
                </dd>
              </>
            )}
          </dl>
        )}
      </form>
    </Drawer>
  );
}
