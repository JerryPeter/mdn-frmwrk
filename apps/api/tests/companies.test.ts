import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { connectRedis, redis } from '../src/config/redis.js';
import { invalidatePermissions } from '../src/lib/permissions.js';
import { bearer, tokenFor } from './helpers.js';

const app = createApp();
const api = () => request(app);

let superadmin: string; // konteks MDN / USRMGNT
let superadminDemo1: string; // konteks DEMO1 / USRMGNT
let auditor: string;
let mdnId: string;

beforeAll(async () => {
  await connectRedis();
  // auth.test.ts bisa lebih dulu mengganti password bc.staff; pastikan kondisi seed untuk test BR-17
  await prisma.users.updateMany({ where: { username: 'bc.staff' }, data: { must_change_password: true } });
  superadmin = await tokenFor('superadmin', 'MDN');
  superadminDemo1 = await tokenFor('superadmin', 'DEMO1');
  auditor = await tokenFor('auditor', 'MDN');
  mdnId = (await prisma.companies.findFirstOrThrow({ where: { company_code: 'MDN' } })).id;
});

afterAll(async () => {
  await invalidatePermissions.all();
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
});

describe('health', () => {
  it('GET /health → database & redis ok', async () => {
    const res = await api().get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'ok', database: 'ok', redis: 'ok' });
  });
});

describe('autentikasi & otorisasi', () => {
  it('tanpa token → 401 UNAUTHENTICATED', async () => {
    const res = await api().get('/api/v1/companies');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, error: { code: 'UNAUTHENTICATED' } });
  });

  it('token kedaluwarsa → 401 TOKEN_EXPIRED', async () => {
    const user = await prisma.users.findFirstOrThrow({ where: { username: 'superadmin' } });
    const expired = jwt.sign({ username: 'superadmin', exp: Math.floor(Date.now() / 1000) - 60 }, env.JWT_SECRET, { subject: user.id });
    const res = await api().get('/api/v1/companies').set(bearer(expired));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('token tanpa konteks → 403 CONTEXT_REQUIRED', async () => {
    const res = await api().get('/api/v1/companies').set(bearer(await tokenFor('superadmin', null)));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CONTEXT_REQUIRED');
  });

  it('konteks aplikasi selain USRMGNT → 403 FORBIDDEN', async () => {
    const res = await api().get('/api/v1/companies').set(bearer(await tokenFor('bc.admin', 'MDN', 'BILLCOST')));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('user wajib ganti password → 403 PASSWORD_CHANGE_REQUIRED (BR-17)', async () => {
    const res = await api().get('/api/v1/companies').set(bearer(await tokenFor('bc.staff', 'MDN', 'BILLCOST')));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('user terkunci → 401 ACCOUNT_LOCKED', async () => {
    const res = await api().get('/api/v1/companies').set(bearer(await tokenFor('locked.user', 'MDN', 'BILLCOST')));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('auditor (READ saja) POST /companies → 403 FORBIDDEN', async () => {
    const res = await api().post('/api/v1/companies').set(bearer(auditor)).send({ company_code: 'X1', company_name: 'X' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('GET /companies (list)', () => {
  it('superadmin melihat 3 company seed, urut kode, dengan meta paginasi', async () => {
    const res = await api().get('/api/v1/companies').set(bearer(superadmin));
    expect(res.status).toBe(200);
    expect(res.body.data.map((c: { company_code: string }) => c.company_code)).toEqual(['DEMO1', 'DEMO2', 'MDN']);
    expect(res.body.meta).toEqual({ page: 1, page_size: 20, total: 3 });
  });

  it('auditor boleh membaca list', async () => {
    const res = await api().get('/api/v1/companies').set(bearer(auditor));
    expect(res.status).toBe(200);
  });

  it('pencarian q tidak membedakan huruf besar/kecil', async () => {
    const res = await api().get('/api/v1/companies?q=modena').set(bearer(superadmin));
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].company_code).toBe('MDN');
  });

  it('paginasi dan sort desc', async () => {
    const res = await api().get('/api/v1/companies?page=2&page_size=2&sort_by=company_code&sort_dir=desc').set(bearer(superadmin));
    expect(res.body.data.map((c: { company_code: string }) => c.company_code)).toEqual(['DEMO1']);
    expect(res.body.meta).toEqual({ page: 2, page_size: 2, total: 3 });
  });

  it('parameter tidak valid → 400 VALIDATION_ERROR', async () => {
    const res = await api().get('/api/v1/companies?page_size=101&sort_by=password').set(bearer(superadmin));
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { field: string }) => d.field).sort()).toEqual(['page_size', 'sort_by']);
  });

  it('include_deleted tanpa permission UPDATE → 403', async () => {
    const res = await api().get('/api/v1/companies?include_deleted=true').set(bearer(auditor));
    expect(res.status).toBe(403);
  });
});

describe('GET /companies/:id', () => {
  it('detail company', async () => {
    const res = await api().get(`/api/v1/companies/${mdnId}`).set(bearer(superadmin));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ company_code: 'MDN', company_name: 'MODENA Indonesia', is_deleted: false });
  });

  it('id tidak ada → 404, id bukan UUID → 400', async () => {
    const missing = await api().get('/api/v1/companies/00000000-0000-0000-0000-000000000000').set(bearer(superadmin));
    expect(missing.status).toBe(404);
    const invalid = await api().get('/api/v1/companies/abc').set(bearer(superadmin));
    expect(invalid.status).toBe(400);
  });
});

describe('create, update, status, delete, restore', () => {
  let tstId: string;

  it('validasi field wajib dan format', async () => {
    const res = await api().post('/api/v1/companies').set(bearer(superadmin)).send({ email: 'bukan-email', company_code: 'AB-1' });
    expect(res.status).toBe(400);
    const fields = res.body.error.details.map((d: { field: string }) => d.field).sort();
    expect(fields).toEqual(['company_code', 'company_name', 'email']);
  });

  it('field tidak dikenal ditolak', async () => {
    const res = await api().post('/api/v1/companies').set(bearer(superadmin)).send({ company_code: 'X2', company_name: 'X', created_by: 'hacker' });
    expect(res.status).toBe(400);
  });

  it('create: kode dinormalisasi huruf besar, created_by dari JWT (BR-15)', async () => {
    const res = await api().post('/api/v1/companies').set(bearer(superadmin)).send({
      company_code: ' tst_01 ',
      company_name: 'Test Company',
      email: 'tst@example.com',
      short_name: '',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      company_code: 'TST_01',
      company_name: 'Test Company',
      short_name: null,
      created_by: 'superadmin',
      is_active: true,
      is_deleted: false,
    });
    tstId = res.body.data.id;
  });

  it('AC-11: kode yang sudah ada → 409 DUPLICATE', async () => {
    const res = await api().post('/api/v1/companies').set(bearer(superadmin)).send({ company_code: 'mdn', company_name: 'Duplikat' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'DUPLICATE', message: 'Kode company MDN sudah digunakan' });
  });

  it('update: updated_by & updated_at terisi; kode tidak dapat diubah', async () => {
    const ok = await api().put(`/api/v1/companies/${tstId}`).set(bearer(superadmin)).send({ company_code: 'TST_01', company_name: 'Test Company Baru', phone: '021-123' });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ company_name: 'Test Company Baru', phone: '021-123', email: null, updated_by: 'superadmin' });
    expect(ok.body.data.updated_at).not.toBeNull();

    const changeCode = await api().put(`/api/v1/companies/${tstId}`).set(bearer(superadmin)).send({ company_code: 'TST_99', company_name: 'X' });
    expect(changeCode.status).toBe(400);
    expect(changeCode.body.error.details[0]).toEqual({ field: 'company_code', message: 'Kode company tidak dapat diubah' });
  });

  it('auditor tidak dapat update', async () => {
    const res = await api().put(`/api/v1/companies/${tstId}`).set(bearer(auditor)).send({ company_name: 'X' });
    expect(res.status).toBe(403);
  });

  it('PATCH status: nonaktifkan lalu aktifkan', async () => {
    const off = await api().patch(`/api/v1/companies/${tstId}/status`).set(bearer(superadmin)).send({ is_active: false });
    expect(off.status).toBe(200);
    expect(off.body.data.is_active).toBe(false);
    const list = await api().get('/api/v1/companies?is_active=false').set(bearer(superadmin));
    expect(list.body.data.map((c: { company_code: string }) => c.company_code)).toEqual(['TST_01']);
    const on = await api().patch(`/api/v1/companies/${tstId}/status`).set(bearer(superadmin)).send({ is_active: true });
    expect(on.body.data.is_active).toBe(true);
    const bad = await api().patch(`/api/v1/companies/${tstId}/status`).set(bearer(superadmin)).send({ is_active: 'ya' });
    expect(bad.status).toBe(400);
  });

  it('BR-21: company yang masih dipakai tidak dapat dihapus, pesan menyebut jumlahnya', async () => {
    const res = await api().delete(`/api/v1/companies/${mdnId}`).set(bearer(superadmin));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('IN_USE');
    expect(res.body.error.message).toBe(
      'Company tidak dapat dihapus karena masih digunakan oleh 3 pemetaan aplikasi dan 8 keanggotaan group.',
    );
  });

  it('auditor tidak dapat menghapus', async () => {
    const res = await api().delete(`/api/v1/companies/${tstId}`).set(bearer(auditor));
    expect(res.status).toBe(403);
  });

  it('soft delete: deleted_by terisi, data tidak muncul di list/detail', async () => {
    const res = await api().delete(`/api/v1/companies/${tstId}`).set(bearer(superadmin));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ is_deleted: true, deleted_by: 'superadmin' });

    expect((await api().get(`/api/v1/companies/${tstId}`).set(bearer(superadmin))).status).toBe(404);
    const list = await api().get('/api/v1/companies').set(bearer(superadmin));
    expect(list.body.meta.total).toBe(3);
    const withDeleted = await api().get('/api/v1/companies?include_deleted=true').set(bearer(superadmin));
    expect(withDeleted.body.meta.total).toBe(4);

    // Data tetap ada di database (tidak dihapus permanen, BR-11)
    expect(await prisma.companies.count({ where: { id: tstId } })).toBe(1);
  });

  it('AC-12: kode dari company terhapus boleh dipakai ulang; restore yang lama → 409', async () => {
    const recreate = await api().post('/api/v1/companies').set(bearer(superadmin)).send({ company_code: 'TST_01', company_name: 'Pengganti' });
    expect(recreate.status).toBe(201);

    const restoreConflict = await api().post(`/api/v1/companies/${tstId}/restore`).set(bearer(superadmin));
    expect(restoreConflict.status).toBe(409);
    expect(restoreConflict.body.error.code).toBe('DUPLICATE');

    await api().delete(`/api/v1/companies/${recreate.body.data.id}`).set(bearer(superadmin));
    const restored = await api().post(`/api/v1/companies/${tstId}/restore`).set(bearer(superadmin));
    expect(restored.status).toBe(200);
    expect(restored.body.data).toMatchObject({ is_deleted: false, deleted_by: null, deleted_at: null, company_name: 'Test Company Baru' });

    const notDeleted = await api().post(`/api/v1/companies/${tstId}/restore`).set(bearer(superadmin));
    expect(notDeleted.status).toBe(422);
    expect(notDeleted.body.error.code).toBe('BUSINESS_RULE');
  });
});

describe('BR-22: invalidasi cache permission', () => {
  it('menonaktifkan company langsung mencabut akses di konteks company tersebut', async () => {
    // Isi cache permission superadmin @ MDN dan pastikan tersimpan di Redis
    expect((await api().get('/api/v1/companies').set(bearer(superadmin))).status).toBe(200);
    const userId = (await prisma.users.findFirstOrThrow({ where: { username: 'superadmin' } })).id;
    const appId = (await prisma.applications.findFirstOrThrow({ where: { app_code: 'USRMGNT' } })).id;
    expect(await redis.exists(`perm:${userId}:${mdnId}:${appId}`)).toBe(1);

    // Nonaktifkan MDN dari konteks DEMO1
    const off = await api().patch(`/api/v1/companies/${mdnId}/status`).set(bearer(superadminDemo1)).send({ is_active: false });
    expect(off.status).toBe(200);
    expect((await api().get('/api/v1/companies').set(bearer(superadmin))).status).toBe(403);

    // Aktifkan kembali → akses pulih
    await api().patch(`/api/v1/companies/${mdnId}/status`).set(bearer(superadminDemo1)).send({ is_active: true });
    expect((await api().get('/api/v1/companies').set(bearer(superadmin))).status).toBe(200);
  });
});
