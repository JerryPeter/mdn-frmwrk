import { Router } from 'express';
import { authorize } from '../../middlewares/authorize.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { MENU, menusController as c } from './menus.controller.js';

/** /api/v1/menus – permission sesuai PRD §9.2 */
export const menusRouter = Router();

menusRouter.get('/', authorize(MENU, 'READ'), asyncHandler(c.list));
menusRouter.get('/:id', authorize(MENU, 'READ'), asyncHandler(c.get));
menusRouter.post('/', authorize(MENU, 'CREATE'), asyncHandler(c.create));
menusRouter.put('/:id', authorize(MENU, 'UPDATE'), asyncHandler(c.update));
menusRouter.patch('/:id/status', authorize(MENU, 'UPDATE'), asyncHandler(c.setStatus));
menusRouter.post('/:id/restore', authorize(MENU, 'UPDATE'), asyncHandler(c.restore));
menusRouter.delete('/:id', authorize(MENU, 'DELETE'), asyncHandler(c.remove));
menusRouter.get('/:id/actions', authorize(MENU, 'READ'), asyncHandler(c.actions));
menusRouter.put('/:id/actions', authorize(MENU, 'UPDATE'), asyncHandler(c.setActions));

/**
 * GET /api/v1/applications/:id/menus/tree. Dipasang di path /applications sebelum
 * applicationsRouter; route lain di path itu diteruskan ke applicationsRouter.
 */
export const menuTreeRouter = Router();
menuTreeRouter.get('/:id/menus/tree', authorize(MENU, 'READ'), asyncHandler(c.tree));
