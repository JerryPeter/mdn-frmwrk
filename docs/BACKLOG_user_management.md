# Backlog & Progress – User Management (RBAC) MODENA Framework

| Item | Keterangan |
|---|---|
| Acuan | `docs/PRD_user_management.md` v1.0, `database/01_user_management.sql` v0.5.0 |
| Posisi terakhir | 16 Oktober 2026 |
| Tahap berjalan | Tahap 4 (Frontend auth & layout) selesai dengan mock API; backend belum dimulai |

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
| 0 | Desain database (DDL + seed) | ✅ Selesai | DDL v0.5.0 dan data seed tersedia di `database/` |
| 1 | Setup monorepo, koneksi DB/Redis, Prisma, format response | 🔶 Sebagian | Health check `/api/v1/health` OK |
| 2 | Auth backend: login, refresh, logout, me, ganti password, lockout | ⬜ Belum | AC-01 s.d. AC-04 lulus |
| 3 | Konteks, menu, permission, middleware `authorize`, cache Redis | ⬜ Belum | AC-05 s.d. AC-07 lulus |
| 4 | Frontend: login, pilih konteks, ganti password, layout + sidebar, `usePermission`, route guard | 🟡 Selesai (mock) | Navigasi sesuai akses tiap akun uji |
| 5 | CRUD Companies, Applications, Actions, Company Applications | ⬜ Belum | AC-11, AC-12 lulus |
| 6 | Menus + action per menu | ⬜ Belum | AC-08 lulus |
| 7 | Users (CRUD, reset/lock/unlock, export/import) | ⬜ Belum | AC-15, AC-16 lulus |
| 8 | User Groups, Group Members, Group Permissions (matriks) | ⬜ Belum | AC-09, AC-10, AC-13, AC-14 lulus |
| 9 | Hardening: rate limit, logging, test integrasi menyeluruh | ⬜ Belum | Seluruh AC lulus |

> **Catatan urutan:** Tahap 4 dikerjakan lebih dulu daripada Tahap 1–3 dengan mock API di `apps/web/src/mocks/`. Saat backend Tahap 2–3 selesai, frontend perlu diuji ulang terhadap API asli (item FE-4.14).

---

## 2. Backlog Detail

### Tahap 0 – Database

| ID | Item | Ref PRD | Status | Catatan |
|---|---|---|---|---|
| DB-0.1 | DDL schema `usrmgnt` (tabel, index parsial, trigger, view `user_effective_permissions`) | §5.3, §6 | ✅ Selesai | `database/01_user_management.sql` v0.5.0 |
| DB-0.2 | Data dictionary + ERD | §6 | ✅ Selesai | `database/01_user_management.md` |
| DB-0.3 | Data seed akun uji | §12 | ✅ Selesai | `database/02_seed_sample_data.sql` |

### Tahap 1 – Fondasi

| ID | Item | Ref PRD | Status | Catatan |
|---|---|---|---|---|
| SET-1.1 | Inisialisasi git repository | – | ⬜ Belum | Folder project belum berupa git repo |
| SET-1.2 | Struktur monorepo (`apps/api`, `apps/web`, workspace root) | §5.2 | 🔶 Sebagian | `apps/web` sudah ada; `apps/api` dan konfigurasi workspace root belum |
| SET-1.3 | `.env.example` (DATABASE_URL, REDIS_URL, JWT_*, CORS_ORIGIN) | §11 | 🔶 Sebagian | Baru `apps/web/.env.example`; versi backend belum |
| SET-1.4 | Setup Express 4 + TypeScript | §5.1 | ⬜ Belum | |
| SET-1.5 | Koneksi PostgreSQL + `prisma db pull` dengan `multiSchema` | §5.3 | ⬜ Belum | Verifikasi fitur preview `multiSchema` di Prisma 5 |
| SET-1.6 | Koneksi Redis | §5.1 | ⬜ Belum | |
| SET-1.7 | Error handler + format response standar + pemetaan error Prisma/trigger (P2002, P0001, 23503) | §8.3, §9.1 | ⬜ Belum | |
| SET-1.8 | Endpoint health check `/api/v1/health` | §14 | ⬜ Belum | |

### Tahap 2 – Auth Backend

| ID | Item | Ref PRD | Status | Catatan |
|---|---|---|---|---|
| AUTH-2.1 | `POST /auth/login` (case-insensitive, validasi status akun, LOCAL saja) | FR-AUTH-01 | ⬜ Belum | Perilaku sudah ditiru di mock |
| AUTH-2.2 | Lockout setelah 5 kali gagal, reset counter saat sukses | BR-16 | ⬜ Belum | |
| AUTH-2.3 | Access token JWT 15 menit | FR-AUTH-02 | ⬜ Belum | |
| AUTH-2.4 | Refresh token di Redis + cookie httpOnly, rotasi | FR-AUTH-02 | ⬜ Belum | |
| AUTH-2.5 | `POST /auth/logout` | FR-AUTH-02 | ⬜ Belum | |
| AUTH-2.6 | `GET /auth/me` | FR-AUTH-06 | ⬜ Belum | |
| AUTH-2.7 | `POST /auth/change-password` + kebijakan password + cabut refresh token | FR-AUTH-05, BR-18 | ⬜ Belum | |
| AUTH-2.8 | Middleware blokir endpoint bila `must_change_password` (403 `PASSWORD_CHANGE_REQUIRED`) | BR-17 | ⬜ Belum | |
| AUTH-2.9 | Test AC-01 s.d. AC-04 | §13 | ⬜ Belum | |

### Tahap 3 – Konteks & Otorisasi Backend

| ID | Item | Ref PRD | Status | Catatan |
|---|---|---|---|---|
| AUTHZ-3.1 | `GET /auth/contexts` | FR-AUTH-03 | ⬜ Belum | |
| AUTHZ-3.2 | `POST /auth/context` (token baru dengan claim `ctx`) | FR-AUTH-03 | ⬜ Belum | |
| AUTHZ-3.3 | `GET /auth/menus` (PAGE dengan READ + GROUP leluhur) | FR-AUTH-04 | ⬜ Belum | |
| AUTHZ-3.4 | `GET /auth/permissions` | FR-AUTH-04 | ⬜ Belum | |
| AUTHZ-3.5 | Middleware `authorize(menuCode, actionCode)` | FR-AUTHZ-01 | ⬜ Belum | |
| AUTHZ-3.6 | Cache permission Redis `perm:{user}:{company}:{app}` TTL 10 menit | FR-AUTHZ-01 | ⬜ Belum | |
| AUTHZ-3.7 | Test AC-05 s.d. AC-07 | §13 | ⬜ Belum | |

### Tahap 4 – Frontend Auth & Layout

| ID | Item | Ref PRD | Status | Catatan |
|---|---|---|---|---|
| FE-4.1 | Setup React 18 + Vite + TS + Tailwind + TanStack Query + Zustand | §5.1 | ✅ Selesai | `apps/web/`; typecheck dan build bersih |
| FE-4.2 | Axios client: Bearer token, refresh otomatis saat `TOKEN_EXPIRED`, terjemahan error | FR-AUTH-02, §9.1 | 🟡 Selesai (mock) | |
| FE-4.3 | Mock API berbasis data seed (lockout, wajib ganti password, konteks, menu, permission) | – | ✅ Selesai | Aktif bila `VITE_USE_MOCK=true` |
| FE-4.4 | Halaman Login (`/login`) | §10 | 🟡 Selesai (mock) | Pesan error per kode; panel akun uji hanya di mode mock |
| FE-4.5 | Halaman Pilih Konteks (`/select-context`), pilih otomatis bila hanya satu | FR-AUTH-03 | 🟡 Selesai (mock) | |
| FE-4.6 | Halaman Ganti Password (`/change-password`), dipaksa bila `must_change_password` | FR-AUTH-05, BR-17 | 🟡 Selesai (mock) | Checklist kebijakan password langsung tampil saat mengetik |
| FE-4.7 | AppLayout: header (aplikasi, company aktif, ganti konteks, menu profil/logout) | FR-AUTH-03, §10 | 🟡 Selesai (mock) | |
| FE-4.8 | Sidebar dinamis dari `/auth/menus`, menu `is_visible=false` disembunyikan | FR-AUTH-04 | 🟡 Selesai (mock) | |
| FE-4.9 | Hook `usePermission` + komponen `PermissionGate` | FR-AUTHZ-03 | 🟡 Selesai (mock) | |
| FE-4.10 | Route guard (login, wajib ganti password, konteks, READ per menu) | FR-AUTHZ-03 | 🟡 Selesai (mock) | |
| FE-4.11 | Halaman 403 dan 404 | §10 | ✅ Selesai | |
| FE-4.12 | Pemulihan sesi saat reload (kembali ke halaman dan konteks terakhir) | FR-AUTH-02 | 🟡 Selesai (mock) | |
| FE-4.13 | Responsif desktop 1280px + tablet (sidebar jadi drawer) | §10 | ✅ Selesai | Diperiksa di lebar 1366px dan 820px |
| FE-4.14 | Uji ulang seluruh alur terhadap backend asli | §14 | ⬜ Belum | Menunggu Tahap 2–3 |
| FE-4.15 | Simpan test browser (Playwright) di repo | §11 | ⬜ Belum | Ada 23 skenario yang sudah lulus, tetapi script masih di luar repo |

### Tahap 5 – Master Dasar

| ID | Item | Ref PRD | Status | Catatan |
|---|---|---|---|---|
| M5.1 | Komponen standar: tabel (paginasi, pencarian, filter), badge status, form modal/drawer, dialog konfirmasi | §10 | ⬜ Belum | Toast dan field form sudah ada dari Tahap 4 |
| M5.2 | Endpoint lookup (`/lookups/companies`, `/applications`, `/actions`, `/users`) | §9.2 | ⬜ Belum | |
| M5.3 | Companies – backend (CRUD, restore, status, cek data terkait) | §8.4 | ⬜ Belum | |
| M5.4 | Companies – frontend `/usrmgnt/companies` | §8.4, §10 | ⬜ Belum | Route dan guard sudah ada (halaman sementara) |
| M5.5 | Applications – backend | §8.5 | ⬜ Belum | |
| M5.6 | Applications – frontend `/usrmgnt/applications` | §8.5 | ⬜ Belum | Route dan guard sudah ada |
| M5.7 | Actions – backend (4 action bawaan terkunci) | §8.7 | ⬜ Belum | |
| M5.8 | Actions – frontend `/usrmgnt/actions` | §8.7 | ⬜ Belum | Route dan guard sudah ada |
| M5.9 | Company Applications – backend | §8.6 | ⬜ Belum | |
| M5.10 | Company Applications – frontend (pilih company → toggle aplikasi) | §8.6 | ⬜ Belum | Route dan guard sudah ada |
| M5.11 | Test AC-11, AC-12 | §13 | ⬜ Belum | |

### Tahap 6 – Menus

| ID | Item | Ref PRD | Status | Catatan |
|---|---|---|---|---|
| M6.1 | Menus – backend (CRUD, tree per aplikasi, validasi parent) | §8.8 | ⬜ Belum | |
| M6.2 | Action per menu – backend (`PUT /menus/:id/actions`, soft delete permission terkait) | §8.8 | ⬜ Belum | |
| M6.3 | Menus – frontend (pilih aplikasi, tree, panel detail, checkbox action) | §8.8, §10 | ⬜ Belum | Drag-and-drop urutan opsional |
| M6.4 | Test AC-08 | §13 | ⬜ Belum | |

### Tahap 7 – Users

| ID | Item | Ref PRD | Status | Catatan |
|---|---|---|---|---|
| M7.1 | Users – backend CRUD (tanpa `password_hash` di response) | §8.9 | ⬜ Belum | |
| M7.2 | Reset password, lock, unlock | §8.9 | ⬜ Belum | |
| M7.3 | `GET /users/:id/memberships` (tab Akses) | §8.9 | ⬜ Belum | |
| M7.4 | Export Excel | §8.9 | ⬜ Belum | |
| M7.5 | Import Excel (template, validasi per baris, all-or-nothing) | §8.9 | ⬜ Belum | |
| M7.6 | Users – frontend (tabel, filter, aksi, export/import, tab Akses) | §8.9, §10 | ⬜ Belum | Route dan guard sudah ada |
| M7.7 | Test AC-15, AC-16 | §13 | ⬜ Belum | |

### Tahap 8 – Group & Hak Akses

| ID | Item | Ref PRD | Status | Catatan |
|---|---|---|---|---|
| M8.1 | User Groups – backend + frontend | §8.10 | ⬜ Belum | |
| M8.2 | Duplikat group | §8.10 | ⬜ Belum | Opsional di Fase 1 |
| M8.3 | Group Members – backend + frontend | §8.11 | ⬜ Belum | |
| M8.4 | Group Permissions – backend (simpan sebagai set lengkap dalam satu transaksi) | §8.12 | ⬜ Belum | |
| M8.5 | Group Permissions – frontend matriks menu × action | §8.12 | ⬜ Belum | |
| M8.6 | Invalidasi cache permission saat data akses berubah | BR-22 | ⬜ Belum | |
| M8.7 | Aturan minimal 1 anggota aktif `SUPER_ADMIN`, user tidak dapat menghapus/mengunci diri sendiri | BR-19, BR-20 | ⬜ Belum | |
| M8.8 | Test AC-09, AC-10, AC-13, AC-14 | §13 | ⬜ Belum | |

### Tahap 9 – Hardening

| ID | Item | Ref PRD | Status | Catatan |
|---|---|---|---|---|
| H9.1 | `helmet`, CORS origin terdaftar | §11 | ⬜ Belum | |
| H9.2 | Rate limit login 10 request/menit per IP | §11 | ⬜ Belum | Pesan `TOO_MANY_REQUESTS` sudah ditangani di halaman login |
| H9.3 | Logging terstruktur JSON (request id, user, durasi) | §11 | ⬜ Belum | |
| H9.4 | Unit test service + integration test seluruh AC | §11 | ⬜ Belum | |
| H9.5 | Uji kinerja list < 500 ms untuk 10.000 baris | §11 | ⬜ Belum | |

---

## 3. Status Acceptance Criteria

| Kode | Skenario | Frontend (mock) | Backend |
|---|---|---|---|
| AC-01 | `superadmin` login, mendapat 2 konteks | ✅ Lulus | ⬜ Belum diuji |
| AC-02 | 5 kali password salah → akun terkunci | ✅ Lulus | ⬜ Belum diuji |
| AC-03 | `locked.user` / `inactive.user` ditolak | ✅ Lulus | ⬜ Belum diuji |
| AC-04 | `bc.staff` diarahkan ke ganti password | ✅ Lulus | ⬜ Belum diuji |
| AC-05 | `bc.staff` di MDN-BILLCOST: CREATE, READ, UPDATE, PRINT, IMPORT_EXCEL | ✅ Lulus | ⬜ Belum diuji |
| AC-06 | `bc.staff` di DEMO1-BILLCOST: hanya READ dan PRINT | ✅ Lulus | ⬜ Belum diuji |
| AC-07 | `auditor` memanggil `POST /users` → 403 | – (sisi frontend: tombol Tambah tersembunyi ✅) | ⬜ Belum diuji |
| AC-08 | Menu PAGE baru otomatis punya CRUD | – | ⬜ Belum |
| AC-09 | Anggota group untuk company tanpa aplikasinya → 422 | – | ⬜ Belum |
| AC-10 | Permission menu aplikasi lain ke group → 422 | – | ⬜ Belum |
| AC-11 | Kode company duplikat → 409 | – | ⬜ Belum |
| AC-12 | Hapus company lalu buat ulang dengan kode sama | – | ⬜ Belum |
| AC-13 | Perubahan permission langsung berlaku | – | ⬜ Belum |
| AC-14 | Keanggotaan kedaluwarsa menghilangkan akses | – | ⬜ Belum |
| AC-15 | Audit field berisi username yang login | – | ⬜ Belum |
| AC-16 | Response tidak mengandung `password_hash` | – | ⬜ Belum |

Skenario frontend tambahan yang sudah lulus: auditor hanya melihat tombol Export di Users, halaman 403 untuk menu tanpa akses, halaman 404, ganti konteks, sesi pulih setelah reload, menu tersembunyi tetap bisa dibuka lewat URL, dan kembali ke halaman yang diminta setelah login.

---

## 4. Hal yang Perlu Direview / Diputuskan

### 4.1 Asumsi dari pengerjaan Tahap 4 (perlu konfirmasi)

| ID | Asumsi | Status | Dampak bila ditolak |
|---|---|---|---|
| AS-01 | Kode error login untuk user LDAP: `AUTH_PROVIDER_NOT_SUPPORTED` (PRD hanya menyebut pesannya) | ❓ Perlu keputusan | Ganti kode di backend dan pemetaan pesan di halaman login |
| AS-02 | Respons konteks ditambah `company_name`, `app_name`, `app_icon` untuk tampilan kartu | ❓ Perlu keputusan | Kartu pilih konteks hanya menampilkan kode |
| AS-03 | Node menu di `/auth/menus` ditambah field `is_visible` | ❓ Perlu keputusan | Frontend tidak bisa menyembunyikan menu seperti Shipment Detail |
| AS-04 | `POST /auth/change-password` mengembalikan access token baru (karena refresh token dicabut) | ❓ Perlu keputusan | User harus login ulang setelah ganti password |
| AS-05 | Setelah refresh token, frontend memanggil ulang `POST /auth/context` karena refresh token tidak membawa konteks | ❓ Perlu keputusan | Alternatif: backend menyimpan konteks bersama refresh token |
| AS-06 | AC-06 "hanya READ dan PRINT" ditafsirkan sesuai seed: READ di Shipment, READ + PRINT di Report | ❓ Perlu keputusan | Bila PRINT harus ada di Shipment, data seed BC_VIEWER perlu ditambah |

### 4.2 Open Issues dari PRD §15

| Kode | Pertanyaan | Status | Menghambat |
|---|---|---|---|
| OI-01 | Pembatasan admin USRMGNT per company | ❓ Perlu keputusan | Tahap 5–8 (scope data) |
| OI-02 | Konfirmasi kebijakan password, batas lockout, durasi token dengan tim keamanan IT | ❓ Perlu keputusan | Tahap 2 (bisa jalan dengan nilai usulan) |
| OI-03 | Login bersamaan di beberapa device | ❓ Perlu keputusan | Tahap 2 (penyimpanan refresh token) |
| OI-04 | Detail integrasi LDAP/AD | ❓ Perlu keputusan | Fase 2 |
| OI-05 | Tabel audit log terpisah | ❓ Perlu keputusan | Fase 2 |
| OI-06 | Pola integrasi aplikasi lain (database bersama vs API terpusat) | ❓ Perlu keputusan | Arsitektur jangka panjang |

---

## 5. Langkah Berikutnya (usulan)

1. Review dan putuskan AS-01 s.d. AS-06 serta OI-02 dan OI-03, karena keduanya memengaruhi Tahap 2.
2. Kerjakan SET-1.1 (git) dan Tahap 1 (fondasi backend).
3. Lanjut Tahap 2–3, lalu FE-4.14 (uji frontend terhadap backend asli).

---

## 6. Riwayat Pembaruan

| Tanggal | Perubahan |
|---|---|
| 16-10-2026 | Backlog awal dibuat; Tahap 4 tercatat selesai dengan mock API |
