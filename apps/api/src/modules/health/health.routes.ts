import { Router } from 'express';
import { prisma } from '../../config/db.js';
import { redis } from '../../config/redis.js';
import { asyncHandler } from '../../utils/async-handler.js';

/** GET /api/v1/health – tanpa autentikasi (PRD §14 Tahap 1) */
export const healthRouter = Router();

healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    let database = 'ok';
    let cache = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'unavailable';
    }
    try {
      await redis.ping();
    } catch {
      cache = 'unavailable';
    }
    const healthy = database === 'ok';
    return res.status(healthy ? 200 : 503).json({
      success: healthy,
      data: { status: healthy ? 'ok' : 'degraded', database, redis: cache, time: new Date().toISOString() },
      message: healthy ? 'OK' : 'Database tidak tersedia',
    });
  }),
);
