import type { NextFunction, Request, Response } from 'express';
import { getPermissionSet } from '../lib/permissions.js';
import { AppError } from '../utils/errors.js';

async function loadPermissions(req: Request) {
  if (req.permissions) return req.permissions;
  const ctx = req.auth?.ctx;
  if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Token tidak ditemukan. Silakan login terlebih dahulu.');
  if (!ctx) throw new AppError(403, 'CONTEXT_REQUIRED', 'Silakan pilih company dan aplikasi terlebih dahulu.');
  req.permissions = await getPermissionSet(req.auth.userId, ctx.company_id, ctx.application_id);
  return req.permissions;
}

/** Konteks aktif wajib aplikasi tertentu, mis. USRMGNT untuk endpoint master (PRD §9.2) */
export function requireApplication(appCode: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const perms = await loadPermissions(req);
      if (perms.appCode !== appCode) {
        throw new AppError(403, 'FORBIDDEN', `Endpoint ini hanya dapat diakses dari aplikasi ${appCode}.`);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** FR-AUTHZ-01: tolak 403 bila permission `menuCode:actionCode` tidak dimiliki */
export function authorize(menuCode: string, actionCode: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const perms = await loadPermissions(req);
      if (!perms.keys.has(`${menuCode}:${actionCode}`)) {
        throw new AppError(403, 'FORBIDDEN', 'Anda tidak memiliki akses untuk melakukan aksi ini.');
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Untuk pengecekan tambahan di controller, mis. include_deleted butuh UPDATE */
export function hasPermission(req: Request, menuCode: string, actionCode: string): boolean {
  return req.permissions?.keys.has(`${menuCode}:${actionCode}`) ?? false;
}
