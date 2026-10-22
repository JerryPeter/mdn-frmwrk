import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors.js';

/**
 * Helper bersama untuk tabel master dengan audit field standar
 * (soft delete, restore, cek data terkait, error kode duplikat).
 */

export const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/** 409 DUPLICATE dengan detail pada field kode (BR-12) */
export function duplicateCodeError(label: string, field: string, code: string) {
  const message = `Kode ${label} ${code} sudah digunakan`;
  return new AppError(409, 'DUPLICATE', message, [{ field, message }]);
}

/** Data untuk soft delete (BR-11); `deleted_by` diisi username login (BR-15) */
export const softDeleteData = (username: string) => ({
  is_deleted: true,
  deleted_by: username,
  deleted_at: new Date(),
  updated_by: username,
});

export const restoreData = (username: string) => ({
  is_deleted: false,
  deleted_by: null,
  deleted_at: null,
  updated_by: username,
});

export interface UsageCheck {
  /** Label jamak untuk pesan, mis. "pemetaan aplikasi" */
  label: string;
  /** Nama tabel turunan, dipakai sebagai `field` di detail error */
  table: string;
  count: number;
}

function joinIndonesian(parts: string[]) {
  if (parts.length <= 1) return parts.join('');
  if (parts.length === 2) return `${parts[0]} dan ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, dan ${parts[parts.length - 1]}`;
}

/** BR-21: tolak delete bila masih dipakai data turunan yang belum dihapus; pesan menyebut jumlahnya */
export function ensureNotInUse(entityLabel: string, checks: UsageCheck[]) {
  const used = checks.filter((c) => c.count > 0);
  if (!used.length) return;
  const message = `${entityLabel} tidak dapat dihapus karena masih digunakan oleh ${joinIndonesian(
    used.map((c) => `${c.count} ${c.label}`),
  )}.`;
  throw new AppError(422, 'IN_USE', message, used.map((c) => ({ field: c.table, message: `${c.count} data aktif` })));
}
