import type { Request, Response } from 'express';
import { hasPermission } from '../../middlewares/authorize.js';
import { AppError } from '../../utils/errors.js';
import { ok } from '../../utils/response.js';
import { parse, uuidParam } from '../../utils/validation.js';
import {
  companyStatusSchema,
  createCompanySchema,
  listCompaniesSchema,
  updateCompanySchema,
} from './companies.schema.js';
import { companiesService } from './companies.service.js';

export const MENU = 'UM_COMPANY';

const username = (req: Request) => req.auth!.username; // BR-15: audit dari JWT, bukan input client
const idOf = (req: Request) => parse(uuidParam, req.params).id;

export const companiesController = {
  async list(req: Request, res: Response) {
    const query = parse(listCompaniesSchema, req.query);
    if (query.include_deleted && !hasPermission(req, MENU, 'UPDATE')) {
      throw new AppError(403, 'FORBIDDEN', 'Melihat data terhapus membutuhkan hak akses UPDATE.');
    }
    const { items, meta } = await companiesService.list(query);
    return ok(res, items, { meta });
  },

  async get(req: Request, res: Response) {
    return ok(res, await companiesService.get(idOf(req)));
  },

  async create(req: Request, res: Response) {
    const input = parse(createCompanySchema, req.body);
    return ok(res, await companiesService.create(input, username(req)), { status: 201, message: 'Company berhasil dibuat' });
  },

  async update(req: Request, res: Response) {
    const id = idOf(req);
    const input = parse(updateCompanySchema, req.body);
    return ok(res, await companiesService.update(id, input, username(req)), { message: 'Company berhasil diperbarui' });
  },

  async setStatus(req: Request, res: Response) {
    const id = idOf(req);
    const { is_active } = parse(companyStatusSchema, req.body);
    const data = await companiesService.setStatus(id, is_active, username(req));
    return ok(res, data, { message: is_active ? 'Company diaktifkan' : 'Company dinonaktifkan' });
  },

  async remove(req: Request, res: Response) {
    return ok(res, await companiesService.remove(idOf(req), username(req)), { message: 'Company berhasil dihapus' });
  },

  async restore(req: Request, res: Response) {
    return ok(res, await companiesService.restore(idOf(req), username(req)), { message: 'Company berhasil dipulihkan' });
  },
};
