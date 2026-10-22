export type MenuType = 'GROUP' | 'PAGE';

/** Baris tabel usrmgnt.menus */
export interface MenuRow {
  id: string;
  application_id: string;
  parent_id: string | null;
  menu_code: string;
  menu_name: string;
  menu_type: MenuType;
  route_path: string | null;
  icon: string | null;
  sort_order: number;
  is_visible: boolean;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  deleted_by: string | null;
  deleted_at: string | null;
  is_deleted: boolean;
  is_active: boolean;
}

/** Node dari GET /applications/:id/menus/tree (tampilan admin) */
export interface AdminMenuNode extends MenuRow {
  /** Kode action yang tersedia di menu PAGE */
  actions: string[];
  children: AdminMenuNode[];
}

export interface MenuInput {
  application_id: string;
  parent_id: string | null;
  menu_code: string;
  menu_name: string;
  menu_type: MenuType;
  route_path: string | null;
  icon: string | null;
  sort_order: number;
  is_visible: boolean;
}

/** Item dari GET /menus/:id/actions */
export interface MenuActionItem {
  action_id: string;
  action_code: string;
  action_name: string;
  is_default: boolean;
  is_active: boolean;
  /** READ wajib ada di setiap PAGE (AD-05) */
  is_required: boolean;
  is_assigned: boolean;
  menu_action_id: string | null;
  /** Jumlah group yang sudah diberi izin action ini di menu ini */
  group_count: number;
}

export interface MenuActions {
  menu_id: string;
  menu_type: MenuType;
  items: MenuActionItem[];
}

export interface LookupApplication {
  id: string;
  code: string;
  name: string;
  icon: string | null;
}
