/** Kebijakan password BR-18 [U] — dipakai untuk validasi inline dan checklist */
export const PASSWORD_RULES: Array<{ key: string; label: string; test: (pwd: string) => boolean }> = [
  { key: 'length', label: 'Minimal 8 karakter', test: (p) => p.length >= 8 },
  { key: 'upper', label: 'Mengandung huruf besar (A-Z)', test: (p) => /[A-Z]/.test(p) },
  { key: 'lower', label: 'Mengandung huruf kecil (a-z)', test: (p) => /[a-z]/.test(p) },
  { key: 'digit', label: 'Mengandung angka (0-9)', test: (p) => /\d/.test(p) },
  { key: 'symbol', label: 'Mengandung simbol (mis. @ # $ !)', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

/** Kembalikan daftar pesan pelanggaran; kosong berarti valid */
export function validatePassword(newPassword: string, oldPassword?: string): string[] {
  const errors = PASSWORD_RULES.filter((r) => !r.test(newPassword)).map((r) => r.label);
  if (oldPassword && newPassword === oldPassword) errors.push('Tidak boleh sama dengan password lama');
  return errors;
}
