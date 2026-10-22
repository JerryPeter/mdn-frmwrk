import type { Request, Response } from 'express';
import { hasPermission } from '../../middlewares/authorize.js';
import { AppError } from '../../utils/errors.js';
import { ok } from '../../utils/response.js';
import { parse, uuidParam } from '../../utils/validation.js';
import {
  createMenuSchema,
  listMenusSchema,
  menuActionsSchema,
  menuStatusSchema,
  treeQuerySchema,
  updateMenuSchema,
} from './menus.schema.js';
import { menusService } from './menus.service.js';

export const MENU = 'UM_MENU';

const username = (req: Request) => req.auth!.username; // BR-15: audit dari JWT, bukan input client
const idOf = (req: Request) => parse(uuidParam, req.params).id;

function ensureCanSeeDeleted(req: Request, includeDeleted: boolean) {
  if (includeDeleted && !hasPermission(req, MENU, 'UPDATE')) {
    throw new AppError(403, 'FORBIDDEN', 'Melihat data terhapus membutuhkan hak akses UPDATE.');
  }
}

export const menusController = {
  /** GET /applications/:id/menus/tree */
  async tree(req: Request, res: Response) {
    const { include_deleted } = parse(treeQuerySchema, req.query);
    ensureCanSeeDeleted(req, include_deleted);
    return ok(res, await menusService.tree(idOf(req), include_deleted));
  },

  async list(req: Request, res: Response) {
    const query = parse(listMenusSchema, req.query);
    ensureCanSeeDeleted(req, query.include_deleted);
    const { items, meta } = await menusService.list(query);
    return ok(res, items, { meta });
  },

  async get(req: Request, res: Response) {
    return ok(res, await menusService.get(idOf(req)));
  },

  async create(req: Request, res: Response) {
    const input = parse(createMenuSchema, req.body);
    return ok(res, await menusService.create(input, username(req)), { status: 201, message: 'Menu berhasil dibuat' });
  },

  async update(req: Request, res: Response) {
    const id = idOf(req);
    const input = parse(updateMenuSchema, req.body);
    return ok(res, await menusService.update(id, input, username(req)), { message: 'Menu berhasil diperbarui' });
  },

  async setStatus(req: Request, res: Response) {
    const id = idOf(req);
    const { is_active } = parse(menuStatusSchema, req.body);
    const data = await menusService.setStatus(id, is_active, username(req));
    return ok(res, data, { message: is_active ? 'Menu diaktifkan' : 'Menu dinonaktifkan' });
  },

  async remove(req: Request, res: Response) {
    return ok(res, await menusService.remove(idOf(req), username(req)), { message: 'Menu berhasil dihapus' });
  },

  async restore(req: Request, res: Response) {
    return ok(res, await menusService.restore(idOf(req), username(req)), { message: 'Menu berhasil dipulihkan' });
  },

  /** GET /menus/:id/actions */
  async actions(req: Request, res: Response) {
    return ok(res, await menusService.actions(idOf(req)));
  },

  /** PUT /menus/:id/actions */
  async setActions(req: Request, res: Response) {
    const id = idOf(req);
    const { action_ids } = parse(menuActionsSchema, req.body);
    return ok(res, await menusService.setActions(id, action_ids, username(req)), { message: 'Action menu berhasil disimpan' });
  },
};
