import type { Response } from 'express';

export interface PageMeta {
  page: number;
  page_size: number;
  total: number;
}

/** Response sukses standar (PRD §9.1) */
export function ok<T>(res: Response, data: T, options: { status?: number; message?: string; meta?: PageMeta } = {}) {
  return res.status(options.status ?? 200).json({
    success: true,
    data,
    message: options.message ?? 'OK',
    ...(options.meta ? { meta: options.meta } : {}),
  });
}
