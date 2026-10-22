import { prisma } from '../../config/db.js';
import { invalidateGroupMembers } from '../../lib/access.js';
import { softDeleteData } from '../../lib/master-data.js';
import { AppError, validationError } from '../../utils/errors.js';
import { findGroupOrThrow } from './user-groups.service.js';

/** Permission yang wajib tetap dimiliki SUPER_ADMIN agar matriks ini tidak terkunci untuk semua admin (AD-01) */
const SUPER_ADMIN_REQUIRED = ['UM_GROUP_PERM:READ', 'UM_GROUP_PERM:UPDATE'];

export interface MatrixRow {
  menu_id: string;
  menu_code: string;
  menu_name: string;
  menu_type: string;
  parent_id: string | null;
  level: number;
  is_active: boolean;
  is_visible: boolean;
  /** Hanya action yang tersedia di menu ini (menu_actions); sel lain ditampilkan nonaktif */
  cells: Array<{ action_code: string; menu_action_id: string; granted: boolean }>;
}

export const groupPermissionsService = {
  /** Matriks pohon menu aplikasi group × action (PRD §8.12) */
  async matrix(groupId: string) {
    const group = await findGroupOrThrow(groupId);
    const [menus, menuActions, granted] = await Promise.all([
      prisma.menus.findMany({
        where: { application_id: group.application_id, is_deleted: false },
        orderBy: [{ sort_order: 'asc' }, { menu_code: 'asc' }],
      }),
      prisma.menu_actions.findMany({
        where: { is_deleted: false, menus: { application_id: group.application_id, is_deleted: false }, actions: { is_deleted: false } },
        select: { id: true, menu_id: true, actions: { select: { id: true, action_code: true, action_name: true, sort_order: true, is_active: true } } },
      }),
      prisma.user_group_permissions.findMany({ where: { user_group_id: groupId, is_deleted: false }, select: { menu_action_id: true } }),
    ]);

    const grantedIds = new Set(granted.map((g) => g.menu_action_id));

    // Kolom: action yang dipakai minimal satu menu aplikasi ini
    const columns = new Map<string, { action_code: string; action_name: string; sort_order: number; is_active: boolean }>();
    const cellsByMenu = new Map<string, MatrixRow['cells']>();
    for (const ma of menuActions) {
      const a = ma.actions;
      columns.set(a.action_code, { action_code: a.action_code, action_name: a.action_name, sort_order: a.sort_order, is_active: a.is_active });
      const cells = cellsByMenu.get(ma.menu_id) ?? [];
      cells.push({ action_code: a.action_code, menu_action_id: ma.id, granted: grantedIds.has(ma.id) });
      cellsByMenu.set(ma.menu_id, cells);
    }
    const actions = [...columns.values()].sort((a, b) => a.sort_order - b.sort_order || a.action_code.localeCompare(b.action_code));

    // Baris: urutan pohon (DFS sesuai sort_order); menu yatim (parent terhapus) ditaruh di tingkat atas
    const ids = new Set(menus.map((m) => m.id));
    const childrenOf = new Map<string | null, typeof menus>();
    for (const m of menus) {
      const parent = m.parent_id && ids.has(m.parent_id) ? m.parent_id : null;
      childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), m]);
    }
    const rows: MatrixRow[] = [];
    const walk = (parent: string | null, level: number) => {
      for (const m of childrenOf.get(parent) ?? []) {
        rows.push({
          menu_id: m.id,
          menu_code: m.menu_code,
          menu_name: m.menu_name,
          menu_type: m.menu_type,
          parent_id: m.parent_id,
          level,
          is_active: m.is_active,
          is_visible: m.is_visible,
          cells: cellsByMenu.get(m.id) ?? [],
        });
        walk(m.id, level + 1);
      }
    };
    walk(null, 0);

    const available = menuActions.length;
    const grantedCount = menuActions.filter((ma) => grantedIds.has(ma.id)).length;
    return { group, actions, rows, summary: { available, granted: grantedCount } };
  },

  /**
   * PUT permissions sebagai set lengkap (PRD §8.12): hitung selisih, tambah yang baru,
   * soft delete yang dilepas dalam satu transaksi, lalu invalidasi cache seluruh anggota (BR-22).
   */
  async setPermissions(groupId: string, menuActionIds: string[], username: string) {
    const group = await findGroupOrThrow(groupId);
    const wanted = new Set(menuActionIds);
    const found = await prisma.menu_actions.findMany({
      where: { id: { in: [...wanted] }, is_deleted: false, menus: { is_deleted: false } },
      select: {
        id: true,
        menus: { select: { application_id: true, menu_code: true } },
        actions: { select: { action_code: true } },
      },
    });
    if (found.length !== wanted.size) {
      throw validationError([{ field: 'menu_action_ids', message: 'Sebagian menu action tidak ditemukan atau sudah dihapus' }]);
    }
    // AC-10: permission hanya untuk menu dari aplikasi group itu sendiri
    const foreign = found.filter((ma) => ma.menus.application_id !== group.application_id);
    if (foreign.length) {
      throw new AppError(
        422,
        'BUSINESS_RULE',
        `Group ${group.group_code} hanya dapat diberi permission menu aplikasi ${group.app_code}. Menu dari aplikasi lain: ${[
          ...new Set(foreign.map((ma) => ma.menus.menu_code)),
        ].join(', ')}.`,
        [{ field: 'menu_action_ids', message: 'Menu dari aplikasi lain' }],
      );
    }
    if (group.is_protected) {
      const keys = new Set(found.map((ma) => `${ma.menus.menu_code}:${ma.actions.action_code}`));
      const missing = SUPER_ADMIN_REQUIRED.filter((k) => !keys.has(k));
      if (missing.length) {
        throw new AppError(
          422,
          'BUSINESS_RULE',
          `Permission ${missing.join(' dan ')} tidak dapat dilepas dari group SUPER_ADMIN.`,
          [{ field: 'menu_action_ids', message: 'Permission wajib SUPER_ADMIN' }],
        );
      }
    }

    const current = await prisma.user_group_permissions.findMany({
      where: { user_group_id: groupId, is_deleted: false },
      select: { id: true, menu_action_id: true },
    });
    const currentIds = new Set(current.map((p) => p.menu_action_id));
    const toAdd = [...wanted].filter((id) => !currentIds.has(id));
    const toRemove = current.filter((p) => !wanted.has(p.menu_action_id)).map((p) => p.id);

    if (toAdd.length || toRemove.length) {
      await prisma.$transaction(async (tx) => {
        if (toRemove.length) {
          await tx.user_group_permissions.updateMany({ where: { id: { in: toRemove } }, data: softDeleteData(username) });
        }
        if (toAdd.length) {
          await tx.user_group_permissions.createMany({
            data: toAdd.map((menu_action_id) => ({ user_group_id: groupId, menu_action_id, created_by: username })),
          });
        }
      });
      await invalidateGroupMembers(groupId);
    }
    return { ...(await this.matrix(groupId)), changes: { added: toAdd.length, removed: toRemove.length } };
  },
};
