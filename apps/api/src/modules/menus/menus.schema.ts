import { z } from 'zod';
import { listQuerySchema } from '../../utils/pagination.js';
import { optionalText, queryBoolean } from '../../utils/validation.js';

export const MENU_TYPES = ['GROUP', 'PAGE'] as const;

const menuName = z
  .string({ required_error: 'Nama menu wajib diisi' })
  .trim()
  .min(1, 'Nama menu wajib diisi')
  .max(150, 'Maksimal 150 karakter');

/** route_path: diawali "/", tanpa spasi; boleh berparameter, mis. /billcost/shipments/:id */
const routePath = optionalText(300).refine((v) => v === null || /^\/[^\s]*$/.test(v), 'Route harus diawali "/" dan tanpa spasi');

const sortOrder = z
  .number({ invalid_type_error: 'Urutan harus berupa angka' })
  .int('Urutan harus bilangan bulat')
  .min(0, 'Urutan minimal 0')
  .max(9999, 'Urutan maksimal 9999');

const isVisible = z.boolean({ invalid_type_error: 'is_visible harus boolean' });
const parentId = z.string().uuid('Parent tidak valid').nullish().transform((v) => v ?? null);

export const menuCodeSchema = z
  .string({ required_error: 'Kode menu wajib diisi' })
  .trim()
  .toUpperCase()
  .min(1, 'Kode menu wajib diisi')
  .max(50, 'Maksimal 50 karakter')
  .regex(/^[A-Z0-9_]+$/, 'Kode menu hanya boleh berisi huruf, angka, dan underscore');

/** PAGE wajib punya route; GROUP (folder) tidak boleh punya route (PRD §8.8) */
function routeRule(type: string, route: string | null, ctx: z.RefinementCtx) {
  if (type === 'PAGE' && !route) ctx.addIssue({ code: 'custom', path: ['route_path'], message: 'Route wajib diisi untuk menu PAGE' });
  if (type === 'GROUP' && route) ctx.addIssue({ code: 'custom', path: ['route_path'], message: 'Menu GROUP tidak memiliki route' });
}

export const createMenuSchema = z
  .object({
    application_id: z.string({ required_error: 'Aplikasi wajib dipilih' }).uuid('Aplikasi tidak valid'),
    parent_id: parentId,
    menu_code: menuCodeSchema,
    menu_name: menuName,
    menu_type: z.enum(MENU_TYPES, { message: 'Tipe menu harus GROUP atau PAGE' }),
    route_path: routePath,
    icon: optionalText(100),
    sort_order: sortOrder.default(0),
    is_visible: isVisible.default(true),
  })
  .strict()
  .superRefine((v, ctx) => routeRule(v.menu_type, v.route_path, ctx));

/**
 * PUT berisi seluruh field yang dapat diedit. application_id, menu_type, dan menu_code
 * boleh dikirim asal tidak berubah. Field opsional yang tidak dikirim tidak diubah.
 */
export const updateMenuSchema = z
  .object({
    application_id: z.string().uuid().optional(),
    menu_type: z.enum(MENU_TYPES).optional(),
    menu_code: z.string().trim().toUpperCase().optional(),
    parent_id: z.string().uuid('Parent tidak valid').nullable().optional(),
    menu_name: menuName,
    route_path: routePath,
    icon: optionalText(100),
    sort_order: sortOrder.optional(),
    is_visible: isVisible.optional(),
  })
  .strict();

export const menuStatusSchema = z
  .object({
    is_active: z.boolean({ required_error: 'is_active wajib diisi', invalid_type_error: 'is_active harus boolean' }),
  })
  .strict();

export const SORTABLE_COLUMNS = ['sort_order', 'menu_code', 'menu_name', 'menu_type', 'route_path', 'is_active', 'created_at', 'updated_at'] as const;

export const listMenusSchema = listQuerySchema(SORTABLE_COLUMNS, 'sort_order').extend({
  application_id: z.string().uuid('Aplikasi tidak valid').optional(),
  menu_type: z.enum(MENU_TYPES, { message: 'Tipe menu harus GROUP atau PAGE' }).optional(),
});

export const treeQuerySchema = z.object({ include_deleted: queryBoolean.default('false') });

export const menuActionsSchema = z
  .object({
    action_ids: z
      .array(z.string().uuid('ID action tidak valid'), { required_error: 'action_ids wajib diisi', invalid_type_error: 'action_ids harus berupa array' })
      .max(100, 'Maksimal 100 action'),
  })
  .strict();

export type CreateMenuInput = z.output<typeof createMenuSchema>;
export type UpdateMenuInput = z.output<typeof updateMenuSchema>;
export type ListMenusQuery = z.output<typeof listMenusSchema>;
