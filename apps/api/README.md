# MODENA Framework – API

Backend Express 4 + TypeScript + Prisma 5 + Redis sesuai `docs/PRD_user_management.md` §5, §8, §9.

## Menjalankan

```bash
cp .env.example .env       # isi DB_PASSWORD, DATABASE_URL, JWT_SECRET
npm install
npm run prisma:pull        # hanya bila DDL di database/ berubah
npm run dev                # http://localhost:3000/api/v1
```

Database adalah *source of truth* (`database/*.sql`). Jangan memakai `prisma migrate`.

## Token untuk testing tanpa frontend

Untuk mencoba endpoint lewat Postman/curl tanpa login, terbitkan token user seed:

```bash
npm run dev:token -- superadmin MDN          # konteks MDN / USRMGNT
npm run dev:token -- auditor MDN             # read-only
```

Kirim sebagai header `Authorization: Bearer <token>`. Script ini ditolak bila `NODE_ENV=production`.

## Test & reset database

```bash
npm test                          # test integrasi (database modena_test)
npm run db:reset -- modena_test   # bangun ulang database test dari DDL + seed
npm run db:reset -- modena --yes  # bangun ulang database dev (SEMUA DATA HILANG)
```

Test integrasi berjalan terhadap database terpisah `TEST_DB_NAME` (default `modena_test`) yang
dibangun ulang dari DDL + seed setiap kali test dijalankan. Database dev `modena` tidak disentuh.

## Endpoint yang tersedia

| Method | Path | Permission |
|---|---|---|
| GET | `/health` | – |
| POST | `/auth/login` · `/auth/refresh` · `/auth/logout` | – (refresh via cookie `refresh_token`; login dibatasi `LOGIN_RATE_LIMIT` per `LOGIN_RATE_WINDOW` per IP → 429) |
| GET | `/auth/me` · POST `/auth/change-password` | token valid (boleh saat wajib ganti password) |
| GET | `/auth/contexts` · POST `/auth/context` | token valid |
| GET | `/auth/menus` · `/auth/permissions` | token valid + konteks |
| GET | `/companies` · `/companies/:id` | `UM_COMPANY:READ` |
| POST | `/companies` | `UM_COMPANY:CREATE` |
| PUT | `/companies/:id` | `UM_COMPANY:UPDATE` |
| PATCH | `/companies/:id/status` | `UM_COMPANY:UPDATE` |
| POST | `/companies/:id/restore` | `UM_COMPANY:UPDATE` |
| DELETE | `/companies/:id` | `UM_COMPANY:DELETE` |
| GET | `/applications` · `/applications/:id` | `UM_APPLICATION:READ` |
| POST | `/applications` | `UM_APPLICATION:CREATE` |
| PUT · PATCH `/:id/status` · POST `/:id/restore` | `/applications/:id` | `UM_APPLICATION:UPDATE` |
| DELETE | `/applications/:id` | `UM_APPLICATION:DELETE` |
| GET | `/actions` · `/actions/:id` | `UM_ACTION:READ` |
| POST | `/actions` | `UM_ACTION:CREATE` |
| PUT · PATCH `/:id/status` · POST `/:id/restore` | `/actions/:id` | `UM_ACTION:UPDATE` |
| DELETE | `/actions/:id` | `UM_ACTION:DELETE` |
| GET | `/companies/:id/applications` | `UM_COMPANY_APP:READ` |
| POST | `/companies/:id/applications` | `UM_COMPANY_APP:CREATE` |
| DELETE | `/companies/:id/applications/:applicationId` | `UM_COMPANY_APP:DELETE` |
| GET | `/applications/:id/menus/tree` · `/menus` · `/menus/:id` · `/menus/:id/actions` | `UM_MENU:READ` |
| POST | `/menus` | `UM_MENU:CREATE` |
| PUT · PATCH `/:id/status` · POST `/:id/restore` · PUT `/:id/actions` | `/menus/:id` | `UM_MENU:UPDATE` |
| DELETE | `/menus/:id` | `UM_MENU:DELETE` |
| GET | `/users` · `/users/:id` · `/users/:id/memberships` | `UM_USER:READ` |
| POST | `/users` | `UM_USER:CREATE` |
| PUT · PATCH `/:id/status` · POST `/:id/restore` · `/:id/reset-password` · `/:id/lock` · `/:id/unlock` | `/users/:id` | `UM_USER:UPDATE` |
| DELETE | `/users/:id` | `UM_USER:DELETE` |
| GET | `/users/export` | `UM_USER:EXPORT_EXCEL` |
| GET | `/users/import/template` · POST `/users/import` (multipart, field `file`) | `UM_USER:IMPORT_EXCEL` |
| GET | `/user-groups` · `/user-groups/:id` | `UM_GROUP:READ` |
| POST | `/user-groups` · `/user-groups/:id/duplicate` | `UM_GROUP:CREATE` |
| PUT · PATCH `/:id/status` · POST `/:id/restore` | `/user-groups/:id` | `UM_GROUP:UPDATE` |
| DELETE | `/user-groups/:id` | `UM_GROUP:DELETE` |
| GET · POST · PUT `/:memberId` · DELETE `/:memberId` | `/user-groups/:id/members` | `UM_GROUP_MEMBER:READ/CREATE/UPDATE/DELETE` |
| GET · PUT | `/user-groups/:id/permissions` (matriks; PUT body `{ menu_action_ids }`) | `UM_GROUP_PERM:READ/UPDATE` |
| GET | `/lookups/applications` · `/lookups/companies?application_id=` · `/lookups/actions` · `/lookups/users?q=` · `/lookups/user-groups?application_id=` | token + konteks USRMGNT |

Query list: `page`, `page_size` (maks 100), `q`, `is_active`, `sort_by`, `sort_dir`, `include_deleted` (butuh UPDATE).

## Struktur

| Folder | Isi |
|---|---|
| `src/config` | env (divalidasi Zod), Prisma client, Redis |
| `src/middlewares` | `authenticate`, `authorize`, `requireApplication`, error handler |
| `src/lib` | JWT, permission set + cache + invalidasi (BR-22) |
| `src/modules/<nama>` | `*.routes.ts`, `*.controller.ts`, `*.service.ts`, `*.schema.ts` |
| `src/utils` | response standar, paginasi, validasi, error |
| `tests` | test integrasi (Vitest + Supertest) |
