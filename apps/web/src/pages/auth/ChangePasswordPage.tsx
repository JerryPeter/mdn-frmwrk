import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowLeft, Check, KeyRound, LogOut, X } from 'lucide-react';
import { authApi } from '@/api/auth';
import { toApiError } from '@/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { authKeys, useSessionActions } from '@/hooks/useAuth';
import { usePostLoginRedirect } from '@/hooks/usePostLoginRedirect';
import { AuthLayout } from '@/layouts/AuthLayout';
import { PASSWORD_RULES, validatePassword } from '@/lib/password';
import { useSession } from '@/stores/session';
import { toast } from '@/stores/toast';

type Field = 'old_password' | 'new_password' | 'confirm_password';

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const qc = useQueryClient();
  const user = useSession((s) => s.user);
  const forced = !!user?.must_change_password;
  const { logout, selectContext } = useSessionActions();
  const redirectAfterLogin = usePostLoginRedirect();

  const [values, setValues] = useState<Record<Field, string>>({ old_password: '', new_password: '', confirm_password: '' });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (field: Field) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    setErrors((er) => ({ ...er, [field]: undefined }));
  };

  const validate = () => {
    const er: Partial<Record<Field, string>> = {};
    if (!values.old_password) er.old_password = 'Password lama wajib diisi';
    const policy = validatePassword(values.new_password, values.old_password);
    if (!values.new_password) er.new_password = 'Password baru wajib diisi';
    else if (policy.length) er.new_password = `Password belum memenuhi kebijakan: ${policy[0].toLowerCase()}`;
    if (!values.confirm_password) er.confirm_password = 'Konfirmasi password wajib diisi';
    else if (values.confirm_password !== values.new_password) er.confirm_password = 'Konfirmasi password tidak sama';
    setErrors(er);
    return Object.keys(er).length === 0;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await authApi.changePassword(values);
      const session = useSession.getState();
      if (res?.access_token) session.setAccessToken(res.access_token);
      session.markMustChangePassword(false);
      toast.success('Password berhasil diganti');

      const activeCtx = session.activeContext;
      if (activeCtx) {
        // Token baru belum membawa ctx → pilih ulang konteks yang sedang aktif
        await selectContext(activeCtx);
        navigate(from || '/', { replace: true });
      } else {
        const contexts = await qc.fetchQuery({ queryKey: authKeys.contexts, queryFn: authApi.contexts });
        await redirectAfterLogin(contexts, from);
      }
    } catch (err) {
      const apiErr = toApiError(err);
      if (apiErr.code === 'VALIDATION_ERROR' && apiErr.details.length) {
        setErrors(Object.fromEntries(apiErr.details.map((d) => [d.field, d.message])));
      } else {
        setFormError(apiErr.message);
      }
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        {!forced && (
          <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-4 w-4" /> Kembali
          </Link>
        )}
        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Ganti Password</h1>
            <p className="mt-0.5 text-sm text-slate-500">{user?.full_name} · {user?.username}</p>
          </div>
        </div>

        {forced && (
          <div className="mb-4">
            <Alert variant="warning" title="Wajib ganti password">
              Demi keamanan, Anda harus mengganti password sebelum dapat menggunakan aplikasi.
            </Alert>
          </div>
        )}

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {formError && <Alert variant="error">{formError}</Alert>}
          <TextField
            label="Password lama"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={values.old_password}
            onChange={set('old_password')}
            error={errors.old_password}
          />
          <TextField
            label="Password baru"
            type="password"
            autoComplete="new-password"
            value={values.new_password}
            onChange={set('new_password')}
            error={errors.new_password}
          />

          <ul className="grid gap-1 rounded-lg bg-slate-50 p-3 text-xs">
            {PASSWORD_RULES.map((r) => {
              const ok = r.test(values.new_password);
              return (
                <li key={r.key} className={clsx('flex items-center gap-1.5', ok ? 'text-emerald-700' : 'text-slate-500')}>
                  {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  {r.label}
                </li>
              );
            })}
            <li
              className={clsx(
                'flex items-center gap-1.5',
                values.new_password && values.new_password !== values.old_password ? 'text-emerald-700' : 'text-slate-500',
              )}
            >
              {values.new_password && values.new_password !== values.old_password ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
              Berbeda dari password lama
            </li>
          </ul>

          <TextField
            label="Konfirmasi password baru"
            type="password"
            autoComplete="new-password"
            value={values.confirm_password}
            onChange={set('confirm_password')}
            error={errors.confirm_password}
          />

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
            {forced ? (
              <Button
                type="button"
                variant="ghost"
                onClick={async () => {
                  await logout();
                  navigate('/login', { replace: true });
                }}
              >
                <LogOut className="h-4 w-4" /> Keluar
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" loading={submitting}>
              Simpan Password
            </Button>
          </div>
        </form>
      </div>
    </AuthLayout>
  );
}
