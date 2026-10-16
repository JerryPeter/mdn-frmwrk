export interface SessionUser {
  id: string;
  username: string;
  full_name: string;
  email?: string;
  employee_no?: string | null;
  must_change_password: boolean;
}

/** Pasangan company + aplikasi yang dapat diakses user (FR-AUTH-03) */
export interface AccessContext {
  company_id: string;
  company_code: string;
  company_name?: string;
  application_id: string;
  app_code: string;
  app_name?: string;
  app_icon?: string | null;
}

export interface LoginResponse {
  access_token: string;
  expires_in: number;
  user: SessionUser;
  contexts: AccessContext[];
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
}

export interface SelectContextResponse extends TokenResponse {
  context: AccessContext;
}

export interface MeResponse extends SessionUser {
  context: AccessContext | null;
}

export interface ChangePasswordPayload {
  old_password: string;
  new_password: string;
  confirm_password: string;
}

export type MenuType = 'GROUP' | 'PAGE';

/** Node pohon menu dari GET /auth/menus (PRD §9.4) */
export interface MenuNode {
  menu_code: string;
  menu_name: string;
  menu_type: MenuType;
  icon?: string | null;
  route_path?: string | null;
  is_visible: boolean;
  actions?: string[];
  children?: MenuNode[];
}
