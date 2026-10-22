import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors.js';

/** Ambil kode & pesan error PostgreSQL dari error Prisma yang tidak dikenali (mis. RAISE EXCEPTION trigger) */
function extractPostgresError(message: string): { code?: string; message?: string } {
  const code = /code: "([0-9A-Z]{5})"/.exec(message)?.[1];
  const msg = /message: "((?:[^"\\]|\\.)*)"/.exec(message)?.[1];
  return { code, message: msg };
}

/** Terjemahkan error database menjadi AppError (PRD §8.3) */
export function mapDatabaseError(err: unknown): AppError | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        return new AppError(409, 'DUPLICATE', 'Data dengan kode yang sama sudah digunakan.');
      case 'P2003':
        return new AppError(422, 'REFERENCE_NOT_FOUND', 'Data referensi tidak ditemukan.');
      case 'P2025':
        return new AppError(404, 'NOT_FOUND', 'Data tidak ditemukan.');
    }
  }
  if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    const pg = extractPostgresError(err.message);
    if (pg.code === 'P0001') return new AppError(422, 'BUSINESS_RULE', pg.message ?? 'Aturan bisnis dilanggar.');
    if (pg.code === '23505') return new AppError(409, 'DUPLICATE', 'Data dengan kode yang sama sudah digunakan.');
    if (pg.code === '23503') return new AppError(422, 'REFERENCE_NOT_FOUND', 'Data referensi tidak ditemukan.');
  }
  return null;
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, 'NOT_FOUND', `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan.`));
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  let appError = err instanceof AppError ? err : mapDatabaseError(err);

  // Body JSON rusak dari express.json()
  if (!appError && err instanceof SyntaxError && 'body' in err) {
    appError = new AppError(400, 'VALIDATION_ERROR', 'Format JSON tidak valid.');
  }

  if (!appError) {
    console.error('[error]', err);
    appError = new AppError(500, 'INTERNAL_ERROR', 'Terjadi kesalahan pada server.');
  }

  res.status(appError.status).json({
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details?.length ? { details: appError.details } : {}),
    },
  });
}
