import type { Company, CompanyInput, CompanyListParams } from '@/types/company';
import { request, requestPage } from './client';

/** Endpoint /companies (PRD §9.2, menu UM_COMPANY) */
export const companiesApi = {
  list: (params: CompanyListParams) =>
    requestPage<Company>({
      method: 'GET',
      url: '/companies',
      params: {
        ...params,
        q: params.q || undefined,
        include_deleted: params.include_deleted || undefined,
      },
    }),

  get: (id: string) => request<Company>({ method: 'GET', url: `/companies/${id}` }),

  create: (input: CompanyInput) => request<Company>({ method: 'POST', url: '/companies', data: input }),

  update: (id: string, input: CompanyInput) => request<Company>({ method: 'PUT', url: `/companies/${id}`, data: input }),

  setStatus: (id: string, is_active: boolean) =>
    request<Company>({ method: 'PATCH', url: `/companies/${id}/status`, data: { is_active } }),

  remove: (id: string) => request<Company>({ method: 'DELETE', url: `/companies/${id}` }),

  restore: (id: string) => request<Company>({ method: 'POST', url: `/companies/${id}/restore` }),
};
