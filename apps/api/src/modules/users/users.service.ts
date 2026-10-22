import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/db.js';
import { dateISO, ensureSuperAdminRemains, membershipStatus } from '../../lib/access.js';
import { isUniqueViolation, restoreData, softDeleteData } from '../../lib/master-data.js';
import { generatePassword, hashPassword, passwordPolicyViolations } from '../../lib/password.js';
import { invalidatePermissions } from '../../lib/permissions.js';
import { refreshTokens } from '../../lib/refresh-tokens.js';
import { AppError, notFound, validationError, type ErrorDetail } from '../../utils/errors.js';
import { pageArgs } from '../../utils/pagination.js';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput, UserFilter } from './users.schema.js';

const NOT_FOUND_MESSAGE = 'User tidak ditemukan';

/** Seluruh kolom kecuali password_hash (PRD §8.9, AC-16) */
export const USER_SELECT = {
  id: true,
  username: true,
  email: true,
  full_name: true,
  employee_no: true,
  phone: true,
  auth_provider: true,
  password_changed_at: true,
  must_change_password: true,
  failed_login_count: true,
  is_locked: true,
  locked_at: true,
  last_login_at: true,
  created_by: true,
  created_at: true,
  updated_by: true,
  updated_at: true,
  deleted_by: true,
  deleted_at: true,
  is_deleted: true,
  is_active: true,
  _count: { select: { user_group_members: { where: { is_deleted: false } } } },
} satisfies Prisma.usersSelect;

type UserRow = Prisma.usersGetPayload<{ select: typeof USER_SELECT }>;

/** Ratakan `_count` menjadi `membership_count` */
const toDto = ({ _count, ...user }: UserRow) => ({ ...user, membership_count: _count.user_group_members });

async function findActiveOrThrow(id: string) {
  const user = await prisma.users.findFirst({ where: { id, is_deleted: false }, select: USER_SELECT });
  if (!user) throw notFound(NOT_FOUND_MESSAGE);
  return user;
}

const save = (id: string, data: Prisma.usersUpdateInput) =>
  prisma.users.update({ where: { id }, data, select: USER_SELECT }).then(toDto);

const NULLABLE_SORT = new Set<string>(['employee_no', 'last_login_at', 'updated_at']);

/** Kolom nullable diurutkan dengan NULL di akhir (Prisma hanya mengizinkan `nulls` pada kolom opsional) */
function orderBy(column: string, dir: 'asc' | 'desc'): Prisma.usersOrderByWithRelationInput[] {
  return [{ [column]: NULLABLE_SORT.has(column) ? { sort: dir, nulls: 'last' } : dir }, { id: 'asc' }];
}

export function buildWhere(query: UserFilter): Prisma.usersWhereInput {
  return {
    ...(query.include_deleted ? {} : { is_deleted: false }),
    ...(query.is_active !== undefined ? { is_active: query.is_active } : {}),
    ...(query.is_locked !== undefined ? { is_locked: query.is_locked } : {}),
    ...(query.auth_provider ? { auth_provider: query.auth_provider } : {}),
    ...(query.q
      ? {
          OR: [
            { username: { contains: query.q, mode: 'insensitive' } },
            { full_name: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } },
            { employee_no: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

/**
 * BR-12/BR-13: username & email unik (tanpa beda huruf besar/kecil) di antara user yang belum dihapus.
 * Dicek lebih dulu agar pesan menyebut field yang bentrok; P2002 tetap ditangani sebagai cadangan.
 */
export async function findDuplicates(fields: { username?: string; email?: string }, excludeId?: string) {
  const details: ErrorDetail[] = [];
  const base = { is_deleted: false, ...(excludeId ? { id: { not: excludeId } } : {}) };
  const [byUsername, byEmail] = await Promise.all([
    fields.username
      ? prisma.users.count({ where: { ...base, username: { equals: fields.username, mode: 'insensitive' } } })
      : 0,
    fields.email ? prisma.users.count({ where: { ...base, email: { equals: fields.email, mode: 'insensitive' } } }) : 0,
  ]);
  if (byUsername) details.push({ field: 'username', message: `Username ${fields.username} sudah digunakan` });
  if (byEmail) details.push({ field: 'email', message: `Email ${fields.email} sudah digunakan` });
  return details;
}

async function ensureUnique(fields: { username?: string; email?: string }, excludeId?: string) {
  const details = await findDuplicates(fields, excludeId);
  if (details.length) throw new AppError(409, 'DUPLICATE', details.map((d) => d.message).join('. '), details);
}

const duplicateFallback = () => new AppError(409, 'DUPLICATE', 'Username atau email sudah digunakan');

/** BR-19: user tidak dapat menghapus, menonaktifkan, atau mengunci akunnya sendiri */
function ensureNotSelf(id: string, actorId: string, action: string) {
  if (id === actorId) throw new AppError(422, 'BUSINESS_RULE', `Anda tidak dapat ${action} akun Anda sendiri.`);
}

/** BR-20: group SUPER_ADMIN (USRMGNT) minimal memiliki 1 anggota aktif */
const ensureNotLastSuperAdmin = (id: string, action: string) =>
  ensureSuperAdminRemains(
    { userId: id },
    `User ini adalah satu-satunya anggota aktif group SUPER_ADMIN, sehingga tidak dapat ${action}.`,
  );

/** Sesi & cache hak akses user dicabut setelah status berubah (BR-22) */
async function revokeAccess(id: string) {
  await Promise.all([refreshTokens.revokeAll(id), invalidatePermissions.user(id)]);
}

function ensureLocal(user: { auth_provider: string }) {
  if (user.auth_provider !== 'LOCAL') {
    throw new AppError(422, 'BUSINESS_RULE', `Password tidak dikelola aplikasi untuk user ${user.auth_provider}.`);
  }
}

export const usersService = {
  async list(query: ListUsersQuery) {
    const where = buildWhere(query);
    const [items, total] = await prisma.$transaction([
      prisma.users.findMany({
        where,
        select: USER_SELECT,
        orderBy: orderBy(query.sort_by, query.sort_dir),
        ...pageArgs(query.page, query.page_size),
      }),
      prisma.users.count({ where }),
    ]);
    return { items: items.map(toDto), meta: { page: query.page, page_size: query.page_size, total } };
  },

  get: (id: string) => findActiveOrThrow(id).then(toDto),

  /** Create: password dari admin (wajib memenuhi BR-18) atau dibangkitkan; selalu wajib ganti password */
  async create(input: CreateUserInput, username: string) {
    const { password, ...fields } = input;
    if (password) {
      const violations = passwordPolicyViolations(password);
      if (violations.length) throw validationError(violations.map((message) => ({ field: 'password', message })));
    }
    await ensureUnique({ username: fields.username, email: fields.email });

    const plain = password ?? generatePassword();
    try {
      const user = await prisma.users.create({
        data: {
          ...fields,
          password_hash: await hashPassword(plain),
          password_changed_at: new Date(),
          must_change_password: true,
          created_by: username,
        },
        select: USER_SELECT,
      });
      // Password bangkitan hanya dikembalikan sekali di response ini
      return { ...toDto(user), generated_password: password ? null : plain };
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateFallback();
      throw err;
    }
  },

  async update(id: string, input: UpdateUserInput, username: string) {
    const existing = await findActiveOrThrow(id);
    const { username: inputUsername, auth_provider, ...fields } = input;
    const errors: ErrorDetail[] = [];
    if (inputUsername !== undefined && inputUsername !== existing.username.toLowerCase()) {
      errors.push({ field: 'username', message: 'Username tidak dapat diubah' });
    }
    if (auth_provider !== undefined && auth_provider !== existing.auth_provider) {
      errors.push({ field: 'auth_provider', message: 'Auth provider tidak dapat diubah' });
    }
    if (errors.length) throw validationError(errors);
    await ensureUnique({ email: fields.email }, id);
    try {
      return await save(id, { ...fields, updated_by: username });
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateFallback();
      throw err;
    }
  },

  async setStatus(id: string, isActive: boolean, actor: { userId: string; username: string }) {
    const existing = await findActiveOrThrow(id);
    if (!isActive) ensureNotSelf(id, actor.userId, 'menonaktifkan');
    if (existing.is_active === isActive) return toDto(existing);
    if (!isActive) await ensureNotLastSuperAdmin(id, 'dinonaktifkan');
    const updated = await save(id, { is_active: isActive, updated_by: actor.username });
    await revokeAccess(id);
    return updated;
  },

  async lock(id: string, actor: { userId: string; username: string }) {
    const existing = await findActiveOrThrow(id);
    ensureNotSelf(id, actor.userId, 'mengunci');
    if (existing.is_locked) throw new AppError(422, 'BUSINESS_RULE', 'User sudah dalam status terkunci');
    await ensureNotLastSuperAdmin(id, 'dikunci');
    const updated = await save(id, { is_locked: true, locked_at: new Date(), updated_by: actor.username });
    await revokeAccess(id);
    return updated;
  },

  async unlock(id: string, username: string) {
    const existing = await findActiveOrThrow(id);
    if (!existing.is_locked && existing.failed_login_count === 0) {
      throw new AppError(422, 'BUSINESS_RULE', 'User tidak dalam status terkunci');
    }
    const updated = await save(id, { is_locked: false, locked_at: null, failed_login_count: 0, updated_by: username });
    await invalidatePermissions.user(id);
    return updated;
  },

  /** Reset password: password acak, wajib ganti, seluruh sesi dicabut (PRD §8.9) */
  async resetPassword(id: string, actor: { userId: string; username: string }) {
    const existing = await findActiveOrThrow(id);
    if (id === actor.userId) {
      throw new AppError(422, 'BUSINESS_RULE', 'Gunakan menu Ganti Password untuk mengganti password Anda sendiri.');
    }
    ensureLocal(existing);
    const plain = generatePassword();
    const updated = await save(id, {
      password_hash: await hashPassword(plain),
      password_changed_at: new Date(),
      must_change_password: true,
      updated_by: actor.username,
    });
    await refreshTokens.revokeAll(id);
    return { ...updated, generated_password: plain };
  },

  /**
   * Soft delete user beserta keanggotaan group-nya (deleted_at yang sama),
   * sehingga keanggotaan ikut dipulihkan saat user dipulihkan.
   */
  async remove(id: string, actor: { userId: string; username: string }) {
    await findActiveOrThrow(id);
    ensureNotSelf(id, actor.userId, 'menghapus');
    await ensureNotLastSuperAdmin(id, 'dihapus');
    const data = softDeleteData(actor.username);
    const [deleted] = await prisma.$transaction([
      prisma.users.update({ where: { id }, data, select: USER_SELECT }),
      prisma.user_group_members.updateMany({ where: { user_id: id, is_deleted: false }, data }),
    ]);
    await revokeAccess(id);
    return toDto(deleted);
  },

  /** Pulihkan user; gagal bila username/email sudah dipakai user aktif lain */
  async restore(id: string, username: string) {
    const user = await prisma.users.findUnique({ where: { id }, select: USER_SELECT });
    if (!user) throw notFound(NOT_FOUND_MESSAGE);
    if (!user.is_deleted) throw new AppError(422, 'BUSINESS_RULE', 'User tidak dalam status terhapus');
    await ensureUnique({ username: user.username, email: user.email }, id);

    try {
      const restored = await prisma.$transaction(async (tx) => {
        const row = await tx.users.update({ where: { id }, data: restoreData(username), select: USER_SELECT });
        // Keanggotaan yang terhapus bersama user; hanya yang group & pemetaan company-aplikasinya masih ada
        // (trigger fn_validate_group_member_company menolak selain itu)
        let restoredMemberships = 0;
        if (user.deleted_at) {
          restoredMemberships = await tx.$executeRaw`
            UPDATE usrmgnt.user_group_members m
               SET is_deleted = false, deleted_by = NULL, deleted_at = NULL, updated_by = ${username}
             WHERE m.user_id = ${id}::uuid
               AND m.is_deleted = true
               AND m.deleted_at = ${user.deleted_at}
               AND EXISTS (
                     SELECT 1
                       FROM usrmgnt.user_groups g
                       JOIN usrmgnt.company_applications ca
                         ON ca.application_id = g.application_id
                        AND ca.company_id = m.company_id
                        AND ca.is_deleted = false
                      WHERE g.id = m.user_group_id AND g.is_deleted = false)`;
        }
        return { ...toDto(row), membership_count: restoredMemberships, restored_memberships: restoredMemberships };
      });
      await invalidatePermissions.user(id);
      return restored;
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateFallback();
      throw err;
    }
  },

  /** Tab "Akses": keanggotaan group user (PRD §8.9) */
  async memberships(id: string) {
    await findActiveOrThrow(id);
    const rows = await prisma.user_group_members.findMany({
      where: { user_id: id, is_deleted: false },
      select: {
        id: true,
        valid_from: true,
        valid_to: true,
        is_active: true,
        companies: { select: { id: true, company_code: true, company_name: true, is_active: true, is_deleted: true } },
        user_groups: {
          select: {
            id: true,
            group_code: true,
            group_name: true,
            is_active: true,
            applications: { select: { id: true, app_code: true, app_name: true, is_active: true } },
          },
        },
      },
    });

    const items = rows.map((m) => {
      const from = dateISO(m.valid_from);
      const to = m.valid_to ? dateISO(m.valid_to) : null;
      const app = m.user_groups.applications;
      const status = membershipStatus({
        is_active: m.is_active,
        valid_from: from,
        valid_to: to,
        parentsActive: m.user_groups.is_active && m.companies.is_active && !m.companies.is_deleted && app.is_active,
      });
      return {
        id: m.id,
        company: { id: m.companies.id, code: m.companies.company_code, name: m.companies.company_name },
        application: { id: app.id, code: app.app_code, name: app.app_name },
        group: { id: m.user_groups.id, code: m.user_groups.group_code, name: m.user_groups.group_name },
        valid_from: from,
        valid_to: to,
        is_active: m.is_active,
        status,
      };
    });
    items.sort(
      (a, b) =>
        a.company.code.localeCompare(b.company.code) ||
        a.application.code.localeCompare(b.application.code) ||
        a.group.code.localeCompare(b.group.code),
    );
    return items;
  },

  /** Data export (mengikuti filter list), dibatasi agar file tetap wajar */
  async exportRows(filter: UserFilter, limit = 10_000) {
    return prisma.users.findMany({
      where: buildWhere(filter),
      select: {
        username: true,
        full_name: true,
        email: true,
        employee_no: true,
        auth_provider: true,
        is_active: true,
        is_locked: true,
        last_login_at: true,
      },
      orderBy: orderBy(filter.sort_by, filter.sort_dir),
      take: limit,
    });
  },
};
