import type { Application, ApplicationInput, ApplicationListParams } from '@/types/application';
import { request, requestPage } from './client';

/** Endpoint /applications (PRD §9.2, menu UM_APPLICATION) */
export const applicationsApi = {
  list: (params: ApplicationListParams) =>
    requestPage<Application>({
      method: 'GET',
      url: '/applications',
      params: {
        ...params,
        q: params.q || undefined,
        include_deleted: params.include_deleted || undefined,
      },
    }),

  get: (id: string) => request<Application>({ method: 'GET', url: `/applications/${id}` }),

  create: (input: ApplicationInput) => request<Application>({ method: 'POST', url: '/applications', data: input }),

  update: (id: string, input: ApplicationInput) =>
    request<Application>({ method: 'PUT', url: `/applications/${id}`, data: input }),

  setStatus: (id: string, is_active: boolean) =>
    request<Application>({ method: 'PATCH', url: `/applications/${id}/status`, data: { is_active } }),

  remove: (id: string) => request<Application>({ method: 'DELETE', url: `/applications/${id}` }),

  restore: (id: string) => request<Application>({ method: 'POST', url: `/applications/${id}/restore` }),
};
