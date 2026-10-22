import { Router, type Request } from 'express';
import { z } from 'zod';
import { authorize } from '../../middlewares/authorize.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { ok } from '../../utils/response.js';
import { parse } from '../../utils/validation.js';
import { companyApplicationsService as service } from './company-applications.service.js';

const MENU = 'UM_COMPANY_APP';

const companyParam = z.object({ id: z.string().uuid('ID company tidak valid') });
const mappingParams = companyParam.extend({ applicationId: z.string().uuid('ID aplikasi tidak valid') });
const assignBody = z
  .object({ application_id: z.string({ required_error: 'Aplikasi wajib dipilih' }).uuid('ID aplikasi tidak valid') })
  .strict();

const username = (req: Request) => req.auth!.username; // BR-15

/**
 * /api/v1/companies/:id/applications (PRD §9.2). Dipasang di path /companies sebelum
 * companiesRouter; route lain di path itu diteruskan ke companiesRouter.
 */
export const companyApplicationsRouter = Router();

companyApplicationsRouter.get(
  '/:id/applications',
  authorize(MENU, 'READ'),
  asyncHandler(async (req, res) => ok(res, await service.list(parse(companyParam, req.params).id))),
);

companyApplicationsRouter.post(
  '/:id/applications',
  authorize(MENU, 'CREATE'),
  asyncHandler(async (req, res) => {
    const { id } = parse(companyParam, req.params);
    const { application_id } = parse(assignBody, req.body);
    return ok(res, await service.assign(id, application_id, username(req)), { status: 201, message: 'Aplikasi berhasil ditambahkan ke company' });
  }),
);

companyApplicationsRouter.delete(
  '/:id/applications/:applicationId',
  authorize(MENU, 'DELETE'),
  asyncHandler(async (req, res) => {
    const { id, applicationId } = parse(mappingParams, req.params);
    return ok(res, await service.unassign(id, applicationId, username(req)), { message: 'Aplikasi berhasil dilepas dari company' });
  }),
);
