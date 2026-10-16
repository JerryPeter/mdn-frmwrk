import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/api/auth';
import { useSession } from '@/stores/session';
import type { AccessContext } from '@/types/auth';

/** Kunci query yang bergantung pada konteks aktif */
export const authKeys = {
  contexts: ['auth', 'contexts'] as const,
  menus: (ctx: AccessContext | null) => ['auth', 'menus', ctx?.company_id, ctx?.application_id] as const,
  permissions: (ctx: AccessContext | null) => ['auth', 'permissions', ctx?.company_id, ctx?.application_id] as const,
};

export function useContexts() {
  const user = useSession((s) => s.user);
  return useQuery({
    queryKey: authKeys.contexts,
    queryFn: authApi.contexts,
    enabled: !!user && !user.must_change_password,
  });
}

export function useMenus() {
  const ctx = useSession((s) => s.activeContext);
  return useQuery({ queryKey: authKeys.menus(ctx), queryFn: authApi.menus, enabled: !!ctx });
}

export function usePermissionSet() {
  const ctx = useSession((s) => s.activeContext);
  return useQuery({
    queryKey: authKeys.permissions(ctx),
    queryFn: authApi.permissions,
    enabled: !!ctx,
    select: (keys) => new Set(keys),
  });
}

/** Aksi sesi: pilih konteks dan logout */
export function useSessionActions() {
  const qc = useQueryClient();

  const selectContext = async (ctx: AccessContext) => {
    const res = await authApi.selectContext(ctx.company_id, ctx.application_id);
    const session = useSession.getState();
    session.setAccessToken(res.access_token);
    session.setActiveContext({ ...ctx, ...res.context });
    qc.removeQueries({ queryKey: ['auth', 'menus'] });
    qc.removeQueries({ queryKey: ['auth', 'permissions'] });
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      /* tetap bersihkan sesi lokal */
    }
    useSession.getState().setActiveContext(null);
    useSession.getState().clear();
    qc.clear();
  };

  return { selectContext, logout };
}
