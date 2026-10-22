import { Router } from 'express';
import { authorize } from '../../middlewares/authorize.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { MENU, actionsController as c } from './actions.controller.js';

/** /api/v1/actions – permission sesuai PRD §9.2 */
export const actionsRouter = Router();

actionsRouter.get('/', authorize(MENU, 'READ'), asyncHandler(c.list));
actionsRouter.get('/:id', authorize(MENU, 'READ'), asyncHandler(c.get));
actionsRouter.post('/', authorize(MENU, 'CREATE'), asyncHandler(c.create));
actionsRouter.put('/:id', authorize(MENU, 'UPDATE'), asyncHandler(c.update));
actionsRouter.patch('/:id/status', authorize(MENU, 'UPDATE'), asyncHandler(c.setStatus));
actionsRouter.post('/:id/restore', authorize(MENU, 'UPDATE'), asyncHandler(c.restore));
actionsRouter.delete('/:id', authorize(MENU, 'DELETE'), asyncHandler(c.remove));
