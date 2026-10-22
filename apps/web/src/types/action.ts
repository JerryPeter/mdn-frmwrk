/** Baris tabel usrmgnt.actions (field snake_case sama dengan database) */
export interface Action {
  id: string;
  action_code: string;
  action_name: string;
  description: string | null;
  is_default: boolean;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  deleted_by: string | null;
  deleted_at: string | null;
  is_deleted: boolean;
  is_active: boolean;
  /** Action utama CREATE/READ/UPDATE/DELETE: tidak dapat dihapus/dinonaktifkan (AD-02) */
  is_builtin: boolean;
}

/** Field yang dikirim saat create/update (PRD §8.7) */
export interface ActionInput {
  action_code: string;
  action_name: string;
  description: string;
  is_default: boolean;
  sort_order: number;
}

export type ActionSortColumn = 'sort_order' | 'action_code' | 'action_name' | 'is_default' | 'is_active' | 'created_at' | 'updated_at';

export interface ActionListParams {
  page: number;
  page_size: number;
  q?: string;
  is_active?: boolean;
  sort_by: ActionSortColumn;
  sort_dir: 'asc' | 'desc';
  include_deleted?: boolean;
}
