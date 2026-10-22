import { z } from 'zod';
import { listQuerySchema } from '../../utils/pagination.js';
import { optionalText, queryBoolean } from '../../utils/validation.js';

export const groupCodeSchema = z
  .string({ required_error: 'Kode group wajib diisi' })
  .trim()
  .toUpperCase()
  .min(1, 'Kode group wajib diisi')
  .max(50, 'Maksimal 50 karakter')
  .regex(/^[A-Z0-9_]+$/, 'Kode group hanya boleh berisi huruf, angka, dan underscore');

/** Field yang dapat diedit (PRD §8.10); application_id & group_code hanya diisi saat create */
const editableFields = {
  group_name: z
    .string({ required_error: 'Nama group wajib diisi' })
    .trim()
    .min(1, 'Nama group wajib diisi')
    .max(150, 'Maksimal 150 karakter'),
  description: optionalText(2000),
};

const applicationId = z.string({ required_error: 'Aplikasi wajib dipilih' }).uuid('Aplikasi tidak valid');

export const createGroupSchema = z.object({ application_id: applicationId, group_code: groupCodeSchema, ...editableFields }).strict();

/** PUT: application_id & group_code boleh dikirim asal tidak berubah */
export const updateGroupSchema = z
  .object({
    application_id: z.string().optional(),
    group_code: z.string().trim().toUpperCase().optional(),
    ...editableFields,
  })
  .strict();

/** Duplikat group: aplikasi sama, permission disalin (PRD §8.10 [U]) */
export const duplicateGroupSchema = z.object({ group_code: groupCodeSchema, ...editableFields }).strict();

export const groupStatusSchema = z
  .object({
    is_active: z.boolean({ required_error: 'is_active wajib diisi', invalid_type_error: 'is_active harus boolean' }),
  })
  .strict();

export const SORTABLE_COLUMNS = ['group_code', 'group_name', 'is_active', 'created_at', 'updated_at'] as const;

export const listGroupsSchema = listQuerySchema(SORTABLE_COLUMNS, 'group_code').extend({
  application_id: z.string().uuid('Aplikasi tidak valid').optional(),
});

export type CreateGroupInput = z.output<typeof createGroupSchema>;
export type UpdateGroupInput = z.output<typeof updateGroupSchema>;
export type DuplicateGroupInput = z.output<typeof duplicateGroupSchema>;
export type ListGroupsQuery = z.output<typeof listGroupsSchema>;

// ---------------------------------------------------------------------
// Group members (PRD §8.11)
// ---------------------------------------------------------------------
const isoDate = (label: string) =>
  z
    .string({ invalid_type_error: `${label} tidak valid` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} harus berformat YYYY-MM-DD`)
    .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), `${label} tidak valid`);

const periodRule = (v: { valid_from?: string; valid_to?: string | null }, ctx: z.RefinementCtx) => {
  if (v.valid_from && v.valid_to && v.valid_to < v.valid_from) {
    ctx.addIssue({ code: 'custom', path: ['valid_to'], message: 'Berlaku sampai tidak boleh sebelum berlaku mulai' });
  }
};

export const createMemberSchema = z
  .object({
    user_id: z.string({ required_error: 'User wajib dipilih' }).uuid('User tidak valid'),
    company_id: z.string({ required_error: 'Company wajib dipilih' }).uuid('Company tidak valid'),
    /** Default hari ini (diisi service) */
    valid_from: isoDate('Berlaku mulai').optional(),
    valid_to: isoDate('Berlaku sampai').nullish().transform((v) => v ?? null),
  })
  .strict()
  .superRefine(periodRule);

/** Ubah: hanya valid_from, valid_to, is_active (PRD §8.11) */
export const updateMemberSchema = z
  .object({
    valid_from: isoDate('Berlaku mulai'),
    valid_to: isoDate('Berlaku sampai').nullish().transform((v) => v ?? null),
    is_active: z.boolean({ required_error: 'is_active wajib diisi', invalid_type_error: 'is_active harus boolean' }),
  })
  .strict()
  .superRefine(periodRule);

export const MEMBER_SORTABLE = ['username', 'full_name', 'company_code', 'valid_from', 'valid_to', 'created_at'] as const;

export const listMembersSchema = z.object({
  page: z.coerce.number().int().min(1, 'Minimal 1').default(1),
  page_size: z.coerce.number().int().min(1, 'Minimal 1').max(100, 'Maksimal 100').default(20),
  q: z.string().trim().max(100, 'Maksimal 100 karakter').optional(),
  company_id: z.string().uuid('Company tidak valid').optional(),
  is_active: queryBoolean.optional(),
  sort_by: z.enum(MEMBER_SORTABLE, { message: `Nilai yang diizinkan: ${MEMBER_SORTABLE.join(', ')}` }).default('username'),
  sort_dir: z.enum(['asc', 'desc'], { message: 'Nilai harus asc atau desc' }).default('asc'),
});

export const memberParams = z.object({
  id: z.string().uuid('ID tidak valid'),
  memberId: z.string().uuid('ID anggota tidak valid'),
});

export type CreateMemberInput = z.output<typeof createMemberSchema>;
export type UpdateMemberInput = z.output<typeof updateMemberSchema>;
export type ListMembersQuery = z.output<typeof listMembersSchema>;

// ---------------------------------------------------------------------
// Group permissions (PRD §8.12)
// ---------------------------------------------------------------------
export const setPermissionsSchema = z
  .object({
    menu_action_ids: z
      .array(z.string().uuid('ID menu action tidak valid'), {
        required_error: 'menu_action_ids wajib diisi',
        invalid_type_error: 'menu_action_ids harus berupa array',
      })
      .max(5000, 'Terlalu banyak permission'),
  })
  .strict();
