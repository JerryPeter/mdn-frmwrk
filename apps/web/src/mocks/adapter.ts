// =====================================================================
// Axios adapter mock untuk endpoint /auth/* (PRD §8.1, §9).
// Aktif bila VITE_USE_MOCK=true. Meniru aturan backend: BR-16 (lockout),
// BR-17 (wajib ganti password), BR-18 (kebijakan password), FR-AUTH-03/04.
// State (password, lockout, refresh token) disimpan di localStorage agar
// bertahan saat reload. Panggil resetMockDb() untuk kembali ke data seed.
// =====================================================================
import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import type { ApiErrorCode } from '@/types/api';
import type { AccessContext, MenuNode } from '@/types/auth';
import { validatePassword } from '@/lib/password';
import {
  SEED_PASSWORD,
  applications,
  companies,
  companyApplications,
  groupPermissions,
  memberships,
  menus,
  seedUsers,
  type MockUser,
} from './data';

const DB_KEY = 'modena.mock.db';
const REFRESH_COOKIE_KEY = 'modena.mock.refreshCookie'; // pengganti cookie httpOnly
const ACCESS_TTL_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGIN = 5;

interface MockDb {
  users: MockUser[];
  passwords: Record<string, string>; // user_id -> password (plain, hanya mock)
  refreshTokens: Record<string, string>; // token -> user_id
}

interface TokenClaims {
  sub: string;
  username: string;
  ctx?: { company_id: string; application_id: string };
  exp: number;
}

function seedDb(): MockDb {
  const users = seedUsers.map((u) => ({ ...u }));
  const passwords: Record<string, string> = {};
  users.filter((u) => u.auth_provider === 'LOCAL').forEach((u) => (passwords[u.id] = SEED_PASSWORD));
  return { users, passwords, refreshTokens: {} };
}

function loadDb(): MockDb {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw) as MockDb;
  } catch {
    /* data rusak → pakai seed */
  }
  return seedDb();
}

function saveDb(db: MockDb) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

export function resetMockDb() {
  localStorage.removeItem(DB_KEY);
  localStorage.removeItem(REFRESH_COOKIE_KEY);
}

// ---------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------
function signToken(claims: Omit<TokenClaims, 'exp'>): string {
  const payload: TokenClaims = { ...claims, exp: Date.now() + ACCESS_TTL_MS };
  return `mock.${btoa(JSON.stringify(payload))}`;
}

function decodeToken(token: string): TokenClaims | null {
  try {
    if (!token.startsWith('mock.')) return null;
    return JSON.parse(atob(token.slice(5))) as TokenClaims;
  } catch {
    return null;
  }
}

function issueRefreshToken(db: MockDb, userId: string) {
  const token = crypto.randomUUID();
  db.refreshTokens[token] = userId;
  localStorage.setItem(REFRESH_COOKIE_KEY, token);
}

// ---------------------------------------------------------------------
// Hak akses efektif (meniru view usrmgnt.user_effective_permissions)
// ---------------------------------------------------------------------
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function activeMemberships(user: MockUser) {
  if (!user.is_active || user.is_locked) return [];
  const now = today();
  return memberships.filter(
    (m) =>
      m.username === user.username &&
      m.valid_from <= now &&
      (m.valid_to === null || now <= m.valid_to) &&
      companyApplications.some(([c, a]) => c === m.company_code && a === m.app_code),
  );
}

/** Set "MENU_CODE:ACTION_CODE" untuk user pada company + aplikasi (BR-09 union) */
function effectivePermissions(user: MockUser, companyCode: string, appCode: string): Set<string> {
  const result = new Set<string>();
  for (const m of activeMemberships(user)) {
    if (m.company_code !== companyCode || m.app_code !== appCode) continue;
    const gp = groupPermissions[m.group_code];
    if (!gp) continue;
    if (gp.perms === 'ALL') {
      menus
        .filter((mn) => mn.app_code === appCode && mn.menu_type === 'PAGE')
        .forEach((mn) => mn.actions.forEach((a) => result.add(`${mn.menu_code}:${a}`)));
    } else {
      gp.perms
        .filter(([menuCode, action]) => menus.some((mn) => mn.menu_code === menuCode && mn.actions.includes(action)))
        .forEach(([menuCode, action]) => result.add(`${menuCode}:${action}`));
    }
  }
  return result;
}

function contextsFor(user: MockUser): AccessContext[] {
  const seen = new Set<string>();
  const list: AccessContext[] = [];
  for (const m of activeMemberships(user)) {
    const key = `${m.company_code}|${m.app_code}`;
    if (seen.has(key) || effectivePermissions(user, m.company_code, m.app_code).size === 0) continue;
    seen.add(key);
    const c = companies.find((x) => x.company_code === m.company_code)!;
    const a = applications.find((x) => x.app_code === m.app_code)!;
    list.push({
      company_id: c.id,
      company_code: c.company_code,
      company_name: c.company_name,
      application_id: a.id,
      app_code: a.app_code,
      app_name: a.app_name,
      app_icon: a.icon,
    });
  }
  return list.sort((x, y) => x.company_code.localeCompare(y.company_code) || x.app_code.localeCompare(y.app_code));
}

function resolveContext(ctx: TokenClaims['ctx']) {
  if (!ctx) return null;
  const c = companies.find((x) => x.id === ctx.company_id);
  const a = applications.find((x) => x.id === ctx.application_id);
  return c && a ? { company: c, app: a } : null;
}

/** Pohon menu: PAGE dengan READ + seluruh GROUP leluhurnya (FR-AUTH-04) */
function menuTree(perms: Set<string>, appCode: string): MenuNode[] {
  const appMenus = menus.filter((m) => m.app_code === appCode);
  const included = new Set<string>();
  for (const m of appMenus) {
    if (m.menu_type !== 'PAGE' || !perms.has(`${m.menu_code}:READ`)) continue;
    let cur: typeof m | undefined = m;
    while (cur) {
      included.add(cur.menu_code);
      cur = cur.parent_code ? appMenus.find((x) => x.menu_code === cur!.parent_code) : undefined;
    }
  }
  const build = (parent: string | null): MenuNode[] =>
    appMenus
      .filter((m) => m.parent_code === parent && included.has(m.menu_code))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((m) => ({
        menu_code: m.menu_code,
        menu_name: m.menu_name,
        menu_type: m.menu_type,
        icon: m.icon,
        route_path: m.route_path,
        is_visible: m.is_visible,
        ...(m.menu_type === 'PAGE'
          ? { actions: m.actions.filter((a) => perms.has(`${m.menu_code}:${a}`)) }
          : { children: build(m.menu_code) }),
      }));
  return build(null);
}

// ---------------------------------------------------------------------
// Helper response
// ---------------------------------------------------------------------
class MockHttpError extends Error {
  constructor(public status: number, public code: ApiErrorCode, message: string, public details?: Array<{ field: string; message: string }>) {
    super(message);
  }
}

const fail = (status: number, code: ApiErrorCode, message: string, details?: Array<{ field: string; message: string }>) => {
  throw new MockHttpError(status, code, message, details);
};

function authenticate(db: MockDb, config: InternalAxiosRequestConfig, allowMustChange = false) {
  const header = String(config.headers?.Authorization ?? '');
  const claims = header.startsWith('Bearer ') ? decodeToken(header.slice(7)) : null;
  if (!claims) fail(401, 'UNAUTHENTICATED', 'Sesi tidak valid. Silakan login kembali.');
  if (claims!.exp < Date.now()) fail(401, 'TOKEN_EXPIRED', 'Sesi telah berakhir.');
  const user = db.users.find((u) => u.id === claims!.sub);
  if (!user || !user.is_active) fail(401, 'UNAUTHENTICATED', 'Sesi tidak valid. Silakan login kembali.');
  if (user!.is_locked) fail(401, 'ACCOUNT_LOCKED', 'Akun Anda terkunci. Hubungi administrator.');
  if (user!.must_change_password && !allowMustChange) {
    fail(403, 'PASSWORD_CHANGE_REQUIRED', 'Anda wajib mengganti password terlebih dahulu.');
  }
  return { user: user!, claims: claims! };
}

function profile(user: MockUser) {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    email: user.email,
    employee_no: user.employee_no,
    must_change_password: user.must_change_password,
  };
}

// ---------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------
type Handler = (db: MockDb, body: Record<string, unknown>, config: InternalAxiosRequestConfig) => unknown;

const routes: Record<string, Handler> = {
  'POST /auth/login': (db, body) => {
    const username = String(body.username ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    if (!username || !password) {
      fail(400, 'VALIDATION_ERROR', 'Data tidak valid', [
        ...(!username ? [{ field: 'username', message: 'Username wajib diisi' }] : []),
        ...(!password ? [{ field: 'password', message: 'Password wajib diisi' }] : []),
      ]);
    }
    const user = db.users.find((u) => u.username.toLowerCase() === username);
    if (!user) fail(401, 'INVALID_CREDENTIALS', 'Username atau password salah');
    const u = user!;
    if (!u.is_active) fail(401, 'ACCOUNT_INACTIVE', 'Akun Anda tidak aktif. Hubungi administrator.');
    if (u.is_locked) fail(401, 'ACCOUNT_LOCKED', 'Akun Anda terkunci. Hubungi administrator.');
    if (u.auth_provider !== 'LOCAL') fail(401, 'AUTH_PROVIDER_NOT_SUPPORTED', 'Metode login belum didukung');

    if (db.passwords[u.id] !== password) {
      u.failed_login_count += 1;
      if (u.failed_login_count >= MAX_FAILED_LOGIN) u.is_locked = true; // BR-16
      saveDb(db);
      fail(401, 'INVALID_CREDENTIALS', 'Username atau password salah');
    }

    u.failed_login_count = 0;
    issueRefreshToken(db, u.id);
    saveDb(db);
    return {
      access_token: signToken({ sub: u.id, username: u.username }),
      expires_in: ACCESS_TTL_MS / 1000,
      user: profile(u),
      contexts: contextsFor(u),
    };
  },

  'POST /auth/refresh': (db) => {
    const token = localStorage.getItem(REFRESH_COOKIE_KEY);
    const userId = token ? db.refreshTokens[token] : undefined;
    const user = db.users.find((u) => u.id === userId);
    if (!token || !user || !user.is_active || user.is_locked) {
      fail(401, 'UNAUTHENTICATED', 'Sesi telah berakhir. Silakan login kembali.');
    }
    delete db.refreshTokens[token!]; // rotasi
    issueRefreshToken(db, user!.id);
    saveDb(db);
    return { access_token: signToken({ sub: user!.id, username: user!.username }), expires_in: ACCESS_TTL_MS / 1000 };
  },

  'POST /auth/logout': (db) => {
    const token = localStorage.getItem(REFRESH_COOKIE_KEY);
    if (token) delete db.refreshTokens[token];
    localStorage.removeItem(REFRESH_COOKIE_KEY);
    saveDb(db);
    return null;
  },

  'GET /auth/me': (db, _body, config) => {
    const { user, claims } = authenticate(db, config, true);
    const ctx = resolveContext(claims.ctx);
    return {
      ...profile(user),
      context: ctx ? contextsFor(user).find((c) => c.company_id === ctx.company.id && c.application_id === ctx.app.id) ?? null : null,
    };
  },

  'POST /auth/change-password': (db, body, config) => {
    const { user } = authenticate(db, config, true);
    const oldPassword = String(body.old_password ?? '');
    const newPassword = String(body.new_password ?? '');
    const confirm = String(body.confirm_password ?? '');
    if (db.passwords[user.id] !== oldPassword) {
      fail(400, 'VALIDATION_ERROR', 'Data tidak valid', [{ field: 'old_password', message: 'Password lama salah' }]);
    }
    const details = validatePassword(newPassword, oldPassword).map((message) => ({ field: 'new_password', message }));
    if (newPassword !== confirm) details.push({ field: 'confirm_password', message: 'Konfirmasi password tidak sama' });
    if (details.length) fail(400, 'VALIDATION_ERROR', 'Data tidak valid', details);

    db.passwords[user.id] = newPassword;
    user.must_change_password = false;
    // Cabut semua refresh token user, lalu terbitkan sesi baru untuk device ini
    Object.keys(db.refreshTokens).forEach((t) => db.refreshTokens[t] === user.id && delete db.refreshTokens[t]);
    issueRefreshToken(db, user.id);
    saveDb(db);
    return { access_token: signToken({ sub: user.id, username: user.username }), expires_in: ACCESS_TTL_MS / 1000 };
  },

  'GET /auth/contexts': (db, _body, config) => contextsFor(authenticate(db, config).user),

  'POST /auth/context': (db, body, config) => {
    const { user } = authenticate(db, config);
    const ctx = contextsFor(user).find(
      (c) => c.company_id === body.company_id && c.application_id === body.application_id,
    );
    if (!ctx) fail(403, 'FORBIDDEN', 'Anda tidak memiliki akses ke company dan aplikasi tersebut');
    return {
      access_token: signToken({
        sub: user.id,
        username: user.username,
        ctx: { company_id: ctx!.company_id, application_id: ctx!.application_id },
      }),
      expires_in: ACCESS_TTL_MS / 1000,
      context: ctx,
    };
  },

  'GET /auth/menus': (db, _body, config) => {
    const { user, claims } = authenticate(db, config);
    const ctx = resolveContext(claims.ctx);
    if (!ctx) fail(403, 'CONTEXT_REQUIRED', 'Silakan pilih company dan aplikasi terlebih dahulu');
    return menuTree(effectivePermissions(user, ctx!.company.company_code, ctx!.app.app_code), ctx!.app.app_code);
  },

  'GET /auth/permissions': (db, _body, config) => {
    const { user, claims } = authenticate(db, config);
    const ctx = resolveContext(claims.ctx);
    if (!ctx) fail(403, 'CONTEXT_REQUIRED', 'Silakan pilih company dan aplikasi terlebih dahulu');
    return [...effectivePermissions(user, ctx!.company.company_code, ctx!.app.app_code)].sort();
  },
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const mockAdapter: AxiosAdapter = async (config) => {
  await delay(250);
  const base = config.baseURL ?? '';
  let path = (config.url ?? '').split('?')[0];
  if (base && path.startsWith(base)) path = path.slice(base.length);
  const key = `${(config.method ?? 'get').toUpperCase()} ${path}`;

  const respond = (status: number, data: unknown): AxiosResponse => ({
    data,
    status,
    statusText: String(status),
    headers: {},
    config,
  });

  let body: Record<string, unknown> = {};
  if (typeof config.data === 'string' && config.data) {
    try {
      body = JSON.parse(config.data);
    } catch {
      /* body bukan JSON */
    }
  }

  try {
    const handler = routes[key];
    if (!handler) fail(404, 'NOT_FOUND', `Endpoint ${key} belum tersedia di mock`);
    const db = loadDb();
    const data = handler!(db, body, config);
    return respond(200, { success: true, data, message: 'OK' });
  } catch (err) {
    if (err instanceof MockHttpError) {
      const res = respond(err.status, {
        success: false,
        error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
      });
      throw new AxiosError(err.message, String(err.status), config, null, res);
    }
    throw err;
  }
};
