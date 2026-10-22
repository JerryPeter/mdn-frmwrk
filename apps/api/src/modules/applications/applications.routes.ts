import { Router } from 'express';
import { authorize } from '../../middlewares/authorize.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { MENU, applicationsController as c } from './applications.controller.js';

/** /api/v1/applications – permission sesuai PRD §9.2 */
export const applicationsRouter = Router();

applicationsRouter.get('/', authorize(MENU, 'READ'), asyncHandler(c.list));
applicationsRouter.get('/:id', authorize(MENU, 'READ'), asyncHandler(c.get));
applicationsRouter.post('/', authorize(MENU, 'CREATE'), asyncHandler(c.create));
applicationsRouter.put('/:id', authorize(MENU, 'UPDATE'), asyncHandler(c.update));
applicationsRouter.patch('/:id/status', authorize(MENU, 'UPDATE'), asyncHandler(c.setStatus));
applicationsRouter.post('/:id/restore', authorize(MENU, 'UPDATE'), asyncHandler(c.restore));
applicationsRouter.delete('/:id', authorize(MENU, 'DELETE'), asyncHandler(c.remove));
