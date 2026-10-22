/**
 * KHUSUS DEVELOPMENT: terbitkan access token untuk user seed tanpa login,
 * selama endpoint /auth/login (Tahap 2) belum dibuat.
 *
 *   npm run dev:token -- <username> [company_code=MDN] [app_code=USRMGNT]
 *   npm run dev:token -- superadmin MDN
 */
import { prisma } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { signAccessToken } from '../src/lib/jwt.js';

if (env.NODE_ENV === 'production') {
  console.error('dev:token tidak boleh dipakai di production.');
  process.exit(1);
}

const [username, companyCode = 'MDN', appCode = 'USRMGNT'] = process.argv.slice(2);
if (!username) {
  console.error('Pemakaian: npm run dev:token -- <username> [company_code] [app_code]');
  process.exit(1);
}

const user = await prisma.users.findFirst({ where: { username: { equals: username, mode: 'insensitive' }, is_deleted: false } });
const company = await prisma.companies.findFirst({ where: { company_code: companyCode, is_deleted: false } });
const app = await prisma.applications.findFirst({ where: { app_code: appCode, is_deleted: false } });
await prisma.$disconnect();

if (!user || !company || !app) {
  console.error(`Tidak ditemukan: ${[!user && `user ${username}`, !company && `company ${companyCode}`, !app && `aplikasi ${appCode}`].filter(Boolean).join(', ')}`);
  process.exit(1);
}

const token = signAccessToken({
  sub: user.id,
  username: user.username,
  ctx: { company_id: company.id, application_id: app.id },
});

console.log(`\nToken ${user.username} @ ${company.company_code}/${app.app_code} (berlaku ${env.JWT_EXPIRES_IN}):\n`);
console.log(token);
console.log(`\nContoh:\ncurl -H "Authorization: Bearer ${token.slice(0, 20)}..." http://localhost:${env.PORT}/api/v1/companies\n`);
