-- =====================================================================
-- MODENA Framework - User Management (RBAC) - SAMPLE SEED DATA
-- Target   : PostgreSQL 13+, schema usrmgnt
-- Prasyarat: 01_user_management.sql (v0.5.0) sudah dijalankan
-- Catatan  :
--   * DATA CONTOH untuk development/testing, BUKAN data produksi.
--   * Jalankan sekali pada database yang baru dibuat (bukan idempotent).
--   * Tidak ada UUID yang di-hardcode: semua relasi dicari via kode bisnis
--     (company_code, app_code, menu_code, group_code, username).
--   * Password semua user LOCAL : Modena@2026  (hash bcrypt, cost 10)
--   * Email memakai domain example.com agar tidak bentrok dengan akun asli.
-- =====================================================================

BEGIN;
SET search_path TO usrmgnt, public;

-- ---------------------------------------------------------------------
-- 1. COMPANIES
-- ---------------------------------------------------------------------
INSERT INTO companies (company_code, company_name, short_name, email, created_by) VALUES
    ('MDN',   'MODENA Indonesia',      'MODENA', 'info@example.com',   'seeder'),
    ('DEMO1', 'Demo Company Satu',     'DEMO1',  'demo1@example.com',  'seeder'),
    ('DEMO2', 'Demo Company Dua',      'DEMO2',  'demo2@example.com',  'seeder');

-- ---------------------------------------------------------------------
-- 2. APPLICATIONS (berdiri sendiri)
-- ---------------------------------------------------------------------
INSERT INTO applications (app_code, app_name, description, base_url, icon, sort_order, created_by) VALUES
    ('USRMGNT',  'User Management', 'Portal administrasi user, group, dan hak akses', '/usrmgnt',  'shield',  1, 'seeder'),
    ('BILLCOST', 'Billing Cost',    'Input data Project Cost Shipment',              '/billcost', 'receipt', 2, 'seeder'),
    ('INVDEMO',  'Inventory Demo',  'Aplikasi contoh untuk pengujian multi-aplikasi', '/invdemo',  'box',     3, 'seeder');

-- ---------------------------------------------------------------------
-- 3. COMPANY_APPLICATIONS (aplikasi yang dimiliki company)
--    MDN   : USRMGNT, BILLCOST, INVDEMO
--    DEMO1 : USRMGNT, BILLCOST
--    DEMO2 : INVDEMO
-- ---------------------------------------------------------------------
INSERT INTO company_applications (company_id, application_id, created_by)
SELECT c.id, a.id, 'seeder'
  FROM (VALUES
        ('MDN',   'USRMGNT'),
        ('MDN',   'BILLCOST'),
        ('MDN',   'INVDEMO'),
        ('DEMO1', 'USRMGNT'),
        ('DEMO1', 'BILLCOST'),
        ('DEMO2', 'INVDEMO')
       ) v(company_code, app_code)
  JOIN companies    c ON c.company_code = v.company_code AND c.is_deleted = false
  JOIN applications a ON a.app_code     = v.app_code     AND a.is_deleted = false;

-- ---------------------------------------------------------------------
-- 4. ACTIONS tambahan
--    (CREATE, READ, UPDATE, DELETE, PRINT, EXPORT_EXCEL sudah di-seed oleh DDL)
-- ---------------------------------------------------------------------
INSERT INTO actions (action_code, action_name, description, is_default, sort_order, created_by) VALUES
    ('APPROVE',      'Approve',           'Menyetujui dokumen/transaksi',   false, 7, 'seeder'),
    ('IMPORT_EXCEL', 'Import from Excel', 'Upload data massal dari Excel',  false, 8, 'seeder');

-- ---------------------------------------------------------------------
-- 5. MENUS
--    Urutan insert: GROUP (parent) dulu, lalu PAGE (child).
--    Menu PAGE otomatis mendapat CRUD lewat trigger trg_menus_default_actions.
-- ---------------------------------------------------------------------

-- 5a. Menu GROUP (header/folder)
INSERT INTO menus (application_id, menu_code, menu_name, menu_type, icon, sort_order, created_by)
SELECT a.id, v.menu_code, v.menu_name, 'GROUP', v.icon, v.sort_order, 'seeder'
  FROM (VALUES
        ('USRMGNT',  'UM_MASTER',   'Master Data',  'database',  1),
        ('USRMGNT',  'UM_ACCESS',   'Access Control','key',      2),
        ('BILLCOST', 'BC_TRX',      'Transaction',  'edit',      1),
        ('BILLCOST', 'BC_REPORT',   'Report',       'bar-chart', 2),
        ('INVDEMO',  'INV_MASTER',  'Master Data',  'database',  1)
       ) v(app_code, menu_code, menu_name, icon, sort_order)
  JOIN applications a ON a.app_code = v.app_code AND a.is_deleted = false;

-- 5b. Menu PAGE (halaman)
INSERT INTO menus (application_id, parent_id, menu_code, menu_name, menu_type, route_path, sort_order, is_visible, created_by)
SELECT a.id, p.id, v.menu_code, v.menu_name, 'PAGE', v.route_path, v.sort_order, v.is_visible, 'seeder'
  FROM (VALUES
        -- USRMGNT > Master Data
        ('USRMGNT',  'UM_MASTER',  'UM_COMPANY',      'Companies',             '/usrmgnt/companies',            1, true),
        ('USRMGNT',  'UM_MASTER',  'UM_APPLICATION',  'Applications',          '/usrmgnt/applications',         2, true),
        ('USRMGNT',  'UM_MASTER',  'UM_MENU',         'Menus',                 '/usrmgnt/menus',                3, true),
        ('USRMGNT',  'UM_MASTER',  'UM_ACTION',       'Actions',               '/usrmgnt/actions',              4, true),
        ('USRMGNT',  'UM_MASTER',  'UM_USER',         'Users',                 '/usrmgnt/users',                5, true),
        -- USRMGNT > Access Control
        ('USRMGNT',  'UM_ACCESS',  'UM_COMPANY_APP',  'Company Applications',  '/usrmgnt/company-applications', 1, true),
        ('USRMGNT',  'UM_ACCESS',  'UM_GROUP',        'User Groups',           '/usrmgnt/user-groups',          2, true),
        ('USRMGNT',  'UM_ACCESS',  'UM_GROUP_MEMBER', 'Group Members',         '/usrmgnt/group-members',        3, true),
        ('USRMGNT',  'UM_ACCESS',  'UM_GROUP_PERM',   'Group Permissions',     '/usrmgnt/group-permissions',    4, true),
        -- BILLCOST > Transaction
        ('BILLCOST', 'BC_TRX',     'BC_SHIPMENT',     'Project Cost Shipment', '/billcost/shipments',           1, true),
        ('BILLCOST', 'BC_TRX',     'BC_SHIPMENT_DTL', 'Shipment Detail',       '/billcost/shipments/:id',       2, false),
        -- BILLCOST > Report
        ('BILLCOST', 'BC_REPORT',  'BC_RPT_SHIPMENT', 'Shipment Cost Report',  '/billcost/reports/shipment',    1, true),
        -- INVDEMO > Master Data
        ('INVDEMO',  'INV_MASTER', 'INV_ITEM',        'Items',                 '/invdemo/items',                1, true),
        ('INVDEMO',  'INV_MASTER', 'INV_WAREHOUSE',   'Warehouses',            '/invdemo/warehouses',           2, true)
       ) v(app_code, parent_code, menu_code, menu_name, route_path, sort_order, is_visible)
  JOIN applications a ON a.app_code = v.app_code AND a.is_deleted = false
  JOIN menus        p ON p.application_id = a.id AND p.menu_code = v.parent_code AND p.is_deleted = false;

-- ---------------------------------------------------------------------
-- 6. MENU_ACTIONS - penyesuaian action per menu
-- ---------------------------------------------------------------------

-- 6a. Action tambahan di menu tertentu
INSERT INTO menu_actions (menu_id, action_id, created_by)
SELECT m.id, act.id, 'seeder'
  FROM (VALUES
        ('USRMGNT',  'UM_USER',         'EXPORT_EXCEL'),
        ('USRMGNT',  'UM_USER',         'IMPORT_EXCEL'),
        ('BILLCOST', 'BC_SHIPMENT',     'APPROVE'),
        ('BILLCOST', 'BC_SHIPMENT',     'PRINT'),
        ('BILLCOST', 'BC_SHIPMENT',     'EXPORT_EXCEL'),
        ('BILLCOST', 'BC_SHIPMENT',     'IMPORT_EXCEL'),
        ('BILLCOST', 'BC_RPT_SHIPMENT', 'PRINT'),
        ('BILLCOST', 'BC_RPT_SHIPMENT', 'EXPORT_EXCEL'),
        ('INVDEMO',  'INV_ITEM',        'EXPORT_EXCEL')
       ) v(app_code, menu_code, action_code)
  JOIN applications a   ON a.app_code = v.app_code AND a.is_deleted = false
  JOIN menus        m   ON m.application_id = a.id AND m.menu_code = v.menu_code AND m.is_deleted = false
  JOIN actions      act ON act.action_code = v.action_code AND act.is_deleted = false;

-- 6b. Menu report bersifat read-only: CREATE/UPDATE/DELETE bawaan trigger di-soft-delete
UPDATE menu_actions ma
   SET is_deleted = true, deleted_by = 'seeder', deleted_at = now(), updated_by = 'seeder'
  FROM menus m, applications a, actions act
 WHERE ma.menu_id = m.id
   AND m.application_id = a.id
   AND ma.action_id = act.id
   AND a.app_code = 'BILLCOST'
   AND m.menu_code = 'BC_RPT_SHIPMENT'
   AND act.action_code IN ('CREATE', 'UPDATE', 'DELETE')
   AND ma.is_deleted = false;

-- ---------------------------------------------------------------------
-- 7. USER_GROUPS (per aplikasi)
-- ---------------------------------------------------------------------
INSERT INTO user_groups (application_id, group_code, group_name, description, created_by)
SELECT a.id, v.group_code, v.group_name, v.description, 'seeder'
  FROM (VALUES
        ('USRMGNT',  'SUPER_ADMIN', 'Super Administrator', 'Akses penuh ke seluruh menu User Management'),
        ('USRMGNT',  'UM_AUDITOR',  'Auditor',             'Hanya dapat melihat data User Management'),
        ('BILLCOST', 'BC_ADMIN',    'Billing Admin',       'Akses penuh aplikasi Billing Cost'),
        ('BILLCOST', 'BC_STAFF',    'Billing Staff',       'Input & ubah transaksi, tanpa hapus dan approve'),
        ('BILLCOST', 'BC_VIEWER',   'Billing Viewer',      'Hanya melihat dan mencetak'),
        ('INVDEMO',  'INV_ADMIN',   'Inventory Admin',     'Akses penuh aplikasi Inventory Demo')
       ) v(app_code, group_code, group_name, description)
  JOIN applications a ON a.app_code = v.app_code AND a.is_deleted = false;

-- ---------------------------------------------------------------------
-- 8. USER_GROUP_PERMISSIONS
-- ---------------------------------------------------------------------

-- 8a. Group "full access": semua action yang tersedia di semua menu aplikasinya
INSERT INTO user_group_permissions (user_group_id, menu_action_id, created_by)
SELECT g.id, ma.id, 'seeder'
  FROM user_groups g
  JOIN applications a  ON a.id = g.application_id
  JOIN menus        m  ON m.application_id = a.id AND m.is_deleted = false
  JOIN menu_actions ma ON ma.menu_id = m.id AND ma.is_deleted = false
 WHERE g.group_code IN ('SUPER_ADMIN', 'BC_ADMIN', 'INV_ADMIN')
   AND g.is_deleted = false;

-- 8b. Group dengan akses terbatas: (group, menu, action) eksplisit
INSERT INTO user_group_permissions (user_group_id, menu_action_id, created_by)
SELECT g.id, ma.id, 'seeder'
  FROM (VALUES
        -- UM_AUDITOR: READ di semua halaman + export user
        ('USRMGNT',  'UM_AUDITOR', 'UM_COMPANY',      'READ'),
        ('USRMGNT',  'UM_AUDITOR', 'UM_APPLICATION',  'READ'),
        ('USRMGNT',  'UM_AUDITOR', 'UM_MENU',         'READ'),
        ('USRMGNT',  'UM_AUDITOR', 'UM_ACTION',       'READ'),
        ('USRMGNT',  'UM_AUDITOR', 'UM_USER',         'READ'),
        ('USRMGNT',  'UM_AUDITOR', 'UM_USER',         'EXPORT_EXCEL'),
        ('USRMGNT',  'UM_AUDITOR', 'UM_COMPANY_APP',  'READ'),
        ('USRMGNT',  'UM_AUDITOR', 'UM_GROUP',        'READ'),
        ('USRMGNT',  'UM_AUDITOR', 'UM_GROUP_MEMBER', 'READ'),
        ('USRMGNT',  'UM_AUDITOR', 'UM_GROUP_PERM',   'READ'),
        -- BC_STAFF: CRUD tanpa DELETE/APPROVE di transaksi, report read + export
        ('BILLCOST', 'BC_STAFF',   'BC_SHIPMENT',     'CREATE'),
        ('BILLCOST', 'BC_STAFF',   'BC_SHIPMENT',     'READ'),
        ('BILLCOST', 'BC_STAFF',   'BC_SHIPMENT',     'UPDATE'),
        ('BILLCOST', 'BC_STAFF',   'BC_SHIPMENT',     'PRINT'),
        ('BILLCOST', 'BC_STAFF',   'BC_SHIPMENT',     'IMPORT_EXCEL'),
        ('BILLCOST', 'BC_STAFF',   'BC_SHIPMENT_DTL', 'CREATE'),
        ('BILLCOST', 'BC_STAFF',   'BC_SHIPMENT_DTL', 'READ'),
        ('BILLCOST', 'BC_STAFF',   'BC_SHIPMENT_DTL', 'UPDATE'),
        ('BILLCOST', 'BC_STAFF',   'BC_RPT_SHIPMENT', 'READ'),
        ('BILLCOST', 'BC_STAFF',   'BC_RPT_SHIPMENT', 'EXPORT_EXCEL'),
        -- BC_VIEWER: hanya lihat dan cetak
        ('BILLCOST', 'BC_VIEWER',  'BC_SHIPMENT',     'READ'),
        ('BILLCOST', 'BC_VIEWER',  'BC_SHIPMENT_DTL', 'READ'),
        ('BILLCOST', 'BC_VIEWER',  'BC_RPT_SHIPMENT', 'READ'),
        ('BILLCOST', 'BC_VIEWER',  'BC_RPT_SHIPMENT', 'PRINT')
       ) v(app_code, group_code, menu_code, action_code)
  JOIN applications a   ON a.app_code = v.app_code AND a.is_deleted = false
  JOIN user_groups  g   ON g.application_id = a.id AND g.group_code = v.group_code AND g.is_deleted = false
  JOIN menus        m   ON m.application_id = a.id AND m.menu_code = v.menu_code AND m.is_deleted = false
  JOIN actions      act ON act.action_code = v.action_code AND act.is_deleted = false
  JOIN menu_actions ma  ON ma.menu_id = m.id AND ma.action_id = act.id AND ma.is_deleted = false;

-- ---------------------------------------------------------------------
-- 9. USERS
--    Password LOCAL: Modena@2026
--    Mencakup skenario uji: LDAP, user terkunci, user nonaktif
-- ---------------------------------------------------------------------
INSERT INTO users (username, email, full_name, employee_no, auth_provider, password_hash,
                   must_change_password, is_locked, locked_at, is_active, created_by) VALUES
    ('superadmin', 'superadmin@example.com', 'Super Administrator', NULL,       'LOCAL', '$2b$10$Eq4LpnxEQ6KS3fa0GmvqxOgVwe2F51qT2S8i8MkKLWTerzsrLBPAO', false, false, NULL,  true,  'seeder'),
    ('auditor',    'auditor@example.com',    'Andi Auditor',        'EMP-0001', 'LOCAL', '$2b$10$Eq4LpnxEQ6KS3fa0GmvqxOgVwe2F51qT2S8i8MkKLWTerzsrLBPAO', false, false, NULL,  true,  'seeder'),
    ('bc.admin',   'bc.admin@example.com',   'Budi Billing Admin',  'EMP-0002', 'LOCAL', '$2b$10$Eq4LpnxEQ6KS3fa0GmvqxOgVwe2F51qT2S8i8MkKLWTerzsrLBPAO', false, false, NULL,  true,  'seeder'),
    ('bc.staff',   'bc.staff@example.com',   'Citra Billing Staff', 'EMP-0003', 'LOCAL', '$2b$10$Eq4LpnxEQ6KS3fa0GmvqxOgVwe2F51qT2S8i8MkKLWTerzsrLBPAO', true,  false, NULL,  true,  'seeder'),
    ('bc.viewer',  'bc.viewer@example.com',  'Dewi Billing Viewer', 'EMP-0004', 'LDAP',  NULL,                                                           false, false, NULL,  true,  'seeder'),
    ('inv.admin',  'inv.admin@example.com',  'Eko Inventory Admin', 'EMP-0005', 'LOCAL', '$2b$10$Eq4LpnxEQ6KS3fa0GmvqxOgVwe2F51qT2S8i8MkKLWTerzsrLBPAO', false, false, NULL,  true,  'seeder'),
    ('locked.user','locked.user@example.com','Fajar Locked User',   'EMP-0006', 'LOCAL', '$2b$10$Eq4LpnxEQ6KS3fa0GmvqxOgVwe2F51qT2S8i8MkKLWTerzsrLBPAO', false, true,  now(), true,  'seeder'),
    ('inactive.user','inactive.user@example.com','Gita Inactive User','EMP-0007','LOCAL','$2b$10$Eq4LpnxEQ6KS3fa0GmvqxOgVwe2F51qT2S8i8MkKLWTerzsrLBPAO', false, false, NULL,  false, 'seeder');

UPDATE users SET failed_login_count = 5 WHERE username = 'locked.user';

-- ---------------------------------------------------------------------
-- 10. USER_GROUP_MEMBERS (user -> group, per company)
--     Company wajib memiliki aplikasi group-nya (divalidasi trigger)
-- ---------------------------------------------------------------------
INSERT INTO user_group_members (user_id, user_group_id, company_id, valid_from, valid_to, created_by)
SELECT u.id, g.id, c.id, v.valid_from, v.valid_to, 'seeder'
  FROM (VALUES
        -- username       app_code    group_code     company  valid_from          valid_to
        ('superadmin',    'USRMGNT',  'SUPER_ADMIN', 'MDN',   DATE '2026-01-01',  NULL::date),
        ('superadmin',    'USRMGNT',  'SUPER_ADMIN', 'DEMO1', DATE '2026-01-01',  NULL::date),
        ('auditor',       'USRMGNT',  'UM_AUDITOR',  'MDN',   DATE '2026-01-01',  NULL::date),
        ('bc.admin',      'BILLCOST', 'BC_ADMIN',    'MDN',   DATE '2026-01-01',  NULL::date),
        ('bc.staff',      'BILLCOST', 'BC_STAFF',    'MDN',   DATE '2026-01-01',  NULL::date),
        ('bc.staff',      'BILLCOST', 'BC_VIEWER',   'DEMO1', DATE '2026-01-01',  NULL::date),
        ('bc.viewer',     'BILLCOST', 'BC_VIEWER',   'MDN',   DATE '2026-01-01',  NULL::date),
        ('bc.viewer',     'BILLCOST', 'BC_STAFF',    'DEMO1', DATE '2025-01-01',  DATE '2025-12-31'),  -- sudah kedaluwarsa
        ('inv.admin',     'INVDEMO',  'INV_ADMIN',   'MDN',   DATE '2026-01-01',  NULL::date),
        ('inv.admin',     'INVDEMO',  'INV_ADMIN',   'DEMO2', DATE '2026-01-01',  NULL::date),
        ('locked.user',   'BILLCOST', 'BC_STAFF',    'MDN',   DATE '2026-01-01',  NULL::date),  -- terkunci
        ('inactive.user', 'BILLCOST', 'BC_VIEWER',   'MDN',   DATE '2026-01-01',  NULL::date)   -- nonaktif
       ) v(username, app_code, group_code, company_code, valid_from, valid_to)
  JOIN users        u ON u.username = v.username AND u.is_deleted = false
  JOIN applications a ON a.app_code = v.app_code AND a.is_deleted = false
  JOIN user_groups  g ON g.application_id = a.id AND g.group_code = v.group_code AND g.is_deleted = false
  JOIN companies    c ON c.company_code = v.company_code AND c.is_deleted = false;

COMMIT;

-- =====================================================================
-- 11. QUERY VERIFIKASI (opsional, jalankan setelah seeding)
-- =====================================================================

-- 11a. Jumlah baris aktif per tabel
SELECT 'companies' AS table_name, count(*) AS total FROM usrmgnt.companies WHERE is_deleted = false
UNION ALL SELECT 'applications',           count(*) FROM usrmgnt.applications           WHERE is_deleted = false
UNION ALL SELECT 'company_applications',   count(*) FROM usrmgnt.company_applications   WHERE is_deleted = false
UNION ALL SELECT 'actions',                count(*) FROM usrmgnt.actions                WHERE is_deleted = false
UNION ALL SELECT 'menus',                  count(*) FROM usrmgnt.menus                  WHERE is_deleted = false
UNION ALL SELECT 'menu_actions',           count(*) FROM usrmgnt.menu_actions           WHERE is_deleted = false
UNION ALL SELECT 'user_groups',            count(*) FROM usrmgnt.user_groups            WHERE is_deleted = false
UNION ALL SELECT 'user_group_permissions', count(*) FROM usrmgnt.user_group_permissions WHERE is_deleted = false
UNION ALL SELECT 'users',                  count(*) FROM usrmgnt.users                  WHERE is_deleted = false
UNION ALL SELECT 'user_group_members',     count(*) FROM usrmgnt.user_group_members     WHERE is_deleted = false;

-- 11b. Ringkasan hak akses efektif per user per company
SELECT username, company_code, app_code,
       count(DISTINCT menu_id) AS menu_count,
       string_agg(DISTINCT action_code, ', ' ORDER BY action_code) AS actions
  FROM usrmgnt.user_effective_permissions
 GROUP BY username, company_code, app_code
 ORDER BY username, company_code, app_code;
