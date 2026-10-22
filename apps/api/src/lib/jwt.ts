import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/** Claim access token (FR-AUTH-02) */
export interface AccessTokenClaims {
  sub: string; // user_id
  username: string;
  ctx?: { company_id: string; application_id: string };
}

export function signAccessToken(claims: AccessTokenClaims): string {
  const { sub, ...payload } = claims;
  return jwt.sign(payload, env.JWT_SECRET, {
    subject: sub,
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

/** Lempar TokenExpiredError / JsonWebTokenError bila token tidak valid */
export function verifyAccessToken(token: string): AccessTokenClaims {
  const decoded = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
  if (!decoded.sub || typeof decoded.username !== 'string') throw new jwt.JsonWebTokenError('Claim tidak lengkap');
  return { sub: decoded.sub, username: decoded.username, ctx: decoded.ctx };
}
