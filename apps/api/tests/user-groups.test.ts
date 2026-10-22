import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/db.js';
import { connectRedis, redis } from '../src/config/redis.js';
import { todayISO } from '../src/lib/access.js';
import { invalidatePermissions } from '../src/lib/permissions.js';
import { bearer, tokenFor } from './helpers.js';

const app = createApp();
const api = () => request(app);

let superadmin: string;
let auditor: string;
const ids = {} as Record<'usrmgnt' | 'billcost' | 'invdemo' | 'mdn' | 'demo1' | 'superAdminGroup' | 'bcStaff' | 'bcAdmin', string>;

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const groupId = (code: string) => prisma.user_groups.findFirstOrThrow({ where: { group_code: code, is_deleted: false } }).then((g) => g.id);
const userId = (username: string) => prisma.users.findFirstOrThrow({ where: { username } }).then((u) => u.id);

/** menu_action_id untuk "MENU:ACTION" */
async function menuActionIds(keys: string[]) {
  const rows = await prisma.menu_actions.findMany({
    where: { is_deleted: false },
    select: { id: true, menus: { select: { menu_code: true } }, actions: { select: { action_code: true } } },
  });
  const map = new Map(rows.map((r) => [`${r.menus.menu_code}:${r.actions.action_code}`, r.id]));
  return keys.map((k) => {
    const id = map.get(k);
    if (!id) throw new Error(`menu action ${k} tidak ada`);
    return id;
  });
}

async function createGroup(code: string, applicationId = ids.billcost) {
  const res = await api()
    .post('/api/v1/user-groups')
    .set(bearer(superadmin))
    .send({ application_id: applicationId, group_code: code, group_name: `Test ${code}` });
  expect(res.status).toBe(201);
  return res.body.data as { id: string };
}

let superAdminDemo1MemberId: string;

beforeAll(async () => {
  await connectRedis();
  superadmin = await tokenFor('superadmin', 'MDN');
  auditor = await tokenFor('auditor', 'MDN');
  const apps = await prisma.applications.findMany();
  const byCode = (c: string) => apps.find((a) => a.app_code === c)!.id;
  ids.usrmgnt = byCode('USRMGNT');
  ids.billcost = byCode('BILLCOST');
  ids.invdemo = byCode('INVDEMO');
  ids.mdn = (await prisma.companies.findFirstOrThrow({ where: { company_code: 'MDN' } })).id;
  ids.demo1 = (await prisma.companies.findFirstOrThrow({ where: { company_code: 'DEMO1' } })).id;
  ids.superAdminGroup = await groupId('SUPER_ADMIN');
  ids.bcStaff = await groupId('BC_STAFF');
  ids.bcAdmin = await groupId('BC_ADMIN');
});

afterAll(async () => {
  // Kembalikan kondisi seed untuk file test berikutnya
  await prisma.user_group_permissions.deleteMany({ where: { created_by: 'superadmin' } });
  await prisma.user_group_members.deleteMany({ where: { created_by: 'superadmin' } });
  await prisma.user_group_permissions.deleteMany({ where: { user_groups: { created_by: 'superadmin' } } });
  await prisma.user_groups.deleteMany({ where: { created_by: 'superadmin' } });
  if (superAdminDemo1MemberId) {
    await prisma.user_group_members.update({
      where: { id: superAdminDemo1MemberId },
      data: { is_deleted: false, deleted_by: null, deleted_at: null },
    });
  }
  await invalidatePermissions.all();
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
});

describe('User Groups', () => {
  it('list per aplikasi dengan jumlah anggota, permission, dan penanda group inti', async () => {
    const res = await api().get(`/api/v1/user-groups?application_id=${ids.usrmgnt}`).set(bearer(auditor));
    expect(res.status).toBe(200);
    expect(res.body.data.map((g: { group_code: string }) => g.group_code)).toEqual(['SUPER_ADMIN', 'UM_AUDITOR']);
    const [sa, aud] = res.body.data;
    expect(sa).toMatchObject({ app_code: 'USRMGNT', member_count: 2, is_protected: true });
    expect(aud).toMatchObject({ member_count: 1, permission_count: 10, is_protected: false });
  });

  it('auditor tidak dapat membuat group → 403', async () => {
    const res = await api()
      .post('/api/v1/user-groups')
      .set(bearer(auditor))
      .send({ application_id: ids.billcost, group_code: 'X', group_name: 'X' });
    expect(res.status).toBe(403);
  });

  it('create: validasi, kode duplikat per aplikasi → 409, kode sama di aplikasi lain boleh', async () => {
    const invalid = await api().post('/api/v1/user-groups').set(bearer(superadmin)).send({ group_code: 'ada spasi', group_name: '' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.details.map((d: { field: string }) => d.field)).toEqual(
      expect.arrayContaining(['application_id', 'group_code', 'group_name']),
    );

    const dup = await api()
      .post('/api/v1/user-groups')
      .set(bearer(superadmin))
      .send({ application_id: ids.billcost, group_code: 'bc_staff', group_name: 'Dup' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.details[0].field).toBe('group_code');

    const created = await api()
      .post('/api/v1/user-groups')
      .set(bearer(superadmin))
      .send({ application_id: ids.invdemo, group_code: 'bc_staff', group_name: 'Kode sama, aplikasi lain' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ group_code: 'BC_STAFF', app_code: 'INVDEMO', created_by: 'superadmin', member_count: 0 });
  });

  it('update: aplikasi & kode tidak dapat diubah', async () => {
    const group = await createGroup('TEST_UPD');
    const locked = await api()
      .put(`/api/v1/user-groups/${group.id}`)
      .set(bearer(superadmin))
      .send({ application_id: ids.usrmgnt, group_code: 'LAIN', group_name: 'X' });
    expect(locked.status).toBe(400);
    expect(locked.body.error.details.map((d: { field: string }) => d.field)).toEqual(['application_id', 'group_code']);
    const ok = await api()
      .put(`/api/v1/user-groups/${group.id}`)
      .set(bearer(superadmin))
      .send({ group_code: 'TEST_UPD', group_name: 'Nama Baru', description: 'Deskripsi' });
    expect(ok.body.data).toMatchObject({ group_name: 'Nama Baru', description: 'Deskripsi', updated_by: 'superadmin' });
  });

  it('AD-01: group SUPER_ADMIN tidak dapat dihapus atau dinonaktifkan', async () => {
    const del = await api().delete(`/api/v1/user-groups/${ids.superAdminGroup}`).set(bearer(superadmin));
    const off = await api().patch(`/api/v1/user-groups/${ids.superAdminGroup}/status`).set(bearer(superadmin)).send({ is_active: false });
    [del, off].forEach((r) => {
      expect(r.status).toBe(422);
      expect(r.body.error.message).toContain('group inti');
    });
  });

  it('BR-21: group yang masih punya anggota tidak dapat dihapus', async () => {
    const res = await api().delete(`/api/v1/user-groups/${ids.bcStaff}`).set(bearer(superadmin));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('IN_USE');
    expect(res.body.error.message).toContain('3 anggota');
  });

  it('duplikat menyalin permission; hapus ikut menghapus permission dan restore memulihkannya', async () => {
    const dup = await api()
      .post(`/api/v1/user-groups/${ids.bcStaff}/duplicate`)
      .set(bearer(superadmin))
      .send({ group_code: 'TEST_COPY', group_name: 'Salinan Billing Staff' });
    expect(dup.status).toBe(201);
    expect(dup.body.data).toMatchObject({ app_code: 'BILLCOST', permission_count: 10, member_count: 0 });

    const del = await api().delete(`/api/v1/user-groups/${dup.body.data.id}`).set(bearer(superadmin));
    expect(del.status).toBe(200);
    expect(await prisma.user_group_permissions.count({ where: { user_group_id: dup.body.data.id, is_deleted: false } })).toBe(0);

    const restore = await api().post(`/api/v1/user-groups/${dup.body.data.id}/restore`).set(bearer(superadmin));
    expect(restore.status).toBe(200);
    expect(restore.body.data).toMatchObject({ is_deleted: false, restored_permissions: 10 });
  });

  it('nonaktif group → anggota langsung kehilangan akses (BR-22)', async () => {
    const token = await tokenFor('bc.admin', 'MDN', 'BILLCOST');
    const before = await api().get('/api/v1/auth/permissions').set(bearer(token));
    expect(before.body.data.length).toBeGreaterThan(0); // sekaligus mengisi cache
    await api().patch(`/api/v1/user-groups/${ids.bcAdmin}/status`).set(bearer(superadmin)).send({ is_active: false });
    const after = await api().get('/api/v1/auth/permissions').set(bearer(token));
    expect(after.body.data).toEqual([]);
    await api().patch(`/api/v1/user-groups/${ids.bcAdmin}/status`).set(bearer(superadmin)).send({ is_active: true });
  });
});

describe('Group Members', () => {
  it('list anggota dengan status (kedaluwarsa, user terkunci → tidak berlaku)', async () => {
    const res = await api().get(`/api/v1/user-groups/${ids.bcStaff}/members`).set(bearer(auditor));
    expect(res.status).toBe(200);
    const byUser = Object.fromEntries(
      res.body.data.map((m: { user: { username: string }; company: { code: string }; status: string }) => [
        `${m.user.username}@${m.company.code}`,
        m.status,
      ]),
    );
    expect(byUser).toEqual({ 'bc.staff@MDN': 'active', 'bc.viewer@DEMO1': 'expired', 'locked.user@MDN': 'suspended' });
  });

  it('pencarian dan filter company', async () => {
    const q = await api().get(`/api/v1/user-groups/${ids.bcStaff}/members?q=locked`).set(bearer(auditor));
    expect(q.body.data.map((m: { user: { username: string } }) => m.user.username)).toEqual(['locked.user']);
    const c = await api().get(`/api/v1/user-groups/${ids.bcStaff}/members?company_id=${ids.demo1}`).set(bearer(auditor));
    expect(c.body.meta.total).toBe(1);
  });

  it('AC-09: company tanpa aplikasi group → 422 BUSINESS_RULE', async () => {
    const invAdmin = await groupId('INV_ADMIN');
    const res = await api()
      .post(`/api/v1/user-groups/${invAdmin}/members`)
      .set(bearer(superadmin))
      .send({ user_id: await userId('bc.viewer'), company_id: ids.demo1 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
    expect(res.body.error.message).toContain('tidak memiliki aplikasi INVDEMO');
  });

  it('tambah anggota: default valid_from hari ini, duplikat → 409, periode tidak valid → 400, user nonaktif → 400', async () => {
    const group = await createGroup('TEST_MEMBERS');
    const auditorId = await userId('auditor');
    const add = await api().post(`/api/v1/user-groups/${group.id}/members`).set(bearer(superadmin)).send({ user_id: auditorId, company_id: ids.mdn });
    expect(add.status).toBe(201);
    expect(add.body.data).toMatchObject({ valid_from: todayISO(), valid_to: null, status: 'active', created_by: 'superadmin' });

    const dup = await api().post(`/api/v1/user-groups/${group.id}/members`).set(bearer(superadmin)).send({ user_id: auditorId, company_id: ids.mdn });
    expect(dup.status).toBe(409);

    const period = await api()
      .post(`/api/v1/user-groups/${group.id}/members`)
      .set(bearer(superadmin))
      .send({ user_id: auditorId, company_id: ids.demo1, valid_from: '2026-05-01', valid_to: '2026-04-01' });
    expect(period.status).toBe(400);
    expect(period.body.error.details[0].field).toBe('valid_to');

    const inactive = await api()
      .post(`/api/v1/user-groups/${group.id}/members`)
      .set(bearer(superadmin))
      .send({ user_id: await userId('inactive.user'), company_id: ids.mdn });
    expect(inactive.status).toBe(400);
    expect(inactive.body.error.details[0].field).toBe('user_id');
  });

  it('AC-14: valid_to lewat dari hari ini → akses dari keanggotaan itu hilang', async () => {
    const group = await createGroup('TEST_PERIOD');
    await api()
      .put(`/api/v1/user-groups/${group.id}/permissions`)
      .set(bearer(superadmin))
      .send({ menu_action_ids: await menuActionIds(['BC_SHIPMENT:DELETE']) });
    const userIdInv = await userId('inv.admin');
    const add = await api()
      .post(`/api/v1/user-groups/${group.id}/members`)
      .set(bearer(superadmin))
      .send({ user_id: userIdInv, company_id: ids.mdn });
    const token = await tokenFor('inv.admin', 'MDN', 'BILLCOST');
    expect((await api().get('/api/v1/auth/permissions').set(bearer(token))).body.data).toEqual(['BC_SHIPMENT:DELETE']);

    const yesterday = addDays(todayISO(), -1);
    const upd = await api()
      .put(`/api/v1/user-groups/${group.id}/members/${add.body.data.id}`)
      .set(bearer(superadmin))
      .send({ valid_from: addDays(todayISO(), -30), valid_to: yesterday, is_active: true });
    expect(upd.status).toBe(200);
    expect(upd.body.data.status).toBe('expired');
    expect((await api().get('/api/v1/auth/permissions').set(bearer(token))).body.data).toEqual([]);

    const del = await api().delete(`/api/v1/user-groups/${group.id}/members/${add.body.data.id}`).set(bearer(superadmin));
    expect(del.status).toBe(200);
  });

  it('BR-20: keanggotaan SUPER_ADMIN terakhir yang berlaku tidak dapat dihapus/dinonaktifkan', async () => {
    const members = await prisma.user_group_members.findMany({
      where: { user_group_id: ids.superAdminGroup, is_deleted: false },
      include: { companies: true },
    });
    const demo1 = members.find((m) => m.companies.company_code === 'DEMO1')!;
    const mdn = members.find((m) => m.companies.company_code === 'MDN')!;
    superAdminDemo1MemberId = demo1.id;

    // Masih ada keanggotaan MDN → keanggotaan DEMO1 boleh dihapus
    const first = await api().delete(`/api/v1/user-groups/${ids.superAdminGroup}/members/${demo1.id}`).set(bearer(superadmin));
    expect(first.status).toBe(200);

    const last = await api().delete(`/api/v1/user-groups/${ids.superAdminGroup}/members/${mdn.id}`).set(bearer(superadmin));
    const off = await api()
      .put(`/api/v1/user-groups/${ids.superAdminGroup}/members/${mdn.id}`)
      .set(bearer(superadmin))
      .send({ valid_from: '2026-01-01', valid_to: null, is_active: false });
    [last, off].forEach((r) => {
      expect(r.status).toBe(422);
      expect(r.body.error.message).toContain('SUPER_ADMIN');
    });
    // Perubahan yang tetap berlaku boleh
    const keep = await api()
      .put(`/api/v1/user-groups/${ids.superAdminGroup}/members/${mdn.id}`)
      .set(bearer(superadmin))
      .send({ valid_from: '2026-01-01', valid_to: null, is_active: true });
    expect(keep.status).toBe(200);
  });

  it('auditor hanya dapat melihat anggota → tambah 403', async () => {
    const res = await api()
      .post(`/api/v1/user-groups/${ids.bcStaff}/members`)
      .set(bearer(auditor))
      .send({ user_id: await userId('auditor'), company_id: ids.mdn });
    expect(res.status).toBe(403);
  });
});

describe('Group Permissions', () => {
  it('matriks: pohon menu × action, sel hanya untuk action yang tersedia', async () => {
    const res = await api().get(`/api/v1/user-groups/${ids.bcStaff}/permissions`).set(bearer(auditor));
    expect(res.status).toBe(200);
    const { actions, rows, summary } = res.body.data;
    expect(actions.map((a: { action_code: string }) => a.action_code)).toEqual(
      expect.arrayContaining(['CREATE', 'READ', 'UPDATE', 'DELETE', 'PRINT', 'APPROVE', 'IMPORT_EXCEL', 'EXPORT_EXCEL']),
    );
    const shipment = rows.find((r: { menu_code: string }) => r.menu_code === 'BC_SHIPMENT');
    expect(shipment.level).toBeGreaterThan(0);
    const granted = shipment.cells.filter((c: { granted: boolean }) => c.granted).map((c: { action_code: string }) => c.action_code);
    expect(granted.sort()).toEqual(['CREATE', 'IMPORT_EXCEL', 'PRINT', 'READ', 'UPDATE']);
    const groupRow = rows.find((r: { menu_type: string }) => r.menu_type === 'GROUP');
    expect(groupRow.cells).toEqual([]);
    expect(summary.granted).toBe(10);
  });

  it('AC-10: permission menu aplikasi lain → 422 BUSINESS_RULE', async () => {
    const res = await api()
      .put(`/api/v1/user-groups/${ids.bcStaff}/permissions`)
      .set(bearer(superadmin))
      .send({ menu_action_ids: await menuActionIds(['BC_SHIPMENT:READ', 'UM_USER:READ']) });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
    expect(res.body.error.message).toContain('UM_USER');
  });

  it('AC-13: perubahan permission langsung berlaku bagi anggota (cache diinvalidasi)', async () => {
    const group = await createGroup('TEST_AC13');
    await api()
      .post(`/api/v1/user-groups/${group.id}/members`)
      .set(bearer(superadmin))
      .send({ user_id: await userId('bc.viewer'), company_id: ids.mdn });
    const token = await tokenFor('bc.viewer', 'MDN', 'BILLCOST');
    const before = (await api().get('/api/v1/auth/permissions').set(bearer(token))).body.data;
    expect(before).not.toContain('BC_SHIPMENT:APPROVE');

    const put = await api()
      .put(`/api/v1/user-groups/${group.id}/permissions`)
      .set(bearer(superadmin))
      .send({ menu_action_ids: await menuActionIds(['BC_SHIPMENT:APPROVE', 'BC_SHIPMENT:READ']) });
    expect(put.status).toBe(200);
    expect(put.body.data.changes).toEqual({ added: 2, removed: 0 });
    expect((await api().get('/api/v1/auth/permissions').set(bearer(token))).body.data).toContain('BC_SHIPMENT:APPROVE');

    // Lepas APPROVE → selisih: 0 ditambah, 1 dilepas (soft delete)
    const remove = await api()
      .put(`/api/v1/user-groups/${group.id}/permissions`)
      .set(bearer(superadmin))
      .send({ menu_action_ids: await menuActionIds(['BC_SHIPMENT:READ']) });
    expect(remove.body.data.changes).toEqual({ added: 0, removed: 1 });
    expect((await api().get('/api/v1/auth/permissions').set(bearer(token))).body.data).not.toContain('BC_SHIPMENT:APPROVE');
    expect(await prisma.user_group_permissions.count({ where: { user_group_id: group.id, is_deleted: true } })).toBe(1);
  });

  it('SUPER_ADMIN wajib tetap memiliki UM_GROUP_PERM:READ & UPDATE', async () => {
    const res = await api()
      .put(`/api/v1/user-groups/${ids.superAdminGroup}/permissions`)
      .set(bearer(superadmin))
      .send({ menu_action_ids: await menuActionIds(['UM_USER:READ']) });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain('UM_GROUP_PERM');
  });

  it('auditor tidak dapat menyimpan permission → 403; ID tidak dikenal → 400', async () => {
    expect((await api().put(`/api/v1/user-groups/${ids.bcStaff}/permissions`).set(bearer(auditor)).send({ menu_action_ids: [] })).status).toBe(403);
    const unknown = await api()
      .put(`/api/v1/user-groups/${ids.bcStaff}/permissions`)
      .set(bearer(superadmin))
      .send({ menu_action_ids: ['00000000-0000-0000-0000-000000000000'] });
    expect(unknown.status).toBe(400);
  });
});

describe('lookups', () => {
  it('/lookups/companies?application_id= hanya company yang memiliki aplikasi', async () => {
    const res = await api().get(`/api/v1/lookups/companies?application_id=${ids.invdemo}`).set(bearer(auditor));
    expect(res.body.data.map((c: { code: string }) => c.code)).toEqual(['DEMO2', 'MDN']);
  });

  it('/lookups/user-groups?application_id= berisi jumlah anggota', async () => {
    const res = await api().get(`/api/v1/lookups/user-groups?application_id=${ids.usrmgnt}`).set(bearer(auditor));
    expect(res.body.data.map((g: { code: string }) => g.code)).toEqual(['SUPER_ADMIN', 'UM_AUDITOR']);
    expect(res.body.data[0]).toMatchObject({ app_code: 'USRMGNT', is_active: true });
  });
});
