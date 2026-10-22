import { z } from 'zod';
import { Router } from 'express';
import { prisma } from '../../config/db.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { ok } from '../../utils/response.js';
import { parse } from '../../utils/validation.js';

/**
 * Lookup untuk dropdown (PRD §9.2 [U]): hanya data aktif, field ringkas.
 * Cukup token + konteks USRMGNT, tanpa permission menu tertentu.
 */
export const lookupsRouter = Router();

lookupsRouter.get(
  '/applications',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.applications.findMany({
      where: { is_deleted: false, is_active: true },
      select: { id: true, app_code: true, app_name: true, icon: true },
      orderBy: [{ sort_order: 'asc' }, { app_code: 'asc' }],
    });
    return ok(res, rows.map((a) => ({ id: a.id, code: a.app_code, name: a.app_name, icon: a.icon })));
  }),
);

const companyLookupQuery = z.object({ application_id: z.string().uuid('Aplikasi tidak valid').optional() });

/** `?application_id=`: hanya company yang memiliki aplikasi tersebut (dropdown tambah anggota, PRD §8.11) */
lookupsRouter.get(
  '/companies',
  asyncHandler(async (req, res) => {
    const { application_id } = parse(companyLookupQuery, req.query);
    const rows = await prisma.companies.findMany({
      where: {
        is_deleted: false,
        is_active: true,
        ...(application_id ? { company_applications: { some: { application_id, is_deleted: false } } } : {}),
      },
      select: { id: true, company_code: true, company_name: true },
      orderBy: { company_code: 'asc' },
    });
    return ok(res, rows.map((c) => ({ id: c.id, code: c.company_code, name: c.company_name })));
  }),
);

const groupLookupQuery = z.object({ application_id: z.string().uuid('Aplikasi tidak valid').optional() });

/**
 * Pemilih group di halaman Group Members & Group Permissions. Group nonaktif ikut ditampilkan
 * (dengan penanda) agar anggota & permission-nya tetap dapat dikelola.
 */
lookupsRouter.get(
  '/user-groups',
  asyncHandler(async (req, res) => {
    const { application_id } = parse(groupLookupQuery, req.query);
    const rows = await prisma.user_groups.findMany({
      where: { is_deleted: false, applications: { is_deleted: false }, ...(application_id ? { application_id } : {}) },
      select: {
        id: true,
        group_code: true,
        group_name: true,
        is_active: true,
        application_id: true,
        applications: { select: { app_code: true, app_name: true } },
        _count: { select: { user_group_members: { where: { is_deleted: false } } } },
      },
      orderBy: [{ applications: { sort_order: 'asc' } }, { group_code: 'asc' }],
    });
    return ok(
      res,
      rows.map((g) => ({
        id: g.id,
        code: g.group_code,
        name: g.group_name,
        is_active: g.is_active,
        application_id: g.application_id,
        app_code: g.applications.app_code,
        app_name: g.applications.app_name,
        member_count: g._count.user_group_members,
      })),
    );
  }),
);

lookupsRouter.get(
  '/actions',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.actions.findMany({
      where: { is_deleted: false, is_active: true },
      select: { id: true, action_code: true, action_name: true },
      orderBy: [{ sort_order: 'asc' }, { action_code: 'asc' }],
    });
    return ok(res, rows.map((a) => ({ id: a.id, code: a.action_code, name: a.action_name })));
  }),
);

const userLookupQuery = z.object({
  q: z.string().trim().max(100, 'Maksimal 100 karakter').optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Pencarian user aktif untuk dropdown (mis. tambah anggota group) */
lookupsRouter.get(
  '/users',
  asyncHandler(async (req, res) => {
    const { q, limit } = parse(userLookupQuery, req.query);
    const rows = await prisma.users.findMany({
      where: {
        is_deleted: false,
        is_active: true,
        ...(q
          ? {
              OR: [
                { username: { contains: q, mode: 'insensitive' } },
                { full_name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: { id: true, username: true, full_name: true, email: true },
      orderBy: { username: 'asc' },
      take: limit,
    });
    return ok(res, rows.map((u) => ({ id: u.id, code: u.username, name: u.full_name, email: u.email })));
  }),
);
