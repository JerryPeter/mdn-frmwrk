import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/db.js';
import { invalidateGroupMembers, isProtectedGroup } from '../../lib/access.js';
import { duplicateCodeError, ensureNotInUse, isUniqueViolation, restoreData, softDeleteData } from '../../lib/master-data.js';
import { AppError, notFound, validationError } from '../../utils/errors.js';
import { pageArgs } from '../../utils/pagination.js';
import type { CreateGroupInput, DuplicateGroupInput, ListGroupsQuery, UpdateGroupInput } from './user-groups.schema.js';

const NOT_FOUND_MESSAGE = 'Group tidak ditemukan';

const duplicateCode = (code: string) => duplicateCodeError('group', 'group_code', code);

export const GROUP_SELECT = {
  id: true,
  application_id: true,
  group_code: true,
  group_name: true,
  description: true,
  created_by: true,
  created_at: true,
  updated_by: true,
  updated_at: true,
  deleted_by: true,
  deleted_at: true,
  is_deleted: true,
  is_active: true,
  applications: { select: { app_code: true, app_name: true, is_active: true } },
  _count: {
    select: {
      user_group_members: { where: { is_deleted: false } },
      user_group_permissions: { where: { is_deleted: false } },
    },
  },
} satisfies Prisma.user_groupsSelect;

type GroupRow = Prisma.user_groupsGetPayload<{ select: typeof GROUP_SELECT }>;

/** Ratakan relasi: app_code/app_name, jumlah anggota & permission, penanda group inti */
export function toGroupDto({ applications, _count, ...g }: GroupRow) {
  return {
    ...g,
    app_code: applications.app_code,
    app_name: applications.app_name,
    app_is_active: applications.is_active,
    member_count: _count.user_group_members,
    permission_count: _count.user_group_permissions,
    is_protected: isProtectedGroup({ group_code: g.group_code, app_code: applications.app_code }),
  };
}

export async function findGroupOrThrow(id: string) {
  const group = await prisma.user_groups.findFirst({ where: { id, is_deleted: false }, select: GROUP_SELECT });
  if (!group) throw notFound(NOT_FOUND_MESSAGE);
  return toGroupDto(group);
}

function ensureNotProtected(group: { is_protected: boolean; group_code: string }, action: string) {
  if (group.is_protected) {
    throw new AppError(422, 'BUSINESS_RULE', `Group ${group.group_code} adalah group inti dan tidak dapat ${action}.`);
  }
}

async function ensureApplication(applicationId: string) {
  const app = await prisma.applications.findFirst({ where: { id: applicationId, is_deleted: false } });
  if (!app) throw validationError([{ field: 'application_id', message: 'Aplikasi tidak ditemukan' }]);
  if (!app.is_active) throw validationError([{ field: 'application_id', message: 'Aplikasi sedang nonaktif' }]);
  return app;
}

const save = (id: string, data: Prisma.user_groupsUpdateInput) =>
  prisma.user_groups.update({ where: { id }, data, select: GROUP_SELECT }).then(toGroupDto);

export const userGroupsService = {
  async list(query: ListGroupsQuery) {
    const where: Prisma.user_groupsWhereInput = {
      ...(query.include_deleted ? {} : { is_deleted: false }),
      ...(query.is_active !== undefined ? { is_active: query.is_active } : {}),
      ...(query.application_id ? { application_id: query.application_id } : {}),
      ...(query.q
        ? {
            OR: [
              { group_code: { contains: query.q, mode: 'insensitive' } },
              { group_name: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.user_groups.findMany({
        where,
        select: GROUP_SELECT,
        orderBy: [{ [query.sort_by]: query.sort_dir }, { id: 'asc' }],
        ...pageArgs(query.page, query.page_size),
      }),
      prisma.user_groups.count({ where }),
    ]);
    return { items: items.map(toGroupDto), meta: { page: query.page, page_size: query.page_size, total } };
  },

  get: findGroupOrThrow,

  async create(input: CreateGroupInput, username: string) {
    await ensureApplication(input.application_id);
    try {
      const group = await prisma.user_groups.create({ data: { ...input, created_by: username }, select: GROUP_SELECT });
      return toGroupDto(group);
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateCode(input.group_code);
      throw err;
    }
  },

  async update(id: string, input: UpdateGroupInput, username: string) {
    const existing = await findGroupOrThrow(id);
    const { application_id, group_code, ...fields } = input;
    const errors = [];
    if (application_id !== undefined && application_id !== existing.application_id) {
      errors.push({ field: 'application_id', message: 'Aplikasi group tidak dapat diubah' });
    }
    if (group_code !== undefined && group_code !== existing.group_code) {
      errors.push({ field: 'group_code', message: 'Kode group tidak dapat diubah' });
    }
    if (errors.length) throw validationError(errors);
    return save(id, { ...fields, updated_by: username });
  },

  async setStatus(id: string, isActive: boolean, username: string) {
    const existing = await findGroupOrThrow(id);
    if (!isActive) ensureNotProtected(existing, 'dinonaktifkan');
    if (existing.is_active === isActive) return existing;
    const updated = await save(id, { is_active: isActive, updated_by: username });
    await invalidateGroupMembers(id);
    return updated;
  },

  /**
   * Soft delete; ditolak bila masih punya anggota (BR-21). Permission group ikut di-soft-delete
   * dengan deleted_at yang sama sehingga ikut dipulihkan saat group dipulihkan.
   */
  async remove(id: string, username: string) {
    const existing = await findGroupOrThrow(id);
    ensureNotProtected(existing, 'dihapus');
    ensureNotInUse('Group', [{ label: 'anggota', table: 'user_group_members', count: existing.member_count }]);
    const data = softDeleteData(username);
    const [deleted] = await prisma.$transaction([
      prisma.user_groups.update({ where: { id }, data, select: GROUP_SELECT }),
      prisma.user_group_permissions.updateMany({ where: { user_group_id: id, is_deleted: false }, data }),
    ]);
    return toGroupDto(deleted);
  },

  /** Pulihkan group beserta permission yang terhapus bersamanya (yang menu-action-nya masih ada) */
  async restore(id: string, username: string) {
    const group = await prisma.user_groups.findUnique({ where: { id }, select: GROUP_SELECT });
    if (!group) throw notFound(NOT_FOUND_MESSAGE);
    if (!group.is_deleted) throw new AppError(422, 'BUSINESS_RULE', 'Group tidak dalam status terhapus');
    const app = await prisma.applications.findFirst({ where: { id: group.application_id, is_deleted: false } });
    if (!app) throw new AppError(422, 'BUSINESS_RULE', 'Aplikasi group ini sudah dihapus. Pulihkan aplikasinya terlebih dahulu.');

    try {
      const restored = await prisma.$transaction(async (tx) => {
        const row = await tx.user_groups.update({ where: { id }, data: restoreData(username), select: GROUP_SELECT });
        let restoredPermissions = 0;
        if (group.deleted_at) {
          restoredPermissions = await tx.$executeRaw`
            UPDATE usrmgnt.user_group_permissions p
               SET is_deleted = false, deleted_by = NULL, deleted_at = NULL, updated_by = ${username}
              FROM usrmgnt.menu_actions ma
             WHERE ma.id = p.menu_action_id
               AND ma.is_deleted = false
               AND p.user_group_id = ${id}::uuid
               AND p.is_deleted = true
               AND p.deleted_at = ${group.deleted_at}`;
        }
        const dto = toGroupDto(row);
        return { ...dto, permission_count: restoredPermissions, restored_permissions: restoredPermissions };
      });
      return restored;
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateCode(group.group_code);
      throw err;
    }
  },

  /** Duplikat group: group baru di aplikasi yang sama + salinan permission aktif (PRD §8.10 [U]) */
  async duplicate(id: string, input: DuplicateGroupInput, username: string) {
    const source = await findGroupOrThrow(id);
    try {
      const created = await prisma.$transaction(async (tx) => {
        const group = await tx.user_groups.create({
          data: { ...input, application_id: source.application_id, created_by: username },
          select: { id: true },
        });
        const permissions = await tx.user_group_permissions.findMany({
          where: { user_group_id: id, is_deleted: false, menu_actions: { is_deleted: false } },
          select: { menu_action_id: true },
        });
        if (permissions.length) {
          await tx.user_group_permissions.createMany({
            data: permissions.map((p) => ({ user_group_id: group.id, menu_action_id: p.menu_action_id, created_by: username })),
          });
        }
        return tx.user_groups.findUniqueOrThrow({ where: { id: group.id }, select: GROUP_SELECT });
      });
      return toGroupDto(created);
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateCode(input.group_code);
      throw err;
    }
  },
};
