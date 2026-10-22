import { prisma } from '../../config/db.js';
import { durationToSeconds, env } from '../../config/env.js';
import { signAccessToken } from '../../lib/jwt.js';
import { hashPassword, passwordPolicyViolations, verifyPassword } from '../../lib/password.js';
import { getPermissionSet, invalidatePermissions } from '../../lib/permissions.js';
import { refreshTokens } from '../../lib/refresh-tokens.js';
import { AppError, validationError, type ErrorDetail } from '../../utils/errors.js';

const MAX_FAILED_LOGIN = 5; // BR-16 [U]
const SYSTEM_USER = 'system';

const expiresIn = () => durationToSeconds(env.JWT_EXPIRES_IN);

export interface AccessContext {
  company_id: string;
  company_code: string;
  company_name: string;
  application_id: string;
  app_code: string;
  app_name: string;
  app_icon: string | null;
}

export interface MenuNode {
  menu_code: string;
  menu_name: string;
  menu_type: string;
  icon: string | null;
  route_path: string | null;
  is_visible: boolean;
  actions?: string[];
  children?: MenuNode[];
}

type UserRow = NonNullable<Awaited<ReturnType<typeof prisma.users.findFirst>>>;

function profile(user: UserRow) {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    email: user.email,
    employee_no: user.employee_no,
    must_change_password: user.must_change_password,
  };
}

/** FR-AUTH-03: pasangan company + aplikasi yang memiliki minimal satu permission efektif */
async function contextsFor(userId: string): Promise<AccessContext[]> {
  return prisma.$queryRaw<AccessContext[]>`
    SELECT DISTINCT v.company_id, v.company_code, c.company_name,
           v.application_id, v.app_code, a.app_name, a.icon AS app_icon
      FROM usrmgnt.user_effective_permissions v
      JOIN usrmgnt.companies    c ON c.id = v.company_id
      JOIN usrmgnt.applications a ON a.id = v.application_id
     WHERE v.user_id = ${userId}::uuid
     ORDER BY v.company_code, v.app_code`;
}

async function findUserById(userId: string) {
  return prisma.users.findFirst({ where: { id: userId, is_deleted: false } });
}

export const authService = {
  /** FR-AUTH-01 + BR-16 */
  async login(username: string, password: string) {
    const user = await prisma.users.findFirst({
      where: { username: { equals: username, mode: 'insensitive' }, is_deleted: false },
    });
    // Pesan sengaja umum agar tidak membocorkan username mana yang ada
    if (!user) throw new AppError(401, 'INVALID_CREDENTIALS', 'Username atau password salah');
    if (!user.is_active) throw new AppError(401, 'ACCOUNT_INACTIVE', 'Akun Anda tidak aktif. Hubungi administrator.');
    if (user.is_locked) throw new AppError(401, 'ACCOUNT_LOCKED', 'Akun Anda terkunci. Hubungi administrator.');
    if (user.auth_provider !== 'LOCAL') {
      throw new AppError(401, 'AUTH_PROVIDER_NOT_SUPPORTED', 'Metode login belum didukung');
    }

    if (!(await verifyPassword(password, user.password_hash))) {
      // Increment atomik agar percobaan paralel tetap terhitung
      const updated = await prisma.users.update({
        where: { id: user.id },
        data: { failed_login_count: { increment: 1 }, updated_by: SYSTEM_USER },
      });
      if (updated.failed_login_count >= MAX_FAILED_LOGIN && !updated.is_locked) {
        await prisma.users.update({
          where: { id: user.id },
          data: { is_locked: true, locked_at: new Date(), updated_by: SYSTEM_USER },
        });
        await invalidatePermissions.user(user.id);
      }
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Username atau password salah');
    }

    const loggedIn = await prisma.users.update({
      where: { id: user.id },
      data: { failed_login_count: 0, last_login_at: new Date(), updated_by: SYSTEM_USER },
    });
    const refreshToken = await refreshTokens.issue(user.id);
    return {
      refreshToken,
      body: {
        access_token: signAccessToken({ sub: user.id, username: user.username }),
        expires_in: expiresIn(),
        user: profile(loggedIn),
        contexts: await contextsFor(user.id),
      },
    };
  },

  /** Rotasi refresh token; access token baru tanpa ctx (frontend memilih ulang konteks) */
  async refresh(token: string | undefined) {
    const invalid = new AppError(401, 'UNAUTHENTICATED', 'Sesi telah berakhir. Silakan login kembali.');
    if (!token) throw invalid;
    const userId = await refreshTokens.lookup(token);
    if (!userId) throw invalid;
    const user = await findUserById(userId);
    await refreshTokens.revoke(token);
    if (!user || !user.is_active || user.is_locked) throw invalid;

    return {
      refreshToken: await refreshTokens.issue(user.id),
      body: { access_token: signAccessToken({ sub: user.id, username: user.username }), expires_in: expiresIn() },
    };
  },

  async logout(token: string | undefined) {
    if (token) await refreshTokens.revoke(token);
  },

  /** FR-AUTH-06 */
  async me(userId: string, ctx: { company_id: string; application_id: string } | null) {
    const user = await findUserById(userId);
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Sesi tidak valid. Silakan login kembali.');
    const context = ctx
      ? (await contextsFor(userId)).find((c) => c.company_id === ctx.company_id && c.application_id === ctx.application_id) ?? null
      : null;
    return { ...profile(user), context };
  },

  /** FR-AUTH-05 + BR-18 */
  async changePassword(userId: string, input: { old_password: string; new_password: string; confirm_password: string }) {
    const user = await findUserById(userId);
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Sesi tidak valid. Silakan login kembali.');

    if (!(await verifyPassword(input.old_password, user.password_hash))) {
      throw validationError([{ field: 'old_password', message: 'Password lama salah' }]);
    }
    const details: ErrorDetail[] = passwordPolicyViolations(input.new_password, input.old_password).map((message) => ({
      field: 'new_password',
      message,
    }));
    if (input.new_password !== input.confirm_password) {
      details.push({ field: 'confirm_password', message: 'Konfirmasi password tidak sama' });
    }
    if (details.length) throw validationError(details);

    await prisma.users.update({
      where: { id: user.id },
      data: {
        password_hash: await hashPassword(input.new_password),
        password_changed_at: new Date(),
        must_change_password: false,
        updated_by: user.username,
      },
    });
    // Cabut semua sesi lain, lalu terbitkan sesi baru untuk device ini
    await refreshTokens.revokeAll(user.id);
    return {
      refreshToken: await refreshTokens.issue(user.id),
      body: { access_token: signAccessToken({ sub: user.id, username: user.username }), expires_in: expiresIn() },
    };
  },

  contexts: contextsFor,

  /** FR-AUTH-03: validasi akses lalu terbitkan token dengan claim ctx */
  async selectContext(userId: string, username: string, companyId: string, applicationId: string) {
    const context = (await contextsFor(userId)).find(
      (c) => c.company_id === companyId && c.application_id === applicationId,
    );
    if (!context) throw new AppError(403, 'FORBIDDEN', 'Anda tidak memiliki akses ke company dan aplikasi tersebut');
    return {
      access_token: signAccessToken({ sub: userId, username, ctx: { company_id: companyId, application_id: applicationId } }),
      expires_in: expiresIn(),
      context,
    };
  },

  /** FR-AUTH-04: PAGE dengan READ + seluruh GROUP leluhurnya, urut sort_order */
  async menus(userId: string, companyId: string, applicationId: string): Promise<MenuNode[]> {
    const [perms, menus, actions] = await Promise.all([
      getPermissionSet(userId, companyId, applicationId),
      prisma.menus.findMany({ where: { application_id: applicationId, is_deleted: false, is_active: true } }),
      prisma.actions.findMany({ where: { is_deleted: false }, select: { action_code: true, sort_order: true } }),
    ]);
    const actionOrder = new Map(actions.map((a) => [a.action_code, a.sort_order]));
    const byId = new Map(menus.map((m) => [m.id, m]));

    const actionsOf = (menuCode: string) =>
      [...perms.keys]
        .filter((k) => k.startsWith(`${menuCode}:`))
        .map((k) => k.slice(menuCode.length + 1))
        .sort((a, b) => (actionOrder.get(a) ?? 99) - (actionOrder.get(b) ?? 99));

    const included = new Set<string>();
    for (const m of menus) {
      if (m.menu_type !== 'PAGE' || !perms.keys.has(`${m.menu_code}:READ`)) continue;
      for (let cur: typeof m | undefined = m; cur; cur = cur.parent_id ? byId.get(cur.parent_id) : undefined) {
        included.add(cur.id);
      }
    }

    const build = (parentId: string | null): MenuNode[] =>
      menus
        .filter((m) => m.parent_id === parentId && included.has(m.id))
        .sort((a, b) => a.sort_order - b.sort_order || a.menu_code.localeCompare(b.menu_code))
        .map((m) => ({
          menu_code: m.menu_code,
          menu_name: m.menu_name,
          menu_type: m.menu_type,
          icon: m.icon,
          route_path: m.route_path,
          is_visible: m.is_visible,
          ...(m.menu_type === 'PAGE' ? { actions: actionsOf(m.menu_code) } : { children: build(m.id) }),
        }));
    return build(null);
  },

  async permissions(userId: string, companyId: string, applicationId: string) {
    return [...(await getPermissionSet(userId, companyId, applicationId)).keys].sort();
  },
};
