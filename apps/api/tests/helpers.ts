import { prisma } from '../src/config/db.js';
import { signAccessToken } from '../src/lib/jwt.js';

/** Token untuk user seed dengan konteks company + aplikasi (atau tanpa konteks) */
export async function tokenFor(username: string, companyCode: string | null = 'MDN', appCode = 'USRMGNT') {
  const user = await prisma.users.findFirstOrThrow({ where: { username } });
  if (!companyCode) return signAccessToken({ sub: user.id, username: user.username });
  const company = await prisma.companies.findFirstOrThrow({ where: { company_code: companyCode, is_deleted: false } });
  const app = await prisma.applications.findFirstOrThrow({ where: { app_code: appCode } });
  return signAccessToken({ sub: user.id, username: user.username, ctx: { company_id: company.id, application_id: app.id } });
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
