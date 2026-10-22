import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { FileText, Folder } from 'lucide-react';
import { toApiError } from '@/api/errors';
import { menusApi } from '@/api/menus';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Modal';
import { TextField } from '@/components/ui/TextField';
import { ICON_OPTIONS, resolveIcon } from '@/lib/icons';
import type { AdminMenuNode, MenuRow, MenuType } from '@/types/menu';
import { groupOptions, subtreeIds } from './menuTree';

interface FormValues {
  menu_type: MenuType;
  parent_id: string;
  menu_code: string;
  menu_name: string;
  route_path: string;
  icon: string;
  sort_order: string;
  is_visible: boolean;
}
type Field = keyof FormValues;
type Errors = Partial<Record<Field, string>>;

const SELECT_CLASS =
  'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-100';

function validate(v: FormValues): Errors {
  const e: Errors = {};
  if (!v.menu_code.trim()) e.menu_code = 'Kode menu wajib diisi';
  else if (!/^[A-Z0-9_]+$/.test(v.menu_code.trim())) e.menu_code = 'Hanya boleh huruf, angka, dan underscore';
  else if (v.menu_code.trim().length > 50) e.menu_code = 'Maksimal 50 karakter';
  if (!v.menu_name.trim()) e.menu_name = 'Nama menu wajib diisi';
  else if (v.menu_name.trim().length > 150) e.menu_name = 'Maksimal 150 karakter';
  if (v.menu_type === 'PAGE') {
    if (!v.route_path.trim()) e.route_path = 'Route wajib diisi untuk menu PAGE';
    else if (!/^\/\S*$/.test(v.route_path.trim())) e.route_path = 'Route harus diawali "/" dan tanpa spasi';
    else if (v.route_path.trim().length > 300) e.route_path = 'Maksimal 300 karakter';
  }
  if (!/^\d+$/.test(v.sort_order.trim())) e.sort_order = 'Urutan harus bilangan bulat ≥ 0';
  else if (Number(v.sort_order) > 9999) e.sort_order = 'Urutan maksimal 9999';
  return e;
}

interface Props {
  open: boolean;
  /** create: menu baru (parent awal = initialParentId); edit: ubah `menu` */
  mode: 'create' | 'edit';
  applicationId: string;
  tree: AdminMenuNode[];
  menu: AdminMenuNode | null;
  initialParentId: string | null;
  onClose: () => void;
  onSaved: (menu: MenuRow, mode: 'create' | 'edit') => void;
}

export function MenuFormDrawer({ open, mode, applicationId, tree, menu, initialParentId, onClose, onSaved }: Props) {
  const [values, setValues] = useState<FormValues>(() => emptyValues(null));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function emptyValues(parentId: string | null): FormValues {
    const siblings = parentId ? tree.flatMap(function find(n): AdminMenuNode[] { return n.id === parentId ? n.children : n.children.flatMap(find); }) : tree;
    const nextOrder = siblings.length ? Math.max(...siblings.map((s) => s.sort_order)) + 1 : 1;
    return {
      menu_type: 'PAGE',
      parent_id: parentId ?? '',
      menu_code: '',
      menu_name: '',
      route_path: '',
      icon: '',
      sort_order: String(nextOrder),
      is_visible: true,
    };
  }

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setFormError(null);
    if (mode === 'edit' && menu) {
      setValues({
        menu_type: menu.menu_type,
        parent_id: menu.parent_id ?? '',
        menu_code: menu.menu_code,
        menu_name: menu.menu_name,
        route_path: menu.route_path ?? '',
        icon: menu.icon ?? '',
        sort_order: String(menu.sort_order),
        is_visible: menu.is_visible,
      });
    } else {
      setValues(emptyValues(initialParentId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, menu, initialParentId]);

  // Parent tidak boleh menu itu sendiri atau turunannya (cegah parent melingkar)
  const parents = useMemo(() => groupOptions(tree, mode === 'edit' && menu ? subtreeIds(menu) : new Set()), [tree, mode, menu]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const payload = {
        parent_id: v.parent_id || null,
        menu_name: v.menu_name.trim(),
        route_path: v.menu_type === 'PAGE' ? v.route_path.trim() : null,
        icon: v.icon || null,
        sort_order: Number(v.sort_order),
        is_visible: v.is_visible,
      };
      return mode === 'create'
        ? menusApi.create({ ...payload, application_id: applicationId, menu_type: v.menu_type, menu_code: v.menu_code.trim() })
        : menusApi.update(menu!.id, payload);
    },
    onSuccess: (saved) => onSaved(saved, mode),
    onError: (err) => {
      const apiErr = toApiError(err);
      const fieldErrors = Object.fromEntries(
        apiErr.details.filter((d) => d.field in values).map((d) => [d.field, d.message]),
      ) as Errors;
      if (Object.keys(fieldErrors).length) setErrors(fieldErrors);
      else setFormError(apiErr.message);
    },
  });

  const set = <K extends Field>(field: K, value: FormValues[K]) => {
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

  const isPage = values.menu_type === 'PAGE';
  const PreviewIcon = resolveIcon(values.icon, isPage ? FileText : Folder);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      busy={mutation.isPending}
      title={mode === 'create' ? 'Tambah Menu' : 'Ubah Menu'}
      description={mode === 'edit' && menu ? `${menu.menu_code} · ${menu.menu_name}` : 'Field bertanda * wajib diisi'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Batal
          </Button>
          <Button type="submit" form="menu-form" loading={mutation.isPending}>
            {mode === 'create' ? 'Simpan' : 'Simpan Perubahan'}
          </Button>
        </>
      }
    >
      <form id="menu-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert variant="error">{formError}</Alert>}

        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-slate-700">Tipe menu *</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['GROUP', 'PAGE'] as const).map((t) => (
              <label
                key={t}
                className={clsx(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-3',
                  values.menu_type === t ? 'border-brand-400 bg-brand-50/50' : 'border-slate-200',
                  mode === 'edit' && 'cursor-not-allowed opacity-70',
                )}
              >
                <input
                  type="radio"
                  name="menu_type"
                  value={t}
                  checked={values.menu_type === t}
                  disabled={mode === 'edit'}
                  onChange={() => set('menu_type', t)}
                  className="mt-0.5 h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-800">{t === 'GROUP' ? 'GROUP (folder)' : 'PAGE (halaman)'}</span>
                  <span className="block text-xs text-slate-500">
                    {t === 'GROUP' ? 'Pengelompok menu di sidebar, tanpa route' : 'Halaman dengan route & action'}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {mode === 'edit' && <p className="mt-1 text-xs text-slate-500">Tipe menu tidak dapat diubah</p>}
        </fieldset>

        <div>
          <label htmlFor="menu-parent" className="mb-1.5 block text-sm font-medium text-slate-700">
            Parent
          </label>
          <select id="menu-parent" value={values.parent_id} onChange={(e) => set('parent_id', e.target.value)} className={SELECT_CLASS}>
            <option value="">— Tingkat teratas —</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          {errors.parent_id ? (
            <p className="mt-1 text-xs text-red-600">{errors.parent_id}</p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">Hanya menu GROUP dari aplikasi yang sama</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Kode *"
            value={values.menu_code}
            onChange={(e) => set('menu_code', e.target.value.toUpperCase())}
            error={errors.menu_code}
            maxLength={50}
            autoFocus={mode === 'create'}
            disabled={mode === 'edit'}
            hint={mode === 'edit' ? 'Kode tidak dapat diubah' : 'mis. INV_SUPPLIER'}
          />
          <TextField
            className="sm:col-span-2"
            label="Nama menu *"
            value={values.menu_name}
            onChange={(e) => set('menu_name', e.target.value)}
            error={errors.menu_name}
            maxLength={150}
            autoFocus={mode === 'edit'}
          />
        </div>

        {isPage && (
          <TextField
            label="Route *"
            value={values.route_path}
            onChange={(e) => set('route_path', e.target.value)}
            error={errors.route_path}
            maxLength={300}
            placeholder="/aplikasi/halaman"
            hint="Harus sama dengan route halaman di frontend; boleh berparameter, mis. /billcost/shipments/:id"
          />
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label htmlFor="menu-icon" className="mb-1.5 block text-sm font-medium text-slate-700">
              Ikon
            </label>
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600" aria-hidden="true">
                <PreviewIcon className="h-5 w-5" />
              </span>
              <select id="menu-icon" value={values.icon} onChange={(e) => set('icon', e.target.value)} className={SELECT_CLASS}>
                <option value="">— Tanpa ikon —</option>
                {ICON_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
                {values.icon && !ICON_OPTIONS.some((o) => o.value === values.icon) && (
                  <option value={values.icon}>{values.icon} (tidak dikenal)</option>
                )}
              </select>
            </div>
            <p className="mt-1 text-xs text-slate-500">Ikon tampil di sidebar untuk menu tingkat teratas</p>
          </div>
          <TextField
            label="Urutan *"
            type="number"
            min={0}
            max={9999}
            value={values.sort_order}
            onChange={(e) => set('sort_order', e.target.value)}
            error={errors.sort_order}
          />
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-4">
          <input
            type="checkbox"
            checked={values.is_visible}
            onChange={(e) => set('is_visible', e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <span>
            <span className="block text-sm font-medium text-slate-800">Tampil di sidebar</span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Matikan untuk halaman yang hanya dibuka lewat halaman lain (mis. halaman detail). Hak akses tetap berlaku.
            </span>
          </span>
        </label>

        {mode === 'create' && isPage && (
          <Alert variant="info">Menu PAGE baru otomatis mendapat action default (CREATE, READ, UPDATE, DELETE). Atur lewat tab Action setelah disimpan.</Alert>
        )}
      </form>
    </Drawer>
  );
}
