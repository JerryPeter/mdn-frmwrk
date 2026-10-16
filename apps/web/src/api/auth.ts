import type {
  AccessContext,
  ChangePasswordPayload,
  LoginResponse,
  MeResponse,
  MenuNode,
  SelectContextResponse,
  TokenResponse,
} from '@/types/auth';
import { request } from './client';

export const authApi = {
  login: (username: string, password: string) =>
    request<LoginResponse>({ method: 'POST', url: '/auth/login', data: { username, password } }),

  logout: () => request<null>({ method: 'POST', url: '/auth/logout' }),

  me: () => request<MeResponse>({ method: 'GET', url: '/auth/me' }),

  /** Backend boleh mengembalikan access token baru karena refresh token lama dicabut (FR-AUTH-05) */
  changePassword: (payload: ChangePasswordPayload) =>
    request<Partial<TokenResponse> | null>({ method: 'POST', url: '/auth/change-password', data: payload }),

  contexts: () => request<AccessContext[]>({ method: 'GET', url: '/auth/contexts' }),

  selectContext: (company_id: string, application_id: string) =>
    request<SelectContextResponse>({ method: 'POST', url: '/auth/context', data: { company_id, application_id } }),

  menus: () => request<MenuNode[]>({ method: 'GET', url: '/auth/menus' }),

  permissions: () => request<string[]>({ method: 'GET', url: '/auth/permissions' }),
};
