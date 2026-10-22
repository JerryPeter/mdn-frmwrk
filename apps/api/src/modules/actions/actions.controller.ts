import type { Request, Response } from 'express';
import { hasPermission } from '../../middlewares/authorize.js';
import { AppError } from '../../utils/errors.js';
import { ok } from '../../utils/response.js';
import { parse, uuidParam } from '../../utils/validation.js';
import { actionStatusSchema, createActionSchema, listActionsSchema, updateActionSchema } from './actions.schema.js';
import { actionsService } from './actions.service.js';

export const MENU = 'UM_ACTION';

const username = (req: Request) => req.auth!.username; // BR-15: audit dari JWT, bukan input client
const idOf = (req: Request) => parse(uuidParam, req.params).id;

export const actionsController = {
  async list(req: Request, res: Response) {
    const query = parse(listActionsSchema, req.query);
    if (query.include_deleted && !hasPermission(req, MENU, 'UPDATE')) {
      throw new AppError(403, 'FORBIDDEN', 'Melihat data terhapus membutuhkan hak akses UPDATE.');
    }
    const { items, meta } = await actionsService.list(query);
    return ok(res, items, { meta });
  },

  async get(req: Request, res: Response) {
    return ok(res, await actionsService.get(idOf(req)));
  },

  async create(req: Request, res: Response) {
    const input = parse(createActionSchema, req.body);
    return ok(res, await actionsService.create(input, username(req)), { status: 201, message: 'Action berhasil dibuat' });
  },

  async update(req: Request, res: Response) {
    const id = idOf(req);
    const input = parse(updateActionSchema, req.body);
    return ok(res, await actionsService.update(id, input, username(req)), { message: 'Action berhasil diperbarui' });
  },

  async setStatus(req: Request, res: Response) {
    const id = idOf(req);
    const { is_active } = parse(actionStatusSchema, req.body);
    const data = await actionsService.setStatus(id, is_active, username(req));
    return ok(res, data, { message: is_active ? 'Action diaktifkan' : 'Action dinonaktifkan' });
  },

  async remove(req: Request, res: Response) {
    return ok(res, await actionsService.remove(idOf(req), username(req)), { message: 'Action berhasil dihapus' });
  },

  async restore(req: Request, res: Response) {
    return ok(res, await actionsService.restore(idOf(req), username(req)), { message: 'Action berhasil dipulihkan' });
  },
};
