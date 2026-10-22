import type { Request, Response } from 'express';
import { hasPermission } from '../../middlewares/authorize.js';
import { AppError } from '../../utils/errors.js';
import { ok } from '../../utils/response.js';
import { parse, uuidParam } from '../../utils/validation.js';
import {
  applicationStatusSchema,
  createApplicationSchema,
  listApplicationsSchema,
  updateApplicationSchema,
} from './applications.schema.js';
import { applicationsService } from './applications.service.js';

export const MENU = 'UM_APPLICATION';

const username = (req: Request) => req.auth!.username; // BR-15: audit dari JWT, bukan input client
const idOf = (req: Request) => parse(uuidParam, req.params).id;

export const applicationsController = {
  async list(req: Request, res: Response) {
    const query = parse(listApplicationsSchema, req.query);
    if (query.include_deleted && !hasPermission(req, MENU, 'UPDATE')) {
      throw new AppError(403, 'FORBIDDEN', 'Melihat data terhapus membutuhkan hak akses UPDATE.');
    }
    const { items, meta } = await applicationsService.list(query);
    return ok(res, items, { meta });
  },

  async get(req: Request, res: Response) {
    return ok(res, await applicationsService.get(idOf(req)));
  },

  async create(req: Request, res: Response) {
    const input = parse(createApplicationSchema, req.body);
    return ok(res, await applicationsService.create(input, username(req)), { status: 201, message: 'Aplikasi berhasil dibuat' });
  },

  async update(req: Request, res: Response) {
    const id = idOf(req);
    const input = parse(updateApplicationSchema, req.body);
    return ok(res, await applicationsService.update(id, input, username(req)), { message: 'Aplikasi berhasil diperbarui' });
  },

  async setStatus(req: Request, res: Response) {
    const id = idOf(req);
    const { is_active } = parse(applicationStatusSchema, req.body);
    const data = await applicationsService.setStatus(id, is_active, username(req));
    return ok(res, data, { message: is_active ? 'Aplikasi diaktifkan' : 'Aplikasi dinonaktifkan' });
  },

  async remove(req: Request, res: Response) {
    return ok(res, await applicationsService.remove(idOf(req), username(req)), { message: 'Aplikasi berhasil dihapus' });
  },

  async restore(req: Request, res: Response) {
    return ok(res, await applicationsService.restore(idOf(req), username(req)), { message: 'Aplikasi berhasil dipulihkan' });
  },
};
