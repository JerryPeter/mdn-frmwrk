import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/db.js';
import { connectRedis, redis } from '../src/config/redis.js';
import { invalidatePermissions } from '../src/lib/permissions.js';
import { bearer, tokenFor } from './helpers.js';

const app = createApp();
const api = () => request(app);
const PASSWORD = 'Modena@2026';
const STRONG = 'Rahasia#2026';

let superadmin: string;
let auditor: string;
let superadminId: string;

const login = (username: string, password = PASSWORD) => api().post('/api/v1/auth/login').send({ username, password });

const newUser = (suffix: string, extra: Record<string, unknown> = {}) => ({
  username: `test.${suffix}`,
  email: `test.${suffix}@example.com`,
  full_name: `Test User ${suffix}`,
  employee_no: `T-${suffix}`,
  ...extra,
});

async function createUser(suffix: string, extra: Record<string, unknown> = {}) {
  const res = await api().post('/api/v1/users').set(bearer(superadmin)).send(newUser(suffix, { password: STRONG, ...extra }));
  expect(res.status).toBe(201);
  return res.body.data as { id: string; username: string };
}

/** Workbook import dari baris data (header = kolom template) */
async function workbook(rows: Array<Record<string, string>>) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Users');
  sheet.addRow(['username', 'email', 'full_name', 'employee_no', 'phone', 'password']);
  rows.forEach((r) => sheet.addRow([r.username, r.email, r.full_name, r.employee_no, r.phone, r.password]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Supertest: kumpulkan body biner (xlsx) sebagai Buffer */
const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

beforeAll(async () => {
  await connectRedis();
  superadmin = await tokenFor('superadmin', 'MDN');
  auditor = await tokenFor('auditor', 'MDN');
  superadminId = (await prisma.users.findFirstOrThrow({ where: { username: 'superadmin' } })).id;
});

afterAll(async () => {
  // Kembalikan jumlah keanggotaan seed untuk file test berikutnya (database test dibangun ulang tiap run)
  await prisma.$executeRaw`
    DELETE FROM usrmgnt.user_group_members m USING usrmgnt.users u
     WHERE u.id = m.user_id AND (u.username LIKE 'test.%' OR u.username LIKE 'imp.%')`;
  await prisma.$executeRaw`
    DELETE FROM usrmgnt.user_group_permissions p USING usrmgnt.user_groups g
     WHERE g.id = p.user_group_id AND g.group_code = 'TEST_UADMIN'`;
  await prisma.user_groups.deleteMany({ where: { group_code: 'TEST_UADMIN' } });
  await invalidatePermissions.all();
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
});

describe('GET /users', () => {
  it('AC-16: list & detail tidak pernah berisi password_hash', async () => {
    const res = await api().get('/api/v1/users?page_size=100').set(bearer(superadmin));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(5);
    res.body.data.forEach((u: Record<string, unknown>) => expect(u).not.toHaveProperty('password_hash'));
    const detail = await api().get(`/api/v1/users/${superadminId}`).set(bearer(superadmin));
    expect(detail.body.data).not.toHaveProperty('password_hash');
    expect(detail.body.data.membership_count).toBe(2);
  });

  it('filter is_locked dan auth_provider', async () => {
    const locked = await api().get('/api/v1/users?is_locked=true').set(bearer(superadmin));
    expect(locked.body.data.map((u: { username: string }) => u.username)).toContain('locked.user');
    expect(locked.body.data.every((u: { is_locked: boolean }) => u.is_locked)).toBe(true);
    const ldap = await api().get('/api/v1/users?auth_provider=LDAP').set(bearer(superadmin));
    expect(ldap.body.data.map((u: { username: string }) => u.username)).toEqual(['bc.viewer']);
  });

  it('pencarian q mencakup email & nomor karyawan; sort last_login_at aman untuk NULL', async () => {
    const res = await api().get('/api/v1/users?q=EMP-0001').set(bearer(superadmin));
    expect(res.body.data.map((u: { username: string }) => u.username)).toEqual(['auditor']);
    const sorted = await api().get('/api/v1/users?sort_by=last_login_at&sort_dir=desc').set(bearer(superadmin));
    expect(sorted.status).toBe(200);
  });

  it('include_deleted tanpa UPDATE → 403', async () => {
    const res = await api().get('/api/v1/users?include_deleted=true').set(bearer(auditor));
    expect(res.status).toBe(403);
  });

  it('GET /users/:id/memberships → company, aplikasi, group, status', async () => {
    const res = await api().get(`/api/v1/users/${superadminId}/memberships`).set(bearer(auditor));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({
      company: { code: 'DEMO1' },
      application: { code: 'USRMGNT' },
      group: { code: 'SUPER_ADMIN' },
      status: 'active',
    });
  });
});

describe('POST /users', () => {
  it('AC-07: auditor → 403 FORBIDDEN', async () => {
    const res = await api().post('/api/v1/users').set(bearer(auditor)).send(newUser('forbidden'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('AC-15: password dibangkitkan, created_by = username login, wajib ganti password', async () => {
    const res = await api().post('/api/v1/users').set(bearer(superadmin)).send(newUser('gen', { username: 'Test.Gen' }));
    expect(res.status).toBe(201);
    const user = res.body.data;
    expect(user).toMatchObject({ username: 'test.gen', created_by: 'superadmin', must_change_password: true, auth_provider: 'LOCAL' });
    expect(user).not.toHaveProperty('password_hash');
    expect(user.generated_password).toMatch(/^.{12}$/);

    const loginRes = await login('test.gen', user.generated_password);
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.user.must_change_password).toBe(true);
  });

  it('password dari admin wajib memenuhi BR-18; tidak dikembalikan di response', async () => {
    const weak = await api().post('/api/v1/users').set(bearer(superadmin)).send(newUser('weak', { password: 'lemah' }));
    expect(weak.status).toBe(400);
    expect(weak.body.error.details.every((d: { field: string }) => d.field === 'password')).toBe(true);

    const ok = await api().post('/api/v1/users').set(bearer(superadmin)).send(newUser('own', { password: STRONG }));
    expect(ok.status).toBe(201);
    expect(ok.body.data.generated_password).toBeNull();
    expect((await login('test.own', STRONG)).status).toBe(200);
  });

  it('validasi format username, email, auth_provider', async () => {
    const res = await api()
      .post('/api/v1/users')
      .set(bearer(superadmin))
      .send({ username: 'ab', email: 'bukan-email', full_name: '', auth_provider: 'LDAP' });
    expect(res.status).toBe(400);
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['username', 'email', 'full_name', 'auth_provider']));
    const symbols = await api().post('/api/v1/users').set(bearer(superadmin)).send(newUser('x', { username: 'nama spasi!' }));
    expect(symbols.body.error.details[0].field).toBe('username');
  });

  it('BR-13: username & email duplikat (beda huruf besar/kecil) → 409 per field', async () => {
    const res = await api()
      .post('/api/v1/users')
      .set(bearer(superadmin))
      .send(newUser('dup', { username: 'AUDITOR', email: 'Auditor@Example.com' }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE');
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toEqual(['username', 'email']);
  });
});

describe('PUT /users/:id', () => {
  it('username tidak dapat diubah; email boleh diubah (AD-06), updated_by dari JWT', async () => {
    const user = await createUser('upd');
    const locked = await api()
      .put(`/api/v1/users/${user.id}`)
      .set(bearer(superadmin))
      .send(newUser('upd', { username: 'test.lain' }));
    expect(locked.status).toBe(400);
    expect(locked.body.error.details[0].field).toBe('username');

    const res = await api()
      .put(`/api/v1/users/${user.id}`)
      .set(bearer(superadmin))
      .send({ username: 'test.upd', email: 'baru.upd@example.com', full_name: 'Nama Baru', employee_no: '', phone: '0812' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ email: 'baru.upd@example.com', full_name: 'Nama Baru', employee_no: null, updated_by: 'superadmin' });

    const dup = await api()
      .put(`/api/v1/users/${user.id}`)
      .set(bearer(superadmin))
      .send({ email: 'auditor@example.com', full_name: 'Nama Baru' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.details[0].field).toBe('email');
  });
});

describe('status, lock, reset password', () => {
  it('BR-19: tidak dapat menonaktifkan, mengunci, atau menghapus akun sendiri', async () => {
    const status = await api().patch(`/api/v1/users/${superadminId}/status`).set(bearer(superadmin)).send({ is_active: false });
    const lock = await api().post(`/api/v1/users/${superadminId}/lock`).set(bearer(superadmin));
    const del = await api().delete(`/api/v1/users/${superadminId}`).set(bearer(superadmin));
    [status, lock, del].forEach((r) => {
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe('BUSINESS_RULE');
    });
  });

  it('lock → login ditolak ACCOUNT_LOCKED & sesi dicabut; unlock mereset failed_login_count', async () => {
    const user = await createUser('lock');
    const first = await login('test.lock', STRONG);
    const cookie = first.headers['set-cookie'];

    const lock = await api().post(`/api/v1/users/${user.id}/lock`).set(bearer(superadmin));
    expect(lock.status).toBe(200);
    expect(lock.body.data).toMatchObject({ is_locked: true });
    expect(lock.body.data.locked_at).toBeTruthy();
    expect((await login('test.lock', STRONG)).body.error.code).toBe('ACCOUNT_LOCKED');
    expect((await api().post('/api/v1/auth/refresh').set('Cookie', cookie)).status).toBe(401);

    const again = await api().post(`/api/v1/users/${user.id}/lock`).set(bearer(superadmin));
    expect(again.status).toBe(422);

    const unlock = await api().post(`/api/v1/users/${user.id}/unlock`).set(bearer(superadmin));
    expect(unlock.body.data).toMatchObject({ is_locked: false, locked_at: null, failed_login_count: 0 });
    expect((await login('test.lock', STRONG)).status).toBe(200);
  });

  it('nonaktif → login ditolak ACCOUNT_INACTIVE; aktifkan kembali', async () => {
    const user = await createUser('inactive');
    const off = await api().patch(`/api/v1/users/${user.id}/status`).set(bearer(superadmin)).send({ is_active: false });
    expect(off.body.data.is_active).toBe(false);
    expect((await login('test.inactive', STRONG)).body.error.code).toBe('ACCOUNT_INACTIVE');
    await api().patch(`/api/v1/users/${user.id}/status`).set(bearer(superadmin)).send({ is_active: true });
    expect((await login('test.inactive', STRONG)).status).toBe(200);
  });

  it('reset password: password acak, wajib ganti, password lama tidak berlaku', async () => {
    const user = await createUser('reset');
    await prisma.users.update({ where: { id: user.id }, data: { must_change_password: false } });
    const res = await api().post(`/api/v1/users/${user.id}/reset-password`).set(bearer(superadmin));
    expect(res.status).toBe(200);
    expect(res.body.data.must_change_password).toBe(true);
    expect(res.body.data).not.toHaveProperty('password_hash');
    expect((await login('test.reset', STRONG)).body.error.code).toBe('INVALID_CREDENTIALS');
    expect((await login('test.reset', res.body.data.generated_password)).status).toBe(200);
  });

  it('reset password user LDAP → 422; reset akun sendiri → 422', async () => {
    const ldap = await prisma.users.findFirstOrThrow({ where: { username: 'bc.viewer' } });
    expect((await api().post(`/api/v1/users/${ldap.id}/reset-password`).set(bearer(superadmin))).status).toBe(422);
    expect((await api().post(`/api/v1/users/${superadminId}/reset-password`).set(bearer(superadmin))).status).toBe(422);
  });
});

describe('BR-20: anggota terakhir SUPER_ADMIN', () => {
  it('tidak dapat dihapus, dinonaktifkan, atau dikunci oleh admin lain', async () => {
    // Admin user lain dengan hak UM_USER lewat group terpisah (bukan SUPER_ADMIN)
    const admin = await createUser('uadmin');
    await prisma.users.update({ where: { id: admin.id }, data: { must_change_password: false } });
    await prisma.$executeRaw`
      WITH g AS (
        INSERT INTO usrmgnt.user_groups (application_id, group_code, group_name, created_by)
        SELECT id, 'TEST_UADMIN', 'Test User Admin', 'test' FROM usrmgnt.applications WHERE app_code = 'USRMGNT'
        RETURNING id
      ), p AS (
        INSERT INTO usrmgnt.user_group_permissions (user_group_id, menu_action_id, created_by)
        SELECT g.id, ma.id, 'test'
          FROM g, usrmgnt.menu_actions ma JOIN usrmgnt.menus m ON m.id = ma.menu_id
         WHERE m.menu_code = 'UM_USER' AND ma.is_deleted = false
      )
      INSERT INTO usrmgnt.user_group_members (user_id, user_group_id, company_id, created_by)
      SELECT ${admin.id}::uuid, g.id, c.id, 'test' FROM g, usrmgnt.companies c WHERE c.company_code = 'MDN'`;
    const token = await tokenFor('test.uadmin', 'MDN');

    const del = await api().delete(`/api/v1/users/${superadminId}`).set(bearer(token));
    const off = await api().patch(`/api/v1/users/${superadminId}/status`).set(bearer(token)).send({ is_active: false });
    const lock = await api().post(`/api/v1/users/${superadminId}/lock`).set(bearer(token));
    [del, off, lock].forEach((r) => {
      expect(r.status).toBe(422);
      expect(r.body.error.message).toContain('SUPER_ADMIN');
    });
    // User biasa tetap dapat dikunci oleh admin ini
    const other = await createUser('bylock');
    expect((await api().post(`/api/v1/users/${other.id}/lock`).set(bearer(token))).status).toBe(200);
  });
});

describe('DELETE & restore', () => {
  it('hapus user ikut menghapus keanggotaan; restore memulihkannya', async () => {
    const user = await createUser('del');
    const group = await prisma.user_groups.findFirstOrThrow({ where: { group_code: 'UM_AUDITOR' } });
    const mdn = await prisma.companies.findFirstOrThrow({ where: { company_code: 'MDN' } });
    await prisma.user_group_members.create({
      data: { user_id: user.id, user_group_id: group.id, company_id: mdn.id, created_by: 'test' },
    });

    const del = await api().delete(`/api/v1/users/${user.id}`).set(bearer(superadmin));
    expect(del.status).toBe(200);
    expect(del.body.data).toMatchObject({ is_deleted: true, deleted_by: 'superadmin' });
    expect(await prisma.user_group_members.count({ where: { user_id: user.id, is_deleted: false } })).toBe(0);
    expect((await api().get(`/api/v1/users/${user.id}`).set(bearer(superadmin))).status).toBe(404);
    expect((await login('test.del', STRONG)).status).toBe(401);

    const restore = await api().post(`/api/v1/users/${user.id}/restore`).set(bearer(superadmin));
    expect(restore.status).toBe(200);
    expect(restore.body.data).toMatchObject({ is_deleted: false, restored_memberships: 1 });
    expect(await prisma.user_group_members.count({ where: { user_id: user.id, is_deleted: false } })).toBe(1);
  });

  it('restore gagal bila username sudah dipakai user aktif lain', async () => {
    const user = await createUser('reuse');
    await api().delete(`/api/v1/users/${user.id}`).set(bearer(superadmin));
    await createUser('reuse', { email: 'reuse.kedua@example.com' }); // username boleh dipakai ulang (BR-12)
    const res = await api().post(`/api/v1/users/${user.id}/restore`).set(bearer(superadmin));
    expect(res.status).toBe(409);
    expect(res.body.error.details[0].field).toBe('username');
  });
});

describe('export & import Excel', () => {
  it('auditor dapat export; kolom sesuai PRD, mengikuti filter', async () => {
    const res = await api().get('/api/v1/users/export?q=bc.').set(bearer(auditor)).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const sheet = wb.getWorksheet('Users')!;
    expect(sheet.getRow(1).values).toEqual([
      undefined,
      'username',
      'full_name',
      'email',
      'employee_no',
      'auth_provider',
      'is_active',
      'is_locked',
      'last_login_at',
    ]);
    const usernames = sheet.getColumn(1).values.slice(2);
    expect(usernames).toEqual(['bc.admin', 'bc.staff', 'bc.viewer']);
  });

  it('auditor tidak dapat import (tanpa IMPORT_EXCEL) → 403', async () => {
    expect((await api().get('/api/v1/users/import/template').set(bearer(auditor))).status).toBe(403);
  });

  it('template dapat diunduh', async () => {
    const res = await api().get('/api/v1/users/import/template').set(bearer(superadmin)).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    expect(wb.getWorksheet('Users')!.getRow(1).values).toEqual([
      undefined,
      'username',
      'email',
      'full_name',
      'employee_no',
      'phone',
      'password',
    ]);
    expect(wb.getWorksheet('Petunjuk')).toBeTruthy();
  });

  it('all-or-nothing: satu baris tidak valid → tidak ada yang disimpan, error per baris', async () => {
    const file = await workbook([
      { username: 'imp.satu', email: 'imp.satu@example.com', full_name: 'Import Satu' },
      { username: 'Imp Dua!', email: 'imp.dua@example.com', full_name: 'Import Dua' },
      { username: 'imp.tiga', email: 'imp.satu@example.com', full_name: 'Import Tiga', password: 'lemah' },
      { username: 'auditor', email: 'imp.empat@example.com', full_name: 'Import Empat' },
    ]);
    const res = await api()
      .post('/api/v1/users/import')
      .set(bearer(superadmin))
      .attach('file', file, 'users.xlsx');
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('3 dari 4 baris');
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['3.username', '4.password', '4.email', '5.username']));
    expect(await prisma.users.count({ where: { username: 'imp.satu' } })).toBe(0);
  });

  it('semua baris valid → tersimpan dalam satu transaksi, password bangkitan dikembalikan', async () => {
    const file = await workbook([
      { username: 'imp.ok1', email: 'imp.ok1@example.com', full_name: 'Import OK 1', employee_no: '00123' },
      { username: 'imp.ok2', email: 'imp.ok2@example.com', full_name: 'Import OK 2', password: STRONG },
    ]);
    const res = await api().post('/api/v1/users/import').set(bearer(superadmin)).attach('file', file, 'users.xlsx');
    expect(res.status).toBe(201);
    expect(res.body.data.imported).toBe(2);
    const [one, two] = res.body.data.users;
    expect(one.generated_password).toBeTruthy();
    expect(two.generated_password).toBeNull();
    const saved = await prisma.users.findFirstOrThrow({ where: { username: 'imp.ok1' } });
    expect(saved).toMatchObject({ employee_no: '00123', created_by: 'superadmin', must_change_password: true });
    expect((await login('imp.ok1', one.generated_password)).status).toBe(200);
  });

  it('file bukan .xlsx / tanpa file → 400', async () => {
    const wrong = await api()
      .post('/api/v1/users/import')
      .set(bearer(superadmin))
      .attach('file', Buffer.from('a,b'), 'users.csv');
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.details[0].field).toBe('file');
    const none = await api().post('/api/v1/users/import').set(bearer(superadmin));
    expect(none.status).toBe(400);
  });
});

describe('GET /lookups/users', () => {
  it('hanya user aktif, field ringkas', async () => {
    const res = await api().get('/api/v1/lookups/users?q=user').set(bearer(auditor));
    expect(res.status).toBe(200);
    const codes = res.body.data.map((u: { code: string }) => u.code);
    expect(codes).toContain('locked.user');
    expect(codes).not.toContain('inactive.user');
    expect(Object.keys(res.body.data[0]).sort()).toEqual(['code', 'email', 'id', 'name']);
  });
});
