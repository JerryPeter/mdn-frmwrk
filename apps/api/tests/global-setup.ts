/**
 * Bangun ulang database test (TEST_DB_NAME) dari database/*.sql sebelum test berjalan,
 * sehingga setiap run dimulai dari kondisi seed yang sama. Database dev tidak disentuh.
 */
import 'dotenv/config';
import { resetDatabase } from '../scripts/reset-db.js';

export default async function setup() {
  const testDb = process.env.TEST_DB_NAME || 'modena_test';
  if (testDb === process.env.DB_NAME) throw new Error('TEST_DB_NAME tidak boleh sama dengan DB_NAME.');
  await resetDatabase(testDb);
}
