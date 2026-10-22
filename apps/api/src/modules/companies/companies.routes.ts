import { Router } from 'express';
import { authorize } from '../../middlewares/authorize.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { MENU, companiesController as c } from './companies.controller.js';

/** /api/v1/companies – permission sesuai PRD §9.2 */
export const companiesRouter = Router();

companiesRouter.get('/', authorize(MENU, 'READ'), asyncHandler(c.list));
companiesRouter.get('/:id', authorize(MENU, 'READ'), asyncHandler(c.get));
companiesRouter.post('/', authorize(MENU, 'CREATE'), asyncHandler(c.create));
companiesRouter.put('/:id', authorize(MENU, 'UPDATE'), asyncHandler(c.update));
companiesRouter.patch('/:id/status', authorize(MENU, 'UPDATE'), asyncHandler(c.setStatus));
companiesRouter.post('/:id/restore', authorize(MENU, 'UPDATE'), asyncHandler(c.restore));
companiesRouter.delete('/:id', authorize(MENU, 'DELETE'), asyncHandler(c.remove));
