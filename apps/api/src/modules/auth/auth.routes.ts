import { Router, type Request, type Response } from 'express';
import { env } from '../../config/env.js';
import { refreshTokens } from '../../lib/refresh-tokens.js';
import { authenticate } from '../../middlewares/auth.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { AppError } from '../../utils/errors.js';
import { ok } from '../../utils/response.js';
import { parse } from '../../utils/validation.js';
import { changePasswordSchema, loginSchema, selectContextSchema } from './auth.schema.js';
import { authService } from './auth.service.js';

/** Refresh token dikirim via cookie httpOnly (FR-AUTH-02) */
const REFRESH_COOKIE = 'refresh_token';
const COOKIE_PATH = '/api/v1/auth';

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: COOKIE_PATH,
    maxAge: refreshTokens.ttlSeconds() * 1000,
  });
}

const readRefreshCookie = (req: Request): string | undefined => req.cookies?.[REFRESH_COOKIE];

function requireCtx(req: Request) {
  const ctx = req.auth?.ctx;
  if (!ctx) throw new AppError(403, 'CONTEXT_REQUIRED', 'Silakan pilih company dan aplikasi terlebih dahulu.');
  return ctx;
}

/** /api/v1/auth – cukup token valid (PRD §9.2) */
export const authRouter = Router();

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = parse(loginSchema, req.body);
    const { refreshToken, body } = await authService.login(username, password);
    setRefreshCookie(res, refreshToken);
    return ok(res, body, { message: 'Login berhasil' });
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken, body } = await authService.refresh(readRefreshCookie(req));
    setRefreshCookie(res, refreshToken);
    return ok(res, body);
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await authService.logout(readRefreshCookie(req));
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
    return ok(res, null, { message: 'Logout berhasil' });
  }),
);

// /me dan /change-password tetap bisa diakses saat wajib ganti password (BR-17)
authRouter.get(
  '/me',
  authenticate({ allowMustChangePassword: true }),
  asyncHandler(async (req, res) => ok(res, await authService.me(req.auth!.userId, req.auth!.ctx))),
);

authRouter.post(
  '/change-password',
  authenticate({ allowMustChangePassword: true }),
  asyncHandler(async (req, res) => {
    const input = parse(changePasswordSchema, req.body);
    const { refreshToken, body } = await authService.changePassword(req.auth!.userId, input);
    setRefreshCookie(res, refreshToken);
    return ok(res, body, { message: 'Password berhasil diganti' });
  }),
);

authRouter.get(
  '/contexts',
  authenticate(),
  asyncHandler(async (req, res) => ok(res, await authService.contexts(req.auth!.userId))),
);

authRouter.post(
  '/context',
  authenticate(),
  asyncHandler(async (req, res) => {
    const { company_id, application_id } = parse(selectContextSchema, req.body);
    return ok(res, await authService.selectContext(req.auth!.userId, req.auth!.username, company_id, application_id));
  }),
);

authRouter.get(
  '/menus',
  authenticate(),
  asyncHandler(async (req, res) => {
    const ctx = requireCtx(req);
    return ok(res, await authService.menus(req.auth!.userId, ctx.company_id, ctx.application_id));
  }),
);

authRouter.get(
  '/permissions',
  authenticate(),
  asyncHandler(async (req, res) => {
    const ctx = requireCtx(req);
    return ok(res, await authService.permissions(req.auth!.userId, ctx.company_id, ctx.application_id));
  }),
);
