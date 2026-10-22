import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/db.js';
import { connectRedis, redis } from '../src/config/redis.js';
import { invalidatePermissions } from '../src/lib/permissions.js';
import { bearer, tokenFor } from './helpers.js';

const app = createApp();
const api = () => request(app);
const URL = '/api/v1/applications';

let superadmin: string;
let auditor: string;
let usrmgntId: string;
let billcostId: string;

const codes = (res: request.Response) => res.body.data.map((a: { app_code: string }) => a.app_code);

beforeAll(async () => {
  await connectRedis();
  superadmin = await tokenFor('superadmin', 'MDN');
  auditor = await tokenFor('auditor', 'MDN');
  usrmgntId = (await prisma.applications.findFirstOrThrow({ where: { app_code: 'USRMGNT' } })).id;
  billcostId = (await prisma.applications.findFirstOrThrow({ where: { app_code: 'BILLCOST' } })).id;
});

afterAll(async () => {
  await invalidatePermissions.all();
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
});

describe('otorisasi', () => {
  it('tanpa token → 401; auditor boleh baca tetapi tidak boleh menulis', async () => {
    expect((await api().get(URL)).status).toBe(401);
    expect((await api().get(URL).set(bearer(auditor))).status).toBe(200);
    const create = await api().post(URL).set(bearer(auditor)).send({ app_code: 'X', app_name: 'X' });
    expect(create.status).toBe(403);
    expect((await api().patch(`${URL}/${billcostId}/status`).set(bearer(auditor)).send({ is_active: false })).status).toBe(403);
    expect((await api().delete(`${URL}/${billcostId}`).set(bearer(auditor))).status).toBe(403);
    expect((await api().get(`${URL}?include_deleted=true`).set(bearer(auditor))).status).toBe(403);
  });
});

describe('GET /applications', () => {
  it('default urut sort_order, dengan meta paginasi', async () => {
    const res = await api().get(URL).set(bearer(superadmin));
    expect(res.status).toBe(200);
    expect(codes(res)).toEqual(['USRMGNT', 'BILLCOST', 'INVDEMO']);
    expect(res.body.meta).toEqual({ page: 1, page_size: 20, total: 3 });
    expect(res.body.data.map((a: { is_protected: boolean }) => a.is_protected)).toEqual([true, false, false]);
  });

  it('pencarian q pada kode, nama, dan deskripsi', async () => {
    expect(codes(await api().get(`${URL}?q=billing`).set(bearer(superadmin)))).toEqual(['BILLCOST']);
    expect(codes(await api().get(`${URL}?q=multi-aplikasi`).set(bearer(superadmin)))).toEqual(['INVDEMO']);
  });

  it('sort app_name desc; sort_by tidak dikenal → 400', async () => {
    const res = await api().get(`${URL}?sort_by=app_name&sort_dir=desc`).set(bearer(superadmin));
    expect(codes(res)).toEqual(['USRMGNT', 'INVDEMO', 'BILLCOST']);
    expect((await api().get(`${URL}?sort_by=icon`).set(bearer(superadmin))).status).toBe(400);
  });

  it('detail & 404', async () => {
    const res = await api().get(`${URL}/${usrmgntId}`).set(bearer(superadmin));
    expect(res.body.data).toMatchObject({ app_code: 'USRMGNT', app_name: 'User Management', base_url: '/usrmgnt', icon: 'shield', sort_order: 1 });
    expect((await api().get(`${URL}/00000000-0000-0000-0000-000000000000`).set(bearer(superadmin))).status).toBe(404);
  });
});

describe('create, update, status, delete, restore', () => {
  let tstId: string;

  it('validasi field', async () => {
    const res = await api().post(URL).set(bearer(superadmin)).send({
      app_code: 'BAD CODE',
      base_url: 'bukan url',
      sort_order: -1,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { field: string }) => d.field).sort()).toEqual(['app_code', 'app_name', 'base_url', 'sort_order']);
  });

  it('create: kode dinormalisasi, base_url path relatif, sort_order default 0, created_by dari JWT', async () => {
    const res = await api().post(URL).set(bearer(superadmin)).send({
      app_code: 'hrdemo',
      app_name: 'HR Demo',
      base_url: '/hrdemo',
      description: '',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      app_code: 'HRDEMO',
      app_name: 'HR Demo',
      base_url: '/hrdemo',
      description: null,
      sort_order: 0,
      created_by: 'superadmin',
      is_active: true,
    });
    tstId = res.body.data.id;
  });

  it('base_url URL http(s) juga diterima', async () => {
    const res = await api().put(`${URL}/${tstId}`).set(bearer(superadmin)).send({
      app_name: 'HR Demo',
      base_url: 'https://hr.example.com/app',
      sort_order: 9,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ base_url: 'https://hr.example.com/app', sort_order: 9, updated_by: 'superadmin' });
  });

  it('PUT tanpa sort_order tidak mereset urutan; kode tidak dapat diubah', async () => {
    const res = await api().put(`${URL}/${tstId}`).set(bearer(superadmin)).send({ app_name: 'HR Demo Baru' });
    expect(res.body.data).toMatchObject({ app_name: 'HR Demo Baru', sort_order: 9, base_url: null });
    const change = await api().put(`${URL}/${tstId}`).set(bearer(superadmin)).send({ app_code: 'HR2', app_name: 'X' });
    expect(change.status).toBe(400);
    expect(change.body.error.details[0]).toEqual({ field: 'app_code', message: 'Kode aplikasi tidak dapat diubah' });
  });

  it('kode yang sudah ada → 409 DUPLICATE', async () => {
    const res = await api().post(URL).set(bearer(superadmin)).send({ app_code: 'billcost', app_name: 'Duplikat' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'DUPLICATE', message: 'Kode aplikasi BILLCOST sudah digunakan' });
  });

  it('BR-21: aplikasi yang masih dipakai tidak dapat dihapus, pesan menyebut jumlahnya', async () => {
    const res = await api().delete(`${URL}/${billcostId}`).set(bearer(superadmin));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('IN_USE');
    expect(res.body.error.message).toBe(
      'Aplikasi tidak dapat dihapus karena masih digunakan oleh 5 menu, 3 user group, dan 2 pemetaan company.',
    );
  });

  it('AD-01: aplikasi USRMGNT tidak dapat dihapus maupun dinonaktifkan', async () => {
    const del = await api().delete(`${URL}/${usrmgntId}`).set(bearer(superadmin));
    expect(del.status).toBe(422);
    expect(del.body.error).toMatchObject({ code: 'BUSINESS_RULE', message: 'Aplikasi USRMGNT adalah aplikasi inti dan tidak dapat dihapus.' });
    const off = await api().patch(`${URL}/${usrmgntId}/status`).set(bearer(superadmin)).send({ is_active: false });
    expect(off.status).toBe(422);
    // Mengubah nama/urutan tetap boleh
    const upd = await api().put(`${URL}/${usrmgntId}`).set(bearer(superadmin)).send({
      app_name: 'User Management',
      description: 'Portal administrasi user, group, dan hak akses',
      base_url: '/usrmgnt',
      icon: 'shield',
      sort_order: 1,
    });
    expect(upd.status).toBe(200);
  });

  it('nonaktif & aktif kembali; filter is_active', async () => {
    const off = await api().patch(`${URL}/${tstId}/status`).set(bearer(superadmin)).send({ is_active: false });
    expect(off.body.data.is_active).toBe(false);
    expect(codes(await api().get(`${URL}?is_active=false`).set(bearer(superadmin)))).toEqual(['HRDEMO']);
    const on = await api().patch(`${URL}/${tstId}/status`).set(bearer(superadmin)).send({ is_active: true });
    expect(on.body.data.is_active).toBe(true);
  });

  it('soft delete, kode boleh dipakai ulang, restore bentrok → 409, restore sukses', async () => {
    const del = await api().delete(`${URL}/${tstId}`).set(bearer(superadmin));
    expect(del.status).toBe(200);
    expect(del.body.data).toMatchObject({ is_deleted: true, deleted_by: 'superadmin' });
    expect((await api().get(`${URL}/${tstId}`).set(bearer(superadmin))).status).toBe(404);
    expect(codes(await api().get(`${URL}?include_deleted=true&q=hrdemo`).set(bearer(superadmin)))).toEqual(['HRDEMO']);

    const recreate = await api().post(URL).set(bearer(superadmin)).send({ app_code: 'HRDEMO', app_name: 'Pengganti' });
    expect(recreate.status).toBe(201);
    const conflict = await api().post(`${URL}/${tstId}/restore`).set(bearer(superadmin));
    expect(conflict.status).toBe(409);

    await api().delete(`${URL}/${recreate.body.data.id}`).set(bearer(superadmin));
    const restored = await api().post(`${URL}/${tstId}/restore`).set(bearer(superadmin));
    expect(restored.status).toBe(200);
    expect(restored.body.data).toMatchObject({ is_deleted: false, deleted_by: null, app_name: 'HR Demo Baru' });
    expect((await api().post(`${URL}/${tstId}/restore`).set(bearer(superadmin))).status).toBe(422);
  });
});

describe('BR-22: invalidasi cache permission', () => {
  it('menonaktifkan BILLCOST langsung mencabut hak akses bc.admin di aplikasi itu', async () => {
    const bcAdmin = await tokenFor('bc.admin', 'MDN', 'BILLCOST');
    const before = await api().get('/api/v1/auth/permissions').set(bearer(bcAdmin));
    expect(before.body.data.length).toBeGreaterThan(0);

    await api().patch(`${URL}/${billcostId}/status`).set(bearer(superadmin)).send({ is_active: false });
    const during = await api().get('/api/v1/auth/permissions').set(bearer(bcAdmin));
    expect(during.body.data).toEqual([]);

    await api().patch(`${URL}/${billcostId}/status`).set(bearer(superadmin)).send({ is_active: true });
    const after = await api().get('/api/v1/auth/permissions').set(bearer(bcAdmin));
    expect(after.body.data).toEqual(before.body.data);
  });
});
