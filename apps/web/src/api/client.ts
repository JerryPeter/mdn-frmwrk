import axios, { type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { env } from '@/config/env';
import { mockAdapter } from '@/mocks/adapter';
import { useSession } from '@/stores/session';
import type { ApiFailure, ApiMeta, ApiSuccess } from '@/types/api';
import type { SelectContextResponse, TokenResponse } from '@/types/auth';
import { toApiError } from './errors';

const baseConfig: AxiosRequestConfig = {
  baseURL: env.apiBaseUrl,
  withCredentials: true, // refresh token dikirim via cookie httpOnly (FR-AUTH-02)
  headers: { 'Content-Type': 'application/json' },
  adapter: env.useMock ? mockAdapter : undefined,
};

export const http = axios.create(baseConfig);

/** Instance tanpa interceptor, khusus alur refresh agar tidak terjadi loop */
const rawHttp = axios.create(baseConfig);

http.interceptors.request.use((config) => {
  const token = useSession.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ---------------------------------------------------------------------
// Refresh token: satu permintaan refresh dipakai bersama oleh semua
// request yang gagal karena TOKEN_EXPIRED.
// ---------------------------------------------------------------------
let refreshPromise: Promise<string> | null = null;

/**
 * Minta access token baru. Refresh token hanya menyimpan user_id (FR-AUTH-02),
 * sehingga claim `ctx` hilang; konteks aktif dipilih ulang agar token kembali memiliki ctx.
 */
export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const { data } = await rawHttp.post<ApiSuccess<TokenResponse>>('/auth/refresh');
      let token = data.data.access_token;
      const session = useSession.getState();
      session.setAccessToken(token);

      const ctx = session.activeContext;
      if (ctx) {
        const res = await rawHttp.post<ApiSuccess<SelectContextResponse>>(
          '/auth/context',
          { company_id: ctx.company_id, application_id: ctx.application_id },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        token = res.data.data.access_token;
        session.setAccessToken(token);
      }
      return token;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

http.interceptors.response.use(
  (res) => res,
  async (error) => {
    // Request berformat blob (download Excel): body error JSON ikut berbentuk Blob
    const blob = error.response?.data;
    if (blob instanceof Blob && blob.type.includes('json')) {
      try {
        error.response.data = JSON.parse(await blob.text());
      } catch {
        /* biarkan apa adanya */
      }
    }
    const config = error.config as RetriableConfig | undefined;
    const code = (error.response?.data as ApiFailure | undefined)?.error?.code;
    const session = useSession.getState();

    if (code === 'TOKEN_EXPIRED' && config && !config._retry) {
      config._retry = true;
      try {
        const token = await refreshAccessToken();
        config.headers.Authorization = `Bearer ${token}`;
        return http(config);
      } catch {
        session.clear();
        return Promise.reject(toApiError(error));
      }
    }

    // Route guard bereaksi terhadap perubahan state berikut
    if (code === 'UNAUTHENTICATED') session.clear();
    if (code === 'PASSWORD_CHANGE_REQUIRED') session.markMustChangePassword(true);
    if (code === 'CONTEXT_REQUIRED') session.setActiveContext(null);

    return Promise.reject(toApiError(error));
  },
);

/** Kirim request dan kembalikan `data` dari envelope sukses */
export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const res = await http.request<ApiSuccess<T>>(config);
  return res.data.data;
}

/** Unduh file (mis. Excel) lalu simpan lewat browser; nama file dari Content-Disposition */
export async function downloadFile(config: AxiosRequestConfig, fallbackName: string): Promise<void> {
  const res = await http.request<Blob>({ ...config, responseType: 'blob' });
  const disposition = String(res.headers['content-disposition'] ?? '');
  const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Untuk endpoint list berpaginasi: kembalikan `data` + `meta` */
export async function requestPage<T>(config: AxiosRequestConfig): Promise<{ data: T[]; meta: ApiMeta }> {
  const res = await http.request<ApiSuccess<T[]>>(config);
  return { data: res.data.data, meta: res.data.meta ?? { page: 1, page_size: res.data.data.length, total: res.data.data.length } };
}
