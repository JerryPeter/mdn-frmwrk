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
import type { CreateApplicationInput, ListApplicationsQuery, UpdateApplicationInput } from './applications.schema.js';

const NOT_FOUND_MESSAGE = 'Aplikasi tidak ditemukan';

/**
 * AD-01 (diputuskan): aplikasi USRMGNT dikunci, tidak dapat dihapus/dinonaktifkan,
 * karena seluruh admin akan kehilangan akses ke modul ini.
 */
export const PROTECTED_APP_CODES = ['USRMGNT'];

const duplicateCode = (code: string) => duplicateCodeError('aplikasi', 'app_code', code);

/** Penanda untuk frontend: aplikasi inti tidak dapat dihapus/dinonaktifkan */
const withFlags = <T extends { app_code: string }>(app: T) => ({ ...app, is_protected: PROTECTED_APP_CODES.includes(app.app_code) });

function ensureNotProtected(app: { app_code: string }, action: string) {
  if (PROTECTED_APP_CODES.includes(app.app_code)) {
    throw new AppError(422, 'BUSINESS_RULE', `Aplikasi ${app.app_code} adalah aplikasi inti dan tidak dapat ${action}.`);
  }
}

async function findActiveOrThrow(id: string) {
  const app = await prisma.applications.findFirst({ where: { id, is_deleted: false } });
  if (!app) throw notFound(NOT_FOUND_MESSAGE);
  return app;
}

export const applicationsService = {
  async list(query: ListApplicationsQuery) {
    const where: Prisma.applicationsWhereInput = {
      ...(query.include_deleted ? {} : { is_deleted: false }),
      ...(query.is_active !== undefined ? { is_active: query.is_active } : {}),
      ...(query.q
        ? {
            OR: [
              { app_code: { contains: query.q, mode: 'insensitive' } },
              { app_name: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.applications.findMany({
        where,
        orderBy: [{ [query.sort_by]: query.sort_dir }, { app_code: 'asc' }],
        ...pageArgs(query.page, query.page_size),
      }),
      prisma.applications.count({ where }),
    ]);
    return { items: items.map(withFlags), meta: { page: query.page, page_size: query.page_size, total } };
  },

  async get(id: string) {
    return withFlags(await findActiveOrThrow(id));
  },

  async create(input: CreateApplicationInput, username: string) {
    try {
      return withFlags(await prisma.applications.create({ data: { ...input, created_by: username } }));
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateCode(input.app_code);
      throw err;
    }
  },

  async update(id: string, input: UpdateApplicationInput, username: string) {
    const existing = await findActiveOrThrow(id);
    const { app_code, ...fields } = input;
    if (app_code !== undefined && app_code !== existing.app_code) {
      throw validationError([{ field: 'app_code', message: 'Kode aplikasi tidak dapat diubah' }]);
    }
    return withFlags(await prisma.applications.update({ where: { id }, data: { ...fields, updated_by: username } }));
  },

  async setStatus(id: string, isActive: boolean, username: string) {
    const existing = await findActiveOrThrow(id);
    if (existing.is_active === isActive) return withFlags(existing);
    if (!isActive) ensureNotProtected(existing, 'dinonaktifkan');
    const updated = await prisma.applications.update({ where: { id }, data: { is_active: isActive, updated_by: username } });
    await invalidatePermissions.application(id); // view hak akses menyaring aplikasi nonaktif (BR-22)
    return withFlags(updated);
  },

  /** Soft delete; ditolak bila masih punya menu, group, atau pemetaan company (BR-21) */
  async remove(id: string, username: string) {
    const existing = await findActiveOrThrow(id);
    ensureNotProtected(existing, 'dihapus');
    const [menuCount, groupCount, companyCount] = await Promise.all([
      prisma.menus.count({ where: { application_id: id, is_deleted: false } }),
      prisma.user_groups.count({ where: { application_id: id, is_deleted: false } }),
      prisma.company_applications.count({ where: { application_id: id, is_deleted: false } }),
    ]);
    ensureNotInUse('Aplikasi', [
      { label: 'menu', table: 'menus', count: menuCount },
      { label: 'user group', table: 'user_groups', count: groupCount },
      { label: 'pemetaan company', table: 'company_applications', count: companyCount },
    ]);

    const deleted = await prisma.applications.update({ where: { id }, data: softDeleteData(username) });
    await invalidatePermissions.application(id);
    return withFlags(deleted);
  },

  /** Pulihkan data terhapus; gagal bila kodenya sudah dipakai aplikasi aktif lain */
  async restore(id: string, username: string) {
    const app = await prisma.applications.findUnique({ where: { id } });
    if (!app) throw notFound(NOT_FOUND_MESSAGE);
    if (!app.is_deleted) throw new AppError(422, 'BUSINESS_RULE', 'Aplikasi tidak dalam status terhapus');
    try {
      const restored = await prisma.applications.update({ where: { id }, data: restoreData(username) });
      await invalidatePermissions.application(id);
      return withFlags(restored);
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateCode(app.app_code);
      throw err;
    }
  },
};
