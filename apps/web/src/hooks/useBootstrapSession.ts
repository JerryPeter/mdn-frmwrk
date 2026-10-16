import { useEffect } from 'react';
import { authApi } from '@/api/auth';
import { refreshAccessToken } from '@/api/client';
import { clearStoredContext, getStoredContextIds, useSession } from '@/stores/session';

/**
 * Pulihkan sesi saat aplikasi dimuat ulang: access token hanya ada di memori,
 * jadi minta token baru via refresh token (cookie), ambil profil, lalu pilih
 * ulang konteks terakhir bila masih valid.
 */
export function useBootstrapSession() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = useSession.getState();
      try {
        let token = await refreshAccessToken();
        const me = await authApi.me();
        if (cancelled) return;

        // Konteks dipulihkan lebih dulu; status 'authenticated' diset terakhir
        // agar route guard tidak sempat mengarahkan ke /select-context.
        const stored = getStoredContextIds();
        if (stored && !me.must_change_password) {
          const contexts = await authApi.contexts();
          const ctx = contexts.find(
            (c) => c.company_id === stored.company_id && c.application_id === stored.application_id,
          );
          if (ctx) {
            const res = await authApi.selectContext(ctx.company_id, ctx.application_id);
            token = res.access_token;
            session.setActiveContext({ ...ctx, ...res.context });
          } else {
            clearStoredContext();
          }
        }
        if (!cancelled) session.setSession(token, me);
      } catch {
        if (!cancelled) session.clear();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
