import type { LookupGroup } from '@/types/group';
import type { LookupApplication } from '@/types/menu';
import { request } from './client';

export interface LookupCompany {
  id: string;
  code: string;
  name: string;
}

export interface LookupUser {
  id: string;
  /** username */
  code: string;
  /** nama lengkap */
  name: string;
  email: string;
}

/** Lookup untuk dropdown: hanya data aktif, cukup token + konteks USRMGNT (PRD §9.2) */
export const lookupsApi = {
  applications: () => request<LookupApplication[]>({ method: 'GET', url: '/lookups/applications' }),
  /** `applicationId`: hanya company yang memiliki aplikasi tersebut */
  companies: (applicationId?: string) =>
    request<LookupCompany[]>({ method: 'GET', url: '/lookups/companies', params: { application_id: applicationId || undefined } }),
  users: (q: string) => request<LookupUser[]>({ method: 'GET', url: '/lookups/users', params: { q: q || undefined, limit: 20 } }),
  /** Termasuk group nonaktif (dengan penanda `is_active`) */
  userGroups: (applicationId?: string) =>
    request<LookupGroup[]>({ method: 'GET', url: '/lookups/user-groups', params: { application_id: applicationId || undefined } }),
};
