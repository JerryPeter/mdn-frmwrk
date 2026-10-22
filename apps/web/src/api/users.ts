import type {
  CreateUserInput,
  ImportResult,
  User,
  UserInput,
  UserListParams,
  UserMembership,
  UserWithPassword,
} from '@/types/user';
import { downloadFile, request, requestPage } from './client';

type Filter = Omit<UserListParams, 'page' | 'page_size'>;

const filterParams = (params: Filter) => ({
  ...params,
  q: params.q || undefined,
  include_deleted: params.include_deleted || undefined,
});

/** Endpoint /users (PRD §9.2, menu UM_USER) */
export const usersApi = {
  list: (params: UserListParams) => requestPage<User>({ method: 'GET', url: '/users', params: filterParams(params) }),

  get: (id: string) => request<User>({ method: 'GET', url: `/users/${id}` }),

  memberships: (id: string) => request<UserMembership[]>({ method: 'GET', url: `/users/${id}/memberships` }),

  create: (input: CreateUserInput) => request<UserWithPassword>({ method: 'POST', url: '/users', data: input }),

  update: (id: string, input: UserInput) => request<User>({ method: 'PUT', url: `/users/${id}`, data: input }),

  setStatus: (id: string, is_active: boolean) =>
    request<User>({ method: 'PATCH', url: `/users/${id}/status`, data: { is_active } }),

  lock: (id: string) => request<User>({ method: 'POST', url: `/users/${id}/lock` }),

  unlock: (id: string) => request<User>({ method: 'POST', url: `/users/${id}/unlock` }),

  resetPassword: (id: string) => request<UserWithPassword>({ method: 'POST', url: `/users/${id}/reset-password` }),

  remove: (id: string) => request<User>({ method: 'DELETE', url: `/users/${id}` }),

  restore: (id: string) => request<User & { restored_memberships: number }>({ method: 'POST', url: `/users/${id}/restore` }),

  /** Export Excel mengikuti filter list */
  exportExcel: (params: Filter) => downloadFile({ method: 'GET', url: '/users/export', params: filterParams(params) }, 'users.xlsx'),

  downloadTemplate: () => downloadFile({ method: 'GET', url: '/users/import/template' }, 'template_import_users.xlsx'),

  importExcel: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    // Header JSON bawaan membuat axios mengubah FormData menjadi JSON; boundary diisi browser
    return request<ImportResult>({ method: 'POST', url: '/users/import', data: form, headers: { 'Content-Type': 'multipart/form-data' } });
  },
};
