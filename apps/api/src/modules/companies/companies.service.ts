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
import type { CreateCompanyInput, ListCompaniesQuery, UpdateCompanyInput } from './companies.schema.js';

const NOT_FOUND_MESSAGE = 'Company tidak ditemukan';

const duplicateCode = (code: string) => duplicateCodeError('company', 'company_code', code);

async function findActiveOrThrow(id: string) {
  const company = await prisma.companies.findFirst({ where: { id, is_deleted: false } });
  if (!company) throw notFound(NOT_FOUND_MESSAGE);
  return company;
}

export const companiesService = {
  async list(query: ListCompaniesQuery) {
    const where: Prisma.companiesWhereInput = {
      ...(query.include_deleted ? {} : { is_deleted: false }),
      ...(query.is_active !== undefined ? { is_active: query.is_active } : {}),
      ...(query.q
        ? {
            OR: [
              { company_code: { contains: query.q, mode: 'insensitive' } },
              { company_name: { contains: query.q, mode: 'insensitive' } },
              { short_name: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.companies.findMany({
        where,
        orderBy: [{ [query.sort_by]: query.sort_dir }, { id: 'asc' }],
        ...pageArgs(query.page, query.page_size),
      }),
      prisma.companies.count({ where }),
    ]);
    return { items, meta: { page: query.page, page_size: query.page_size, total } };
  },

  get: findActiveOrThrow,

  async create(input: CreateCompanyInput, username: string) {
    try {
      return await prisma.companies.create({ data: { ...input, created_by: username } });
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateCode(input.company_code);
      throw err;
    }
  },

  async update(id: string, input: UpdateCompanyInput, username: string) {
    const existing = await findActiveOrThrow(id);
    const { company_code, ...fields } = input;
    if (company_code !== undefined && company_code !== existing.company_code) {
      throw validationError([{ field: 'company_code', message: 'Kode company tidak dapat diubah' }]);
    }
    return prisma.companies.update({ where: { id }, data: { ...fields, updated_by: username } });
  },

  async setStatus(id: string, isActive: boolean, username: string) {
    const existing = await findActiveOrThrow(id);
    if (existing.is_active === isActive) return existing;
    const updated = await prisma.companies.update({ where: { id }, data: { is_active: isActive, updated_by: username } });
    await invalidatePermissions.company(id); // view hak akses menyaring company nonaktif (BR-22)
    return updated;
  },

  /** Soft delete; ditolak bila masih dipakai data turunan yang belum dihapus (BR-21) */
  async remove(id: string, username: string) {
    await findActiveOrThrow(id);
    const [appCount, memberCount] = await Promise.all([
      prisma.company_applications.count({ where: { company_id: id, is_deleted: false } }),
      prisma.user_group_members.count({ where: { company_id: id, is_deleted: false } }),
    ]);
    ensureNotInUse('Company', [
      { label: 'pemetaan aplikasi', table: 'company_applications', count: appCount },
      { label: 'keanggotaan group', table: 'user_group_members', count: memberCount },
    ]);

    const deleted = await prisma.companies.update({ where: { id }, data: softDeleteData(username) });
    await invalidatePermissions.company(id);
    return deleted;
  },

  /** Pulihkan data terhapus; gagal bila kodenya sudah dipakai company aktif lain */
  async restore(id: string, username: string) {
    const company = await prisma.companies.findUnique({ where: { id } });
    if (!company) throw notFound(NOT_FOUND_MESSAGE);
    if (!company.is_deleted) throw new AppError(422, 'BUSINESS_RULE', 'Company tidak dalam status terhapus');
    try {
      const restored = await prisma.companies.update({
        where: { id },
        data: restoreData(username),
      });
      await invalidatePermissions.company(id);
      return restored;
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateCode(company.company_code);
      throw err;
    }
  },
};
