import { request } from './client';

export interface CompanyApplicationItem {
  application_id: string;
  app_code: string;
  app_name: string;
  icon: string | null;
  is_active: boolean;
  is_assigned: boolean;
  mapping_id: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
  /** Keanggotaan group untuk company + aplikasi ini; pemetaan tidak dapat dilepas bila > 0 */
  member_count: number;
}

export interface CompanyApplications {
  company: { id: string; company_code: string; company_name: string; is_active: boolean };
  items: CompanyApplicationItem[];
}

/** Endpoint /companies/:id/applications (PRD §9.2, menu UM_COMPANY_APP) */
export const companyApplicationsApi = {
  list: (companyId: string) => request<CompanyApplications>({ method: 'GET', url: `/companies/${companyId}/applications` }),

  assign: (companyId: string, applicationId: string) =>
    request<unknown>({ method: 'POST', url: `/companies/${companyId}/applications`, data: { application_id: applicationId } }),

  unassign: (companyId: string, applicationId: string) =>
    request<unknown>({ method: 'DELETE', url: `/companies/${companyId}/applications/${applicationId}` }),
};
