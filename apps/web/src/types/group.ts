import type { MembershipStatus } from './user';

/** Baris usrmgnt.user_groups + ringkasan relasi (PRD §8.10) */
export interface UserGroup {
  id: string;
  application_id: string;
  app_code: string;
  app_name: string;
  app_is_active: boolean;
  group_code: string;
  group_name: string;
  description: string | null;
  member_count: number;
  permission_count: number;
  /** SUPER_ADMIN di USRMGNT: tidak dapat dihapus/dinonaktifkan (AD-01) */
  is_protected: boolean;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  deleted_by: string | null;
  deleted_at: string | null;
  is_deleted: boolean;
  is_active: boolean;
}

export interface GroupInput {
  application_id: string;
  group_code: string;
  group_name: string;
  description: string;
}

export type GroupSortColumn = 'group_code' | 'group_name' | 'is_active' | 'created_at' | 'updated_at';

export interface GroupListParams {
  page: number;
  page_size: number;
  q?: string;
  is_active?: boolean;
  application_id?: string;
  sort_by: GroupSortColumn;
  sort_dir: 'asc' | 'desc';
  include_deleted?: boolean;
}

/** Item /lookups/user-groups (pemilih group) */
export interface LookupGroup {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  application_id: string;
  app_code: string;
  app_name: string;
  member_count: number;
}

// ---------------------------------------------------------------------
// Group members (PRD §8.11)
// ---------------------------------------------------------------------
export interface GroupMember {
  id: string;
  user_group_id: string;
  valid_from: string;
  valid_to: string | null;
  is_active: boolean;
  status: MembershipStatus;
  user: { id: string; username: string; full_name: string; email: string; is_active: boolean; is_locked: boolean };
  company: { id: string; code: string; name: string; is_active: boolean };
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
}

export type MemberSortColumn = 'username' | 'full_name' | 'company_code' | 'valid_from' | 'valid_to' | 'created_at';

export interface MemberListParams {
  page: number;
  page_size: number;
  q?: string;
  company_id?: string;
  sort_by: MemberSortColumn;
  sort_dir: 'asc' | 'desc';
}

export interface CreateMemberInput {
  user_id: string;
  company_id: string;
  valid_from: string;
  valid_to: string | null;
}

export interface UpdateMemberInput {
  valid_from: string;
  valid_to: string | null;
  is_active: boolean;
}

// ---------------------------------------------------------------------
// Group permissions (PRD §8.12)
// ---------------------------------------------------------------------
export interface MatrixAction {
  action_code: string;
  action_name: string;
  sort_order: number;
  is_active: boolean;
}

export interface MatrixCell {
  action_code: string;
  menu_action_id: string;
  granted: boolean;
}

export interface MatrixRow {
  menu_id: string;
  menu_code: string;
  menu_name: string;
  menu_type: 'GROUP' | 'PAGE';
  parent_id: string | null;
  level: number;
  is_active: boolean;
  is_visible: boolean;
  cells: MatrixCell[];
}

export interface PermissionMatrix {
  group: UserGroup;
  actions: MatrixAction[];
  rows: MatrixRow[];
  summary: { available: number; granted: number };
  changes?: { added: number; removed: number };
}
