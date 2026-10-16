import { create } from 'zustand';
import type { AccessContext, SessionUser } from '@/types/auth';

/** Hanya id konteks yang disimpan agar konteks bisa dipilih ulang setelah reload */
const CONTEXT_STORAGE_KEY = 'modena.activeContext';

type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

interface SessionState {
  status: SessionStatus;
  /** Access token disimpan di memori saja, tidak di localStorage */
  accessToken: string | null;
  user: SessionUser | null;
  activeContext: AccessContext | null;

  setSession: (token: string, user: SessionUser) => void;
  setAccessToken: (token: string) => void;
  setActiveContext: (ctx: AccessContext | null) => void;
  markMustChangePassword: (value: boolean) => void;
  setStatus: (status: SessionStatus) => void;
  clear: () => void;
}

export const useSession = create<SessionState>((set) => ({
  status: 'loading',
  accessToken: null,
  user: null,
  activeContext: null,

  setSession: (token, user) => set({ accessToken: token, user, status: 'authenticated' }),
  setAccessToken: (token) => set({ accessToken: token }),
  setActiveContext: (ctx) => {
    if (ctx) {
      localStorage.setItem(
        CONTEXT_STORAGE_KEY,
        JSON.stringify({ company_id: ctx.company_id, application_id: ctx.application_id }),
      );
    } else {
      localStorage.removeItem(CONTEXT_STORAGE_KEY);
    }
    set({ activeContext: ctx });
  },
  markMustChangePassword: (value) =>
    set((s) => (s.user ? { user: { ...s.user, must_change_password: value } } : s)),
  setStatus: (status) => set({ status }),
  clear: () => set({ accessToken: null, user: null, activeContext: null, status: 'anonymous' }),
}));

export function getStoredContextIds(): { company_id: string; application_id: string } | null {
  try {
    const raw = localStorage.getItem(CONTEXT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearStoredContext() {
  localStorage.removeItem(CONTEXT_STORAGE_KEY);
}
