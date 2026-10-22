import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { redis } from '../config/redis.js';
import { AppError } from '../utils/errors.js';

interface RateLimitOptions {
  /** Nama bucket, bagian dari key Redis `ratelimit:{name}:{ip}` */
  name: string;
  /** Dibaca setiap request agar bisa diatur lewat env (dan diubah di test) */
  max: () => number;
  windowSeconds: () => number;
  message: (retryAfter: number) => string;
}

const keyOf = (name: string, ip: string) => `ratelimit:${name}:${ip}`;

/**
 * Rate limit fixed window per IP berbasis Redis (PRD §11, H9.2).
 * Bila Redis tidak tersedia, request tetap dilayani (fail-open); proteksi
 * per akun tetap berjalan lewat lockout 5 kali gagal login (BR-16).
 */
export function rateLimit({ name, max, windowSeconds, message }: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = keyOf(name, req.ip ?? 'unknown');
    const limit = max();
    let count: number;
    let ttl: number;
    try {
      // INCR + EXPIRE NX: jendela dimulai pada request pertama dan tidak diperpanjang request berikutnya
      const results = await redis.multi().incr(key).expire(key, windowSeconds(), 'NX').ttl(key).exec();
      if (!results || results.some(([err]) => err)) return next();
      count = results[0][1] as number;
      const remaining = results[2][1] as number;
      ttl = remaining > 0 ? remaining : windowSeconds();
    } catch {
      return next();
    }

    res.setHeader('RateLimit-Limit', limit);
    res.setHeader('RateLimit-Remaining', Math.max(0, limit - count));
    res.setHeader('RateLimit-Reset', ttl);
    if (count > limit) {
      res.setHeader('Retry-After', ttl);
      return next(new AppError(429, 'TOO_MANY_REQUESTS', message(ttl)));
    }
    next();
  };
}

/** Batas percobaan login per IP: LOGIN_RATE_LIMIT request per LOGIN_RATE_WINDOW */
export const loginRateLimit = rateLimit({
  name: 'login',
  max: () => env.LOGIN_RATE_LIMIT,
  windowSeconds: () => env.LOGIN_RATE_WINDOW_SECONDS,
  message: (s) => `Terlalu banyak percobaan login dari perangkat ini. Coba lagi dalam ${s} detik.`,
});
