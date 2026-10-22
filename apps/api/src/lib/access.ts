import type { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { AppError } from '../utils/errors.js';
import { invalidatePermissions } from './permissions.js';

/**
 * Helper bersama untuk keanggotaan group (users, user-groups, group members):
 * status keanggotaan (BR-10), perlindungan SUPER_ADMIN (AD-01, BR-20), invalidasi cache (BR-22).
 */

/** Group inti yang dikunci (AD-01) */
export const SUPER_ADMIN = { appCode: 'USRMGNT', groupCode: 'SUPER_ADMIN' } as const;

export const isProtectedGroup = (group: { group_code: string; app_code: string }) =>
  group.group_code === SUPER_ADMIN.groupCode && group.app_code === SUPER_ADMIN.appCode;

/** Tanggal hari ini (YYYY-MM-DD) zona Asia/Jakarta, sama dengan current_date database */
export const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

/** Kolom date Prisma (UTC tengah malam) → "YYYY-MM-DD" */
export const dateISO = (d: Date) => d.toISOString().slice(0, 10);

/** "YYYY-MM-DD" → Date untuk kolom date */
export const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export type MembershipStatus = 'active' | 'inactive' | 'upcoming' | 'expired' | 'suspended';

/** Status keanggotaan sesuai BR-10; `suspended` bila group/company/aplikasi/user induknya tidak aktif */
export function membershipStatus(m: {
  is_active: boolean;
  valid_from: string;
  valid_to: string | null;
  parentsActive: boolean;
}): MembershipStatus {
  const today = todayISO();
  if (!m.is_active) return 'inactive';
  if (m.valid_from > today) return 'upcoming';
  if (m.valid_to !== null && m.valid_to < today) return 'expired';
  return m.parentsActive ? 'active' : 'suspended';
}

/** Keanggotaan yang sedang berlaku untuk group SUPER_ADMIN (user aktif, tidak terkunci) */
function effectiveSuperAdminWhere(): Prisma.user_group_membersWhereInput {
  const today = toDate(todayISO());
  return {
    is_deleted: false,
    is_active: true,
    valid_from: { lte: today },
    OR: [{ valid_to: null }, { valid_to: { gte: today } }],
    user_groups: { group_code: SUPER_ADMIN.groupCode, is_deleted: false, applications: { app_code: SUPER_ADMIN.appCode } },
    users: { is_deleted: false, is_active: true, is_locked: false },
  };
}

/**
 * BR-20: group SUPER_ADMIN minimal memiliki 1 anggota aktif.
 * Tolak perubahan bila setelah `exclude` (user atau keanggotaan tertentu) tidak ada lagi anggota yang berlaku.
 * Hanya diperiksa bila yang dikecualikan memang sedang menjadi anggota yang berlaku.
 */
export async function ensureSuperAdminRemains(exclude: { userId?: string; memberId?: string }, message: string) {
  const base = effectiveSuperAdminWhere();
  const target: Prisma.user_group_membersWhereInput = exclude.userId ? { user_id: exclude.userId } : { id: exclude.memberId };
  const isEffective = await prisma.user_group_members.count({ where: { ...base, ...target } });
  if (!isEffective) return;
  const others = await prisma.user_group_members.count({
    where: { ...base, ...(exclude.userId ? { user_id: { not: exclude.userId } } : { id: { not: exclude.memberId } }) },
  });
  if (!others) throw new AppError(422, 'BUSINESS_RULE', message);
}

/** BR-22: hapus cache permission seluruh anggota group (termasuk anggota nonaktif, agar aman) */
export async function invalidateGroupMembers(groupId: string) {
  const members = await prisma.user_group_members.findMany({
    where: { user_group_id: groupId, is_deleted: false },
    select: { user_id: true },
    distinct: ['user_id'],
  });
  await Promise.all(members.map((m) => invalidatePermissions.user(m.user_id)));
}
