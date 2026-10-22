export type AuthProvider = 'LOCAL' | 'LDAP' | 'SSO';

/** Baris usrmgnt.users tanpa password_hash (PRD §8.9) */
export interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  employee_no: string | null;
  phone: string | null;
  auth_provider: AuthProvider;
  password_changed_at: string | null;
  must_change_password: boolean;
  failed_login_count: number;
  is_locked: boolean;
  locked_at: string | null;
  last_login_at: string | null;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  deleted_by: string | null;
  deleted_at: string | null;
  is_deleted: boolean;
  is_active: boolean;
  /** Jumlah keanggotaan group yang belum dihapus */
  membership_count: number;
}

/** Response create/reset password: password bangkitan hanya dikirim sekali */
export interface UserWithPassword extends User {
  generated_password: string | null;
}

export interface UserInput {
  username: string;
  email: string;
  full_name: string;
  employee_no: string;
  phone: string;
}

export interface CreateUserInput extends UserInput {
  /** Kosong → dibangkitkan sistem */
  password: string | null;
}

export type UserSortColumn =
  | 'username'
  | 'full_name'
  | 'email'
  | 'employee_no'
  | 'auth_provider'
  | 'is_active'
  | 'is_locked'
  | 'last_login_at'
  | 'created_at'
  | 'updated_at';

export interface UserListParams {
  page: number;
  page_size: number;
  q?: string;
  is_active?: boolean;
  is_locked?: boolean;
  auth_provider?: AuthProvider;
  sort_by: UserSortColumn;
  sort_dir: 'asc' | 'desc';
  include_deleted?: boolean;
}

export type MembershipStatus = 'active' | 'inactive' | 'upcoming' | 'expired' | 'suspended';

/** Tab "Akses": keanggotaan group user */
export interface UserMembership {
  id: string;
  company: { id: string; code: string; name: string };
  application: { id: string; code: string; name: string };
  group: { id: string; code: string; name: string };
  valid_from: string;
  valid_to: string | null;
  is_active: boolean;
  status: MembershipStatus;
}

export interface ImportResult {
  imported: number;
  users: Array<{ username: string; email: string; full_name: string; generated_password: string | null }>;
}
