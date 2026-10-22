/** Baris tabel usrmgnt.applications (field snake_case sama dengan database) */
export interface Application {
  id: string;
  app_code: string;
  app_name: string;
  description: string | null;
  base_url: string | null;
  icon: string | null;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  deleted_by: string | null;
  deleted_at: string | null;
  is_deleted: boolean;
  is_active: boolean;
  /** Aplikasi inti (AD-01): tidak dapat dihapus/dinonaktifkan */
  is_protected: boolean;
}

/** Field yang dikirim saat create/update (PRD §8.5) */
export interface ApplicationInput {
  app_code: string;
  app_name: string;
  description: string;
  base_url: string;
  icon: string;
  sort_order: number;
}

export type ApplicationSortColumn = 'sort_order' | 'app_code' | 'app_name' | 'is_active' | 'created_at' | 'updated_at';

export interface ApplicationListParams {
  page: number;
  page_size: number;
  q?: string;
  is_active?: boolean;
  sort_by: ApplicationSortColumn;
  sort_dir: 'asc' | 'desc';
  include_deleted?: boolean;
}
