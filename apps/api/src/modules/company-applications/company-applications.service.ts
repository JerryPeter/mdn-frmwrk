import { prisma } from '../../config/db.js';
import { ensureNotInUse, isUniqueViolation, softDeleteData } from '../../lib/master-data.js';
import { invalidatePermissions } from '../../lib/permissions.js';
import { AppError, notFound, validationError } from '../../utils/errors.js';

async function findCompanyOrThrow(companyId: string) {
  const company = await prisma.companies.findFirst({ where: { id: companyId, is_deleted: false } });
  if (!company) throw notFound('Company tidak ditemukan');
  return company;
}

/** Jumlah keanggotaan group (belum dihapus) untuk company + aplikasi */
async function memberCount(companyId: string, applicationId: string) {
  return prisma.user_group_members.count({
    where: { company_id: companyId, is_deleted: false, user_groups: { application_id: applicationId } },
  });
}

export const companyApplicationsService = {
  /**
   * AD-03: seluruh aplikasi (belum dihapus) + penanda `is_assigned`, untuk tampilan toggle.
   * `member_count` = keanggotaan group yang membuat pemetaan tidak dapat dihapus.
   */
  async list(companyId: string) {
    const company = await findCompanyOrThrow(companyId);
    const [apps, mappings, members] = await Promise.all([
      prisma.applications.findMany({ where: { is_deleted: false }, orderBy: [{ sort_order: 'asc' }, { app_code: 'asc' }] }),
      prisma.company_applications.findMany({ where: { company_id: companyId, is_deleted: false } }),
      prisma.user_group_members.findMany({
        where: { company_id: companyId, is_deleted: false },
        select: { user_groups: { select: { application_id: true } } },
      }),
    ]);
    const byApp = new Map(mappings.map((m) => [m.application_id, m]));
    const countByApp = new Map<string, number>();
    members.forEach((m) => countByApp.set(m.user_groups.application_id, (countByApp.get(m.user_groups.application_id) ?? 0) + 1));

    return {
      company: { id: company.id, company_code: company.company_code, company_name: company.company_name, is_active: company.is_active },
      items: apps.map((a) => {
        const mapping = byApp.get(a.id);
        return {
          application_id: a.id,
          app_code: a.app_code,
          app_name: a.app_name,
          icon: a.icon,
          is_active: a.is_active,
          is_assigned: !!mapping,
          mapping_id: mapping?.id ?? null,
          assigned_at: mapping?.created_at ?? null,
          assigned_by: mapping?.created_by ?? null,
          member_count: mapping ? countByApp.get(a.id) ?? 0 : 0,
        };
      }),
    };
  },

  /** Tambah pemetaan; company dan aplikasi wajib aktif (BR-01) */
  async assign(companyId: string, applicationId: string, username: string) {
    const company = await findCompanyOrThrow(companyId);
    if (!company.is_active) throw new AppError(422, 'BUSINESS_RULE', `Company ${company.company_code} sedang nonaktif.`);
    const app = await prisma.applications.findFirst({ where: { id: applicationId, is_deleted: false } });
    if (!app) throw validationError([{ field: 'application_id', message: 'Aplikasi tidak ditemukan' }]);
    if (!app.is_active) throw new AppError(422, 'BUSINESS_RULE', `Aplikasi ${app.app_code} sedang nonaktif dan tidak dapat ditambahkan.`);

    try {
      const mapping = await prisma.company_applications.create({
        data: { company_id: companyId, application_id: applicationId, created_by: username },
      });
      await invalidatePermissions.company(companyId);
      return mapping;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError(409, 'DUPLICATE', `Aplikasi ${app.app_code} sudah dimiliki company ${company.company_code}`);
      }
      throw err;
    }
  },

  /** Hapus pemetaan (soft delete); ditolak bila masih ada keanggotaan group (PRD §8.6) */
  async unassign(companyId: string, applicationId: string, username: string) {
    await findCompanyOrThrow(companyId);
    const mapping = await prisma.company_applications.findFirst({
      where: { company_id: companyId, application_id: applicationId, is_deleted: false },
    });
    if (!mapping) throw notFound('Pemetaan company dan aplikasi tidak ditemukan');
    ensureNotInUse('Pemetaan', [
      { label: 'keanggotaan group', table: 'user_group_members', count: await memberCount(companyId, applicationId) },
    ]);

    const deleted = await prisma.company_applications.update({ where: { id: mapping.id }, data: softDeleteData(username) });
    await invalidatePermissions.company(companyId);
    return deleted;
  },
};
