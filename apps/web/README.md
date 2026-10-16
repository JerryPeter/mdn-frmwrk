# MODENA Framework – Web (Tahap 4)

Frontend React 18 + Vite + TypeScript + Tailwind sesuai `docs/PRD_user_management.md` §5, §8.1–§8.2, §10.

## Menjalankan

```bash
cp .env.example .env
npm install
npm run dev        # http://localhost:5173
```

`VITE_USE_MOCK=true` (default) memakai mock API di `src/mocks/` yang meniru data seed
(`database/02_seed_sample_data.sql`) dan aturan backend (lockout, wajib ganti password,
konteks, menu dari hak akses efektif). Akun uji: lihat PRD §12, password `Modena@2026`.
Saat backend Express siap, set `VITE_USE_MOCK=false`; request `/api` diteruskan ke
`VITE_API_PROXY_TARGET`.

## Struktur

| Folder | Isi |
|---|---|
| `src/api` | Axios client (Bearer token, refresh otomatis saat `TOKEN_EXPIRED`), endpoint `/auth/*` |
| `src/stores` | Zustand: sesi (token di memori, konteks aktif) dan toast |
| `src/hooks` | `useMenus`, `usePermissionSet`, `usePermission(menu, action)`, bootstrap sesi |
| `src/routes` | Guard (`RequireAuth`, `RequirePasswordChanged`, `RequireContext`, `RequireMenuAccess`) dan registry halaman |
| `src/layouts` | `AuthLayout`, `AppLayout` (header + sidebar dinamis) |
| `src/pages` | Login, ganti password, pilih konteks, beranda, 403, 404, placeholder |

## Menambah halaman

Daftarkan di `src/routes/registry.ts` dengan `path` = `menus.route_path` dan `menuCode` =
`menus.menu_code`. Route guard otomatis memeriksa permission `READ`. Untuk tombol aksi,
gunakan `<PermissionGate menu="UM_USER" action="CREATE">` atau `usePermission()`.
