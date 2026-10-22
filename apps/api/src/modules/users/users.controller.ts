import type { Request, Response } from 'express';
import { hasPermission } from '../../middlewares/authorize.js';
import { AppError } from '../../utils/errors.js';
import { ok } from '../../utils/response.js';
import { parse, uuidParam } from '../../utils/validation.js';
import { exportUsers, importTemplate, importUsers } from './users.excel.js';
import {
  createUserSchema,
  exportUsersSchema,
  listUsersSchema,
  updateUserSchema,
  userStatusSchema,
} from './users.schema.js';
import { usersService } from './users.service.js';

export const MENU = 'UM_USER';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const actor = (req: Request) => ({ userId: req.auth!.userId, username: req.auth!.username }); // BR-15
const idOf = (req: Request) => parse(uuidParam, req.params).id;

function ensureCanSeeDeleted(req: Request, includeDeleted: boolean) {
  if (includeDeleted && !hasPermission(req, MENU, 'UPDATE')) {
    throw new AppError(403, 'FORBIDDEN', 'Melihat data terhapus membutuhkan hak akses UPDATE.');
  }
}

function sendXlsx(res: Response, filename: string, buffer: Buffer) {
  res.setHeader('Content-Type', XLSX_MIME);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  return res.end(buffer);
}

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

export const usersController = {
  async list(req: Request, res: Response) {
    const query = parse(listUsersSchema, req.query);
    ensureCanSeeDeleted(req, query.include_deleted);
    const { items, meta } = await usersService.list(query);
    return ok(res, items, { meta });
  },

  async get(req: Request, res: Response) {
    return ok(res, await usersService.get(idOf(req)));
  },

  async create(req: Request, res: Response) {
    const input = parse(createUserSchema, req.body);
    return ok(res, await usersService.create(input, actor(req).username), { status: 201, message: 'User berhasil dibuat' });
  },

  async update(req: Request, res: Response) {
    const id = idOf(req);
    const input = parse(updateUserSchema, req.body);
    return ok(res, await usersService.update(id, input, actor(req).username), { message: 'User berhasil diperbarui' });
  },

  async setStatus(req: Request, res: Response) {
    const id = idOf(req);
    const { is_active } = parse(userStatusSchema, req.body);
    const data = await usersService.setStatus(id, is_active, actor(req));
    return ok(res, data, { message: is_active ? 'User diaktifkan' : 'User dinonaktifkan' });
  },

  async lock(req: Request, res: Response) {
    return ok(res, await usersService.lock(idOf(req), actor(req)), { message: 'User dikunci' });
  },

  async unlock(req: Request, res: Response) {
    return ok(res, await usersService.unlock(idOf(req), actor(req).username), { message: 'User dibuka kuncinya' });
  },

  async resetPassword(req: Request, res: Response) {
    return ok(res, await usersService.resetPassword(idOf(req), actor(req)), { message: 'Password berhasil direset' });
  },

  async remove(req: Request, res: Response) {
    return ok(res, await usersService.remove(idOf(req), actor(req)), { message: 'User berhasil dihapus' });
  },

  async restore(req: Request, res: Response) {
    return ok(res, await usersService.restore(idOf(req), actor(req).username), { message: 'User berhasil dipulihkan' });
  },

  async memberships(req: Request, res: Response) {
    return ok(res, await usersService.memberships(idOf(req)));
  },

  async export(req: Request, res: Response) {
    const filter = parse(exportUsersSchema, req.query);
    ensureCanSeeDeleted(req, filter.include_deleted);
    return sendXlsx(res, `users_${stamp()}.xlsx`, await exportUsers(filter));
  },

  async importTemplate(_req: Request, res: Response) {
    return sendXlsx(res, 'template_import_users.xlsx', await importTemplate());
  },

  async import(req: Request, res: Response) {
    if (!req.file) {
      throw new AppError(400, 'VALIDATION_ERROR', 'File wajib diunggah', [{ field: 'file', message: 'File wajib diunggah' }]);
    }
    const result = await importUsers(req.file.buffer, actor(req).username);
    return ok(res, result, { status: 201, message: `${result.imported} user berhasil diimport` });
  },
};
