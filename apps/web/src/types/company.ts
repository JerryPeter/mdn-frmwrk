/** Baris tabel usrmgnt.companies (field snake_case sama dengan database) */
export interface Company {
  id: string;
  company_code: string;
  company_name: string;
  short_name: string | null;
  tax_number: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  deleted_by: string | null;
  deleted_at: string | null;
  is_deleted: boolean;
  is_active: boolean;
}

/** Field yang dikirim saat create/update (PRD §8.4) */
export interface CompanyInput {
  company_code: string;
  company_name: string;
  short_name: string;
  tax_number: string;
  address: string;
  phone: string;
  email: string;
  logo_url: string;
}

export type CompanySortColumn = 'company_code' | 'company_name' | 'short_name' | 'is_active' | 'created_at' | 'updated_at';

export interface CompanyListParams {
  page: number;
  page_size: number;
  q?: string;
  is_active?: boolean;
  sort_by: CompanySortColumn;
  sort_dir: 'asc' | 'desc';
  include_deleted?: boolean;
}
