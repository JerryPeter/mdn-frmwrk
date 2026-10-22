import { randomBytes } from 'node:crypto';
import { durationToSeconds, env } from '../config/env.js';
import { redis } from '../config/redis.js';
import { AppError } from '../utils/errors.js';

/**
 * Refresh token acak di Redis (FR-AUTH-02):
 *   refresh:{token}        → user_id (TTL REFRESH_EXPIRES_IN)
 *   user_refresh:{user_id} → set token milik user (untuk cabut semua)
 */
const ttl = () => durationToSeconds(env.REFRESH_EXPIRES_IN);
const tokenKey = (token: string) => `refresh:${token}`;
const userKey = (userId: string) => `user_refresh:${userId}`;

const unavailable = () =>
  new AppError(503, 'INTERNAL_ERROR', 'Layanan sesi sedang tidak tersedia. Coba beberapa saat lagi.');

export const refreshTokens = {
  async issue(userId: string): Promise<string> {
    const token = randomBytes(48).toString('base64url');
    try {
      await redis
        .multi()
        .set(tokenKey(token), userId, 'EX', ttl())
        .sadd(userKey(userId), token)
        .expire(userKey(userId), ttl())
        .exec();
    } catch {
      throw unavailable();
    }
    return token;
  },

  /** Ambil user_id pemilik token; null bila tidak ada / kedaluwarsa */
  async lookup(token: string): Promise<string | null> {
    try {
      return await redis.get(tokenKey(token));
    } catch {
      throw unavailable();
    }
  },

  async revoke(token: string) {
    try {
      const userId = await redis.get(tokenKey(token));
      const tx = redis.multi().del(tokenKey(token));
      if (userId) tx.srem(userKey(userId), token);
      await tx.exec();
    } catch {
      /* gagal cabut → token tetap kedaluwarsa sesuai TTL */
    }
  },

  /** Cabut seluruh refresh token user (ganti/reset password, nonaktif, kunci) */
  async revokeAll(userId: string) {
    try {
      const tokens = await redis.smembers(userKey(userId));
      const tx = redis.multi().del(userKey(userId));
      tokens.forEach((t) => tx.del(tokenKey(t)));
      await tx.exec();
    } catch {
      /* idem */
    }
  },

  ttlSeconds: ttl,
};
