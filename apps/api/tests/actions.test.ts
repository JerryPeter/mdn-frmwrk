import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/db.js';
import { connectRedis, redis } from '../src/config/redis.js';
import { invalidatePermissions } from '../src/lib/permissions.js';
import { bearer, tokenFor } from './helpers.js';

const app = createApp();
const api = () => request(app);
const URL = '/api/v1/actions';

let superadmin: string;
let auditor: string;
const idOf = async (code: string) => (await prisma.actions.findFirstOrThrow({ where: { action_code: code, is_deleted: false } })).id;
const codes = (res: request.Response) => res.body.data.map((a: { action_code: string }) => a.action_code);

beforeAll(async () => {
  await connectRedis();
  superadmin = await tokenFor('superadmin', 'MDN');
  auditor = await tokenFor('auditor', 'MDN');
});

afterAll(async () => {
  await invalidatePermissions.all();
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
});

describe('GET /actions', () => {
  it('8 action seed urut sort_order, dengan penanda is_builtin', async () => {
    const res = await api().get(URL).set(bearer(auditor));
    expect(res.status).toBe(200);
    expect(codes(res)).toEqual(['CREATE', 'READ', 'UPDATE', 'DELETE', 'PRINT', 'EXPORT_EXCEL', 'APPROVE', 'IMPORT_EXCEL']);
    expect(res.body.data.filter((a: { is_builtin: boolean }) => a.is_builtin).map((a: { action_code: string }) => a.action_code)).toEqual([
      'CREATE', 'READ', 'UPDATE', 'DELETE',
    ]);
  });

  it('pencarian & filter', async () => {
    expect(codes(await api().get(`${URL}?q=excel`).set(bearer(superadmin)))).toEqual(['EXPORT_EXCEL', 'IMPORT_EXCEL']);
  });

  it('auditor tidak boleh menulis', async () => {
    expect((await api().post(URL).set(bearer(auditor)).send({ action_code: 'X', action_name: 'X' })).status).toBe(403);
    expect((await api().delete(`${URL}/${await idOf('PRINT')}`).set(bearer(auditor))).status).toBe(403);
  });
});

describe('action utama (CREATE, READ, UPDATE, DELETE)', () => {
  it('tidak dapat dihapus', async () => {
    const res = await api().delete(`${URL}/${await idOf('CREATE')}`).set(bearer(superadmin));
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'BUSINESS_RULE', message: 'Action CREATE adalah action utama dan tidak dapat dihapus.' });
  });

  it('AD-02: tidak dapat dinonaktifkan', async () => {
    const res = await api().patch(`${URL}/${await idOf('READ')}/status`).set(bearer(superadmin)).send({ is_active: false });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('Action READ adalah action utama dan tidak dapat dinonaktifkan.');
  });

  it('AD-05: READ wajib tetap default; kode tidak dapat diubah; nama boleh diubah', async () => {
    const id = await idOf('READ');
    const notDefault = await api().put(`${URL}/${id}`).set(bearer(superadmin)).send({ action_name: 'Read', is_default: false });
    expect(notDefault.status).toBe(400);
    expect(notDefault.body.error.details[0].field).toBe('is_default');
    const changeCode = await api().put(`${URL}/${id}`).set(bearer(superadmin)).send({ action_code: 'VIEW', action_name: 'Read' });
    expect(changeCode.body.error.details[0]).toEqual({ field: 'action_code', message: 'Kode action tidak dapat diubah' });
    const rename = await api().put(`${URL}/${id}`).set(bearer(superadmin)).send({ action_name: 'Lihat', description: 'Melihat data' });
    expect(rename.status).toBe(200);
    expect(rename.body.data).toMatchObject({ action_name: 'Lihat', description: 'Melihat data', is_default: true, sort_order: 2, updated_by: 'superadmin' });
    await api().put(`${URL}/${id}`).set(bearer(superadmin)).send({ action_name: 'Read', description: null });
  });
});

describe('create, update, status, delete, restore', () => {
  let signId: string;

  it('validasi: kode hanya huruf & underscore', async () => {
    const res = await api().post(URL).set(bearer(superadmin)).send({ action_code: 'SIGN2', sort_order: 'satu' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { field: string }) => d.field).sort()).toEqual(['action_code', 'action_name', 'sort_order']);
  });

  it('create: kode dinormalisasi, default is_default=false', async () => {
    const res = await api().post(URL).set(bearer(superadmin)).send({ action_code: 'sign', action_name: 'Sign Document', sort_order: 9 });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ action_code: 'SIGN', is_default: false, is_builtin: false, sort_order: 9, created_by: 'superadmin' });
    signId = res.body.data.id;
  });

  it('kode duplikat → 409', async () => {
    const res = await api().post(URL).set(bearer(superadmin)).send({ action_code: 'print', action_name: 'Cetak' });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Kode action PRINT sudah digunakan');
  });

  it('BR-21: action yang masih dipasang di menu tidak dapat dihapus', async () => {
    const res = await api().delete(`${URL}/${await idOf('PRINT')}`).set(bearer(superadmin));
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'IN_USE', message: 'Action tidak dapat dihapus karena masih digunakan oleh 2 menu.' });
  });

  it('is_default tidak retroaktif: hanya menu PAGE baru yang mendapat action default', async () => {
    const before = await prisma.menu_actions.count({ where: { action_id: signId, is_deleted: false } });
    expect((await api().put(`${URL}/${signId}`).set(bearer(superadmin)).send({ action_name: 'Sign Document', is_default: true })).status).toBe(200);
    expect(await prisma.menu_actions.count({ where: { action_id: signId, is_deleted: false } })).toBe(before);

    // Menu PAGE baru (trigger trg_menus_default_actions) otomatis mendapat SIGN
    const invdemo = await prisma.applications.findFirstOrThrow({ where: { app_code: 'INVDEMO' } });
    const menu = await prisma.menus.create({
      data: { application_id: invdemo.id, menu_code: 'INV_TEST_SIGN', menu_name: 'Test Sign', menu_type: 'PAGE', route_path: '/invdemo/test-sign', created_by: 'test' },
    });
    const attached = await prisma.menu_actions.findMany({ where: { menu_id: menu.id }, include: { actions: true } });
    expect(attached.map((ma) => ma.actions.action_code).sort()).toEqual(['CREATE', 'DELETE', 'READ', 'SIGN', 'UPDATE']);

    // Kini SIGN dipakai → tidak dapat dihapus
    const del = await api().delete(`${URL}/${signId}`).set(bearer(superadmin));
    expect(del.body.error.code).toBe('IN_USE');

    // Bersihkan menu test
    await prisma.menu_actions.deleteMany({ where: { menu_id: menu.id } });
    await prisma.menus.delete({ where: { id: menu.id } });
    await api().put(`${URL}/${signId}`).set(bearer(superadmin)).send({ action_name: 'Sign Document', is_default: false });
  });

  it('soft delete, kode dipakai ulang, restore bentrok → 409, restore sukses', async () => {
    const del = await api().delete(`${URL}/${signId}`).set(bearer(superadmin));
    expect(del.status).toBe(200);
    expect(del.body.data).toMatchObject({ is_deleted: true, deleted_by: 'superadmin' });
    expect(codes(await api().get(URL).set(bearer(superadmin)))).not.toContain('SIGN');

    const again = await api().post(URL).set(bearer(superadmin)).send({ action_code: 'SIGN', action_name: 'Sign v2' });
    expect(again.status).toBe(201);
    expect((await api().post(`${URL}/${signId}/restore`).set(bearer(superadmin))).status).toBe(409);
    await api().delete(`${URL}/${again.body.data.id}`).set(bearer(superadmin));
    const restored = await api().post(`${URL}/${signId}/restore`).set(bearer(superadmin));
    expect(restored.status).toBe(200);
    expect(restored.body.data).toMatchObject({ action_name: 'Sign Document', is_deleted: false });
  });
});

describe('BR-22: menonaktifkan action tambahan langsung mencabut permission-nya', () => {
  it('APPROVE nonaktif → bc.admin kehilangan BC_SHIPMENT:APPROVE; aktif kembali → pulih', async () => {
    const bcAdmin = await tokenFor('bc.admin', 'MDN', 'BILLCOST');
    const perms = async () => (await api().get('/api/v1/auth/permissions').set(bearer(bcAdmin))).body.data as string[];
    expect(await perms()).toContain('BC_SHIPMENT:APPROVE');

    const approveId = await idOf('APPROVE');
    const off = await api().patch(`${URL}/${approveId}/status`).set(bearer(superadmin)).send({ is_active: false });
    expect(off.status).toBe(200);
    expect(off.body.data.is_active).toBe(false);
    expect(await perms()).not.toContain('BC_SHIPMENT:APPROVE');

    await api().patch(`${URL}/${approveId}/status`).set(bearer(superadmin)).send({ is_active: true });
    expect(await perms()).toContain('BC_SHIPMENT:APPROVE');
  });
});
