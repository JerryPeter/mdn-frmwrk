import type { Request, Response } from 'express';
import { hasPermission } from '../../middlewares/authorize.js';
import { AppError } from '../../utils/errors.js';
import { ok } from '../../utils/response.js';
import { parse, uuidParam } from '../../utils/validation.js';
import { groupMembersService } from './group-members.service.js';
import { groupPermissionsService } from './group-permissions.service.js';
import {
  createGroupSchema,
  createMemberSchema,
  duplicateGroupSchema,
  groupStatusSchema,
  listGroupsSchema,
  listMembersSchema,
  memberParams,
  setPermissionsSchema,
  updateGroupSchema,
  updateMemberSchema,
} from './user-groups.schema.js';
import { userGroupsService } from './user-groups.service.js';

/** Menu per sub-fitur (PRD §9.2) */
export const MENU = { group: 'UM_GROUP', member: 'UM_GROUP_MEMBER', permission: 'UM_GROUP_PERM' } as const;

const username = (req: Request) => req.auth!.username; // BR-15
const idOf = (req: Request) => parse(uuidParam, req.params).id;

export const userGroupsController = {
  async list(req: Request, res: Response) {
    const query = parse(listGroupsSchema, req.query);
    if (query.include_deleted && !hasPermission(req, MENU.group, 'UPDATE')) {
      throw new AppError(403, 'FORBIDDEN', 'Melihat data terhapus membutuhkan hak akses UPDATE.');
    }
    const { items, meta } = await userGroupsService.list(query);
    return ok(res, items, { meta });
  },

  async get(req: Request, res: Response) {
    return ok(res, await userGroupsService.get(idOf(req)));
  },

  async create(req: Request, res: Response) {
    const input = parse(createGroupSchema, req.body);
    return ok(res, await userGroupsService.create(input, username(req)), { status: 201, message: 'Group berhasil dibuat' });
  },

  async update(req: Request, res: Response) {
    const id = idOf(req);
    const input = parse(updateGroupSchema, req.body);
    return ok(res, await userGroupsService.update(id, input, username(req)), { message: 'Group berhasil diperbarui' });
  },

  async setStatus(req: Request, res: Response) {
    const id = idOf(req);
    const { is_active } = parse(groupStatusSchema, req.body);
    const data = await userGroupsService.setStatus(id, is_active, username(req));
    return ok(res, data, { message: is_active ? 'Group diaktifkan' : 'Group dinonaktifkan' });
  },

  async remove(req: Request, res: Response) {
    return ok(res, await userGroupsService.remove(idOf(req), username(req)), { message: 'Group berhasil dihapus' });
  },

  async restore(req: Request, res: Response) {
    return ok(res, await userGroupsService.restore(idOf(req), username(req)), { message: 'Group berhasil dipulihkan' });
  },

  async duplicate(req: Request, res: Response) {
    const id = idOf(req);
    const input = parse(duplicateGroupSchema, req.body);
    return ok(res, await userGroupsService.duplicate(id, input, username(req)), { status: 201, message: 'Group berhasil diduplikat' });
  },
};

export const groupMembersController = {
  async list(req: Request, res: Response) {
    const query = parse(listMembersSchema, req.query);
    const { items, meta } = await groupMembersService.list(idOf(req), query);
    return ok(res, items, { meta });
  },

  async create(req: Request, res: Response) {
    const id = idOf(req);
    const input = parse(createMemberSchema, req.body);
    return ok(res, await groupMembersService.create(id, input, username(req)), { status: 201, message: 'Anggota berhasil ditambahkan' });
  },

  async update(req: Request, res: Response) {
    const { id, memberId } = parse(memberParams, req.params);
    const input = parse(updateMemberSchema, req.body);
    return ok(res, await groupMembersService.update(id, memberId, input, username(req)), { message: 'Anggota berhasil diperbarui' });
  },

  async remove(req: Request, res: Response) {
    const { id, memberId } = parse(memberParams, req.params);
    return ok(res, await groupMembersService.remove(id, memberId, username(req)), { message: 'Anggota berhasil dihapus' });
  },
};

export const groupPermissionsController = {
  async matrix(req: Request, res: Response) {
    return ok(res, await groupPermissionsService.matrix(idOf(req)));
  },

  async set(req: Request, res: Response) {
    const id = idOf(req);
    const { menu_action_ids } = parse(setPermissionsSchema, req.body);
    return ok(res, await groupPermissionsService.setPermissions(id, menu_action_ids, username(req)), {
      message: 'Permission group berhasil disimpan',
    });
  },
};
