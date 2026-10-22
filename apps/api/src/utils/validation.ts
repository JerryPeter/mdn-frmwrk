import { z, type ZodTypeAny } from 'zod';
import { validationError } from './errors.js';

// Pesan bawaan Zod dalam Bahasa Indonesia (PRD §11)
z.setErrorMap((issue, ctx) => {
  if (issue.code === z.ZodIssueCode.invalid_type) {
    if (issue.received === 'undefined' || issue.received === 'null') return { message: 'Wajib diisi' };
    return { message: `Tipe data tidak valid (diharapkan ${issue.expected})` };
  }
  if (issue.code === z.ZodIssueCode.unrecognized_keys) {
    return { message: `Field tidak dikenal: ${issue.keys.join(', ')}` };
  }
  return { message: ctx.defaultError };
});

/** Parse input dengan schema Zod; gagal → 400 VALIDATION_ERROR dengan detail per field */
export function parse<S extends ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw validationError(
      result.error.issues.map((i) => ({ field: i.path.join('.') || '(body)', message: i.message })),
    );
  }
  return result.data;
}

/** String opsional: dipangkas, string kosong menjadi null */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maksimal ${max} karakter`)
    .nullish()
    .transform((v) => (v ? v : null));

/** Query boolean dari string "true"/"false" */
export const queryBoolean = z
  .enum(['true', 'false'], { message: 'Nilai harus true atau false' })
  .transform((v) => v === 'true');

export const uuidParam = z.object({ id: z.string().uuid('ID tidak valid') });
