import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';

const BCRYPT_COST = 10; // sesuai hash di data seed

/** Kebijakan password BR-18 [U]; label sama dengan checklist di frontend */
const RULES: Array<{ test: (p: string) => boolean; message: string }> = [
  { test: (p) => p.length >= 8, message: 'Minimal 8 karakter' },
  { test: (p) => /[A-Z]/.test(p), message: 'Mengandung huruf besar (A-Z)' },
  { test: (p) => /[a-z]/.test(p), message: 'Mengandung huruf kecil (a-z)' },
  { test: (p) => /\d/.test(p), message: 'Mengandung angka (0-9)' },
  { test: (p) => /[^A-Za-z0-9]/.test(p), message: 'Mengandung simbol (mis. @ # $ !)' },
];

/** Daftar pelanggaran kebijakan; kosong berarti valid */
export function passwordPolicyViolations(newPassword: string, oldPassword?: string): string[] {
  const errors = RULES.filter((r) => !r.test(newPassword)).map(
    (r) => `Password belum memenuhi kebijakan: ${r.message.charAt(0).toLowerCase()}${r.message.slice(1)}`,
  );
  if (oldPassword !== undefined && newPassword === oldPassword) errors.push('Tidak boleh sama dengan password lama');
  return errors;
}

// Tanpa karakter yang mudah tertukar (0/O, 1/l/I) agar mudah disalin dari layar
const CHARSETS = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '@#$%&*!?'];

/** Password acak yang memenuhi BR-18 (create tanpa password, reset password, import) */
export function generatePassword(length = 12): string {
  const all = CHARSETS.join('');
  const chars = CHARSETS.map((set) => set[randomInt(set.length)]);
  while (chars.length < length) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export const hashPassword =(password: string) => bcrypt.hash(password, BCRYPT_COST);

export const verifyPassword = (password: string, hash: string | null) =>
  hash ? bcrypt.compare(password, hash) : Promise.resolve(false);
