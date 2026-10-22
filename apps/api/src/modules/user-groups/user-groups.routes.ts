import { Router } from 'express';
import { authorize } from '../../middlewares/authorize.js';
import { asyncHandler } from '../../utils/async-handler.js';
import {
  MENU,
  groupMembersController as m,
  groupPermissionsController as p,
  userGroupsController as g,
} from './user-groups.controller.js';

/** /api/v1/user-groups – permission sesuai PRD §9.2 */
export const userGroupsRouter = Router();

// Group (UM_GROUP)
userGroupsRouter.get('/', authorize(MENU.group, 'READ'), asyncHandler(g.list));
userGroupsRouter.get('/:id', authorize(MENU.group, 'READ'), asyncHandler(g.get));
userGroupsRouter.post('/', authorize(MENU.group, 'CREATE'), asyncHandler(g.create));
userGroupsRouter.put('/:id', authorize(MENU.group, 'UPDATE'), asyncHandler(g.update));
userGroupsRouter.patch('/:id/status', authorize(MENU.group, 'UPDATE'), asyncHandler(g.setStatus));
userGroupsRouter.post('/:id/restore', authorize(MENU.group, 'UPDATE'), asyncHandler(g.restore));
userGroupsRouter.post('/:id/duplicate', authorize(MENU.group, 'CREATE'), asyncHandler(g.duplicate));
userGroupsRouter.delete('/:id', authorize(MENU.group, 'DELETE'), asyncHandler(g.remove));

// Anggota (UM_GROUP_MEMBER)
userGroupsRouter.get('/:id/members', authorize(MENU.member, 'READ'), asyncHandler(m.list));
userGroupsRouter.post('/:id/members', authorize(MENU.member, 'CREATE'), asyncHandler(m.create));
userGroupsRouter.put('/:id/members/:memberId', authorize(MENU.member, 'UPDATE'), asyncHandler(m.update));
userGroupsRouter.delete('/:id/members/:memberId', authorize(MENU.member, 'DELETE'), asyncHandler(m.remove));

// Permission matriks (UM_GROUP_PERM)
userGroupsRouter.get('/:id/permissions', authorize(MENU.permission, 'READ'), asyncHandler(p.matrix));
userGroupsRouter.put('/:id/permissions', authorize(MENU.permission, 'UPDATE'), asyncHandler(p.set));
