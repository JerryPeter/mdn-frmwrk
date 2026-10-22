import { prisma } from '../config/db.js';
import { env } from '../config/env.js';
import { redis } from '../config/redis.js';

export interface PermissionSet {
  /** app_code konteks aktif; null bila user tidak punya permission apa pun di konteks ini */
  appCode: string | null;
  /** Permission key "MENU_CODE:ACTION_CODE" */
  keys: Set<string>;
}

const cacheKey = (userId: string, companyId: string, applicationId: string) =>
  `perm:${userId}:${companyId}:${applicationId}`;

/**
 * Hak akses efektif user pada konteks company + aplikasi (FR-AUTHZ-01).
 * Sumber: view usrmgnt.user_effective_permissions; di-cache di Redis.
 */
export async function getPermissionSet(userId: string, companyId: string, applicationId: string): Promise<PermissionSet> {
  const key = cacheKey(userId, companyId, applicationId);
  try {
    const cached = await redis.get(key);
    if (cached) {
      const parsed = JSON.parse(cached) as { appCode: string | null; keys: string[] };
      return { appCode: parsed.appCode, keys: new Set(parsed.keys) };
    }
  } catch {
    /* Redis tidak tersedia → baca langsung dari database */
  }

  const rows = await prisma.$queryRaw<Array<{ app_code: string; menu_code: string; action_code: string }>>`
    SELECT DISTINCT app_code, menu_code, action_code
      FROM usrmgnt.user_effective_permissions
     WHERE user_id = ${userId}::uuid
       AND company_id = ${companyId}::uuid
       AND application_id = ${applicationId}::uuid`;

  const result: PermissionSet = {
    appCode: rows[0]?.app_code ?? null,
    keys: new Set(rows.map((r) => `${r.menu_code}:${r.action_code}`)),
  };

  try {
    await redis.set(key, JSON.stringify({ appCode: result.appCode, keys: [...result.keys] }), 'EX', env.PERMISSION_CACHE_TTL);
  } catch {
    /* cache opsional */
  }
  return result;
}

/** Hapus cache yang cocok dengan pola (tanpa prefix; prefix ditambahkan otomatis) */
async function deleteByPattern(pattern: string) {
  try {
    const prefix = env.REDIS_KEY_PREFIX;
    let cursor = '0';
    do {
      // SCAN tidak menambahkan keyPrefix otomatis, jadi prefix ditulis manual
      const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}${pattern}`, 'COUNT', 500);
      cursor = next;
      if (keys.length) await redis.del(...keys.map((k) => k.slice(prefix.length)));
    } while (cursor !== '0');
  } catch {
    /* Redis tidak tersedia: cache akan kedaluwarsa sesuai TTL */
  }
}

/** BR-22: invalidasi cache permission */
export const invalidatePermissions = {
  user: (userId: string) => deleteByPattern(`perm:${userId}:*`),
  company: (companyId: string) => deleteByPattern(`perm:*:${companyId}:*`),
  application: (applicationId: string) => deleteByPattern(`perm:*:*:${applicationId}`),
  all: () => deleteByPattern('perm:*'),
};
