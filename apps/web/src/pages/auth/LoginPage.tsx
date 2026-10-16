import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LogIn, RotateCcw } from 'lucide-react';
import { authApi } from '@/api/auth';
import { toApiError } from '@/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { env } from '@/config/env';
import { authKeys } from '@/hooks/useAuth';
import { usePostLoginRedirect } from '@/hooks/usePostLoginRedirect';
import { AuthLayout } from '@/layouts/AuthLayout';
import { resetMockDb } from '@/mocks/adapter';
import { useSession } from '@/stores/session';
import { toast } from '@/stores/toast';

interface FieldErrors {
  username?: string;
  password?: string;
}

/** Akun uji dari PRD §12 (hanya ditampilkan saat mode mock) */
const TEST_ACCOUNTS = [
  { username: 'superadmin', note: 'USRMGNT penuh (MDN, DEMO1)' },
  { username: 'auditor', note: 'USRMGNT read-only' },
  { username: 'bc.admin', note: 'BILLCOST penuh' },
  { username: 'bc.staff', note: 'Wajib ganti password' },
  { username: 'bc.viewer', note: 'LDAP – belum didukung' },
  { username: 'inv.admin', note: 'INVDEMO (MDN, DEMO2)' },
  { username: 'locked.user', note: 'Terkunci' },
  { username: 'inactive.user', note: 'Nonaktif' },
];

export default function LoginPage() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const status = useSession((s) => s.status);
  const qc = useQueryClient();
  const redirectAfterLogin = usePostLoginRedirect();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<{ title: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated' && !submitting) return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errors: FieldErrors = {};
    if (!username.trim()) errors.username = 'Username wajib diisi';
    if (!password) errors.password = 'Password wajib diisi';
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    try {
      const res = await authApi.login(username.trim(), password);
      useSession.getState().setSession(res.access_token, res.user);
      qc.setQueryData(authKeys.contexts, res.contexts);
      await redirectAfterLogin(res.contexts, from);
    } catch (err) {
      const apiErr = toApiError(err);
      const titles: Partial<Record<string, string>> = {
        INVALID_CREDENTIALS: 'Login gagal',
        ACCOUNT_LOCKED: 'Akun terkunci',
        ACCOUNT_INACTIVE: 'Akun tidak aktif',
        AUTH_PROVIDER_NOT_SUPPORTED: 'Metode login belum didukung',
        TOO_MANY_REQUESTS: 'Terlalu banyak percobaan',
      };
      if (apiErr.code === 'VALIDATION_ERROR' && apiErr.details.length) {
        setFieldErrors(Object.fromEntries(apiErr.details.map((d) => [d.field, d.message])));
      } else {
        setFormError({ title: titles[apiErr.code] ?? 'Terjadi kesalahan', message: apiErr.message });
      }
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Masuk</h1>
          <p className="mt-1 text-sm text-slate-500">Gunakan akun MODENA Anda untuk melanjutkan.</p>
        </div>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {formError && (
            <Alert variant="error" title={formError.title}>
              {formError.message}
            </Alert>
          )}
          <TextField
            label="Username"
            name="username"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            error={fieldErrors.username}
          />
          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
          />
          <Button type="submit" size="lg" className="w-full" loading={submitting}>
            {!submitting && <LogIn className="h-4 w-4" />}
            Masuk
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-400">
          Lupa password? Hubungi administrator IT untuk reset password.
        </p>
      </div>

      {env.useMock && (
        <div className="mt-6 rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              Mode mock · password: Modena@2026
            </p>
            <button
              type="button"
              onClick={() => {
                resetMockDb();
                toast.info('Data mock dikembalikan ke kondisi seed');
              }}
              className="inline-flex items-center gap-1 text-xs text-amber-800 hover:underline"
            >
              <RotateCcw className="h-3 w-3" /> Reset data
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {TEST_ACCOUNTS.map((a) => (
              <button
                key={a.username}
                type="button"
                onClick={() => {
                  setUsername(a.username);
                  setPassword('Modena@2026');
                  setFieldErrors({});
                  setFormError(null);
                }}
                className="rounded-md bg-white px-2.5 py-1.5 text-left ring-1 ring-amber-200 hover:ring-amber-400"
              >
                <span className="block text-xs font-medium text-slate-800">{a.username}</span>
                <span className="block text-[11px] text-slate-500">{a.note}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
