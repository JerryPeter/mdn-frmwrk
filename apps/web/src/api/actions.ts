import type { Action, ActionInput, ActionListParams } from '@/types/action';
import { request, requestPage } from './client';

/** Endpoint /actions (PRD §9.2, menu UM_ACTION) */
export const actionsApi = {
  list: (params: ActionListParams) =>
    requestPage<Action>({
      method: 'GET',
      url: '/actions',
      params: {
        ...params,
        q: params.q || undefined,
        include_deleted: params.include_deleted || undefined,
      },
    }),

  get: (id: string) => request<Action>({ method: 'GET', url: `/actions/${id}` }),

  create: (input: ActionInput) => request<Action>({ method: 'POST', url: '/actions', data: input }),

  update: (id: string, input: ActionInput) => request<Action>({ method: 'PUT', url: `/actions/${id}`, data: input }),

  setStatus: (id: string, is_active: boolean) =>
    request<Action>({ method: 'PATCH', url: `/actions/${id}/status`, data: { is_active } }),

  remove: (id: string) => request<Action>({ method: 'DELETE', url: `/actions/${id}` }),

  restore: (id: string) => request<Action>({ method: 'POST', url: `/actions/${id}/restore` }),
};
