import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/db.js';
import {
  duplicateCodeError,
  ensureNotInUse,
  isUniqueViolation,
  restoreData,
  softDeleteData,
} from '../../lib/master-data.js';
import { invalidatePermissions } from '../../lib/permissions.js';
import { AppError, notFound, validationError } from '../../utils/errors.js';
import { pageArgs } from '../../utils/pagination.js';
import type { CreateActionInput, ListActionsQuery, UpdateActionInput } from './actions.schema.js';

const NOT_FOUND_MESSAGE = 'Action tidak ditemukan';

/**
 * Action utama: tidak dapat dihapus (PRD §8.7) dan tidak dapat dinonaktifkan (AD-02).
 * READ juga wajib tetap default agar setiap menu PAGE baru selalu punya READ (AD-05).
 */
export const BUILTIN_ACTION_CODES = ['CREATE', 'READ', 'UPDATE', 'DELETE'];
const REQUIRED_DEFAULT_ACTION = 'READ';

const isBuiltin = (code: string) => BUILTIN_ACTION_CODES.includes(code);
const duplicateCode = (code: string) => duplicateCodeError('action', 'action_code', code);

async function findActiveOrThrow(id: string) {
  const action = await prisma.actions.findFirst({ where: { id, is_deleted: false } });
  if (!action) throw notFound(NOT_FOUND_MESSAGE);
  return action;
}

export const actionsService = {
  async list(query: ListActionsQuery) {
    const where: Prisma.actionsWhereInput = {
      ...(query.include_deleted ? {} : { is_deleted: false }),
      ...(query.is_active !== undefined ? { is_active: query.is_active } : {}),
      ...(query.q
        ? {
            OR: [
              { action_code: { contains: query.q, mode: 'insensitive' } },
              { action_name: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.actions.findMany({
        where,
        orderBy: [{ [query.sort_by]: query.sort_dir }, { action_code: 'asc' }],
        ...pageArgs(query.page, query.page_size),
      }),
      prisma.actions.count({ where }),
    ]);
    // Penanda untuk frontend: action utama tidak dapat dihapus/dinonaktifkan
    return {
      items: items.map((a) => ({ ...a, is_builtin: isBuiltin(a.action_code) })),
      meta: { page: query.page, page_size: query.page_size, total },
    };
  },

  async get(id: string) {
    const action = await findActiveOrThrow(id);
    return { ...action, is_builtin: isBuiltin(action.action_code) };
  },

  async create(input: CreateActionInput, username: string) {
    try {
      const created = await prisma.actions.create({ data: { ...input, created_by: username } });
      return { ...created, is_builtin: false };
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateCode(input.action_code);
      throw err;
    }
  },

  /** Perubahan is_default hanya berlaku untuk menu yang dibuat setelahnya (tidak retroaktif) */
  async update(id: string, input: UpdateActionInput, username: string) {
    const existing = await findActiveOrThrow(id);
    const { action_code, ...fields } = input;
    if (action_code !== undefined && action_code !== existing.action_code) {
      throw validationError([{ field: 'action_code', message: 'Kode action tidak dapat diubah' }]);
    }
    if (existing.action_code === REQUIRED_DEFAULT_ACTION && fields.is_default === false) {
      throw validationError([{ field: 'is_default', message: 'Action READ wajib menjadi default untuk setiap menu baru' }]);
    }
    const updated = await prisma.actions.update({ where: { id }, data: { ...fields, updated_by: username } });
    return { ...updated, is_builtin: isBuiltin(updated.action_code) };
  },

  async setStatus(id: string, isActive: boolean, username: string) {
    const existing = await findActiveOrThrow(id);
    if (existing.is_active !== isActive) {
      if (!isActive && isBuiltin(existing.action_code)) {
        throw new AppError(422, 'BUSINESS_RULE', `Action ${existing.action_code} adalah action utama dan tidak dapat dinonaktifkan.`);
      }
      await prisma.actions.update({ where: { id }, data: { is_active: isActive, updated_by: username } });
      // Action bersifat global: semua cache permission bisa terdampak (BR-22)
      await invalidatePermissions.all();
    }
    return this.get(id);
  },

  /** Soft delete; ditolak untuk action utama atau bila masih dipasang di menu (BR-21) */
  async remove(id: string, username: string) {
    const existing = await findActiveOrThrow(id);
    if (isBuiltin(existing.action_code)) {
      throw new AppError(422, 'BUSINESS_RULE', `Action ${existing.action_code} adalah action utama dan tidak dapat dihapus.`);
    }
    const menuCount = await prisma.menu_actions.count({ where: { action_id: id, is_deleted: false } });
    ensureNotInUse('Action', [{ label: 'menu', table: 'menu_actions', count: menuCount }]);

    const deleted = await prisma.actions.update({ where: { id }, data: softDeleteData(username) });
    return { ...deleted, is_builtin: false };
  },

  /** Pulihkan data terhapus; gagal bila kodenya sudah dipakai action aktif lain */
  async restore(id: string, username: string) {
    const action = await prisma.actions.findUnique({ where: { id } });
    if (!action) throw notFound(NOT_FOUND_MESSAGE);
    if (!action.is_deleted) throw new AppError(422, 'BUSINESS_RULE', 'Action tidak dalam status terhapus');
    try {
      const restored = await prisma.actions.update({ where: { id }, data: restoreData(username) });
      return { ...restored, is_builtin: isBuiltin(restored.action_code) };
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateCode(action.action_code);
      throw err;
    }
  },
};
