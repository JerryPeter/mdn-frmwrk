import type { AdminMenuNode, MenuActions, MenuInput, MenuRow } from '@/types/menu';
import { request } from './client';

/** Endpoint menu (PRD §9.2, menu UM_MENU) */
export const menusApi = {
  tree: (applicationId: string, includeDeleted = false) =>
    request<AdminMenuNode[]>({
      method: 'GET',
      url: `/applications/${applicationId}/menus/tree`,
      params: includeDeleted ? { include_deleted: true } : undefined,
    }),

  create: (input: MenuInput) => request<MenuRow>({ method: 'POST', url: '/menus', data: input }),

  update: (id: string, input: Omit<MenuInput, 'application_id' | 'menu_type' | 'menu_code'>) =>
    request<MenuRow>({ method: 'PUT', url: `/menus/${id}`, data: input }),

  setStatus: (id: string, is_active: boolean) => request<MenuRow>({ method: 'PATCH', url: `/menus/${id}/status`, data: { is_active } }),

  remove: (id: string) => request<MenuRow>({ method: 'DELETE', url: `/menus/${id}` }),

  restore: (id: string) => request<MenuRow>({ method: 'POST', url: `/menus/${id}/restore` }),

  actions: (id: string) => request<MenuActions>({ method: 'GET', url: `/menus/${id}/actions` }),

  setActions: (id: string, action_ids: string[]) =>
    request<MenuActions>({ method: 'PUT', url: `/menus/${id}/actions`, data: { action_ids } }),
};
