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
const ids: Record<string, string> = {};

interface Item {
  app_code: string;
  is_assigned: boolean;
  member_count: number;
  is_active: boolean;
  assigned_by: string | null;
}
const url = (companyCode: string, appCode?: string) =>
  `/api/v1/companies/${ids[companyCode]}/applications${appCode ? `/${ids[appCode]}` : ''}`;
const items = (res: request.Response) => res.body.data.items as Item[];

beforeAll(async () => {
  await connectRedis();
  superadmin = await tokenFor('superadmin', 'MDN');
  auditor = await tokenFor('auditor', 'MDN');
  for (const c of await prisma.companies.findMany({ where: { is_deleted: false } })) ids[c.company_code] = c.id;
  for (const a of await prisma.applications.findMany({ where: { is_deleted: false } })) ids[a.app_code] = a.id;
});

afterAll(async () => {
  await invalidatePermissions.all();
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
});

describe('GET /companies/:id/applications', () => {
  it('AD-03: seluruh aplikasi + penanda is_assigned dan jumlah keanggotaan', async () => {
    const res = await api().get(url('MDN')).set(bearer(auditor));
    expect(res.status).toBe(200);
    expect(res.body.data.company).toMatchObject({ company_code: 'MDN', company_name: 'MODENA Indonesia' });
    const seed = items(res).filter((i) => ['USRMGNT', 'BILLCOST', 'INVDEMO'].includes(i.app_code));
    expect(seed.map((i) => [i.app_code, i.is_assigned, i.member_count])).toEqual([
      ['USRMGNT', true, 2],
      ['BILLCOST', true, 5],
      ['INVDEMO', true, 1],
    ]);
    expect(seed[0].assigned_by).toBe('seeder');
  });

  it('DEMO2 hanya memiliki INVDEMO', async () => {
    const assigned = items(await api().get(url('DEMO2')).set(bearer(superadmin))).filter((i) => i.is_assigned);
    expect(assigned.map((i) => i.app_code)).toEqual(['INVDEMO']);
  });

  it('company tidak ada → 404; ID tidak valid → 400', async () => {
    expect((await api().get('/api/v1/companies/00000000-0000-0000-0000-000000000000/applications').set(bearer(superadmin))).status).toBe(404);
    expect((await api().get('/api/v1/companies/abc/applications').set(bearer(superadmin))).status).toBe(400);
  });
});

describe('tambah & lepas pemetaan', () => {
  it('auditor tidak boleh mengubah pemetaan', async () => {
    expect((await api().post(url('DEMO2')).set(bearer(auditor)).send({ application_id: ids.BILLCOST })).status).toBe(403);
    expect((await api().delete(url('DEMO2', 'INVDEMO')).set(bearer(auditor))).status).toBe(403);
  });

  it('tambah BILLCOST ke DEMO2; duplikat → 409', async () => {
    const res = await api().post(url('DEMO2')).set(bearer(superadmin)).send({ application_id: ids.BILLCOST });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ company_id: ids.DEMO2, application_id: ids.BILLCOST, created_by: 'superadmin' });
    const dup = await api().post(url('DEMO2')).set(bearer(superadmin)).send({ application_id: ids.BILLCOST });
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toBe('Aplikasi BILLCOST sudah dimiliki company DEMO2');
    const assigned = items(await api().get(url('DEMO2')).set(bearer(superadmin))).filter((i) => i.is_assigned);
    expect(assigned.map((i) => i.app_code)).toEqual(['BILLCOST', 'INVDEMO']);
  });

  it('lepas pemetaan tanpa keanggotaan → sukses (soft delete); bisa ditambahkan kembali', async () => {
    const del = await api().delete(url('DEMO2', 'BILLCOST')).set(bearer(superadmin));
    expect(del.status).toBe(200);
    expect(del.body.data).toMatchObject({ is_deleted: true, deleted_by: 'superadmin' });
    expect(await prisma.company_applications.count({ where: { company_id: ids.DEMO2, application_id: ids.BILLCOST } })).toBe(1); // baris tetap ada (BR-11)

    const again = await api().post(url('DEMO2')).set(bearer(superadmin)).send({ application_id: ids.BILLCOST });
    expect(again.status).toBe(201);
    await api().delete(url('DEMO2', 'BILLCOST')).set(bearer(superadmin));
    expect(await prisma.company_applications.count({ where: { company_id: ids.DEMO2, application_id: ids.BILLCOST } })).toBe(2);
  });

  it('PRD §8.6: pemetaan yang masih dipakai keanggotaan group tidak dapat dilepas', async () => {
    const res = await api().delete(url('MDN', 'BILLCOST')).set(bearer(superadmin));
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'IN_USE', message: 'Pemetaan tidak dapat dihapus karena masih digunakan oleh 5 keanggotaan group.' });
  });

  it('lepas pemetaan yang tidak ada → 404', async () => {
    expect((await api().delete(url('DEMO2', 'USRMGNT')).set(bearer(superadmin))).status).toBe(404);
  });

  it('aplikasi nonaktif / tidak ada tidak dapat ditambahkan', async () => {
    const inactive = await prisma.applications.create({ data: { app_code: 'TEMP_OFF', app_name: 'Temp', is_active: false, created_by: 'test' } });
    const res = await api().post(url('DEMO2')).set(bearer(superadmin)).send({ application_id: inactive.id });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('Aplikasi TEMP_OFF sedang nonaktif dan tidak dapat ditambahkan.');
    await prisma.applications.delete({ where: { id: inactive.id } });

    const missing = await api().post(url('DEMO2')).set(bearer(superadmin)).send({ application_id: '00000000-0000-0000-0000-000000000000' });
    expect(missing.status).toBe(400);
    expect((await api().post(url('DEMO2')).set(bearer(superadmin)).send({})).status).toBe(400);
  });

  it('BR-07 tetap berlaku: tanpa pemetaan, keanggotaan group untuk company itu ditolak trigger', async () => {
    const user = await prisma.users.findFirstOrThrow({ where: { username: 'auditor' } });
    const group = await prisma.user_groups.findFirstOrThrow({ where: { group_code: 'BC_VIEWER' } });
    await expect(
      prisma.user_group_members.create({ data: { user_id: user.id, user_group_id: group.id, company_id: ids.DEMO2, created_by: 'test' } }),
    ).rejects.toThrow(/tidak memiliki aplikasi/);
  });
});
