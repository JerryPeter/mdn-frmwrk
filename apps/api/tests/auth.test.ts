import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { connectRedis, redis } from '../src/config/redis.js';
import { invalidatePermissions } from '../src/lib/permissions.js';
import { bearer } from './helpers.js';

const app = createApp();
const PASSWORD = 'Modena@2026';

interface Ctx {
  company_id: string;
  company_code: string;
  application_id: string;
  app_code: string;
}

const login = (username: string, password = PASSWORD) =>
  request(app).post('/api/v1/auth/login').send({ username, password });

const refreshCookie = (res: request.Response) =>
  ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('refresh_token='));

async function selectContext(token: string, ctx: Ctx) {
  const res = await request(app)
    .post('/api/v1/auth/context')
    .set(bearer(token))
    .send({ company_id: ctx.company_id, application_id: ctx.application_id });
  expect(res.status).toBe(200);
  return res.body.data.access_token as string;
}

beforeAll(connectRedis);
afterAll(async () => {
  await invalidatePermissions.all();
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
});

describe('POST /auth/login', () => {
  it('AC-01: superadmin login → 2 konteks (DEMO1 & MDN di USRMGNT), refresh cookie httpOnly', async () => {
    const res = await login('SuperAdmin'); // username tidak membedakan huruf besar/kecil
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ username: 'superadmin', must_change_password: false });
    expect(res.body.data.user).not.toHaveProperty('password_hash');
    expect(res.body.data.contexts.map((c: Ctx) => `${c.company_code}-${c.app_code}`)).toEqual(['DEMO1-USRMGNT', 'MDN-USRMGNT']);
    expect(res.body.data.expires_in).toBe(900);
    const cookie = refreshCookie(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);

    const user = await prisma.users.findFirstOrThrow({ where: { username: 'superadmin' } });
    expect(user.last_login_at).not.toBeNull();
  });

  it('username/password salah → pesan umum INVALID_CREDENTIALS', async () => {
    const wrongUser = await login('tidak.ada');
    const wrongPass = await login('auditor', 'salah');
    for (const res of [wrongUser, wrongPass]) {
      expect(res.status).toBe(401);
      expect(res.body.error).toEqual({ code: 'INVALID_CREDENTIALS', message: 'Username atau password salah' });
    }
  });

  it('AC-02: 5 kali salah → akun terkunci; percobaan berikutnya ACCOUNT_LOCKED', async () => {
    for (let i = 1; i <= 5; i++) expect((await login('inv.admin', 'salah')).body.error.code).toBe('INVALID_CREDENTIALS');
    const user = await prisma.users.findFirstOrThrow({ where: { username: 'inv.admin' } });
    expect(user).toMatchObject({ is_locked: true, failed_login_count: 5 });
    expect(user.locked_at).not.toBeNull();
    expect((await login('inv.admin')).body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('login sukses mereset failed_login_count', async () => {
    await login('auditor', 'salah');
    await login('auditor');
    expect((await prisma.users.findFirstOrThrow({ where: { username: 'auditor' } })).failed_login_count).toBe(0);
  });

  it('AC-03: locked.user / inactive.user ditolak dengan kode masing-masing; LDAP belum didukung', async () => {
    expect((await login('locked.user')).body.error.code).toBe('ACCOUNT_LOCKED');
    expect((await login('inactive.user')).body.error.code).toBe('ACCOUNT_INACTIVE');
    const ldap = await login('bc.viewer');
    expect(ldap.body.error).toEqual({ code: 'AUTH_PROVIDER_NOT_SUPPORTED', message: 'Metode login belum didukung' });
  });

  it('validasi input', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ username: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { field: string }) => d.field).sort()).toEqual(['password', 'username']);
  });
});

describe('refresh & logout', () => {
  it('refresh merotasi token; token lama tidak dapat dipakai lagi; logout mencabut token', async () => {
    const cookie = refreshCookie(await login('auditor'))!;
    const first = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie.split(';')[0]);
    expect(first.status).toBe(200);
    expect(first.body.data.access_token).toBeTruthy();
    const rotated = refreshCookie(first)!;
    expect(rotated).not.toBe(cookie);

    const reuse = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie.split(';')[0]);
    expect(reuse.status).toBe(401);

    await request(app).post('/api/v1/auth/logout').set('Cookie', rotated.split(';')[0]);
    const afterLogout = await request(app).post('/api/v1/auth/refresh').set('Cookie', rotated.split(';')[0]);
    expect(afterLogout.status).toBe(401);
  });

  it('refresh tanpa cookie → 401', async () => {
    expect((await request(app).post('/api/v1/auth/refresh')).status).toBe(401);
  });
});

describe('konteks, menu, permission', () => {
  it('menus/permissions tanpa konteks → 403 CONTEXT_REQUIRED', async () => {
    const token = (await login('superadmin')).body.data.access_token;
    const res = await request(app).get('/api/v1/auth/menus').set(bearer(token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CONTEXT_REQUIRED');
  });

  it('pilih konteks yang tidak dimiliki → 403 FORBIDDEN', async () => {
    const res = await login('auditor');
    const demo1 = await prisma.companies.findFirstOrThrow({ where: { company_code: 'DEMO1' } });
    const ctx = res.body.data.contexts[0] as Ctx;
    const forbidden = await request(app)
      .post('/api/v1/auth/context')
      .set(bearer(res.body.data.access_token))
      .send({ company_id: demo1.id, application_id: ctx.application_id });
    expect(forbidden.status).toBe(403);
  });

  it('superadmin @ MDN: menu USRMGNT lengkap, GET /me menampilkan konteks aktif', async () => {
    const res = await login('superadmin');
    const mdn = (res.body.data.contexts as Ctx[]).find((c) => c.company_code === 'MDN')!;
    const token = await selectContext(res.body.data.access_token, mdn);

    const menus = await request(app).get('/api/v1/auth/menus').set(bearer(token));
    expect(menus.body.data.map((g: { menu_code: string }) => g.menu_code)).toEqual(['UM_MASTER', 'UM_ACCESS']);
    expect(menus.body.data[0].children.map((p: { menu_code: string }) => p.menu_code)).toEqual([
      'UM_COMPANY', 'UM_APPLICATION', 'UM_MENU', 'UM_ACTION', 'UM_USER',
    ]);

    const me = await request(app).get('/api/v1/auth/me').set(bearer(token));
    expect(me.body.data.context).toMatchObject({ company_code: 'MDN', app_code: 'USRMGNT', company_name: 'MODENA Indonesia' });
  });

  it('AC-04 s.d. AC-06: bc.staff wajib ganti password, lalu akses sesuai company', async () => {
    const first = await login('bc.staff');
    expect(first.body.data.user.must_change_password).toBe(true);
    const token = first.body.data.access_token;

    // AC-04: endpoint lain ditolak sampai password diganti
    const blocked = await request(app).get('/api/v1/auth/contexts').set(bearer(token));
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await request(app).get('/api/v1/auth/me').set(bearer(token))).status).toBe(200);

    // Validasi kebijakan password (BR-18)
    const weak = await request(app).post('/api/v1/auth/change-password').set(bearer(token))
      .send({ old_password: PASSWORD, new_password: PASSWORD, confirm_password: 'beda' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.details.map((d: { field: string }) => d.field)).toEqual(['new_password', 'confirm_password']);
    const wrongOld = await request(app).post('/api/v1/auth/change-password').set(bearer(token))
      .send({ old_password: 'salah', new_password: 'Baru#2026x', confirm_password: 'Baru#2026x' });
    expect(wrongOld.body.error.details[0].field).toBe('old_password');

    const changed = await request(app).post('/api/v1/auth/change-password').set(bearer(token))
      .send({ old_password: PASSWORD, new_password: 'Baru#2026x', confirm_password: 'Baru#2026x' });
    expect(changed.status).toBe(200);
    expect(refreshCookie(changed)).toBeTruthy();
    // Refresh token lama (dari login) sudah dicabut
    const oldRefresh = await request(app).post('/api/v1/auth/refresh').set('Cookie', refreshCookie(first)!.split(';')[0]);
    expect(oldRefresh.status).toBe(401);

    const fresh = changed.body.data.access_token;
    const contexts = (await request(app).get('/api/v1/auth/contexts').set(bearer(fresh))).body.data as Ctx[];
    expect(contexts.map((c) => `${c.company_code}-${c.app_code}`)).toEqual(['DEMO1-BILLCOST', 'MDN-BILLCOST']);

    // AC-05: MDN → CREATE, READ, UPDATE, PRINT, IMPORT_EXCEL di Project Cost Shipment
    const mdnToken = await selectContext(fresh, contexts.find((c) => c.company_code === 'MDN')!);
    const menus = (await request(app).get('/api/v1/auth/menus').set(bearer(mdnToken))).body.data;
    const trx = menus.find((g: { menu_code: string }) => g.menu_code === 'BC_TRX');
    const shipment = trx.children.find((p: { menu_code: string }) => p.menu_code === 'BC_SHIPMENT');
    expect(trx.menu_name).toBe('Transaction');
    expect(shipment).toMatchObject({ menu_name: 'Project Cost Shipment', route_path: '/billcost/shipments', is_visible: true });
    expect(shipment.actions).toEqual(['CREATE', 'READ', 'UPDATE', 'PRINT', 'IMPORT_EXCEL']);
    const detail = trx.children.find((p: { menu_code: string }) => p.menu_code === 'BC_SHIPMENT_DTL');
    expect(detail.is_visible).toBe(false);

    // AC-06: DEMO1 → hanya READ dan PRINT
    const demoToken = await selectContext(fresh, contexts.find((c) => c.company_code === 'DEMO1')!);
    const perms = (await request(app).get('/api/v1/auth/permissions').set(bearer(demoToken))).body.data as string[];
    expect(new Set(perms.map((p) => p.split(':')[1]))).toEqual(new Set(['READ', 'PRINT']));

    // Login dengan password baru berhasil
    expect((await login('bc.staff', 'Baru#2026x')).status).toBe(200);
  });
});

describe('rate limit login (H9.2)', () => {
  /** Hapus penghitung rate limit login (SCAN tidak menambahkan keyPrefix otomatis) */
  async function resetLoginLimit() {
    const keys = await redis.keys(`${env.REDIS_KEY_PREFIX}ratelimit:login:*`);
    if (keys.length) await redis.del(...keys.map((k) => k.slice(env.REDIS_KEY_PREFIX.length)));
  }

  it('melebihi batas per IP → 429 TOO_MANY_REQUESTS dengan Retry-After; login lain tidak terpengaruh setelah jendela berakhir', async () => {
    const original = env.LOGIN_RATE_LIMIT;
    env.LOGIN_RATE_LIMIT = 3;
    try {
      await resetLoginLimit();
      const first = await login('auditor');
      expect(first.status).toBe(200);
      expect(first.headers['ratelimit-limit']).toBe('3');
      expect(first.headers['ratelimit-remaining']).toBe('2');
      await login('auditor', 'salah-password'); // gagal login tetap dihitung
      await login('auditor');

      const blocked = await login('auditor');
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
      expect(blocked.body.error.message).toMatch(/Coba lagi dalam \d+ detik/);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect(Number(blocked.headers['retry-after'])).toBeLessThanOrEqual(env.LOGIN_RATE_WINDOW_SECONDS);

      // Percobaan yang diblokir tidak menyentuh akun (tidak menambah failed_login_count)
      const auditor = await prisma.users.findFirstOrThrow({ where: { username: 'auditor' } });
      expect(auditor.failed_login_count).toBe(0);

      // Endpoint auth lain tidak ikut dibatasi
      expect((await request(app).post('/api/v1/auth/refresh')).status).toBe(401);

      // Setelah jendela berakhir (disimulasikan dengan menghapus penghitung) login kembali bisa
      await resetLoginLimit();
      expect((await login('auditor')).status).toBe(200);
    } finally {
      env.LOGIN_RATE_LIMIT = original;
      await resetLoginLimit();
    }
  });
});
