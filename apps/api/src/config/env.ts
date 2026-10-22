import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL wajib diisi'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_KEY_PREFIX: z.string().default(''),
  PERMISSION_CACHE_TTL: z.coerce.number().int().positive().default(600),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET minimal 32 karakter'),
  JWT_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/, 'Format durasi mis. 15m, 7d').default('15m'),
  REFRESH_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/, 'Format durasi mis. 15m, 7d').default('7d'),
  // Rate limit login per IP (PRD §11): default 10 request per 1 menit
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  LOGIN_RATE_WINDOW: z.string().regex(/^\d+[smhd]$/, 'Format durasi mis. 1m').default('1m'),
  // Express `trust proxy`: false (akses langsung), true, atau jumlah hop proxy (mis. 1 di belakang nginx)
  TRUST_PROXY: z
    .string()
    .default('false')
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : Number(v)))
    .refine((v) => typeof v === 'boolean' || (Number.isInteger(v) && v >= 0), 'Nilai true, false, atau jumlah hop'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Konfigurasi .env tidak valid:\n${issues}`);
}

export const env = {
  ...parsed.data,
  LOGIN_RATE_WINDOW_SECONDS: durationToSeconds(parsed.data.LOGIN_RATE_WINDOW),
};

/** Ubah durasi "15m" / "7d" menjadi detik */
export function durationToSeconds(value: string): number {
  const n = Number(value.slice(0, -1));
  const unit = value.slice(-1) as 's' | 'm' | 'h' | 'd';
  return n * { s: 1, m: 60, h: 3600, d: 86400 }[unit];
}
