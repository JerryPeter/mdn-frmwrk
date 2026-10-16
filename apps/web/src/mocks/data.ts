// =====================================================================
// Data mock = cerminan database/02_seed_sample_data.sql.
// HANYA untuk development frontend sebelum backend (Tahap 1–3) tersedia.
// =====================================================================

export interface MockCompany { id: string; company_code: string; company_name: string; is_active: boolean }
export interface MockApplication { id: string; app_code: string; app_name: string; icon: string; sort_order: number; is_active: boolean }
export interface MockMenu {
  id: string;
  app_code: string;
  menu_code: string;
  menu_name: string;
  menu_type: 'GROUP' | 'PAGE';
  parent_code: string | null;
  route_path: string | null;
  icon: string | null;
  sort_order: number;
  is_visible: boolean;
  /** Action yang tersedia di menu (menu_actions aktif) */
  actions: string[];
}
export interface MockUser {
  id: string;
  username: string;
  email: string;
  full_name: string;
  employee_no: string | null;
  auth_provider: 'LOCAL' | 'LDAP';
  must_change_password: boolean;
  is_locked: boolean;
  is_active: boolean;
  failed_login_count: number;
}
export interface MockMembership {
  username: string;
  app_code: string;
  group_code: string;
  company_code: string;
  valid_from: string;
  valid_to: string | null;
}

export const SEED_PASSWORD = 'Modena@2026';

export const companies: MockCompany[] = [
  { id: 'c-mdn', company_code: 'MDN', company_name: 'MODENA Indonesia', is_active: true },
  { id: 'c-demo1', company_code: 'DEMO1', company_name: 'Demo Company Satu', is_active: true },
  { id: 'c-demo2', company_code: 'DEMO2', company_name: 'Demo Company Dua', is_active: true },
];

export const applications: MockApplication[] = [
  { id: 'a-usrmgnt', app_code: 'USRMGNT', app_name: 'User Management', icon: 'shield', sort_order: 1, is_active: true },
  { id: 'a-billcost', app_code: 'BILLCOST', app_name: 'Billing Cost', icon: 'receipt', sort_order: 2, is_active: true },
  { id: 'a-invdemo', app_code: 'INVDEMO', app_name: 'Inventory Demo', icon: 'box', sort_order: 3, is_active: true },
];

export const companyApplications: Array<[string, string]> = [
  ['MDN', 'USRMGNT'],
  ['MDN', 'BILLCOST'],
  ['MDN', 'INVDEMO'],
  ['DEMO1', 'USRMGNT'],
  ['DEMO1', 'BILLCOST'],
  ['DEMO2', 'INVDEMO'],
];

const CRUD = ['CREATE', 'READ', 'UPDATE', 'DELETE'];

function group(app_code: string, menu_code: string, menu_name: string, icon: string, sort_order: number): MockMenu {
  return { id: `m-${menu_code}`, app_code, menu_code, menu_name, menu_type: 'GROUP', parent_code: null, route_path: null, icon, sort_order, is_visible: true, actions: [] };
}

function page(
  app_code: string, parent_code: string, menu_code: string, menu_name: string,
  route_path: string, sort_order: number, actions: string[], is_visible = true,
): MockMenu {
  return { id: `m-${menu_code}`, app_code, menu_code, menu_name, menu_type: 'PAGE', parent_code, route_path, icon: null, sort_order, is_visible, actions };
}

export const menus: MockMenu[] = [
  group('USRMGNT', 'UM_MASTER', 'Master Data', 'database', 1),
  group('USRMGNT', 'UM_ACCESS', 'Access Control', 'key', 2),
  group('BILLCOST', 'BC_TRX', 'Transaction', 'edit', 1),
  group('BILLCOST', 'BC_REPORT', 'Report', 'bar-chart', 2),
  group('INVDEMO', 'INV_MASTER', 'Master Data', 'database', 1),

  page('USRMGNT', 'UM_MASTER', 'UM_COMPANY', 'Companies', '/usrmgnt/companies', 1, CRUD),
  page('USRMGNT', 'UM_MASTER', 'UM_APPLICATION', 'Applications', '/usrmgnt/applications', 2, CRUD),
  page('USRMGNT', 'UM_MASTER', 'UM_MENU', 'Menus', '/usrmgnt/menus', 3, CRUD),
  page('USRMGNT', 'UM_MASTER', 'UM_ACTION', 'Actions', '/usrmgnt/actions', 4, CRUD),
  page('USRMGNT', 'UM_MASTER', 'UM_USER', 'Users', '/usrmgnt/users', 5, [...CRUD, 'EXPORT_EXCEL', 'IMPORT_EXCEL']),
  page('USRMGNT', 'UM_ACCESS', 'UM_COMPANY_APP', 'Company Applications', '/usrmgnt/company-applications', 1, CRUD),
  page('USRMGNT', 'UM_ACCESS', 'UM_GROUP', 'User Groups', '/usrmgnt/user-groups', 2, CRUD),
  page('USRMGNT', 'UM_ACCESS', 'UM_GROUP_MEMBER', 'Group Members', '/usrmgnt/group-members', 3, CRUD),
  page('USRMGNT', 'UM_ACCESS', 'UM_GROUP_PERM', 'Group Permissions', '/usrmgnt/group-permissions', 4, CRUD),

  page('BILLCOST', 'BC_TRX', 'BC_SHIPMENT', 'Project Cost Shipment', '/billcost/shipments', 1,
    [...CRUD, 'APPROVE', 'PRINT', 'EXPORT_EXCEL', 'IMPORT_EXCEL']),
  page('BILLCOST', 'BC_TRX', 'BC_SHIPMENT_DTL', 'Shipment Detail', '/billcost/shipments/:id', 2, CRUD, false),
  page('BILLCOST', 'BC_REPORT', 'BC_RPT_SHIPMENT', 'Shipment Cost Report', '/billcost/reports/shipment', 1,
    ['READ', 'PRINT', 'EXPORT_EXCEL']),

  page('INVDEMO', 'INV_MASTER', 'INV_ITEM', 'Items', '/invdemo/items', 1, [...CRUD, 'EXPORT_EXCEL']),
  page('INVDEMO', 'INV_MASTER', 'INV_WAREHOUSE', 'Warehouses', '/invdemo/warehouses', 2, CRUD),
];

/** Permission per group: 'ALL' = semua action yang tersedia di semua menu aplikasinya */
export const groupPermissions: Record<string, { app_code: string; perms: 'ALL' | Array<[string, string]> }> = {
  SUPER_ADMIN: { app_code: 'USRMGNT', perms: 'ALL' },
  BC_ADMIN: { app_code: 'BILLCOST', perms: 'ALL' },
  INV_ADMIN: { app_code: 'INVDEMO', perms: 'ALL' },
  UM_AUDITOR: {
    app_code: 'USRMGNT',
    perms: [
      ['UM_COMPANY', 'READ'], ['UM_APPLICATION', 'READ'], ['UM_MENU', 'READ'], ['UM_ACTION', 'READ'],
      ['UM_USER', 'READ'], ['UM_USER', 'EXPORT_EXCEL'], ['UM_COMPANY_APP', 'READ'], ['UM_GROUP', 'READ'],
      ['UM_GROUP_MEMBER', 'READ'], ['UM_GROUP_PERM', 'READ'],
    ],
  },
  BC_STAFF: {
    app_code: 'BILLCOST',
    perms: [
      ['BC_SHIPMENT', 'CREATE'], ['BC_SHIPMENT', 'READ'], ['BC_SHIPMENT', 'UPDATE'], ['BC_SHIPMENT', 'PRINT'],
      ['BC_SHIPMENT', 'IMPORT_EXCEL'], ['BC_SHIPMENT_DTL', 'CREATE'], ['BC_SHIPMENT_DTL', 'READ'],
      ['BC_SHIPMENT_DTL', 'UPDATE'], ['BC_RPT_SHIPMENT', 'READ'], ['BC_RPT_SHIPMENT', 'EXPORT_EXCEL'],
    ],
  },
  BC_VIEWER: {
    app_code: 'BILLCOST',
    perms: [
      ['BC_SHIPMENT', 'READ'], ['BC_SHIPMENT_DTL', 'READ'], ['BC_RPT_SHIPMENT', 'READ'], ['BC_RPT_SHIPMENT', 'PRINT'],
    ],
  },
};

function user(
  username: string, full_name: string, employee_no: string | null,
  opts: Partial<Pick<MockUser, 'auth_provider' | 'must_change_password' | 'is_locked' | 'is_active' | 'failed_login_count'>> = {},
): MockUser {
  return {
    id: `u-${username}`, username, email: `${username}@example.com`, full_name, employee_no,
    auth_provider: 'LOCAL', must_change_password: false, is_locked: false, is_active: true, failed_login_count: 0,
    ...opts,
  };
}

export const seedUsers: MockUser[] = [
  user('superadmin', 'Super Administrator', null),
  user('auditor', 'Andi Auditor', 'EMP-0001'),
  user('bc.admin', 'Budi Billing Admin', 'EMP-0002'),
  user('bc.staff', 'Citra Billing Staff', 'EMP-0003', { must_change_password: true }),
  user('bc.viewer', 'Dewi Billing Viewer', 'EMP-0004', { auth_provider: 'LDAP' }),
  user('inv.admin', 'Eko Inventory Admin', 'EMP-0005'),
  user('locked.user', 'Fajar Locked User', 'EMP-0006', { is_locked: true, failed_login_count: 5 }),
  user('inactive.user', 'Gita Inactive User', 'EMP-0007', { is_active: false }),
];

export const memberships: MockMembership[] = [
  { username: 'superadmin', app_code: 'USRMGNT', group_code: 'SUPER_ADMIN', company_code: 'MDN', valid_from: '2026-01-01', valid_to: null },
  { username: 'superadmin', app_code: 'USRMGNT', group_code: 'SUPER_ADMIN', company_code: 'DEMO1', valid_from: '2026-01-01', valid_to: null },
  { username: 'auditor', app_code: 'USRMGNT', group_code: 'UM_AUDITOR', company_code: 'MDN', valid_from: '2026-01-01', valid_to: null },
  { username: 'bc.admin', app_code: 'BILLCOST', group_code: 'BC_ADMIN', company_code: 'MDN', valid_from: '2026-01-01', valid_to: null },
  { username: 'bc.staff', app_code: 'BILLCOST', group_code: 'BC_STAFF', company_code: 'MDN', valid_from: '2026-01-01', valid_to: null },
  { username: 'bc.staff', app_code: 'BILLCOST', group_code: 'BC_VIEWER', company_code: 'DEMO1', valid_from: '2026-01-01', valid_to: null },
  { username: 'bc.viewer', app_code: 'BILLCOST', group_code: 'BC_VIEWER', company_code: 'MDN', valid_from: '2026-01-01', valid_to: null },
  { username: 'bc.viewer', app_code: 'BILLCOST', group_code: 'BC_STAFF', company_code: 'DEMO1', valid_from: '2025-01-01', valid_to: '2025-12-31' },
  { username: 'inv.admin', app_code: 'INVDEMO', group_code: 'INV_ADMIN', company_code: 'MDN', valid_from: '2026-01-01', valid_to: null },
  { username: 'inv.admin', app_code: 'INVDEMO', group_code: 'INV_ADMIN', company_code: 'DEMO2', valid_from: '2026-01-01', valid_to: null },
  { username: 'locked.user', app_code: 'BILLCOST', group_code: 'BC_STAFF', company_code: 'MDN', valid_from: '2026-01-01', valid_to: null },
  { username: 'inactive.user', app_code: 'BILLCOST', group_code: 'BC_VIEWER', company_code: 'MDN', valid_from: '2026-01-01', valid_to: null },
];
