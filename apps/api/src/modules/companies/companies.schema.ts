import { z } from 'zod';
import { listQuerySchema } from '../../utils/pagination.js';
import { optionalText } from '../../utils/validation.js';

/** Field yang dapat diedit (PRD §8.4). `company_code` hanya diisi saat create. */
const editableFields = {
  company_name: z
    .string({ required_error: 'Nama company wajib diisi' })
    .trim()
    .min(1, 'Nama company wajib diisi')
    .max(200, 'Maksimal 200 karakter'),
  short_name: optionalText(50),
  tax_number: optionalText(30),
  address: optionalText(2000),
  phone: optionalText(30),
  email: optionalText(150).refine((v) => v === null || z.string().email().safeParse(v).success, 'Format email tidak valid'),
  logo_url: optionalText(500).refine((v) => v === null || z.string().url().safeParse(v).success, 'Format URL tidak valid'),
};

export const companyCodeSchema = z
  .string({ required_error: 'Kode company wajib diisi' })
  .trim()
  .toUpperCase()
  .min(1, 'Kode company wajib diisi')
  .max(20, 'Maksimal 20 karakter')
  .regex(/^[A-Z0-9_]+$/, 'Kode company hanya boleh berisi huruf, angka, dan underscore');

export const createCompanySchema = z.object({ company_code: companyCodeSchema, ...editableFields }).strict();

/** PUT berisi seluruh field yang dapat diedit; company_code boleh dikirim asal tidak berubah */
export const updateCompanySchema = z
  .object({ company_code: z.string().trim().toUpperCase().optional(), ...editableFields })
  .strict();

export const companyStatusSchema = z.object({
  is_active: z.boolean({ required_error: 'is_active wajib diisi', invalid_type_error: 'is_active harus boolean' }),
}).strict();

export const SORTABLE_COLUMNS = ['company_code', 'company_name', 'short_name', 'is_active', 'created_at', 'updated_at'] as const;

export const listCompaniesSchema = listQuerySchema(SORTABLE_COLUMNS, 'company_code');

export type CreateCompanyInput = z.output<typeof createCompanySchema>;
export type UpdateCompanyInput = z.output<typeof updateCompanySchema>;
export type ListCompaniesQuery = z.output<typeof listCompaniesSchema>;
