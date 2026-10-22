/**
 * Bangun ulang database dari database/01_user_management.sql + 02_seed_sample_data.sql.
 * SEMUA DATA DI DATABASE TERSEBUT AKAN HILANG.
 *
 *   npm run db:reset -- modena_test         # database test (bebas)
 *   npm run db:reset -- modena --yes        # database lain wajib --yes
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const sqlFile = (name: string) => fileURLToPath(new URL(`../../../database/${name}`, import.meta.url));

export async function resetDatabase(dbName: string) {
  if (!/^[a-z0-9_]+$/.test(dbName)) throw new Error('Nama database hanya boleh huruf kecil, angka, underscore.');
  const conn = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  };

  const admin = new pg.Client({ ...conn, database: 'postgres' });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${dbName} ENCODING 'UTF8' TEMPLATE template0`);
  } finally {
    await admin.end();
  }

  const db = new pg.Client({ ...conn, database: dbName });
  await db.connect();
  try {
    await db.query(await readFile(sqlFile('01_user_management.sql'), 'utf8'));
    await db.query(await readFile(sqlFile('02_seed_sample_data.sql'), 'utf8'));
  } finally {
    await db.end();
  }
}

// Dijalankan langsung dari CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [dbName, flag] = process.argv.slice(2);
  const testDb = process.env.TEST_DB_NAME || 'modena_test';
  if (!dbName) {
    console.error('Pemakaian: npm run db:reset -- <nama_database> [--yes]');
    process.exit(1);
  }
  if (dbName !== testDb && flag !== '--yes') {
    console.error(`Database "${dbName}" bukan database test. Seluruh datanya akan hilang. Tambahkan --yes bila yakin.`);
    process.exit(1);
  }
  await resetDatabase(dbName);
  console.log(`Database ${dbName} dibangun ulang dari DDL + seed.`);
}
