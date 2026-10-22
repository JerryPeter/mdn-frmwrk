import { z } from 'zod';
import { listQuerySchema } from '../../utils/pagination.js';
import { optionalText } from '../../utils/validation.js';

/** Field yang dapat diedit (PRD §8.7). `action_code` hanya diisi saat create. */
const editableFields = {
  action_name: z
    .string({ required_error: 'Nama action wajib diisi' })
    .trim()
    .min(1, 'Nama action wajib diisi')
    .max(100, 'Maksimal 100 karakter'),
  description: optionalText(2000),
};

const isDefault = z.boolean({ invalid_type_error: 'is_default harus boolean' });

const sortOrder = z
  .number({ invalid_type_error: 'Urutan harus berupa angka' })
  .int('Urutan harus bilangan bulat')
  .min(0, 'Urutan minimal 0')
  .max(9999, 'Urutan maksimal 9999');

export const actionCodeSchema = z
  .string({ required_error: 'Kode action wajib diisi' })
  .trim()
  .toUpperCase()
  .min(1, 'Kode action wajib diisi')
  .max(30, 'Maksimal 30 karakter')
  .regex(/^[A-Z_]+$/, 'Kode action hanya boleh berisi huruf dan underscore');

export const createActionSchema = z
  .object({ action_code: actionCodeSchema, ...editableFields, is_default: isDefault.default(false), sort_order: sortOrder.default(0) })
  .strict();

/**
 * PUT berisi seluruh field yang dapat diedit; action_code boleh dikirim asal tidak berubah.
 * is_default / sort_order yang tidak dikirim tidak diubah.
 */
export const updateActionSchema = z
  .object({
    action_code: z.string().trim().toUpperCase().optional(),
    ...editableFields,
    is_default: isDefault.optional(),
    sort_order: sortOrder.optional(),
  })
  .strict();

export const actionStatusSchema = z
  .object({
    is_active: z.boolean({ required_error: 'is_active wajib diisi', invalid_type_error: 'is_active harus boolean' }),
  })
  .strict();

export const SORTABLE_COLUMNS = ['sort_order', 'action_code', 'action_name', 'is_default', 'is_active', 'created_at', 'updated_at'] as const;

export const listActionsSchema = listQuerySchema(SORTABLE_COLUMNS, 'sort_order');

export type CreateActionInput = z.output<typeof createActionSchema>;
export type UpdateActionInput = z.output<typeof updateActionSchema>;
export type ListActionsQuery = z.output<typeof listActionsSchema>;
