import { z } from 'zod';
import { listQuerySchema } from '../../utils/pagination.js';
import { optionalText, queryBoolean } from '../../utils/validation.js';

/** Fase 1 hanya LOCAL yang dapat dipilih (PRD §8.9 [U]) */
export const AUTH_PROVIDERS = ['LOCAL', 'LDAP', 'SSO'] as const;

export const usernameSchema = z
  .string({ required_error: 'Username wajib diisi' })
  .trim()
  .toLowerCase()
  .min(3, 'Minimal 3 karakter')
  .max(100, 'Maksimal 100 karakter')
  .regex(/^[a-z0-9._]+$/, 'Username hanya boleh berisi huruf kecil, angka, titik, dan underscore');

/** Field yang dapat diedit (PRD §8.9; AD-06: email boleh diubah, username dikunci) */
const editableFields = {
  email: z
    .string({ required_error: 'Email wajib diisi' })
    .trim()
    .toLowerCase()
    .min(1, 'Email wajib diisi')
    .max(150, 'Maksimal 150 karakter')
    .email('Format email tidak valid'),
  full_name: z
    .string({ required_error: 'Nama lengkap wajib diisi' })
    .trim()
    .min(1, 'Nama lengkap wajib diisi')
    .max(200, 'Maksimal 200 karakter'),
  employee_no: optionalText(30),
  phone: optionalText(30),
};

const localOnly = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => v === 'LOCAL', 'Fase 1 hanya mendukung auth provider LOCAL');

export const createUserSchema = z
  .object({
    username: usernameSchema,
    ...editableFields,
    auth_provider: localOnly.default('LOCAL'),
    /** Kosong → sistem membangkitkan password acak yang ditampilkan sekali */
    password: z
      .string()
      .max(100, 'Maksimal 100 karakter')
      .nullish()
      .transform((v) => (v ? v : null)),
  })
  .strict();

/** PUT berisi seluruh field yang dapat diedit; username/auth_provider boleh dikirim asal tidak berubah */
export const updateUserSchema = z
  .object({
    username: z.string().trim().toLowerCase().optional(),
    auth_provider: z.string().trim().toUpperCase().optional(),
    ...editableFields,
  })
  .strict();

export const userStatusSchema = z
  .object({
    is_active: z.boolean({ required_error: 'is_active wajib diisi', invalid_type_error: 'is_active harus boolean' }),
  })
  .strict();

export const SORTABLE_COLUMNS = [
  'username',
  'full_name',
  'email',
  'employee_no',
  'auth_provider',
  'is_active',
  'is_locked',
  'last_login_at',
  'created_at',
  'updated_at',
] as const;

export const listUsersSchema = listQuerySchema(SORTABLE_COLUMNS, 'username').extend({
  is_locked: queryBoolean.optional(),
  auth_provider: z.enum(AUTH_PROVIDERS, { message: `Nilai yang diizinkan: ${AUTH_PROVIDERS.join(', ')}` }).optional(),
});

/** Export mengikuti filter list, tanpa paginasi */
export const exportUsersSchema = listUsersSchema.omit({ page: true, page_size: true });

export type CreateUserInput = z.output<typeof createUserSchema>;
export type UpdateUserInput = z.output<typeof updateUserSchema>;
export type ListUsersQuery = z.output<typeof listUsersSchema>;
export type UserFilter = z.output<typeof exportUsersSchema>;
