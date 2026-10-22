import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/db.js';
import { dateISO, ensureSuperAdminRemains, membershipStatus, toDate, todayISO } from '../../lib/access.js';
import { isUniqueViolation, softDeleteData } from '../../lib/master-data.js';
import { invalidatePermissions } from '../../lib/permissions.js';
import { AppError, notFound, validationError } from '../../utils/errors.js';
import { pageArgs } from '../../utils/pagination.js';
import type { CreateMemberInput, ListMembersQuery, UpdateMemberInput } from './user-groups.schema.js';
import { findGroupOrThrow } from './user-groups.service.js';

const MEMBER_SELECT = {
  id: true,
  user_group_id: true,
  valid_from: true,
  valid_to: true,
  is_active: true,
  created_by: true,
  created_at: true,
  updated_by: true,
  updated_at: true,
  users: { select: { id: true, username: true, full_name: true, email: true, is_active: true, is_locked: true } },
  companies: { select: { id: true, company_code: true, company_name: true, is_active: true } },
  user_groups: { select: { is_active: true, applications: { select: { is_active: true } } } },
} satisfies Prisma.user_group_membersSelect;

type MemberRow = Prisma.user_group_membersGetPayload<{ select: typeof MEMBER_SELECT }>;

function toMemberDto({ users, companies, user_groups, ...m }: MemberRow) {
  const valid_from = dateISO(m.valid_from);
  const valid_to = m.valid_to ? dateISO(m.valid_to) : null;
  return {
    ...m,
    valid_from,
    valid_to,
    user: users,
    company: { id: companies.id, code: companies.company_code, name: companies.company_name, is_active: companies.is_active },
    status: membershipStatus({
      is_active: m.is_active,
      valid_from,
      valid_to,
      parentsActive:
        user_groups.is_active && user_groups.applications.is_active && companies.is_active && users.is_active && !users.is_locked,
    }),
  };
}

const SORT: Record<ListMembersQuery['sort_by'], (dir: 'asc' | 'desc') => Prisma.user_group_membersOrderByWithRelationInput> = {
  username: (dir) => ({ users: { username: dir } }),
  full_name: (dir) => ({ users: { full_name: dir } }),
  company_code: (dir) => ({ companies: { company_code: dir } }),
  valid_from: (dir) => ({ valid_from: dir }),
  valid_to: (dir) => ({ valid_to: { sort: dir, nulls: 'last' } }),
  created_at: (dir) => ({ created_at: dir }),
};

async function findMemberOrThrow(groupId: string, memberId: string) {
  const member = await prisma.user_group_members.findFirst({
    where: { id: memberId, user_group_id: groupId, is_deleted: false },
    select: MEMBER_SELECT,
  });
  if (!member) throw notFound('Anggota group tidak ditemukan');
  return member;
}

/** Apakah keanggotaan dengan nilai ini sedang berlaku hari ini (abaikan status induk) */
const isEffective = (m: { is_active: boolean; valid_from: string; valid_to: string | null }) =>
  membershipStatus({ ...m, parentsActive: true }) === 'active';

const lastSuperAdminMessage = (action: string) =>
  `Keanggotaan ini adalah satu-satunya anggota aktif group SUPER_ADMIN, sehingga tidak dapat ${action}.`;

export const groupMembersService = {
  async list(groupId: string, query: ListMembersQuery) {
    await findGroupOrThrow(groupId);
    const where: Prisma.user_group_membersWhereInput = {
      user_group_id: groupId,
      is_deleted: false,
      ...(query.company_id ? { company_id: query.company_id } : {}),
      ...(query.is_active !== undefined ? { is_active: query.is_active } : {}),
      ...(query.q
        ? {
            users: {
              OR: [
                { username: { contains: query.q, mode: 'insensitive' } },
                { full_name: { contains: query.q, mode: 'insensitive' } },
                { email: { contains: query.q, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.user_group_members.findMany({
        where,
        select: MEMBER_SELECT,
        orderBy: [SORT[query.sort_by](query.sort_dir), { id: 'asc' }],
        ...pageArgs(query.page, query.page_size),
      }),
      prisma.user_group_members.count({ where }),
    ]);
    return { items: items.map(toMemberDto), meta: { page: query.page, page_size: query.page_size, total } };
  },

  /**
   * Tambah anggota (PRD §8.11). Company wajib memiliki aplikasi group (AC-09); dicek lebih dulu
   * agar pesannya jelas, trigger fn_validate_group_member_company tetap menjadi pengaman terakhir.
   */
  async create(groupId: string, input: CreateMemberInput, username: string) {
    const group = await findGroupOrThrow(groupId);
    const [user, company] = await Promise.all([
      prisma.users.findFirst({ where: { id: input.user_id, is_deleted: false } }),
      prisma.companies.findFirst({ where: { id: input.company_id, is_deleted: false } }),
    ]);
    const errors = [];
    if (!user) errors.push({ field: 'user_id', message: 'User tidak ditemukan' });
    else if (!user.is_active) errors.push({ field: 'user_id', message: `User ${user.username} sedang nonaktif` });
    if (!company) errors.push({ field: 'company_id', message: 'Company tidak ditemukan' });
    if (errors.length) throw validationError(errors);

    const mapping = await prisma.company_applications.count({
      where: { company_id: input.company_id, application_id: group.application_id, is_deleted: false },
    });
    if (!mapping) {
      throw new AppError(
        422,
        'BUSINESS_RULE',
        `Company ${company!.company_code} tidak memiliki aplikasi ${group.app_code}. Tambahkan aplikasinya di halaman Company Applications terlebih dahulu.`,
        [{ field: 'company_id', message: `Company tidak memiliki aplikasi ${group.app_code}` }],
      );
    }

    const validFrom = input.valid_from ?? todayISO();
    if (input.valid_to && input.valid_to < validFrom) {
      throw validationError([{ field: 'valid_to', message: 'Berlaku sampai tidak boleh sebelum berlaku mulai' }]);
    }
    try {
      const member = await prisma.user_group_members.create({
        data: {
          user_id: input.user_id,
          user_group_id: groupId,
          company_id: input.company_id,
          valid_from: toDate(validFrom),
          valid_to: input.valid_to ? toDate(input.valid_to) : null,
          created_by: username,
        },
        select: MEMBER_SELECT,
      });
      await invalidatePermissions.user(input.user_id);
      return toMemberDto(member);
    } catch (err) {
      if (isUniqueViolation(err)) {
        const message = `User ${user!.username} sudah menjadi anggota group ini untuk company ${company!.company_code}`;
        throw new AppError(409, 'DUPLICATE', message, [{ field: 'user_id', message }]);
      }
      throw err;
    }
  },

  /** Ubah: hanya valid_from, valid_to, is_active (PRD §8.11) */
  async update(groupId: string, memberId: string, input: UpdateMemberInput, username: string) {
    const group = await findGroupOrThrow(groupId);
    await findMemberOrThrow(groupId, memberId);
    if (group.is_protected && !isEffective(input)) {
      await ensureSuperAdminRemains({ memberId }, lastSuperAdminMessage('dinonaktifkan atau diakhiri masa berlakunya'));
    }
    const member = await prisma.user_group_members.update({
      where: { id: memberId },
      data: {
        valid_from: toDate(input.valid_from),
        valid_to: input.valid_to ? toDate(input.valid_to) : null,
        is_active: input.is_active,
        updated_by: username,
      },
      select: MEMBER_SELECT,
    });
    await invalidatePermissions.user(member.users.id);
    return toMemberDto(member);
  },

  async remove(groupId: string, memberId: string, username: string) {
    const group = await findGroupOrThrow(groupId);
    const existing = await findMemberOrThrow(groupId, memberId);
    if (group.is_protected) await ensureSuperAdminRemains({ memberId }, lastSuperAdminMessage('dihapus'));
    const member = await prisma.user_group_members.update({
      where: { id: memberId },
      data: softDeleteData(username),
      select: MEMBER_SELECT,
    });
    await invalidatePermissions.user(existing.users.id);
    return toMemberDto(member);
  },
};
