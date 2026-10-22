import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/db.js';
import { connectRedis, redis } from '../src/config/redis.js';
import { invalidatePermissions } from '../src/lib/permissions.js';
import { bearer, tokenFor } from './helpers.js';

const app = createApp();
const api = () => request(app);

let superadmin: string;
let auditor: string;
let invdemoId: string;
let billcostId: string;
let invMasterId: string;
const actionId = async (code: string) => (await prisma.actions.findFirstOrThrow({ where: { action_code: code, is_deleted: false } })).id;

interface Node {
  id: string;
  menu_code: string;
  menu_type: string;
  is_visible: boolean;
  actions: string[];
  children: Node[];
}
const find = (nodes: Node[], code: string): Node | undefined => {
  for (const n of nodes) {
    if (n.menu_code === code) return n;
    const c = find(n.children, code);
    if (c) return c;
  }
};

beforeAll(async () => {
  await connectRedis();
  // auth.test.ts bisa lebih dulu mengunci inv.admin (AC-02); test ini memakai inv.admin
  await prisma.users.updateMany({ where: { username: 'inv.admin' }, data: { is_locked: false, failed_login_count: 0, locked_at: null } });
  superadmin = await tokenFor('superadmin', 'MDN');
  auditor = await tokenFor('auditor', 'MDN');
  invdemoId = (await prisma.applications.findFirstOrThrow({ where: { app_code: 'INVDEMO' } })).id;
  billcostId = (await prisma.applications.findFirstOrThrow({ where: { app_code: 'BILLCOST' } })).id;
  invMasterId = (await prisma.menus.findFirstOrThrow({ where: { menu_code: 'INV_MASTER' } })).id;
});

afterAll(async () => {
  await invalidatePermissions.all();
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
});

describe('tree & lookup', () => {
  it('GET /applications/:id/menus/tree: hirarki, urutan, action per PAGE', async () => {
    const res = await api().get(`/api/v1/applications/${invdemoId}/menus/tree`).set(bearer(auditor));
    expect(res.status).toBe(200);
    const tree = res.body.data as Node[];
    expect(tree.map((n) => n.menu_code)).toEqual(['INV_MASTER']);
    expect(tree[0].children.map((n) => n.menu_code)).toEqual(['INV_ITEM', 'INV_WAREHOUSE']);
    expect(find(tree, 'INV_ITEM')!.actions).toEqual(['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXPORT_EXCEL']);
  });

  it('menu tersembunyi tetap tampil di tree admin', async () => {
    const tree = (await api().get(`/api/v1/applications/${billcostId}/menus/tree`).set(bearer(superadmin))).body.data as Node[];
    expect(find(tree, 'BC_SHIPMENT_DTL')).toMatchObject({ is_visible: false });
  });

  it('GET /lookups/applications: hanya data aktif, field ringkas', async () => {
    const res = await api().get('/api/v1/lookups/applications').set(bearer(auditor));
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toEqual({ id: expect.any(String), code: 'USRMGNT', name: 'User Management', icon: 'shield' });
  });

  it('auditor: boleh baca, tidak boleh menulis atau melihat yang terhapus', async () => {
    expect((await api().post('/api/v1/menus').set(bearer(auditor)).send({})).status).toBe(403);
    expect((await api().get(`/api/v1/applications/${invdemoId}/menus/tree?include_deleted=true`).set(bearer(auditor))).status).toBe(403);
    const inv = await prisma.menus.findFirstOrThrow({ where: { menu_code: 'INV_ITEM' } });
    expect((await api().put(`/api/v1/menus/${inv.id}/actions`).set(bearer(auditor)).send({ action_ids: [] })).status).toBe(403);
  });
});

describe('create & validasi', () => {
  const base = () => ({ application_id: invdemoId, parent_id: invMasterId });

  it('AC-08: menu PAGE baru otomatis memiliki CREATE, READ, UPDATE, DELETE', async () => {
    const res = await api().post('/api/v1/menus').set(bearer(superadmin)).send({
      ...base(),
      menu_code: 'inv_supplier',
      menu_name: 'Suppliers',
      menu_type: 'PAGE',
      route_path: '/invdemo/suppliers',
      sort_order: 3,
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ menu_code: 'INV_SUPPLIER', menu_type: 'PAGE', is_visible: true, created_by: 'superadmin' });
    const acts = await api().get(`/api/v1/menus/${res.body.data.id}/actions`).set(bearer(superadmin));
    const assigned = acts.body.data.items.filter((a: { is_assigned: boolean }) => a.is_assigned).map((a: { action_code: string }) => a.action_code);
    expect(assigned).toEqual(expect.arrayContaining(['CREATE', 'READ', 'UPDATE', 'DELETE']));
    expect(assigned).not.toContain('PRINT');
  });

  it('validasi tipe & route', async () => {
    const noRoute = await api().post('/api/v1/menus').set(bearer(superadmin)).send({ ...base(), menu_code: 'X1', menu_name: 'X', menu_type: 'PAGE' });
    expect(noRoute.status).toBe(400);
    expect(noRoute.body.error.details[0]).toEqual({ field: 'route_path', message: 'Route wajib diisi untuk menu PAGE' });
    const groupRoute = await api().post('/api/v1/menus').set(bearer(superadmin)).send({
      application_id: invdemoId, menu_code: 'X2', menu_name: 'X', menu_type: 'GROUP', route_path: '/x',
    });
    expect(groupRoute.body.error.details[0].message).toBe('Menu GROUP tidak memiliki route');
    const badRoute = await api().post('/api/v1/menus').set(bearer(superadmin)).send({ ...base(), menu_code: 'X3', menu_name: 'X', menu_type: 'PAGE', route_path: 'tanpa slash' });
    expect(badRoute.body.error.details[0].field).toBe('route_path');
  });

  it('parent wajib GROUP dari aplikasi yang sama', async () => {
    const item = await prisma.menus.findFirstOrThrow({ where: { menu_code: 'INV_ITEM' } });
    const pageParent = await api().post('/api/v1/menus').set(bearer(superadmin)).send({
      application_id: invdemoId, parent_id: item.id, menu_code: 'X4', menu_name: 'X', menu_type: 'PAGE', route_path: '/x4',
    });
    expect(pageParent.body.error.details[0]).toEqual({ field: 'parent_id', message: 'Parent hanya boleh menu bertipe GROUP' });
    const bcTrx = await prisma.menus.findFirstOrThrow({ where: { menu_code: 'BC_TRX' } });
    const otherApp = await api().post('/api/v1/menus').set(bearer(superadmin)).send({
      application_id: invdemoId, parent_id: bcTrx.id, menu_code: 'X5', menu_name: 'X', menu_type: 'PAGE', route_path: '/x5',
    });
    expect(otherApp.body.error.details[0].message).toBe('Parent menu harus berasal dari aplikasi yang sama');
  });

  it('kode unik per aplikasi: duplikat → 409, aplikasi lain boleh', async () => {
    const dup = await api().post('/api/v1/menus').set(bearer(superadmin)).send({ ...base(), menu_code: 'INV_ITEM', menu_name: 'X', menu_type: 'PAGE', route_path: '/x' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toBe('Kode menu INV_ITEM sudah digunakan');
    const otherApp = await api().post('/api/v1/menus').set(bearer(superadmin)).send({
      application_id: billcostId, menu_code: 'INV_ITEM', menu_name: 'Kode sama di BILLCOST', menu_type: 'GROUP',
    });
    expect(otherApp.status).toBe(201);
    await api().delete(`/api/v1/menus/${otherApp.body.data.id}`).set(bearer(superadmin));
  });
});

describe('update', () => {
  let groupA: string;
  let groupB: string;
  let page: string;

  it('tipe & kode tidak dapat diubah', async () => {
    const supplier = await prisma.menus.findFirstOrThrow({ where: { menu_code: 'INV_SUPPLIER' } });
    page = supplier.id;
    const res = await api().put(`/api/v1/menus/${page}`).set(bearer(superadmin)).send({
      menu_type: 'GROUP', menu_code: 'X', menu_name: 'Suppliers', route_path: '/invdemo/suppliers',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { field: string }) => d.field).sort()).toEqual(['menu_code', 'menu_type']);
  });

  it('pindah parent & cegah parent melingkar', async () => {
    const a = await api().post('/api/v1/menus').set(bearer(superadmin)).send({ application_id: invdemoId, menu_code: 'INV_GRP_A', menu_name: 'Grup A', menu_type: 'GROUP', sort_order: 5 });
    groupA = a.body.data.id;
    const b = await api().post('/api/v1/menus').set(bearer(superadmin)).send({ application_id: invdemoId, parent_id: groupA, menu_code: 'INV_GRP_B', menu_name: 'Grup B', menu_type: 'GROUP' });
    groupB = b.body.data.id;

    const moved = await api().put(`/api/v1/menus/${page}`).set(bearer(superadmin)).send({
      parent_id: groupB, menu_name: 'Suppliers', route_path: '/invdemo/suppliers', is_visible: false,
    });
    expect(moved.status).toBe(200);
    expect(moved.body.data).toMatchObject({ parent_id: groupB, is_visible: false, updated_by: 'superadmin', sort_order: 3 });

    const cycle = await api().put(`/api/v1/menus/${groupA}`).set(bearer(superadmin)).send({ parent_id: groupB, menu_name: 'Grup A' });
    expect(cycle.status).toBe(400);
    expect(cycle.body.error.details[0].message).toBe('Parent tidak boleh menu itu sendiri atau sub-menunya');
    const self = await api().put(`/api/v1/menus/${groupA}`).set(bearer(superadmin)).send({ parent_id: groupA, menu_name: 'Grup A' });
    expect(self.status).toBe(400);
  });

  it('GROUP yang masih punya sub-menu tidak dapat dihapus', async () => {
    const res = await api().delete(`/api/v1/menus/${groupA}`).set(bearer(superadmin));
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('Menu GROUP tidak dapat dihapus karena masih digunakan oleh 1 sub-menu.');
  });
});

describe('action per menu, cascade delete/restore, dan cache permission', () => {
  let menuId: string;
  let invAdmin: string;
  const perms = async () => (await api().get('/api/v1/auth/permissions').set(bearer(invAdmin))).body.data as string[];

  beforeAll(async () => {
    menuId = (await prisma.menus.findFirstOrThrow({ where: { menu_code: 'INV_SUPPLIER' } })).id;
    invAdmin = await tokenFor('inv.admin', 'MDN', 'INVDEMO');
  });

  it('PUT actions: tambah APPROVE, lepas DELETE', async () => {
    const ids = await Promise.all(['CREATE', 'READ', 'UPDATE', 'APPROVE'].map(actionId));
    const res = await api().put(`/api/v1/menus/${menuId}/actions`).set(bearer(superadmin)).send({ action_ids: ids });
    expect(res.status).toBe(200);
    const assigned = res.body.data.items.filter((a: { is_assigned: boolean }) => a.is_assigned).map((a: { action_code: string }) => a.action_code);
    expect(assigned).toEqual(['CREATE', 'READ', 'UPDATE', 'APPROVE']);
    expect(res.body.data.items.find((a: { action_code: string }) => a.action_code === 'READ').is_required).toBe(true);
  });

  it('AD-05: READ tidak boleh dilepas; action nonaktif tidak boleh ditambah; GROUP tidak punya action', async () => {
    const noRead = await api().put(`/api/v1/menus/${menuId}/actions`).set(bearer(superadmin)).send({ action_ids: [await actionId('CREATE')] });
    expect(noRead.status).toBe(400);
    expect(noRead.body.error.details[0].message).toBe('Action READ wajib ada di setiap menu PAGE');

    const inactive = await prisma.actions.create({ data: { action_code: 'TEMP_INACTIVE', action_name: 'Temp', is_active: false, created_by: 'test' } });
    const addInactive = await api().put(`/api/v1/menus/${menuId}/actions`).set(bearer(superadmin)).send({ action_ids: [await actionId('READ'), inactive.id] });
    expect(addInactive.body.error.details[0].message).toBe('Action nonaktif tidak dapat ditambahkan: TEMP_INACTIVE');
    await prisma.actions.delete({ where: { id: inactive.id } });

    const group = await prisma.menus.findFirstOrThrow({ where: { menu_code: 'INV_MASTER' } });
    const onGroup = await api().put(`/api/v1/menus/${group.id}/actions`).set(bearer(superadmin)).send({ action_ids: [await actionId('READ')] });
    expect(onGroup.status).toBe(422);
  });

  it('melepas action → permission group ikut dicabut dan langsung berlaku', async () => {
    // Beri INV_ADMIN izin APPROVE di menu baru
    const group = await prisma.user_groups.findFirstOrThrow({ where: { group_code: 'INV_ADMIN' } });
    const approveMa = await prisma.menu_actions.findFirstOrThrow({ where: { menu_id: menuId, action_id: await actionId('APPROVE'), is_deleted: false } });
    const readMa = await prisma.menu_actions.findFirstOrThrow({ where: { menu_id: menuId, action_id: await actionId('READ'), is_deleted: false } });
    await prisma.user_group_permissions.createMany({
      data: [approveMa.id, readMa.id].map((menu_action_id) => ({ user_group_id: group.id, menu_action_id, created_by: 'test' })),
    });
    await invalidatePermissions.all();
    expect(await perms()).toEqual(expect.arrayContaining(['INV_SUPPLIER:APPROVE', 'INV_SUPPLIER:READ']));

    const groupCount = (await api().get(`/api/v1/menus/${menuId}/actions`).set(bearer(superadmin))).body.data.items.find(
      (a: { action_code: string }) => a.action_code === 'APPROVE',
    ).group_count;
    expect(groupCount).toBe(1);

    const ids = await Promise.all(['CREATE', 'READ', 'UPDATE'].map(actionId));
    await api().put(`/api/v1/menus/${menuId}/actions`).set(bearer(superadmin)).send({ action_ids: ids });
    expect(await perms()).not.toContain('INV_SUPPLIER:APPROVE');
    expect(await perms()).toContain('INV_SUPPLIER:READ');
    const perm = await prisma.user_group_permissions.findFirstOrThrow({ where: { menu_action_id: approveMa.id } });
    expect(perm).toMatchObject({ is_deleted: true, deleted_by: 'superadmin' });
  });

  it('nonaktif menu PAGE → akses hilang; aktif kembali → pulih', async () => {
    await api().patch(`/api/v1/menus/${menuId}/status`).set(bearer(superadmin)).send({ is_active: false });
    expect(await perms()).not.toContain('INV_SUPPLIER:READ');
    await api().patch(`/api/v1/menus/${menuId}/status`).set(bearer(superadmin)).send({ is_active: true });
    expect(await perms()).toContain('INV_SUPPLIER:READ');
  });

  it('AD-04: hapus PAGE ikut menghapus action & permission; restore memulihkan semuanya', async () => {
    const del = await api().delete(`/api/v1/menus/${menuId}`).set(bearer(superadmin));
    expect(del.status).toBe(200);
    expect(await prisma.menu_actions.count({ where: { menu_id: menuId, is_deleted: false } })).toBe(0);
    expect(await perms()).not.toContain('INV_SUPPLIER:READ');
    expect((await api().get(`/api/v1/menus/${menuId}`).set(bearer(superadmin))).status).toBe(404);

    const tree = (await api().get(`/api/v1/applications/${invdemoId}/menus/tree?include_deleted=true`).set(bearer(superadmin))).body.data as Node[];
    expect(find(tree, 'INV_SUPPLIER')).toMatchObject({ is_deleted: true });

    const restored = await api().post(`/api/v1/menus/${menuId}/restore`).set(bearer(superadmin));
    expect(restored.status).toBe(200);
    // Hanya action yang terhapus bersama menu yang dipulihkan (APPROVE yang dilepas sebelumnya tetap terhapus)
    const assigned = (await api().get(`/api/v1/menus/${menuId}/actions`).set(bearer(superadmin))).body.data.items
      .filter((a: { is_assigned: boolean }) => a.is_assigned)
      .map((a: { action_code: string }) => a.action_code);
    expect(assigned).toEqual(['CREATE', 'READ', 'UPDATE']);
    expect(await perms()).toContain('INV_SUPPLIER:READ');
    expect(await perms()).not.toContain('INV_SUPPLIER:APPROVE');
  });

  it('restore sub-menu ditolak bila induknya masih terhapus', async () => {
    const grpB = await prisma.menus.findFirstOrThrow({ where: { menu_code: 'INV_GRP_B' } });
    await api().delete(`/api/v1/menus/${menuId}`).set(bearer(superadmin));
    await api().delete(`/api/v1/menus/${grpB.id}`).set(bearer(superadmin));
    const res = await api().post(`/api/v1/menus/${menuId}/restore`).set(bearer(superadmin));
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('Pulihkan dulu menu induknya (INV_GRP_B).');
    await api().post(`/api/v1/menus/${grpB.id}/restore`).set(bearer(superadmin));
    expect((await api().post(`/api/v1/menus/${menuId}/restore`).set(bearer(superadmin))).status).toBe(200);
  });
});
