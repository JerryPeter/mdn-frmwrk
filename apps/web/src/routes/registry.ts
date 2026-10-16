import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export interface PageRoute {
  /** Wajib sama persis dengan menus.route_path (PRD §10) */
  path: string;
  /** menus.menu_code untuk pengecekan permission READ */
  menuCode: string;
  title: string;
  component: LazyExoticComponent<ComponentType>;
}

const Placeholder = lazy(() => import('@/pages/system/PlaceholderPage'));

/**
 * Daftar halaman yang dikenali frontend. Halaman yang belum dibangun memakai
 * PlaceholderPage; ganti `component` saat halaman dikerjakan di tahap berikutnya.
 */
export const pageRoutes: PageRoute[] = [
  // USRMGNT – Tahap 5–8
  { path: '/usrmgnt/companies', menuCode: 'UM_COMPANY', title: 'Companies', component: Placeholder },
  { path: '/usrmgnt/applications', menuCode: 'UM_APPLICATION', title: 'Applications', component: Placeholder },
  { path: '/usrmgnt/menus', menuCode: 'UM_MENU', title: 'Menus', component: Placeholder },
  { path: '/usrmgnt/actions', menuCode: 'UM_ACTION', title: 'Actions', component: Placeholder },
  { path: '/usrmgnt/users', menuCode: 'UM_USER', title: 'Users', component: Placeholder },
  { path: '/usrmgnt/company-applications', menuCode: 'UM_COMPANY_APP', title: 'Company Applications', component: Placeholder },
  { path: '/usrmgnt/user-groups', menuCode: 'UM_GROUP', title: 'User Groups', component: Placeholder },
  { path: '/usrmgnt/group-members', menuCode: 'UM_GROUP_MEMBER', title: 'Group Members', component: Placeholder },
  { path: '/usrmgnt/group-permissions', menuCode: 'UM_GROUP_PERM', title: 'Group Permissions', component: Placeholder },

  // Aplikasi contoh dari data seed (di luar lingkup modul ini)
  { path: '/billcost/shipments', menuCode: 'BC_SHIPMENT', title: 'Project Cost Shipment', component: Placeholder },
  { path: '/billcost/shipments/:id', menuCode: 'BC_SHIPMENT_DTL', title: 'Shipment Detail', component: Placeholder },
  { path: '/billcost/reports/shipment', menuCode: 'BC_RPT_SHIPMENT', title: 'Shipment Cost Report', component: Placeholder },
  { path: '/invdemo/items', menuCode: 'INV_ITEM', title: 'Items', component: Placeholder },
  { path: '/invdemo/warehouses', menuCode: 'INV_WAREHOUSE', title: 'Warehouses', component: Placeholder },
];
