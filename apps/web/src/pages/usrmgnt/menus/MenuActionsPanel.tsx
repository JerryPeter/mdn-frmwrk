import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Lock, RotateCcw, Users } from 'lucide-react';
import { getErrorMessage } from '@/api/errors';
import { menusApi } from '@/api/menus';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/stores/toast';

/** Tab "Action": action yang tersedia di menu PAGE, disimpan sebagai set lengkap (PRD §8.8) */
export function MenuActionsPanel({ menuId, canUpdate, onSaved }: { menuId: string; canUpdate: boolean; onSaved: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['menu-actions', menuId], queryFn: () => menusApi.actions(menuId) });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const initial = useMemo(() => new Set(data?.items.filter((a) => a.is_assigned).map((a) => a.action_id)), [data]);
  useEffect(() => setSelected(new Set(initial)), [initial]);

  const dirty = data ? initial.size !== selected.size || [...initial].some((id) => !selected.has(id)) : false;
  const removedInUse = (data?.items ?? []).filter((a) => a.is_assigned && !selected.has(a.action_id) && a.group_count > 0);

  const mutation = useMutation({
    mutationFn: () => menusApi.setActions(menuId, [...selected]),
    onSuccess: (res) => {
      qc.setQueryData(['menu-actions', menuId], res);
      toast.success('Action menu berhasil disimpan');
      setConfirmOpen(false);
      onSaved();
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
      setConfirmOpen(false);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
        <Spinner className="h-4 w-4" /> Memuat action...
      </div>
    );
  }
  if (error || !data) return <Alert variant="error">{getErrorMessage(error)}</Alert>;

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Centang action yang tersedia di halaman ini. Hak akses per group diatur di halaman Group Permissions.
      </p>

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {data.items.map((a) => {
          const checked = selected.has(a.action_id);
          // Action nonaktif hanya bisa dilepas, tidak bisa ditambahkan
          const disabled = !canUpdate || a.is_required || (!a.is_active && !a.is_assigned);
          const willRemove = a.is_assigned && !checked;
          return (
            <li key={a.action_id} className={clsx('flex items-center gap-3 px-4 py-2.5', willRemove && 'bg-amber-50/60')}>
              <input
                id={`act-${a.action_id}`}
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(e) => toggle(a.action_id, e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50"
              />
              <label htmlFor={`act-${a.action_id}`} className={clsx('flex min-w-0 flex-1 items-center gap-2', disabled ? 'cursor-default' : 'cursor-pointer')}>
                <span className="font-mono text-xs font-semibold text-slate-700">{a.action_code}</span>
                <span className="truncate text-sm text-slate-600">{a.action_name}</span>
                {a.is_required && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                    <Lock className="h-3 w-3" /> wajib
                  </span>
                )}
                {!a.is_active && <span className="rounded bg-slate-100 px-1.5 text-[10px] font-medium text-slate-600">Nonaktif</span>}
              </label>
              {a.group_count > 0 && (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-500" title="Jumlah group yang sudah diberi izin">
                  <Users className="h-3.5 w-3.5" /> {a.group_count} group
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {removedInUse.length > 0 && (
        <Alert variant="warning" title="Izin group akan ikut dicabut">
          {removedInUse.map((a) => `${a.action_code} (${a.group_count} group)`).join(', ')} sedang dipakai. Melepasnya akan mencabut izin
          tersebut dari group terkait.
        </Alert>
      )}

      {canUpdate && (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setSelected(new Set(initial))} disabled={!dirty || mutation.isPending}>
            <RotateCcw className="h-4 w-4" /> Batalkan perubahan
          </Button>
          <Button onClick={() => (removedInUse.length ? setConfirmOpen(true) : mutation.mutate())} disabled={!dirty} loading={mutation.isPending}>
            Simpan Action
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Cabut izin group?"
        message={
          <>
            Action berikut akan dilepas dari menu ini dan izinnya dicabut dari group terkait:{' '}
            <span className="font-medium text-slate-800">{removedInUse.map((a) => a.action_code).join(', ')}</span>.
          </>
        }
        confirmLabel="Ya, simpan"
        variant="danger"
        loading={mutation.isPending}
        onConfirm={() => mutation.mutate()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
