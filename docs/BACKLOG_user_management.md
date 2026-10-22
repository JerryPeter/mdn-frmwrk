# Backlog & Progress – User Management (RBAC) MODENA Framework

| Item | Keterangan |
|---|---|
| Acuan | `docs/PRD_user_management_v2.md` (as-built, acuan utama sesi berikutnya), `docs/PRD_user_management.md` v1.0 (riwayat), `database/01_user_management.sql` v0.5.0 |
| Repository | https://github.com/JerryPeter/mdn-frmwrk (branch `main`) |
| Database dev | PostgreSQL 18.3 lokal, database `modena`, schema `usrmgnt` (DDL + seed sudah dijalankan) |
| Posisi terakhir | 22 Oktober 2026 |
| Tahap berjalan | Tahap 2 s.d. 8 selesai; Tahap 9 berjalan (H9.1, H9.2 selesai). Berikutnya: H9.3 logging, H9.5 uji kinerja, FE-4.15, SET-1.2 |

**Status yang dipakai**

| Status | Arti |
|---|---|
| ✅ Selesai | Dikerjakan dan sudah diverifikasi |
| 🟡 Selesai (mock) | Dikerjakan di frontend, diverifikasi terhadap mock API; belum diuji dengan backend asli |
| 🔶 Sebagian | Sebagian sudah dikerjakan; lihat catatan |
| ⬜ Belum | Belum dimulai |
| ❓ Perlu keputusan | Menunggu keputusan pemilik produk sebelum bisa dikerjakan/difinalkan |

---

## 1. Ringkasan per Tahap

Urutan tahap mengikuti PRD §14.

| Tahap | Lingkup | Status | Selesai bila (PRD) |
|---|---|---|---|
| 0 | Desain database (DDL + seed) dan penerapan ke database dev | ✅ Selesai | DDL v0.5.0 dan seed sudah berjalan di database `modena` |
| 1 | Setup monorepo, koneksi DB/Redis, Prisma, format response | 🔶 Sebagian | Health check `/api/v1/health` OK (sudah terpenuhi; sisa: workspace root, `.gitattributes`) |
| 2 | Auth backend: login, refresh, logout, me, ganti password, lockout | ✅ Selesai | AC-01 s.d. AC-04 lulus (sudah, test integrasi backend) |
| 3 | Konteks, menu, permission, middleware `authorize`, cache Redis | ✅ Selesai | AC-05 s.d. AC-07 lulus (sudah, backend + browser) |
| 4 | Frontend: login, pilih konteks, ganti password, layout + sidebar, `usePermission`, route guard | ✅ Selesai | Navigasi sesuai akses tiap akun uji (sudah, diuji di browser terhadap backend asli) |
| 5 | CRUD Companies, Applications, Actions, Company Applications | ✅ Selesai | AC-11, AC-12 lulus (sudah, backend + halaman Companies) |
| 6 | Menus + action per menu | ✅ Selesai | AC-08 lulus (sudah, backend + browser) |
| 7 | Users (CRUD, reset/lock/unlock, export/import) | ✅ Selesai | AC-15, AC-16 lulus (sudah, backend + browser) |
| 8 | User Groups, Group Members, Group Permissions (matriks) | ✅ Selesai | AC-09, AC-10, AC-13, AC-14 lulus (sudah, backend; alur UI diuji di browser) |
| 9 | Hardening: rate limit, logging, test integrasi menyeluruh | 🔶 Sebagian | Seluruh AC lulus (sudah); sisa: logging terstruktur, uji kinerja |

> **Catatan urutan:** Tahap 4 dikerjakan lebih dulu daripada Tahap 1–3 dengan mock API di `apps/web/src/mocks/`. Sejak 16-10-2026 frontend memakai backend asli (FE-4.14). Mock masih tersedia lewat `VITE_USE_MOCK=true`, tetapi hanya mencakup endpoint `/auth/*`.

---

## 2. Backlog Detail

### Tahap 0 – Database

| ID | Item | Ref PRD | Status | Catatan |
|---|---|---|---|---|
| DB-0.1 | DDL schema `usrmgnt` (tabel, index parsial, trigger, view `user_effective_permissions`) | §5.3, §6 | ✅ Selesai | `database/01_user_management.sql` v0.5.0 |
| DB-0.2 | Data dictionary + ERD | §6 | ✅ Selesai | `database/01_user_management.md` |
| DB-0.3 | Data seed akun uji | §12 | ✅ Selesai | `database/02_seed_sample_data.sql` |
| DB-0.4 | Buat database dev `modena` dan jalankan DDL ke schema `usrmgnt` | §5.3 | ✅ Selesai | 16-10-2026. Terverifikasi: 10 tabel, 1 view, 5 function, 14 trigger, 30 index, 6 action bawaan |
| DB-0.5 | Jalankan data seed ke database `modena` | §12 | ✅ Selesai | 16-10-2026. Terverifikasi: 3 company, 3 aplikasi, 19 menu, 6 group, 8 user, 12 keanggotaan; hak akses efektif per akun uji sesuai PRD §12 dan identik dengan mock frontend |
| DB-0.6 | Script reset database dev (drop → DDL → seed) | – | ✅ Selesai | `npm run db:reset -- <db>` di `apps/api` (database selain `modena_test` wajib `--yes`); dipakai juga oleh setup test |

### Tahap 1 – Fondasi

| ID | Item | Ref PRD | Status | Catatan |
|---|---|---|---|---|
| SET-1.1 | Inisialisasi git repository + push ke GitHub | – | ✅ Selesai | 16-10-2026. Commit awal `c54c336` di `main`; `.gitignore` root mengecualikan `.env`, `node_modules`, `dist`, `.claude/settings.local.json` (sudah dicek: `.env` tidak ikut ter-upload) |
| SET-1.1b | Tambah `.gitattributes` untuk konsistensi akhir baris (LF/CRLF) | – | ✅ Selesai | 22-10-2026: `* text=auto eol=lf`, skrip Windows CRLF, file biner ditandai |
| SET-1.2 | Struktur monorepo (`apps/api`, `apps/web`, workspace root) | §5.2 | 🔶 Sebagian | `apps/web` dan `apps/api` sudah ada; konfigurasi workspace root (npm workspaces) belum |
| SET-1.3 | `.env.example` (DATABASE_URL, REDIS_URL, JWT_*, CORS_ORIGIN) | §11 | ✅ Selesai | `apps/api/.env.example` berisi DATABASE_URL, REDIS_URL, JWT_*, CORS_ORIGIN, TEST_DB_NAME. Nilai DB lama di `apps/web/.env` tidak dipakai lagi oleh siapa pun dan boleh dihapus |
| SET-1.4 | Setup Express 4 + TypeScript | §5.1 | ✅ Selesai | Express 4 + TypeScript (ESM), `helmet`, CORS dari `CORS_ORIGIN` |
| SET-1.5 | Koneksi PostgreSQL + `prisma db pull` dengan `multiSchema` | §5.3 | ✅ Selesai | Prisma 5.22 + `multiSchema`, `prisma db pull` ke `modena` → 10 model. Unique index parsial memang tidak terbawa ke schema Prisma (sesuai PRD §5.3) |
| SET-1.6 | Koneksi Redis | §5.1 | ✅ Selesai | Memurai (Redis) lokal. Bila Redis mati, permission dibaca langsung dari database (cache opsional) |
| SET-1.7 | Error handler + format response standar + pemetaan error Prisma/trigger (P2002, P0001, 23503) | §8.3, §9.1 | ✅ Selesai | `src/middlewares/error.ts` + `src/utils/response.ts`; pesan validasi Zod dalam Bahasa Indonesia |
| SET-1.8 | Endpoint health check `/api/v1/health` | §14 | ✅ Selesai | `GET /api/v1/health` mengembalikan status database dan Redis |

### Tahap 2 – Auth Backend

| ID | Item | Ref PRD | Status | Catatan |
|---|---|---|---|---|
| AUTH-2.1 | `POST /auth/login` (case-insensitive, validasi status akun, LOCAL saja) | FR-AUTH-01 | ✅ Selesai | `POST /auth/login`; username tidak membedakan huruf besar/kecil; pesan gagal umum |
| AUTH-2.2 | Lockout setelah 5 kali gagal, reset counter saat sukses | BR-16 | ✅ Selesai | Increment atomik `failed_login_count`; percobaan ke-5 mengunci akun |
| AUTH-2.3 | Access token JWT 15 menit | FR-AUTH-02 | ✅ Selesai | `expires_in` 900 detik; claim `sub`, `username`, `ctx` |
| AUTH-2.4 | Refresh token di Redis + cookie httpOnly, rotasi | FR-AUTH-02 | ✅ Selesai | Redis `refresh:{token}` + `user_refresh:{user_id}`; cookie `refresh_token` httpOnly, sameSite=strict, path `/api/v1/auth`; `secure` hanya di production |
| AUTH-2.5 | `POST /auth/logout` | FR-AUTH-02 | ✅ Selesai | Menghapus token di Redis dan cookie |
| AUTH-2.6 | `GET /auth/me` | FR-AUTH-06 | ✅ Selesai | Termasuk konteks aktif |
| AUTH-2.7 | `POST /auth/change-password` + kebijakan password + cabut refresh token | FR-AUTH-05, BR-18 | ✅ Selesai | Kebijakan BR-18; cabut semua refresh token lalu terbitkan sesi baru untuk device ini |
| AUTH-2.8 | Middleware blokir endpoint bila `must_change_password` (403 `PASSWORD_CHANGE_REQUIRED`) | BR-17 | ✅ Selesai | Middleware `authenticate` menolak dengan 403 `PASSWORD_CHANGE_REQUIRED`; juga menolak user nonaktif/terkunci walau token masih berlaku |
| AUTH-2.9 | Test AC-01 s.d. AC-04 | §13 | ✅ Selesai | `apps/api/tests/auth.test.ts` (12 test) |

### Tahap 3 – Konteks & Otorisasi Backend

| ID | Item | Ref PRD | Status | Catatan |
|---|---|---|---|---|
| AUTHZ-3.1 | `GET /auth/contexts` | FR-AUTH-03 | ✅ Selesai | Dari view hak akses efektif + nama company/aplikasi dan ikon |
| AUTHZ-3.2 | `POST /auth/context` (token baru dengan claim `ctx`) | FR-AUTH-03 | ✅ Selesai | Token baru dengan claim `ctx`; konteks yang tidak dimiliki → 403 |
| AUTHZ-3.3 | `GET /auth/menus` (PAGE dengan READ + GROUP leluhur) | FR-AUTH-04 | ✅ Selesai | Termasuk `is_visible` dan action efektif per halaman, urut `sort_order` |
| AUTHZ-3.4 | `GET /auth/permissions` | FR-AUTH-04 | ✅ Selesai | Array permission key terurut |
| AUTHZ-3.5 | Middleware `authorize(menuCode, actionCode)` | FR-AUTHZ-01 | ✅ Selesai | `authorize(menu, action)` + `requireApplication('USRMGNT')`; sumber view `user_effective_permissions` |
| AUTHZ-3.6 | Cache permission Redis `perm:{user}:{company}:{app}` TTL 10 menit | FR-AUTHZ-01 | ✅ Selesai | Key `perm:{user}:{company}:{app}`, TTL `PERMISSION_CACHE_TTL` (600 detik) |
| AUTHZ-3.7 | Test AC-05 s.d. AC-07 | §13 | ✅ Selesai | AC-05 dan AC-06 lulus (backend + browser). AC-07: `auditor` → `POST /users` 403 (`tests/users.test.ts`) |

### Tahap 4 – Frontend Auth & Layout

| ID | Item | Ref PRD | Status | Catatan |
|---|---|---|---|---|
| FE-4.1 | Setup React 18 + Vite + TS + Tailwind + TanStack Query + Zustand | §5.1 | ✅ Selesai | `apps/web/`; typecheck dan build bersih |
| FE-4.2 | Axios client: Bearer token, refresh otomatis saat `TOKEN_EXPIRED`, terjemahan error | FR-AUTH-02, §9.1 | ✅ Selesai | |
| FE-4.3 | Mock API berbasis data seed (lockout, wajib ganti password, konteks, menu, permission) | – | ✅ Selesai | Aktif bila `VITE_USE_MOCK=true` |
| FE-4.4 | Halaman Login (`/login`) | §10 | ✅ Selesai | Pesan error per kode; panel akun uji hanya di mode mock |
| FE-4.5 | Halaman Pilih Konteks (`/select-context`), pilih otomatis bila hanya satu | FR-AUTH-03 | ✅ Selesai | |
| FE-4.6 | Halaman Ganti Password (`/change-password`), dipaksa bila `must_change_password` | FR-AUTH-05, BR-17 | ✅ Selesai | Checklist kebijakan password langsung tampil saat mengetik |
| FE-4.7 | AppLayout: header (aplikasi, company aktif, ganti konteks, menu profil/logout) | FR-AUTH-03, §10 | ✅ Selesai | |
| FE-4.8 | Sidebar dinamis dari `/auth/menus`, menu `is_visible=false` disembunyikan | FR-AUTH-04 | ✅ Selesai | |
| FE-4.9 | Hook `usePermission` + komponen `PermissionGate` | FR-AUTHZ-03 | ✅ Selesai | |
| FE-4.10 | Route guard (login, wajib ganti password, konteks, READ per menu) | FR-AUTHZ-03 | ✅ Selesai | |
| FE-4.11 | Halaman 403 dan 404 | §10 | ✅ Selesai | |
| FE-4.12 | Pemulihan sesi saat reload (kembali ke halaman dan konteks terakhir) | FR-AUTH-02 | ✅ Selesai | |
| FE-4.13 | Responsif desktop 1280px + tablet (sidebar jadi drawer) | §10 | ✅ Selesai | Diperiksa di lebar 1366px dan 820px |
| FE-4.14 | Uji ulang seluruh alur terhadap backend asli | §14 | ✅ Selesai | 16-10-2026: 34 skenario browser lulus terhadap backend asli (login, ganti password, konteks, menu, hak akses, CRUD Companies, reload, logout). Diuji di database `modena_test`, bukan `modena` |
| FE-4.15 | Simpan test browser (Playwright) di repo | §11 | ⬜ Belum | Script browser test masih di luar repo; perlu dipindah ke `apps/web/e2e` (Playwright) |
| FE-4.16 | Pilihan tema Terang / Gelap / Ikuti sistem | – (permintaan tambahan) | ✅ Selesai | Tombol tema di header aplikasi dan halaman login; tersimpan di `localStorage` (`modena-theme`), diterapkan sebelum render pertama (tanpa kedipan), mengikuti perubahan tema OS. Warna lewat CSS variable (`src/styles/theme.css`) sehingga seluruh halaman ikut tanpa class `dark:` per komponen |

### Tahap 5 – Master Dasar

| ID | Item | Ref PRD | Status | Catatan |
|---|---|---|---|---|
| M5.1 | Komponen standar: tabel (paginasi, pencarian, filter), badge status, form modal/drawer, dialog konfirmasi | §10 | ✅ Selesai | `Modal`, `Drawer`, `ConfirmDialog`, `StatusBadge`, `Pagination`, `SortableHeader`, `TextAreaField`, `useDebounce`, `formatDateTime` (WIB). Toast dipindah ke kanan bawah agar tidak menutupi tombol header Ditambah `IconButton`, `SearchInput`, `StatusTabs` (dipakai Companies & Applications). |
| M5.2 | Endpoint lookup (`/lookups/companies`, `/applications`, `/actions`, `/users`) | §9.2 | ✅ Selesai | Rincian: API-00.6 |
| M5.3 | Companies – backend (CRUD, restore, status, cek data terkait) | §8.4 | ✅ Selesai | Rincian: §3.2 (API-01.x). `apps/api/src/modules/companies/` |
| M5.4 | Companies – frontend `/usrmgnt/companies` | §8.4, §10 | ✅ Selesai | `apps/web/src/pages/usrmgnt/companies/`: tabel (cari, filter status, tampilkan terhapus, sort, paginasi), drawer tambah/ubah/detail + audit, aktif/nonaktif, hapus, pulihkan; tombol mengikuti permission |
| M5.5 | Applications – backend | §8.5 | ✅ Selesai | Rincian: §3.3 (API-02.x). `apps/api/src/modules/applications/` |
| M5.6 | Applications – frontend `/usrmgnt/applications` | §8.5 | ✅ Selesai | `apps/web/src/pages/usrmgnt/applications/`: tabel urut `sort_order` dengan ikon, cari, filter, tampilkan terhapus, sort, paginasi; drawer tambah/ubah/detail (pilihan ikon dengan pratinjau, urutan default = urutan terbesar + 1); aplikasi inti (`is_protected`) tanpa tombol nonaktif/hapus. 26 skenario browser lulus |
| M5.7 | Actions – backend (4 action bawaan terkunci) | §8.7 | ✅ Selesai | Rincian: §3.4 (API-03.x). `apps/api/src/modules/actions/` |
| M5.8 | Actions – frontend `/usrmgnt/actions` | §8.7 | ✅ Selesai | `apps/web/src/pages/usrmgnt/actions/`: tabel urut `sort_order` dengan penanda Default dan action utama (gembok); drawer tambah/ubah/detail; checkbox "Action default" dengan peringatan tidak retroaktif, terkunci untuk READ; action utama tanpa tombol nonaktif/hapus. 26 skenario browser lulus |
| M5.9 | Company Applications – backend | §8.6 | ✅ Selesai | Rincian: §3.5 (API-04.x). `apps/api/src/modules/company-applications/` |
| M5.10 | Company Applications – frontend (pilih company → toggle aplikasi) | §8.6 | ✅ Selesai | `apps/web/src/pages/usrmgnt/company-applications/`: daftar company (cari, tersimpan di URL `?company=`) + daftar aplikasi dengan toggle; toggle terkunci bila pemetaan masih dipakai keanggotaan group atau tanpa hak akses; konfirmasi sebelum melepas. 15 skenario browser lulus |
| M5.11 | Test AC-11, AC-12 | §13 | ✅ Selesai | AC-11 dan AC-12 lulus di backend dan di browser |

### Tahap 6 – Menus

| ID | Item | Ref PRD | Status | Catatan |
|---|---|---|---|---|
| M6.1 | Menus – backend (CRUD, tree per aplikasi, validasi parent) | §8.8 | ✅ Selesai | Rincian: §3.6 (API-05.x). `apps/api/src/modules/menus/` |
| M6.2 | Action per menu – backend (`PUT /menus/:id/actions`, soft delete permission terkait) | §8.8 | ✅ Selesai | Rincian: §3.7 (API-06.x) |
| M6.3 | Menus – frontend (pilih aplikasi, tree, panel detail, checkbox action) | §8.8, §10 | ✅ Selesai | `apps/web/src/pages/usrmgnt/menus/`: pilih aplikasi (tersimpan di URL `?app=`), tree (cari, buka/tutup semua, tampilkan terhapus), panel detail + tab Action, drawer tambah/ubah (tipe, parent, route, ikon, urutan, tampil di sidebar), aktif/nonaktif, hapus, pulihkan; info bila route belum punya halaman frontend. Drag-and-drop urutan belum (opsional). 35 skenario browser lulus |
| M6.4 | Test AC-08 | §13 | ✅ Selesai | Lulus di backend (`tests/menus.test.ts`) dan browser |

### Tahap 7 – Users

| ID | Item | Ref PRD | Status | Catatan |
|---|---|---|---|---|
| M7.1 | Users – backend CRUD (tanpa `password_hash` di response) | §8.9 | ✅ Selesai | Rincian M7.1–M7.5: §3.8 (API-07.x). `apps/api/src/modules/users/` |
| M7.2 | Reset password, lock, unlock | §8.9 | ✅ Selesai | |
| M7.3 | `GET /users/:id/memberships` (tab Akses) | §8.9 | ✅ Selesai | Status keanggotaan: berlaku, belum berlaku, kedaluwarsa, nonaktif, tidak berlaku |
| M7.4 | Export Excel | §8.9 | ✅ Selesai | `exceljs`, maks 10.000 baris |
| M7.5 | Import Excel (template, validasi per baris, all-or-nothing) | §8.9 | ✅ Selesai | Maks 2 MB / 1.000 baris; password kosong dibangkitkan dan dikembalikan sekali |
| M7.6 | Users – frontend (tabel, filter, aksi, export/import, tab Akses) | §8.9, §10 | ✅ Selesai | `apps/web/src/pages/usrmgnt/users/`: filter status/kunci/provider, drawer Profil + Akses, dialog password sekali tampil, dialog import dengan tabel error per baris |
| M7.7 | Test AC-15, AC-16 | §13 | ✅ Selesai | 26 test backend + 41 skenario browser |

### Tahap 8 – Group & Hak Akses

| ID | Item | Ref PRD | Status | Catatan |
|---|---|---|---|---|
| M8.1 | User Groups – backend + frontend | §8.10 | ✅ Selesai | Rincian backend: §3.9 (API-08.x). `apps/web/src/pages/usrmgnt/user-groups/`: filter aplikasi (URL `?app=`), jumlah anggota & permission sebagai tautan ke halaman terkait |
| M8.2 | Duplikat group | §8.10 | ✅ Selesai | Kode default `<KODE>_COPY`; permission disalin, anggota tidak |
| M8.3 | Group Members – backend + frontend | §8.11 | ✅ Selesai | Rincian backend: §3.10 (API-09.x). Pemilih group (URL `?group=`), pencarian user, dropdown company terfilter, status keanggotaan |
| M8.4 | Group Permissions – backend (simpan sebagai set lengkap dalam satu transaksi) | §8.12 | ✅ Selesai | Rincian: §3.11 (API-10.x) |
| M8.5 | Group Permissions – frontend matriks menu × action | §8.12 | ✅ Selesai | Diubah 16-10-2026 atas permintaan pemilik produk menjadi tabel bertingkat 4 layer (Aplikasi → Group → Menu → Action) agar tetap rapi bila action bertambah. Centang per action, per menu, per folder menu (mencakup sub-menu); draft per group tidak hilang saat baris ditutup; simpan/batal di baris group; opsi "Tampilkan semua action"; tautan `?group=` membuka group terkait |
| M8.6 | Invalidasi cache permission saat data akses berubah | BR-22 | ✅ Selesai | Status/hapus group, tambah/ubah/hapus anggota, simpan permission (`lib/access.ts`) |
| M8.7 | Aturan minimal 1 anggota aktif `SUPER_ADMIN`, user tidak dapat menghapus/mengunci diri sendiri | BR-19, BR-20 | ✅ Selesai | Dijaga di Users (hapus/nonaktif/kunci) dan Group Members (hapus/nonaktif/akhiri masa berlaku) |
| M8.8 | Test AC-09, AC-10, AC-13, AC-14 | §13 | ✅ Selesai | 22 test backend (`tests/user-groups.test.ts`) + 50 skenario browser |

### Tahap 9 – Hardening

| ID | Item | Ref PRD | Status | Catatan |
|---|---|---|---|---|
| H9.1 | `helmet`, CORS origin terdaftar | §11 | ✅ Selesai | Terpasang sejak fondasi backend (`app.ts`): `helmet()`, CORS hanya `CORS_ORIGIN`, `credentials: true` |
| H9.2 | Rate limit login 10 request/menit per IP | §11 | ✅ Selesai | `middlewares/rate-limit.ts`: fixed window Redis per IP (`ratelimit:login:{ip}`), 429 `TOO_MANY_REQUESTS` + `Retry-After` + header `RateLimit-*`; diatur lewat `LOGIN_RATE_LIMIT`, `LOGIN_RATE_WINDOW`; `TRUST_PROXY` untuk IP asli di belakang reverse proxy; fail-open bila Redis mati (lockout per akun tetap berlaku). Test di `auth.test.ts` |
| H9.3 | Logging terstruktur JSON (request id, user, durasi) | §11 | ⬜ Belum | |
| H9.4 | Unit test service + integration test seluruh AC | §11 | ⬜ Belum | |
| H9.5 | Uji kinerja list < 500 ms untuk 10.000 baris | §11 | ⬜ Belum | |

---

## 3. Backlog API Backend per Tabel

Rincian backend untuk setiap tabel di ERD (`database/01_user_management.md`). Item master di Tahap 5–8 di atas merujuk ke bagian ini.

**Prasyarat:** Tahap 1–3 selesai, terutama format response (SET-1.7), JWT + konteks (Tahap 2–3), dan middleware `authorize` (AUTHZ-3.5). Semua endpoint di bagian ini mewajibkan konteks aktif aplikasi `USRMGNT` (PRD §9.2).

### 3.0 Ringkasan dan Urutan Pengerjaan

Urutan mengikuti ketergantungan foreign key: tabel induk dibuat lebih dulu.

| Urutan | Tabel | Menu / permission | Tahap | Jumlah endpoint | Bergantung pada | Status |
|---|---|---|---|---|---|---|
| 0 | Pola umum & lookup | – | 5 | 4 lookup | Tahap 1–3 | 🔶 Sebagian |
| 1 | `companies` | `UM_COMPANY` | 5 | 7 | – | ✅ Selesai |
| 2 | `applications` | `UM_APPLICATION` | 5 | 7 | – | ✅ Selesai |
| 3 | `actions` | `UM_ACTION` | 5 | 7 | – | ✅ Selesai |
| 4 | `company_applications` | `UM_COMPANY_APP` | 5 | 3 | companies, applications | ✅ Selesai |
| 5 | `menus` | `UM_MENU` | 6 | 8 | applications | ✅ Selesai |
| 6 | `menu_actions` | `UM_MENU` | 6 | 2 | menus, actions | ✅ Selesai |
| 7 | `users` | `UM_USER` | 7 | 13 | – | ✅ Selesai |
| 8 | `user_groups` | `UM_GROUP` | 8 | 7 (+1 opsional) | applications | ✅ Selesai |
| 9 | `user_group_members` | `UM_GROUP_MEMBER` | 8 | 4 | users, user_groups, company_applications | ✅ Selesai |
| 10 | `user_group_permissions` | `UM_GROUP_PERM` | 8 | 2 | user_groups, menu_actions | ✅ Selesai |
| – | View `user_effective_permissions` | – (hanya dibaca) | 3 | – | semua tabel | ⬜ Belum (lihat AUTHZ-3.1 s.d. 3.6) |

**Pola endpoint master standar** (PRD §8.3), dipakai untuk tabel bertanda "pola standar":

| Method | Path | Permission | Ketentuan |
|---|---|---|---|
| GET | `/<resource>` | `READ` | Paginasi `page`, `page_size` (default 20, maks 100), `q`, filter `is_active`, `sort_by` + `sort_dir`; `include_deleted=true` hanya untuk pemilik `UPDATE` |
| GET | `/<resource>/:id` | `READ` | 404 bila tidak ada atau terhapus |
| POST | `/<resource>` | `CREATE` | Validasi Zod; `created_by` dari JWT |
| PUT | `/<resource>/:id` | `UPDATE` | Seluruh field yang dapat diedit; kode bisnis tidak dapat diubah |
| PATCH | `/<resource>/:id/status` | `UPDATE` | Body `{ "is_active": boolean }` |
| POST | `/<resource>/:id/restore` | `UPDATE` | Gagal (409) bila kode sudah dipakai data aktif lain |
| DELETE | `/<resource>/:id` | `DELETE` | Soft delete; ditolak (422 `IN_USE`) bila masih dipakai data turunan aktif, pesan menyebut jumlahnya (BR-21) |

### 3.1 Pola Umum (dipakai semua tabel)

| ID | Item | Ref PRD | Status | Catatan |
|---|---|---|---|---|
| API-00.1 | Helper list: paginasi, pencarian, filter, sort (whitelist kolom), `meta` response | §8.3 | ✅ Selesai | `src/utils/pagination.ts` (`listQuerySchema` dengan whitelist kolom sort) |
| API-00.2 | Helper soft delete, restore, dan ubah status dengan audit field dari JWT | BR-11, BR-15 | ✅ Selesai | `src/lib/master-data.ts`: `softDeleteData`, `restoreData`, `isUniqueViolation`, `duplicateCodeError`; dipakai companies & applications |
| API-00.3 | Helper cek data terkait (`IN_USE` + jumlah) sebelum delete | BR-21 | ✅ Selesai | `ensureNotInUse()` di `src/lib/master-data.ts`; pesan menyebut jumlah per jenis data, mis. "5 menu, 3 user group, dan 2 pemetaan company" |
| API-00.4 | Pemetaan error database: P2002/23505 → 409 `DUPLICATE`, P0001 → 422 `BUSINESS_RULE`, 23503 → 422 `REFERENCE_NOT_FOUND` | §8.3 | ✅ Selesai | Termasuk ekstraksi pesan `RAISE EXCEPTION` trigger (P0001) |
| API-00.5 | Helper invalidasi cache permission per user, per group, per company + aplikasi | BR-22 | ✅ Selesai | `invalidatePermissions.user/company/application/all` di `src/lib/permissions.ts` |
| API-00.6 | Endpoint lookup: `GET /lookups/companies`, `/lookups/applications`, `/lookups/actions`, `/lookups/users?q=` | §9.2 | ✅ Selesai | `/lookups/users?q=&limit=` mencari username/nama/email, hanya user aktif, maks 50 |
| API-00.7 | Harness test integrasi: reset database ke kondisi seed sebelum test | §11 | ✅ Selesai | Vitest + Supertest; `modena_test` dibangun ulang dari DDL + seed setiap run; Redis memakai prefix `test:` |
| API-00.8 | Dokumentasi API (OpenAPI/Swagger) | – | ⬜ Belum | Usulan, opsional |

### 3.2 `companies` – menu `UM_COMPANY` (Tahap 5, rincian M5.3)

| ID | Item | Status | Catatan |
|---|---|---|---|
| API-01.1 | Endpoint pola standar `/companies` (7 endpoint) | ✅ Selesai | Pencarian `q` pada `company_code`, `company_name`, `short_name`; `include_deleted` hanya untuk pemilik UPDATE |
| API-01.2 | Validasi: `company_code` wajib, maks 20, `^[A-Z0-9_]+$`; `company_name` wajib, maks 200; `short_name` 50; `tax_number` 30; `phone` 30; `email` format email, 150; `logo_url` URL, 500 | ✅ Selesai | `company_code` dinormalisasi ke huruf besar; field tidak dikenal (mis. `created_by` dari client) ditolak |
| API-01.3 | Tolak delete bila masih ada `company_applications` atau `user_group_members` aktif | ✅ Selesai | Pesan: "masih digunakan oleh N pemetaan aplikasi dan M keanggotaan group" |
| API-01.4 | Nonaktif/hapus company → invalidasi cache permission seluruh anggota di company tersebut | ✅ Selesai | Teruji: menonaktifkan MDN langsung mencabut akses konteks MDN, aktifkan kembali → pulih |
| API-01.5 | Test: AC-11 (kode duplikat → 409), AC-12 (hapus lalu buat ulang kode sama → sukses), restore gagal bila kode dipakai | ✅ Selesai | `apps/api/tests/companies.test.ts`: 28 test lulus |

### 3.3 `applications` – menu `UM_APPLICATION` (Tahap 5, rincian M5.5)

| ID | Item | Status | Catatan |
|---|---|---|---|
| API-02.1 | Endpoint pola standar `/applications` (7 endpoint) | ✅ Selesai | Pencarian `q` pada kode, nama, deskripsi; default sort `sort_order` |
| API-02.2 | Validasi: `app_code` wajib, maks 30, `^[A-Z0-9_]+$`, unik global; `app_name` wajib, maks 150; `base_url` 500; `icon` 100; `sort_order` integer ≥ 0 | ✅ Selesai | `base_url` boleh path relatif (`/billcost`, seperti seed) atau URL http(s). PUT tanpa `sort_order` tidak mereset urutan |
| API-02.3 | Tolak delete bila masih ada menu, group, atau pemetaan company aktif | ✅ Selesai | Pesan: "masih digunakan oleh N menu, M user group, dan K pemetaan company" |
| API-02.4 | Lindungi aplikasi `USRMGNT`: tidak dapat dihapus/dinonaktifkan | ✅ Selesai | AD-01 diputuskan 16-10-2026: dikunci (`PROTECTED_APP_CODES`). Ubah nama/urutan USRMGNT tetap boleh. Response menyertakan `is_protected` untuk frontend |
| API-02.5 | Nonaktif/hapus aplikasi → invalidasi cache permission seluruh pengguna aplikasi tersebut | ✅ Selesai | Teruji: menonaktifkan BILLCOST → permission bc.admin langsung kosong; aktif kembali → pulih |

### 3.4 `actions` – menu `UM_ACTION` (Tahap 5, rincian M5.7)

| ID | Item | Status | Catatan |
|---|---|---|---|
| API-03.1 | Endpoint pola standar `/actions` (7 endpoint) | ✅ Selesai | Default sort `sort_order`; response menyertakan `is_builtin` untuk penanda di frontend |
| API-03.2 | Validasi: `action_code` wajib, maks 30, `^[A-Z_]+$`; `action_name` wajib, maks 100; `is_default` boolean; `sort_order` integer ≥ 0 | ✅ Selesai | Kode dinormalisasi huruf besar; PUT tanpa `is_default`/`sort_order` tidak mengubah nilainya |
| API-03.3 | 4 action bawaan (CREATE, READ, UPDATE, DELETE) tidak dapat dihapus | ✅ Selesai | `BUILTIN_ACTION_CODES` di `actions.service.ts` |
| API-03.4 | Boleh atau tidaknya action bawaan dinonaktifkan | ✅ Selesai | AD-02 diputuskan: tidak dapat dinonaktifkan. Tambahan (konsekuensi AD-05): READ wajib tetap `is_default = true` |
| API-03.5 | Tolak delete bila action masih dipakai `menu_actions` aktif | ✅ Selesai | Pesan: "masih digunakan oleh N menu" |
| API-03.6 | Perubahan `is_default` tidak retroaktif (hanya untuk menu baru) | ✅ Selesai | Teruji: mengubah `is_default` tidak menambah action ke menu lama; menu PAGE baru langsung mendapatkannya. Menonaktifkan action tambahan (mis. APPROVE) langsung mencabut permission terkait |

### 3.5 `company_applications` – menu `UM_COMPANY_APP` (Tahap 5, rincian M5.9)

| ID | Item | Status | Catatan |
|---|---|---|---|
| API-04.1 | `GET /companies/:id/applications` (`UM_COMPANY_APP:READ`): seluruh aplikasi aktif + penanda sudah dipetakan atau belum | ✅ Selesai | AD-03: seluruh aplikasi + `is_assigned`, `assigned_at/by`, dan `member_count` |
| API-04.2 | `POST /companies/:id/applications` body `{ application_id }` (`CREATE`) | ✅ Selesai | Company & aplikasi wajib aktif; duplikat → 409 |
| API-04.3 | `DELETE /companies/:id/applications/:applicationId` (`DELETE`): soft delete pemetaan | ✅ Selesai | Soft delete |
| API-04.4 | Tolak hapus pemetaan bila masih ada `user_group_members` aktif untuk company + aplikasi tersebut | ✅ Selesai | Pesan: "Pemetaan tidak dapat dihapus karena masih digunakan oleh N keanggotaan group." |
| API-04.5 | Invalidasi cache permission saat pemetaan berubah | ✅ Selesai | Invalidasi cache per company |
| API-04.6 | Test: pemetaan yang dihapus dapat ditambahkan kembali | ✅ Selesai | Lulus |

### 3.6 `menus` – menu `UM_MENU` (Tahap 6, rincian M6.1)

| ID | Item | Status | Catatan |
|---|---|---|---|
| API-05.1 | `GET /applications/:id/menus/tree` (`UM_MENU:READ`): pohon menu urut `sort_order` | ✅ Selesai | Termasuk menu nonaktif & tersembunyi; `include_deleted` untuk pemilik UPDATE; tiap PAGE menyertakan daftar action |
| API-05.2 | Endpoint pola standar `/menus` (7 endpoint); list wajib/bisa filter `application_id` | ✅ Selesai | Filter `application_id`, `menu_type`, `q` (kode/nama/route) |
| API-05.3 | Validasi: `menu_code` wajib, maks 50; `menu_name` wajib, maks 150; `menu_type` `GROUP`/`PAGE`; `route_path` wajib untuk `PAGE`, maks 300; `icon` 100; `sort_order`; `is_visible` | ✅ Selesai | Kode dinormalisasi huruf besar; route diawali "/"; GROUP tidak boleh punya route |
| API-05.4 | `parent_id` hanya boleh menu `GROUP` dari aplikasi yang sama | ✅ Selesai | Dicek di API (GROUP, belum dihapus, aplikasi sama) sebelum trigger |
| API-05.5 | Cegah parent melingkar (A → B → A) saat ubah `parent_id` | ✅ Selesai | Menelusuri leluhur parent baru; menu & turunannya ditolak |
| API-05.6 | `menu_type` dan `application_id` tidak dapat diubah setelah dibuat | ✅ Selesai | Termasuk `menu_code` |
| API-05.7 | Delete menu `GROUP` ditolak bila masih punya child aktif | ✅ Selesai | Pesan: "Menu GROUP tidak dapat dihapus karena masih digunakan oleh N sub-menu." |
| API-05.8 | Delete menu `PAGE`: perlakuan terhadap `menu_actions` dan permission terkait | ✅ Selesai | AD-04: `menu_actions` & permission ikut di-soft-delete (satu transaksi, `deleted_at` sama). Restore memulihkan yang terhapus bersamanya; restore ditolak bila induk masih terhapus |
| API-05.9 | Nonaktif/hapus menu → invalidasi cache permission pengguna aplikasi | ✅ Selesai | Termasuk create & update menu |
| API-05.10 | Test AC-08: menu `PAGE` baru otomatis punya CREATE, READ, UPDATE, DELETE | ✅ Selesai | Lulus |

### 3.7 `menu_actions` – menu `UM_MENU` (Tahap 6, rincian M6.2)

| ID | Item | Status | Catatan |
|---|---|---|---|
| API-06.1 | `GET /menus/:id/actions` (`UM_MENU:READ`): seluruh action aktif + penanda tersedia di menu atau belum | ✅ Selesai | Termasuk `is_required` (READ), `is_active`, dan `group_count` (jumlah group yang sudah diberi izin) |
| API-06.2 | `PUT /menus/:id/actions` body `{ action_ids }` (`UM_MENU:UPDATE`): simpan sebagai set lengkap dalam satu transaksi | ✅ Selesai | Hanya PAGE; action nonaktif tidak dapat ditambahkan (boleh dilepas) |
| API-06.3 | Action yang dilepas → permission group yang memakainya ikut di-soft-delete | ✅ Selesai | Teruji: izin group dicabut dan langsung berlaku |
| API-06.4 | Boleh atau tidaknya READ dilepas dari menu `PAGE` | ✅ Selesai | AD-05: READ wajib; ditolak 400 |
| API-06.5 | Invalidasi cache permission anggota group yang terdampak | ✅ Selesai | Invalidasi cache per aplikasi |

### 3.8 `users` – menu `UM_USER` (Tahap 7, rincian M7.1 s.d. M7.5)

| ID | Item | Status | Catatan |
|---|---|---|---|
| API-07.1 | Endpoint pola standar `/users` (7 endpoint); filter tambahan `is_locked`, `auth_provider` | ✅ Selesai | Response tidak pernah berisi `password_hash` (AC-16) |
| API-07.2 | Validasi: `username` wajib, 3–100, `^[a-z0-9._]+$`; `email` wajib, format email, 150; `full_name` wajib, 200; `employee_no` 30; `phone` 30; `auth_provider` hanya `LOCAL` di Fase 1 | ✅ Selesai | Username & email unik tanpa beda huruf besar/kecil (BR-13) |
| API-07.3 | Create: password awal dari admin atau dibangkitkan acak (ditampilkan sekali), hash bcrypt cost 10, `must_change_password = true` | ✅ Selesai | PRD §8.9 |
| API-07.4 | `username` tidak dapat diubah; `email` boleh diubah | ✅ Selesai | AD-06; `auth_provider` juga tidak dapat diubah |
| API-07.5 | `POST /users/:id/reset-password` (`UPDATE`): password acak, wajib ganti, cabut refresh token | ✅ Selesai | |
| API-07.6 | `POST /users/:id/lock` dan `/unlock` (`UPDATE`): unlock mereset `failed_login_count` dan `locked_at` | ✅ Selesai | |
| API-07.7 | User tidak dapat menghapus, menonaktifkan, atau mengunci akunnya sendiri | ✅ Selesai | BR-19 |
| API-07.8 | Nonaktif/kunci/hapus user → cabut refresh token + invalidasi cache permission | ✅ Selesai | BR-22 |
| API-07.9 | `GET /users/:id/memberships` (`READ`): company, aplikasi, group, masa berlaku, status | ✅ Selesai | Untuk tab "Akses" |
| API-07.10 | `GET /users/export` (`EXPORT_EXCEL`): kolom sesuai PRD, mengikuti filter list | ✅ Selesai | Pakai `exceljs` |
| API-07.11 | `GET /users/import/template` dan `POST /users/import` (`IMPORT_EXCEL`): validasi semua baris, error per baris, simpan hanya bila semua valid | ✅ Selesai | Upload via Multer; satu transaksi |
| API-07.12 | Daftarkan route `/users/export` dan `/users/import/*` sebelum `/users/:id` | ✅ Selesai | Agar tidak tertangkap sebagai `:id` |
| API-07.13 | Test AC-15 (audit field = username login) dan AC-16 (tanpa `password_hash`) | ✅ Selesai | |

### 3.9 `user_groups` – menu `UM_GROUP` (Tahap 8, rincian M8.1)

| ID | Item | Status | Catatan |
|---|---|---|---|
| API-08.1 | Endpoint pola standar `/user-groups` (7 endpoint); filter `application_id` | ✅ Selesai | |
| API-08.2 | Validasi: `application_id` wajib; `group_code` wajib, maks 50; `group_name` wajib, maks 150; `description` | ✅ Selesai | |
| API-08.3 | `application_id` tidak dapat diubah setelah dibuat | ✅ Selesai | PRD §8.10 |
| API-08.4 | Delete ditolak bila masih punya anggota aktif | ✅ Selesai | Permission group ikut di-soft-delete (deleted_at sama) dan ikut dipulihkan saat restore |
| API-08.5 | Group `SUPER_ADMIN` aplikasi `USRMGNT` tidak dapat dihapus/dinonaktifkan | ✅ Selesai | AD-01. Tambahan: `UM_GROUP_PERM:READ` & `UPDATE` tidak dapat dilepas dari SUPER_ADMIN agar matriks tidak terkunci |
| API-08.6 | Nonaktif/hapus group → invalidasi cache permission seluruh anggota | ✅ Selesai | BR-22 |
| API-08.7 | `POST /user-groups/:id/duplicate`: salin permission ke group baru di aplikasi yang sama | ✅ Selesai | Opsional Fase 1 (M8.2) |

### 3.10 `user_group_members` – menu `UM_GROUP_MEMBER` (Tahap 8, rincian M8.3)

| ID | Item | Status | Catatan |
|---|---|---|---|
| API-09.1 | `GET /user-groups/:id/members` (`READ`): username, nama, company, `valid_from`, `valid_to`, status; paginasi + pencarian | ✅ Selesai | |
| API-09.2 | `POST /user-groups/:id/members` (`CREATE`): `user_id`, `company_id`, `valid_from` (default hari ini), `valid_to` opsional ≥ `valid_from` | ✅ Selesai | Duplikat → 409 |
| API-09.3 | Company wajib memiliki aplikasi group (error trigger → 422 `BUSINESS_RULE`) | ✅ Selesai | AC-09. Dicek di service dengan pesan jelas; trigger tetap pengaman terakhir |
| API-09.4 | Lookup company yang memiliki aplikasi group: `GET /lookups/companies?application_id=` | ✅ Selesai | Ditambah `GET /lookups/user-groups?application_id=` untuk pemilih group (tanpa perlu `UM_GROUP:READ`) |
| API-09.5 | `PUT /user-groups/:id/members/:memberId` (`UPDATE`): hanya `valid_from`, `valid_to`, `is_active` | ✅ Selesai | |
| API-09.6 | `DELETE /user-groups/:id/members/:memberId` (`DELETE`): soft delete | ✅ Selesai | |
| API-09.7 | Tolak hapus/nonaktif anggota aktif terakhir group `SUPER_ADMIN` | ✅ Selesai | BR-20 |
| API-09.8 | Invalidasi cache permission user yang terdampak | ✅ Selesai | BR-22 |
| API-09.9 | Test AC-09 dan AC-14 (`valid_to` lewat → akses hilang) | ✅ Selesai | |

### 3.11 `user_group_permissions` – menu `UM_GROUP_PERM` (Tahap 8, rincian M8.4)

| ID | Item | Status | Catatan |
|---|---|---|---|
| API-10.1 | `GET /user-groups/:id/permissions` (`READ`): matriks pohon menu aplikasi group × action; tiap sel berisi `menu_action_id`, tersedia, dan sudah diizinkan | ✅ Selesai | Sel tanpa `menu_action` ditampilkan nonaktif di frontend |
| API-10.2 | `PUT /user-groups/:id/permissions` body `{ menu_action_ids }` (`UPDATE`): hitung selisih, tambah yang baru, soft delete yang dilepas, satu transaksi | ✅ Selesai | PRD §8.12 |
| API-10.3 | Tolak `menu_action_id` dari aplikasi lain (error trigger → 422) | ✅ Selesai | AC-10 |
| API-10.4 | Invalidasi cache permission seluruh anggota group setelah simpan | ✅ Selesai | AC-13 |
| API-10.5 | Test AC-10 dan AC-13 | ✅ Selesai | |

---

## 4. Status Acceptance Criteria

| Kode | Skenario | Frontend | Backend |
|---|---|---|---|
| AC-01 | `superadmin` login, mendapat 2 konteks | ✅ Lulus | ✅ Lulus |
| AC-02 | 5 kali password salah → akun terkunci | ✅ Lulus | ✅ Lulus |
| AC-03 | `locked.user` / `inactive.user` ditolak | ✅ Lulus | ✅ Lulus |
| AC-04 | `bc.staff` diarahkan ke ganti password | ✅ Lulus | ✅ Lulus |
| AC-05 | `bc.staff` di MDN-BILLCOST: CREATE, READ, UPDATE, PRINT, IMPORT_EXCEL | ✅ Lulus | ✅ Lulus |
| AC-06 | `bc.staff` di DEMO1-BILLCOST: hanya READ dan PRINT | ✅ Lulus | ✅ Lulus |
| AC-07 | `auditor` memanggil `POST /users` → 403 | ✅ Lulus (tombol Tambah/Import tersembunyi) | ✅ Lulus |
| AC-08 | Menu PAGE baru otomatis punya CRUD | ✅ Lulus | ✅ Lulus |
| AC-09 | Anggota group untuk company tanpa aplikasinya → 422 | ✅ Dicegah (dropdown hanya company yang memiliki aplikasi) | ✅ Lulus |
| AC-10 | Permission menu aplikasi lain ke group → 422 | ✅ Dicegah (matriks hanya menu aplikasi group) | ✅ Lulus |
| AC-11 | Kode company duplikat → 409 | ✅ Lulus | ✅ Lulus |
| AC-12 | Hapus company lalu buat ulang dengan kode sama | ✅ Lulus | ✅ Lulus |
| AC-13 | Perubahan permission langsung berlaku | ✅ Lulus (sesi dimuat ulang setelah simpan) | ✅ Lulus |
| AC-14 | Keanggotaan kedaluwarsa menghilangkan akses | ✅ Lulus (status Kedaluwarsa) | ✅ Lulus |
| AC-15 | Audit field berisi username yang login | ✅ Lulus | ✅ Lulus |
| AC-16 | Response tidak mengandung `password_hash` | ✅ Lulus | ✅ Lulus |

Skenario frontend tambahan yang sudah lulus: auditor hanya melihat tombol Export di Users, halaman 403 untuk menu tanpa akses, halaman 404, ganti konteks, sesi pulih setelah reload, menu tersembunyi tetap bisa dibuka lewat URL, dan kembali ke halaman yang diminta setelah login.

---

## 5. Hal yang Perlu Direview / Diputuskan

### 5.1 Asumsi dari pengerjaan Tahap 4 (perlu konfirmasi)

| ID | Asumsi | Status | Dampak bila ditolak |
|---|---|---|---|
| AS-01 | Kode error login untuk user LDAP: `AUTH_PROVIDER_NOT_SUPPORTED` (PRD hanya menyebut pesannya) | ❓ Perlu keputusan | Ganti kode di backend dan pemetaan pesan di halaman login (sudah diterapkan di backend; tinggal dikonfirmasi) |
| AS-02 | Respons konteks ditambah `company_name`, `app_name`, `app_icon` untuk tampilan kartu | ❓ Perlu keputusan | Kartu pilih konteks hanya menampilkan kode (sudah diterapkan di backend; tinggal dikonfirmasi) |
| AS-03 | Node menu di `/auth/menus` ditambah field `is_visible` | ❓ Perlu keputusan | Frontend tidak bisa menyembunyikan menu seperti Shipment Detail (sudah diterapkan di backend; tinggal dikonfirmasi) |
| AS-04 | `POST /auth/change-password` mengembalikan access token baru (karena refresh token dicabut) | ❓ Perlu keputusan | User harus login ulang setelah ganti password (sudah diterapkan di backend; tinggal dikonfirmasi) |
| AS-05 | Setelah refresh token, frontend memanggil ulang `POST /auth/context` karena refresh token tidak membawa konteks | ❓ Perlu keputusan | Alternatif: backend menyimpan konteks bersama refresh token (sudah diterapkan di backend; tinggal dikonfirmasi) |
| AS-06 | AC-06 "hanya READ dan PRINT" ditafsirkan sesuai seed: READ di Shipment, READ + PRINT di Report | ❓ Perlu keputusan | Bila PRINT harus ada di Shipment, data seed BC_VIEWER perlu ditambah |

### 5.2 Open Issues dari PRD §15

| Kode | Pertanyaan | Status | Menghambat |
|---|---|---|---|
| OI-01 | Pembatasan admin USRMGNT per company | ❓ Perlu keputusan | Tahap 5–8 (scope data) |
| OI-02 | Konfirmasi kebijakan password, batas lockout, durasi token dengan tim keamanan IT | ❓ Perlu keputusan | Tahap 2 (bisa jalan dengan nilai usulan) |
| OI-03 | Login bersamaan di beberapa device | ❓ Perlu keputusan | Tahap 2 (penyimpanan refresh token) |
| OI-04 | Detail integrasi LDAP/AD | ❓ Perlu keputusan | Fase 2 |
| OI-05 | Tabel audit log terpisah | ❓ Perlu keputusan | Fase 2 |
| OI-06 | Pola integrasi aplikasi lain (database bersama vs API terpusat) | ❓ Perlu keputusan | Arsitektur jangka panjang. Catatan: database dev bernama umum `modena` dengan schema per modul (`usrmgnt`), sehingga pola database bersama tetap terbuka |

---

### 5.3 Keputusan Desain API (muncul dari backlog per tabel)

| ID | Pertanyaan | Usulan | Status | Item terkait |
|---|---|---|---|---|
| AD-01 | Perlukah aplikasi `USRMGNT` dan group `SUPER_ADMIN` dikunci agar tidak dapat dihapus/dinonaktifkan? | Ya, dikunci, agar admin tidak kehilangan akses ke modul ini | ✅ Diputuskan: Di kunci, SUPER ADMIN tidak boleh di delete | API-02.4, API-08.5 |
| AD-02 | Bolehkah action bawaan (CREATE, READ, UPDATE, DELETE) dinonaktifkan? | Tidak; PRD hanya melarang hapus dan ubah kode, tetapi menonaktifkan READ menutup semua menu | ✅ Diputuskan: Tidak, ini action utama | API-03.4 |
| AD-03 | Bentuk response `GET /companies/:id/applications` | Seluruh aplikasi aktif + penanda `is_assigned`, sesuai tampilan toggle | ✅ Diputuskan: Setuju dengan usulan | API-04.1 |
| AD-04 | Saat menu `PAGE` dihapus, apa yang terjadi pada `menu_actions` dan permission group-nya? | Ikut di-soft-delete dalam satu transaksi. Menolak delete (BR-21) tidak praktis karena setiap PAGE pasti punya `menu_actions` dari trigger | ✅ Diputuskan: Setuju dengan usulan | API-05.8 |
| AD-05 | Bolehkah READ dilepas dari menu `PAGE`? | Tidak; tanpa READ menu tidak pernah tampil di sidebar | ✅ Diputuskan: Setuju dengan usulan | API-06.4 |
| AD-06 | Bolehkah `email` user diubah setelah dibuat? | Ya; hanya `username` yang dikunci. BR-12 menyebut email sebagai kode bisnis unik, tetapi email bisa berubah di dunia nyata | ✅ Diputuskan: Setuju dengan usulan | API-07.4 |

## 6. Langkah Berikutnya (usulan)

1. Review dan putuskan AS-01 s.d. AS-06 serta OI-02 dan OI-03, karena keduanya memengaruhi Tahap 2.
2. Selesaikan Tahap 1: buat `apps/api` (SET-1.2, SET-1.4), pindahkan konfigurasi DB + `DATABASE_URL` (SET-1.3), `prisma db pull` ke database `modena` (SET-1.5), Redis, error handler, dan health check.
3. ~~Tahap 2–3 dan FE-4.14~~ selesai 16-10-2026. Sisa: rate limit login (H9.2) sebelum dipakai di luar komputer lokal.
4. ~~Putuskan AD-01 s.d. AD-06~~ sudah diputuskan 16-10-2026 (§5.3). Masih terbuka: AS-01 s.d. AS-06 (§5.1) dan OI-01 s.d. OI-06 (§5.2).
5. ~~API per tabel (§3.0)~~ seluruh 10 tabel selesai 16-10-2026. Berikutnya Tahap 9: rate limit login (H9.2), logging, dan test menyeluruh; serta sisa Tahap 1 (workspace root, `.gitattributes`) dan FE-4.15 (skrip e2e browser ke dalam repo).

---

## 7. Riwayat Pembaruan

| Tanggal | Perubahan |
|---|---|
| 16-10-2026 | Backlog awal dibuat; Tahap 4 tercatat selesai dengan mock API |
| 16-10-2026 | Database dev `modena` dibuat, DDL dan seed dijalankan (DB-0.4, DB-0.5); git repo dibuat dan di-push ke GitHub (SET-1.1); SET-1.3 dan SET-1.5 menjadi Sebagian; item baru DB-0.6 dan SET-1.1b |
| 16-10-2026 | Ditambah §3 Backlog API Backend per Tabel (10 tabel + pola umum, 79 item); ditambah §5.3 keputusan desain API (AD-01 s.d. AD-06); item Tahap 5–8 ditautkan ke rinciannya; nomor bagian 3–6 bergeser menjadi 4–7 |
| 16-10-2026 | Fondasi backend `apps/api` dibuat (SET-1.3 s.d. SET-1.8 selesai, AUTH-2.8, AUTHZ-3.5, AUTHZ-3.6 selesai); backend CRUD Companies selesai (API-01, M5.3) dengan 28 test integrasi; AC-11 dan AC-12 lulus di backend |
| 16-10-2026 | Auth backend selesai (Tahap 2; AUTHZ-3.1 s.d. 3.4); frontend beralih dari mock ke backend asli (FE-4.14); halaman Companies CRUD selesai (M5.1, M5.4); script reset database (DB-0.6); AC-01 s.d. AC-06 lulus di backend. Total test backend 40, test browser 34 |
| 16-10-2026 | Backend CRUD Applications selesai (API-02, M5.5) dengan 15 test; helper master bersama (API-00.2, API-00.3) dan companies di-refactor memakainya; AD-01 diterapkan sementara. Total test backend 55 |
| 16-10-2026 | AD-01 s.d. AD-06 diputuskan pemilik produk. Backend CRUD Actions selesai (API-03, M5.7) dengan 13 test; AD-01 final di applications. Total test backend 68 |
| 16-10-2026 | Halaman Applications CRUD selesai (M5.6) terintegrasi backend; komponen tabel bersama ditambah dan Companies di-refactor memakainya; API applications menambah `is_protected`. Test backend 68, test browser Applications 26 + regresi Companies 34 |
| 16-10-2026 | Halaman Actions CRUD selesai (M5.8) terintegrasi backend yang sudah ada (tanpa perubahan backend). Test backend 68 tetap lulus, test browser Actions 26 |
| 16-10-2026 | Tahap 6 selesai: backend Menus + action per menu (API-05, API-06) dengan 17 test, lookup aplikasi/company/action (API-00.6 sebagian), halaman Menus (M6.3) dengan 35 skenario browser; AC-08 lulus. Total test backend 85 |
| 16-10-2026 | Tahap 5 selesai: backend + halaman Company Applications (API-04, M5.9, M5.10) dengan 10 test backend dan 15 skenario browser; komponen `Switch` dan `api/lookups.ts`. Total test backend 95 |
| 16-10-2026 | Tahap 7 selesai: backend Users (API-07.1 s.d. API-07.13) + `/lookups/users` (API-00.6) dengan 26 test; halaman Users (M7.6) dengan 41 skenario browser; AC-07, AC-15, AC-16 lulus sehingga Tahap 3 juga selesai. Tambahan aturan: BR-20 dijaga saat hapus/nonaktif/kunci user; hapus user ikut menghapus keanggotaannya dan restore memulihkannya; reset password akun sendiri ditolak. Perbaikan: pesan kebijakan password menampilkan "(A-Z)" dengan benar. Status AC-08 di §4 diselaraskan (sudah lulus sejak Tahap 6). Total test backend 121 |
| 16-10-2026 | Tahap 8 selesai: backend User Groups, Group Members, Group Permissions (API-08, API-09, API-10) dengan 22 test; lookup `/lookups/companies?application_id=` dan `/lookups/user-groups`; helper bersama `lib/access.ts` (status keanggotaan, BR-20, invalidasi cache) dan Users di-refactor memakainya; halaman User Groups, Group Members, Group Permissions (M8.1–M8.5) dengan 50 skenario browser + regresi Users 41 dan Company Applications 15. AC-09, AC-10, AC-13, AC-14 lulus. Total test backend 143 |
| 16-10-2026 | Ditambah FE-4.16: dark mode (Terang / Gelap / Ikuti sistem) berbasis CSS variable untuk palet slate, white, brand, red, amber, emerald, sky; overlay modal memakai hitam agar tidak ikut terbalik. Diuji di browser (11 skenario + pemeriksaan visual halaman login, Users, drawer, dialog, matriks permission) |
| 16-10-2026 | Halaman Group Permissions (M8.5) diganti dari matriks kolom-per-action menjadi tabel bertingkat Aplikasi → Group → Menu → Action (backend tidak berubah). 25 skenario browser lulus, termasuk mode gelap |
| 16-10-2026 | Dibuat `docs/PRD_user_management_v2.md` (as-built) sebagai acuan pengembangan sesi baru; status H9.1 diselaraskan (helmet + CORS sudah terpasang) |
| 22-10-2026 | Seluruh pekerjaan Tahap 1–8 di-commit (4 commit) dan di-push ke GitHub; SET-1.1b `.gitattributes` selesai. H9.2 rate limit login selesai (1 test baru). Total test backend 144 |
