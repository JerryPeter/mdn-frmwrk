import { z } from 'zod';
import { queryBoolean } from './validation.js';

/**
 * Schema query list standar (PRD §8.3): page, page_size (default 20, maks 100),
 * q, is_active, sort_by (dibatasi whitelist kolom), sort_dir, include_deleted.
 */
export function listQuerySchema<const T extends readonly [string, ...string[]]>(sortable: T, defaultSort: T[number]) {
  return z.object({
    page: z.coerce.number().int().min(1, 'Minimal 1').default(1),
    page_size: z.coerce.number().int().min(1, 'Minimal 1').max(100, 'Maksimal 100').default(20),
    q: z.string().trim().max(100, 'Maksimal 100 karakter').optional(),
    is_active: queryBoolean.optional(),
    sort_by: z.enum(sortable, { message: `Nilai yang diizinkan: ${sortable.join(', ')}` }).default(defaultSort as never),
    sort_dir: z.enum(['asc', 'desc'], { message: 'Nilai harus asc atau desc' }).default('asc'),
    include_deleted: queryBoolean.default('false'),
  });
}

export function pageArgs(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}
