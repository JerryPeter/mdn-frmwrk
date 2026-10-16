import { useNavigate } from 'react-router-dom';
import { useSession } from '@/stores/session';
import type { AccessContext } from '@/types/auth';
import { useSessionActions } from './useAuth';

/**
 * Arahkan user setelah login / ganti password:
 * wajib ganti password → /change-password; satu konteks → pilih otomatis (FR-AUTH-03);
 * selain itu → /select-context.
 */
export function usePostLoginRedirect() {
  const navigate = useNavigate();
  const { selectContext } = useSessionActions();

  return async (contexts: AccessContext[], from?: string) => {
    const user = useSession.getState().user;
    if (user?.must_change_password) {
      navigate('/change-password', { replace: true, state: { from } });
      return;
    }
    if (contexts.length === 1) {
      await selectContext(contexts[0]);
      navigate(from || '/', { replace: true });
      return;
    }
    navigate('/select-context', { replace: true, state: { from } });
  };
}
