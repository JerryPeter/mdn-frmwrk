import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/db.js';
import { duplicateCodeError, ensureNotInUse, isUniqueViolation, softDeleteData } from '../../lib/master-data.js';
import { invalidatePermissions } from '../../lib/permissions.js';
import { AppError, notFound, validationError } from '../../utils/errors.js';
import { pageArgs } from '../../utils/pagination.js';
import type { CreateMenuInput, ListMenusQuery, UpdateMenuInput } from './menus.schema.js';

const NOT_FOUND_MESSAGE = 'Menu tidak ditemukan';
/** AD-05: READ wajib ada di setiap menu PAGE */
const REQUIRED_ACTION = 'READ';

type MenuRow = NonNullable<Awaited<ReturnType<typeof prisma.menus.findFirst>>>;

export interface MenuTreeNode extends MenuRow {
  /** Kode action yang tersedia (menu_actions aktif), hanya untuk PAGE */
  actions: string[];
  children: MenuTreeNode[];
}

const duplicateCode = (code: string) => duplicateCodeError('menu', 'menu_code', code);

async function findActiveOrThrow(id: string) {
  const menu = await prisma.menus.findFirst({ where: { id, is_deleted: false } });
  if (!menu) throw notFound(NOT_FOUND_MESSAGE);
  return menu;
}

async function ensureApplication(applicationId: string) {
  const app = await prisma.applications.findFirst({ where: { id: applicationId, is_deleted: false } });
  if (!app) throw validationError([{ field: 'application_id', message: 'Aplikasi tidak ditemukan' }]);
  return app;
}

/** Parent wajib menu GROUP aktif (belum dihapus) dari aplikasi yang sama (BR-03) */
async function ensureValidParent(parentId: string, applicationId: string) {
  const parent = await prisma.menus.findFirst({ where: { id: parentId, is_deleted: false } });
  if (!parent) throw validationError([{ field: 'parent_id', message: 'Parent menu tidak ditemukan' }]);
  if (parent.application_id !== applicationId) {
    throw validationError([{ field: 'parent_id', message: 'Parent menu harus berasal dari aplikasi yang sama' }]);
  }
  if (parent.menu_type !== 'GROUP') {
    throw validationError([{ field: 'parent_id', message: 'Parent hanya boleh menu bertipe GROUP' }]);
  }
  return parent;
}

/** Cegah parent melingkar: parent baru tidak boleh menu itu sendiri atau turunannya */
async function ensureNoCycle(menuId: string, newParentId: string, applicationId: string) {
  const menus = await prisma.menus.findMany({ where: { application_id: applicationId }, select: { id: true, parent_id: true } });
  const parentOf = new Map(menus.map((m) => [m.id, m.parent_id]));
  for (let cur: string | null | undefined = newParentId; cur; cur = parentOf.get(cur)) {
    if (cur === menuId) {
      throw validationError([{ field: 'parent_id', message: 'Parent tidak boleh menu itu sendiri atau sub-menunya' }]);
    }
  }
}

export const menusService = {
  /** Pohon menu satu aplikasi untuk halaman admin, termasuk menu nonaktif & tersembunyi */
  async tree(applicationId: string, includeDeleted: boolean): Promise<MenuTreeNode[]> {
    await ensureApplication(applicationId);
    const menus = await prisma.menus.findMany({
      where: { application_id: applicationId, ...(includeDeleted ? {} : { is_deleted: false }) },
      include: {
        menu_actions: {
          where: { is_deleted: false },
          select: { actions: { select: { action_code: true, sort_order: true } } },
        },
      },
      orderBy: [{ sort_order: 'asc' }, { menu_code: 'asc' }],
    });
    const ids = new Set(menus.map((m) => m.id));
    const nodes = new Map<string, MenuTreeNode>(
      menus.map(({ menu_actions, ...m }) => [
        m.id,
        {
          ...m,
          actions: menu_actions
            .map((ma) => ma.actions)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((a) => a.action_code),
          children: [],
        },
      ]),
    );
    const roots: MenuTreeNode[] = [];
    for (const node of nodes.values()) {
      // Parent terhapus (saat include_deleted=false) → tampilkan di root agar tidak hilang
      if (node.parent_id && ids.has(node.parent_id)) nodes.get(node.parent_id)!.children.push(node);
      else roots.push(node);
    }
    return roots;
  },

  async list(query: ListMenusQuery) {
    const where: Prisma.menusWhereInput = {
      ...(query.include_deleted ? {} : { is_deleted: false }),
      ...(query.is_active !== undefined ? { is_active: query.is_active } : {}),
      ...(query.application_id ? { application_id: query.application_id } : {}),
      ...(query.menu_type ? { menu_type: query.menu_type } : {}),
      ...(query.q
        ? {
            OR: [
              { menu_code: { contains: query.q, mode: 'insensitive' } },
              { menu_name: { contains: query.q, mode: 'insensitive' } },
              { route_path: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.menus.findMany({
        where,
        orderBy: [{ [query.sort_by]: query.sort_dir }, { menu_code: 'asc' }],
        ...pageArgs(query.page, query.page_size),
      }),
      prisma.menus.count({ where }),
    ]);
    return { items, meta: { page: query.page, page_size: query.page_size, total } };
  },

  get: findActiveOrThrow,

  /** Menu PAGE baru otomatis mendapat action default lewat trigger (BR-04, AC-08) */
  async create(input: CreateMenuInput, username: string) {
    await ensureApplication(input.application_id);
    if (input.parent_id) await ensureValidParent(input.parent_id, input.application_id);
    try {
      const menu = await prisma.menus.create({
        data: { ...input, route_path: input.menu_type === 'PAGE' ? input.route_path : null, created_by: username },
      });
      await invalidatePermissions.application(input.application_id);
      return menu;
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateCode(input.menu_code);
      throw err;
    }
  },

  async update(id: string, input: UpdateMenuInput, username: string) {
    const existing = await findActiveOrThrow(id);
    const { application_id, menu_type, menu_code, parent_id, ...fields } = input;
    const immutable: Array<[string, unknown, unknown, string]> = [
      ['application_id', application_id, existing.application_id, 'Aplikasi menu tidak dapat diubah'],
      ['menu_type', menu_type, existing.menu_type, 'Tipe menu tidak dapat diubah'],
      ['menu_code', menu_code, existing.menu_code, 'Kode menu tidak dapat diubah'],
    ];
    const changed = immutable.filter(([, given, current]) => given !== undefined && given !== current);
    if (changed.length) throw validationError(changed.map(([field, , , message]) => ({ field, message })));

    if (existing.menu_type === 'PAGE' && !fields.route_path) {
      throw validationError([{ field: 'route_path', message: 'Route wajib diisi untuk menu PAGE' }]);
    }
    if (existing.menu_type === 'GROUP' && fields.route_path) {
      throw validationError([{ field: 'route_path', message: 'Menu GROUP tidak memiliki route' }]);
    }

    if (parent_id !== undefined && parent_id !== existing.parent_id && parent_id !== null) {
      if (parent_id === id) throw validationError([{ field: 'parent_id', message: 'Parent tidak boleh menu itu sendiri atau sub-menunya' }]);
      await ensureValidParent(parent_id, existing.application_id);
      await ensureNoCycle(id, parent_id, existing.application_id);
    }

    const updated = await prisma.menus.update({
      where: { id },
      data: { ...fields, ...(parent_id !== undefined ? { parent_id } : {}), updated_by: username },
    });
    await invalidatePermissions.application(existing.application_id);
    return updated;
  },

  /** Menonaktifkan GROUP menyembunyikan seluruh isinya dari sidebar */
  async setStatus(id: string, isActive: boolean, username: string) {
    const existing = await findActiveOrThrow(id);
    if (existing.is_active === isActive) return existing;
    const updated = await prisma.menus.update({ where: { id }, data: { is_active: isActive, updated_by: username } });
    await invalidatePermissions.application(existing.application_id);
    return updated;
  },

  /**
   * GROUP: ditolak bila masih punya sub-menu (BR-21).
   * PAGE: menu_actions dan permission group-nya ikut di-soft-delete dalam satu transaksi (AD-04),
   * dengan deleted_at yang sama agar bisa dipulihkan bersama.
   */
  async remove(id: string, username: string) {
    const existing = await findActiveOrThrow(id);
    if (existing.menu_type === 'GROUP') {
      const childCount = await prisma.menus.count({ where: { parent_id: id, is_deleted: false } });
      ensureNotInUse('Menu GROUP', [{ label: 'sub-menu', table: 'menus', count: childCount }]);
    }

    const data = softDeleteData(username);
    const deleted = await prisma.$transaction(async (tx) => {
      const menuActionIds = (
        await tx.menu_actions.findMany({ where: { menu_id: id, is_deleted: false }, select: { id: true } })
      ).map((ma) => ma.id);
      if (menuActionIds.length) {
        await tx.user_group_permissions.updateMany({ where: { menu_action_id: { in: menuActionIds }, is_deleted: false }, data });
        await tx.menu_actions.updateMany({ where: { id: { in: menuActionIds } }, data });
      }
      return tx.menus.update({ where: { id }, data });
    });
    await invalidatePermissions.application(existing.application_id);
    return deleted;
  },

  /** Pulihkan menu beserta action & permission yang terhapus bersamanya (deleted_at sama) */
  async restore(id: string, username: string) {
    const menu = await prisma.menus.findUnique({ where: { id } });
    if (!menu) throw notFound(NOT_FOUND_MESSAGE);
    if (!menu.is_deleted) throw new AppError(422, 'BUSINESS_RULE', 'Menu tidak dalam status terhapus');
    if (menu.parent_id) {
      const parent = await prisma.menus.findUnique({ where: { id: menu.parent_id } });
      if (parent?.is_deleted) {
        throw new AppError(422, 'BUSINESS_RULE', `Pulihkan dulu menu induknya (${parent.menu_code}).`);
      }
    }

    const restoreFields = { is_deleted: false, deleted_by: null, deleted_at: null, updated_by: username };
    try {
      const restored = await prisma.$transaction(async (tx) => {
        const sameBatch = { is_deleted: true, deleted_at: menu.deleted_at };
        const menuActionIds = (
          await tx.menu_actions.findMany({ where: { menu_id: id, ...sameBatch }, select: { id: true } })
        ).map((ma) => ma.id);
        if (menuActionIds.length) {
          await tx.menu_actions.updateMany({ where: { id: { in: menuActionIds } }, data: restoreFields });
          await tx.user_group_permissions.updateMany({
            where: { menu_action_id: { in: menuActionIds }, ...sameBatch },
            data: restoreFields,
          });
        }
        return tx.menus.update({ where: { id }, data: restoreFields });
      });
      await invalidatePermissions.application(menu.application_id);
      return restored;
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateCode(menu.menu_code);
      throw err;
    }
  },

  /** Daftar seluruh action + penanda tersedia di menu ini dan jumlah group yang memakainya */
  async actions(id: string) {
    const menu = await findActiveOrThrow(id);
    const [actions, menuActions] = await Promise.all([
      prisma.actions.findMany({ where: { is_deleted: false }, orderBy: [{ sort_order: 'asc' }, { action_code: 'asc' }] }),
      prisma.menu_actions.findMany({
        where: { menu_id: id, is_deleted: false },
        select: {
          id: true,
          action_id: true,
          _count: { select: { user_group_permissions: { where: { is_deleted: false } } } },
        },
      }),
    ]);
    const byAction = new Map(menuActions.map((ma) => [ma.action_id, ma]));
    return {
      menu_id: menu.id,
      menu_type: menu.menu_type,
      items: actions.map((a) => {
        const ma = byAction.get(a.id);
        return {
          action_id: a.id,
          action_code: a.action_code,
          action_name: a.action_name,
          is_default: a.is_default,
          is_active: a.is_active,
          is_required: a.action_code === REQUIRED_ACTION,
          is_assigned: !!ma,
          menu_action_id: ma?.id ?? null,
          group_count: ma?._count.user_group_permissions ?? 0,
        };
      }),
    };
  },

  /**
   * PUT /menus/:id/actions: simpan sebagai set lengkap (PRD §8.8). Action yang dilepas →
   * menu_action dan permission group yang memakainya di-soft-delete, dalam satu transaksi.
   */
  async setActions(id: string, actionIds: string[], username: string) {
    const menu = await findActiveOrThrow(id);
    if (menu.menu_type !== 'PAGE') {
      throw new AppError(422, 'BUSINESS_RULE', 'Action hanya dapat diatur pada menu bertipe PAGE.');
    }
    const wanted = new Set(actionIds);
    const actions = await prisma.actions.findMany({ where: { id: { in: [...wanted] }, is_deleted: false } });
    if (actions.length !== wanted.size) {
      throw validationError([{ field: 'action_ids', message: 'Sebagian action tidak ditemukan' }]);
    }
    if (!actions.some((a) => a.action_code === REQUIRED_ACTION)) {
      throw validationError([{ field: 'action_ids', message: 'Action READ wajib ada di setiap menu PAGE' }]);
    }

    const current = await prisma.menu_actions.findMany({ where: { menu_id: id, is_deleted: false } });
    const currentIds = new Set(current.map((ma) => ma.action_id));
    const toAdd = actions.filter((a) => !currentIds.has(a.id));
    const inactive = toAdd.filter((a) => !a.is_active);
    if (inactive.length) {
      throw validationError([
        { field: 'action_ids', message: `Action nonaktif tidak dapat ditambahkan: ${inactive.map((a) => a.action_code).join(', ')}` },
      ]);
    }
    const toRemove = current.filter((ma) => !wanted.has(ma.action_id));

    if (toAdd.length || toRemove.length) {
      const removedIds = toRemove.map((ma) => ma.id);
      const data = softDeleteData(username);
      await prisma.$transaction(async (tx) => {
        if (removedIds.length) {
          await tx.user_group_permissions.updateMany({ where: { menu_action_id: { in: removedIds }, is_deleted: false }, data });
          await tx.menu_actions.updateMany({ where: { id: { in: removedIds } }, data });
        }
        if (toAdd.length) {
          await tx.menu_actions.createMany({ data: toAdd.map((a) => ({ menu_id: id, action_id: a.id, created_by: username })) });
        }
      });
      await invalidatePermissions.application(menu.application_id);
    }
    return this.actions(id);
  },
};
