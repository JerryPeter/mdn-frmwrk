import { useEffect, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { toApiError } from '@/api/errors';
import { userGroupsApi } from '@/api/userGroups';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Modal';
import { StatusBadge, rowStatus } from '@/components/ui/StatusBadge';
import { TextAreaField } from '@/components/ui/TextAreaField';
import { TextField } from '@/components/ui/TextField';
import { formatDateTime } from '@/lib/format';
import type { GroupInput, UserGroup } from '@/types/group';
import type { LookupApplication } from '@/types/menu';

/** `duplicate`: group baru di aplikasi yang sama dengan salinan permission (PRD §8.10 [U]) */
export type FormMode = 'create' | 'edit' | 'view' | 'duplicate';
type Field = keyof GroupInput;
type Errors = Partial<Record<Field, string>>;

const MAX: Record<Field, number> = { application_id: 36, group_code: 50, group_name: 150, description: 2000 };

const SELECT_CLASS =
  'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-100';

function toInput(mode: FormMode, g: UserGroup | null, defaultAppId: string): GroupInput {
  if (!g || mode === 'create') return { application_id: defaultAppId, group_code: '', group_name: '', description: '' };
  if (mode === 'duplicate') {
    return { application_id: g.application_id, group_code: `${g.group_code}_COPY`.slice(0, 50), group_name: `Salinan ${g.group_name}`.slice(0, 150), description: g.description ?? '' };
  }
  return { application_id: g.application_id, group_code: g.group_code, group_name: g.group_name, description: g.description ?? '' };
}

function validate(v: GroupInput): Errors {
  const e: Errors = {};
  if (!v.application_id) e.application_id = 'Aplikasi wajib dipilih';
  if (!v.group_code.trim()) e.group_code = 'Kode group wajib diisi';
  else if (!/^[A-Z0-9_]+$/.test(v.group_code.trim())) e.group_code = 'Hanya boleh huruf, angka, dan underscore';
  if (!v.group_name.trim()) e.group_name = 'Nama group wajib diisi';
  (['group_code', 'group_name', 'description'] as const).forEach((f) => {
    if (!e[f] && v[f].trim().length > MAX[f]) e[f] = `Maksimal ${MAX[f]} karakter`;
  });
  return e;
}

interface Props {
  open: boolean;
  mode: FormMode;
  group: UserGroup | null;
  apps: LookupApplication[];
  defaultAppId: string;
  canUpdate: boolean;
  onClose: () => void;
  onModeChange: (mode: FormMode) => void;
  onSaved: (group: UserGroup, mode: Exclude<FormMode, 'view'>) => void;
}

export function GroupFormDrawer({ open, mode, group, apps, defaultAppId, canUpdate, onClose, onModeChange, onSaved }: Props) {
  const [values, setValues] = useState<GroupInput>(() => toInput(mode, group, defaultAppId));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValues(toInput(mode, group, defaultAppId));
      setErrors({});
      setFormError(null);
    }
  }, [open, mode, group, defaultAppId]);

  const mutation = useMutation({
    mutationFn: (input: GroupInput) => {
      if (mode === 'create') return userGroupsApi.create(input);
      if (mode === 'duplicate') {
        const { application_id: _app, ...rest } = input;
        return userGroupsApi.duplicate(group!.id, rest);
      }
      return userGroupsApi.update(group!.id, input);
    },
    onSuccess: (saved) => onSaved(saved, mode === 'view' ? 'edit' : mode),
    onError: (err) => {
      const apiErr = toApiError(err);
      const fieldErrors = Object.fromEntries(
        apiErr.details.filter((d) => d.field in MAX).map((d) => [d.field, d.message]),
      ) as Errors;
      if (Object.keys(fieldErrors).length) setErrors(fieldErrors);
      else setFormError(apiErr.message);
    },
  });

  const readOnly = mode === 'view';
  const codeLocked = mode === 'edit' || readOnly;
  const set = (field: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = field === 'group_code' ? e.target.value.toUpperCase() : e.target.value;
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

  const title = { create: 'Tambah Group', edit: 'Ubah Group', view: 'Detail Group', duplicate: 'Duplikat Group' }[mode];
  const app = apps.find((a) => a.id === values.application_id);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      busy={mutation.isPending}
      title={title}
      description={
        group && mode !== 'create' ? `${group.app_code} · ${group.group_code} · ${group.group_name}` : 'Field bertanda * wajib diisi'
      }
      footer={
        readOnly ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Tutup
            </Button>
            {canUpdate && group && !group.is_deleted && (
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
            <Button type="submit" form="group-form" loading={mutation.isPending}>
              {mode === 'edit' ? 'Simpan Perubahan' : mode === 'duplicate' ? 'Duplikat' : 'Simpan'}
            </Button>
          </>
        )
      }
    >
      <form id="group-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert variant="error">{formError}</Alert>}
        {mode === 'duplicate' && group && (
          <Alert variant="info">
            Group baru dibuat di aplikasi {group.app_code} dengan salinan {group.permission_count} permission dari {group.group_code}. Anggota
            tidak ikut disalin.
          </Alert>
        )}

        <div>
          <label htmlFor="group-app" className="mb-1.5 block text-sm font-medium text-slate-700">
            Aplikasi *
          </label>
          {mode === 'create' ? (
            <select id="group-app" value={values.application_id} onChange={set('application_id')} className={SELECT_CLASS}>
              <option value="">— Pilih aplikasi —</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.code})
                </option>
              ))}
            </select>
          ) : (
            <input
              id="group-app"
              disabled
              value={group ? `${group.app_name} (${group.app_code})` : app ? `${app.name} (${app.code})` : ''}
              className={SELECT_CLASS}
            />
          )}
          {errors.application_id ? (
            <p className="mt-1 text-xs text-red-600">{errors.application_id}</p>
          ) : (
            mode !== 'create' && <p className="mt-1 text-xs text-slate-500">Aplikasi group tidak dapat diubah</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-5">
          <TextField
            label="Kode *"
            className="sm:col-span-2"
            value={values.group_code}
            onChange={set('group_code')}
            error={errors.group_code}
            disabled={codeLocked}
            readOnly={readOnly}
            maxLength={MAX.group_code}
            autoFocus={mode === 'create' || mode === 'duplicate'}
            hint={mode === 'edit' ? 'Kode tidak dapat diubah' : 'Huruf besar, angka, _'}
          />
          <TextField
            label="Nama group *"
            className="sm:col-span-3"
            value={values.group_name}
            onChange={set('group_name')}
            error={errors.group_name}
            disabled={readOnly}
            readOnly={readOnly}
            maxLength={MAX.group_name}
            autoFocus={mode === 'edit'}
          />
        </div>
        <TextAreaField
          label="Deskripsi"
          value={values.description}
          onChange={set('description')}
          error={errors.description}
          readOnly={readOnly}
          disabled={readOnly}
          maxLength={MAX.description}
        />

        {group && (mode === 'view' || mode === 'edit') && (
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg bg-slate-50 p-4 text-xs">
            <dt className="text-slate-500">Status</dt>
            <dd className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={rowStatus(group)} />
              {group.is_protected && <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-medium text-brand-700">Group inti</span>}
            </dd>
            <dt className="text-slate-500">Anggota</dt>
            <dd className="text-slate-700">{group.member_count} keanggotaan</dd>
            <dt className="text-slate-500">Permission</dt>
            <dd className="text-slate-700">{group.permission_count} menu-action</dd>
            <dt className="text-slate-500">Dibuat</dt>
            <dd className="text-slate-700">
              {formatDateTime(group.created_at)} · {group.created_by}
            </dd>
            <dt className="text-slate-500">Diubah</dt>
            <dd className="text-slate-700">
              {group.updated_at ? `${formatDateTime(group.updated_at)} · ${group.updated_by ?? '–'}` : '–'}
            </dd>
            {group.is_deleted && (
              <>
                <dt className="text-slate-500">Dihapus</dt>
                <dd className="text-slate-700">
                  {formatDateTime(group.deleted_at)} · {group.deleted_by}
                </dd>
              </>
            )}
          </dl>
        )}
      </form>
    </Drawer>
  );
}
