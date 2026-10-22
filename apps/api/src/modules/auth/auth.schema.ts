import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string({ required_error: 'Username wajib diisi' }).trim().min(1, 'Username wajib diisi').max(100),
  password: z.string({ required_error: 'Password wajib diisi' }).min(1, 'Password wajib diisi').max(200),
});

export const changePasswordSchema = z.object({
  old_password: z.string({ required_error: 'Password lama wajib diisi' }).min(1, 'Password lama wajib diisi'),
  new_password: z.string({ required_error: 'Password baru wajib diisi' }).min(1, 'Password baru wajib diisi').max(200),
  confirm_password: z.string({ required_error: 'Konfirmasi password wajib diisi' }).min(1, 'Konfirmasi password wajib diisi'),
});

export const selectContextSchema = z.object({
  company_id: z.string({ required_error: 'Company wajib dipilih' }).uuid('ID company tidak valid'),
  application_id: z.string({ required_error: 'Aplikasi wajib dipilih' }).uuid('ID aplikasi tidak valid'),
});
