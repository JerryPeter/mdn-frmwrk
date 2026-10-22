import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { AppError } from '../utils/errors.js';

/**
 * Wajib access token valid. Status user dibaca ulang dari database agar user
 * yang baru dinonaktifkan/dikunci langsung tertolak meskipun tokennya belum kedaluwarsa.
 * `allowMustChangePassword` hanya untuk endpoint /auth/* (BR-17).
 */
export function authenticate(options: { allowMustChangePassword?: boolean } = {}) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization ?? '';
      if (!header.startsWith('Bearer ')) {
        throw new AppError(401, 'UNAUTHENTICATED', 'Token tidak ditemukan. Silakan login terlebih dahulu.');
      }

      let claims;
      try {
        claims = verifyAccessToken(header.slice(7));
      } catch (err) {
        if (err instanceof jwt.TokenExpiredError) throw new AppError(401, 'TOKEN_EXPIRED', 'Sesi telah berakhir.');
        throw new AppError(401, 'UNAUTHENTICATED', 'Token tidak valid. Silakan login kembali.');
      }

      const user = await prisma.users.findFirst({
        where: { id: claims.sub, is_deleted: false },
        select: { id: true, username: true, is_active: true, is_locked: true, must_change_password: true },
      });
      if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Sesi tidak valid. Silakan login kembali.');
      if (!user.is_active) throw new AppError(401, 'ACCOUNT_INACTIVE', 'Akun Anda tidak aktif. Hubungi administrator.');
      if (user.is_locked) throw new AppError(401, 'ACCOUNT_LOCKED', 'Akun Anda terkunci. Hubungi administrator.');
      if (user.must_change_password && !options.allowMustChangePassword) {
        throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Anda wajib mengganti password terlebih dahulu.');
      }

      req.auth = { userId: user.id, username: user.username, ctx: claims.ctx ?? null };
      next();
    } catch (err) {
      next(err);
    }
  };
}
