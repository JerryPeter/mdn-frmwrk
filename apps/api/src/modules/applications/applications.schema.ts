import { z } from 'zod';
import { listQuerySchema } from '../../utils/pagination.js';
import { optionalText } from '../../utils/validation.js';

/** base_url boleh path relatif (mis. "/usrmgnt", seperti data seed) atau URL http(s) */
const isBaseUrl = (v: string) => /^\/[^\s]*$/.test(v) || z.string().url().safeParse(v).success;

/** Field yang dapat diedit (PRD §8.5). `app_code` hanya diisi saat create. */
const editableFields = {
  app_name: z
    .string({ required_error: 'Nama aplikasi wajib diisi' })
    .trim()
    .min(1, 'Nama aplikasi wajib diisi')
    .max(150, 'Maksimal 150 karakter'),
  description: optionalText(2000),
  base_url: optionalText(500).refine((v) => v === null || isBaseUrl(v), 'Isi dengan path (mis. /billcost) atau URL http(s)'),
  icon: optionalText(100),
};

const sortOrder = z
  .number({ invalid_type_error: 'Urutan harus berupa angka' })
  .int('Urutan harus bilangan bulat')
  .min(0, 'Urutan minimal 0')
  .max(9999, 'Urutan maksimal 9999');

export const appCodeSchema = z
  .string({ required_error: 'Kode aplikasi wajib diisi' })
  .trim()
  .toUpperCase()
  .min(1, 'Kode aplikasi wajib diisi')
  .max(30, 'Maksimal 30 karakter')
  .regex(/^[A-Z0-9_]+$/, 'Kode aplikasi hanya boleh berisi huruf, angka, dan underscore');

export const createApplicationSchema = z
  .object({ app_code: appCodeSchema, ...editableFields, sort_order: sortOrder.default(0) })
  .strict();

/**
 * PUT berisi seluruh field yang dapat diedit; app_code boleh dikirim asal tidak berubah.
 * sort_order yang tidak dikirim tidak diubah (bukan direset ke 0).
 */
export const updateApplicationSchema = z
  .object({ app_code: z.string().trim().toUpperCase().optional(), ...editableFields, sort_order: sortOrder.optional() })
  .strict();

export const applicationStatusSchema = z
  .object({
    is_active: z.boolean({ required_error: 'is_active wajib diisi', invalid_type_error: 'is_active harus boolean' }),
  })
  .strict();

export const SORTABLE_COLUMNS = ['sort_order', 'app_code', 'app_name', 'is_active', 'created_at', 'updated_at'] as const;

export const listApplicationsSchema = listQuerySchema(SORTABLE_COLUMNS, 'sort_order');

export type CreateApplicationInput = z.output<typeof createApplicationSchema>;
export type UpdateApplicationInput = z.output<typeof updateApplicationSchema>;
export type ListApplicationsQuery = z.output<typeof listApplicationsSchema>;
