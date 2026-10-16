-- =====================================================================
-- MODENA Framework - User Management (RBAC) Schema
-- Target   : PostgreSQL 13+ (gen_random_uuid() built-in)
-- Version  : 0.5.0 (keanggotaan group per company: company_id di user_group_members)
-- Konvensi :
--   * Nama tabel = kata benda jamak (plural) sesuai peruntukannya,
--     mis. companies, applications, menus, users
--   * Tabel relasi diberi nama sesuai makna relasinya,
--     mis. menu_actions, user_group_members, user_group_permissions
--   * PK UUID, nama field snake_case
--   * Semua tabel memiliki 8 audit field standar
--   * Unique constraint bisnis memakai partial index (WHERE is_deleted = false)
--     agar kode yang sudah di-soft-delete bisa dipakai ulang
-- =====================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS usrmgnt;   -- usrmgnt = user management
SET search_path TO usrmgnt, public;

-- ---------------------------------------------------------------------
-- 0. Helper function: auto update updated_at
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION usrmgnt.fn_set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 1. COMPANIES - Daftar perusahaan
-- =====================================================================
CREATE TABLE usrmgnt.companies (
    id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    company_code    varchar(20)     NOT NULL,
    company_name    varchar(200)    NOT NULL,
    short_name      varchar(50),
    tax_number      varchar(30),                -- NPWP
    address         text,
    phone           varchar(30),
    email           varchar(150),
    logo_url        varchar(500),
    -- audit fields
    created_by      varchar(100)    NOT NULL,
    created_at      timestamptz     NOT NULL DEFAULT now(),
    updated_by      varchar(100),
    updated_at      timestamptz,
    deleted_by      varchar(100),
    deleted_at      timestamptz,
    is_deleted      boolean         NOT NULL DEFAULT false,
    is_active       boolean         NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX uq_companies_code
    ON usrmgnt.companies (company_code) WHERE is_deleted = false;

-- =====================================================================
-- 2. APPLICATIONS - Daftar aplikasi (berdiri sendiri, tanpa relasi ke company)
-- =====================================================================
CREATE TABLE usrmgnt.applications (
    id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    app_code        varchar(30)     NOT NULL,
    app_name        varchar(150)    NOT NULL,
    description     text,
    base_url        varchar(500),
    icon            varchar(100),
    sort_order      integer         NOT NULL DEFAULT 0,
    -- audit fields
    created_by      varchar(100)    NOT NULL,
    created_at      timestamptz     NOT NULL DEFAULT now(),
    updated_by      varchar(100),
    updated_at      timestamptz,
    deleted_by      varchar(100),
    deleted_at      timestamptz,
    is_deleted      boolean         NOT NULL DEFAULT false,
    is_active       boolean         NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX uq_applications_code
    ON usrmgnt.applications (app_code) WHERE is_deleted = false;

-- =====================================================================
-- 2b. COMPANY_APPLICATIONS - Pemetaan aplikasi yang dimiliki company (M:N)
-- =====================================================================
CREATE TABLE usrmgnt.company_applications (
    id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      uuid            NOT NULL REFERENCES usrmgnt.companies(id),
    application_id  uuid            NOT NULL REFERENCES usrmgnt.applications(id),
    -- audit fields
    created_by      varchar(100)    NOT NULL,
    created_at      timestamptz     NOT NULL DEFAULT now(),
    updated_by      varchar(100),
    updated_at      timestamptz,
    deleted_by      varchar(100),
    deleted_at      timestamptz,
    is_deleted      boolean         NOT NULL DEFAULT false,
    is_active       boolean         NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX uq_company_applications
    ON usrmgnt.company_applications (company_id, application_id) WHERE is_deleted = false;
CREATE INDEX ix_company_applications_application
    ON usrmgnt.company_applications (application_id);

-- =====================================================================
-- 3. MENUS - Daftar menu per aplikasi (mendukung hirarki parent-child)
-- =====================================================================
CREATE TABLE usrmgnt.menus (
    id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id  uuid            NOT NULL REFERENCES usrmgnt.applications(id),
    parent_id       uuid            REFERENCES usrmgnt.menus(id),
    menu_code       varchar(50)     NOT NULL,
    menu_name       varchar(150)    NOT NULL,
    menu_type       varchar(10)     NOT NULL DEFAULT 'PAGE'
                    CHECK (menu_type IN ('GROUP', 'PAGE')),  -- GROUP = header/folder, PAGE = halaman
    route_path      varchar(300),
    icon            varchar(100),
    sort_order      integer         NOT NULL DEFAULT 0,
    is_visible      boolean         NOT NULL DEFAULT true,   -- false = halaman tersembunyi (mis. detail page)
    -- audit fields
    created_by      varchar(100)    NOT NULL,
    created_at      timestamptz     NOT NULL DEFAULT now(),
    updated_by      varchar(100),
    updated_at      timestamptz,
    deleted_by      varchar(100),
    deleted_at      timestamptz,
    is_deleted      boolean         NOT NULL DEFAULT false,
    is_active       boolean         NOT NULL DEFAULT true,
    CONSTRAINT ck_menus_not_self_parent CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE UNIQUE INDEX uq_menus_code
    ON usrmgnt.menus (application_id, menu_code) WHERE is_deleted = false;
CREATE INDEX ix_menus_application ON usrmgnt.menus (application_id);
CREATE INDEX ix_menus_parent      ON usrmgnt.menus (parent_id);

-- =====================================================================
-- 4a. ACTIONS - Katalog action global (CREATE, READ, UPDATE, DELETE, PRINT, ...)
-- =====================================================================
CREATE TABLE usrmgnt.actions (
    id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    action_code     varchar(30)     NOT NULL,
    action_name     varchar(100)    NOT NULL,
    description     text,
    is_default      boolean         NOT NULL DEFAULT false,  -- true = otomatis ditempel ke setiap menu PAGE baru
    sort_order      integer         NOT NULL DEFAULT 0,
    -- audit fields
    created_by      varchar(100)    NOT NULL,
    created_at      timestamptz     NOT NULL DEFAULT now(),
    updated_by      varchar(100),
    updated_at      timestamptz,
    deleted_by      varchar(100),
    deleted_at      timestamptz,
    is_deleted      boolean         NOT NULL DEFAULT false,
    is_active       boolean         NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX uq_actions_code
    ON usrmgnt.actions (action_code) WHERE is_deleted = false;

-- =====================================================================
-- 4b. MENU_ACTIONS - Action apa saja yang TERSEDIA di sebuah menu
-- =====================================================================
CREATE TABLE usrmgnt.menu_actions (
    id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_id         uuid            NOT NULL REFERENCES usrmgnt.menus(id),
    action_id       uuid            NOT NULL REFERENCES usrmgnt.actions(id),
    -- audit fields
    created_by      varchar(100)    NOT NULL,
    created_at      timestamptz     NOT NULL DEFAULT now(),
    updated_by      varchar(100),
    updated_at      timestamptz,
    deleted_by      varchar(100),
    deleted_at      timestamptz,
    is_deleted      boolean         NOT NULL DEFAULT false,
    is_active       boolean         NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX uq_menu_actions
    ON usrmgnt.menu_actions (menu_id, action_id) WHERE is_deleted = false;
CREATE INDEX ix_menu_actions_action ON usrmgnt.menu_actions (action_id);

-- =====================================================================
-- 5. USER_GROUPS - Group akses user (1 application : N group)
-- =====================================================================
CREATE TABLE usrmgnt.user_groups (
    id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id  uuid            NOT NULL REFERENCES usrmgnt.applications(id),
    group_code      varchar(50)     NOT NULL,
    group_name      varchar(150)    NOT NULL,
    description     text,
    -- audit fields
    created_by      varchar(100)    NOT NULL,
    created_at      timestamptz     NOT NULL DEFAULT now(),
    updated_by      varchar(100),
    updated_at      timestamptz,
    deleted_by      varchar(100),
    deleted_at      timestamptz,
    is_deleted      boolean         NOT NULL DEFAULT false,
    is_active       boolean         NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX uq_user_groups_code
    ON usrmgnt.user_groups (application_id, group_code) WHERE is_deleted = false;
CREATE INDEX ix_user_groups_application ON usrmgnt.user_groups (application_id);

-- =====================================================================
-- 6. USERS - Daftar user (global, satu akun lintas company & aplikasi)
-- =====================================================================
CREATE TABLE usrmgnt.users (
    id                  uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    username            varchar(100)    NOT NULL,
    email               varchar(150)    NOT NULL,
    full_name           varchar(200)    NOT NULL,
    employee_no         varchar(30),                -- NIK karyawan (opsional)
    phone               varchar(30),
    auth_provider       varchar(10)     NOT NULL DEFAULT 'LOCAL'
                        CHECK (auth_provider IN ('LOCAL', 'LDAP', 'SSO')),
    password_hash       varchar(255),               -- NULL bila login via LDAP/SSO
    password_changed_at timestamptz,
    must_change_password boolean        NOT NULL DEFAULT false,
    failed_login_count  smallint        NOT NULL DEFAULT 0,
    is_locked           boolean         NOT NULL DEFAULT false,
    locked_at           timestamptz,
    last_login_at       timestamptz,
    -- audit fields
    created_by          varchar(100)    NOT NULL,
    created_at          timestamptz     NOT NULL DEFAULT now(),
    updated_by          varchar(100),
    updated_at          timestamptz,
    deleted_by          varchar(100),
    deleted_at          timestamptz,
    is_deleted          boolean         NOT NULL DEFAULT false,
    is_active           boolean         NOT NULL DEFAULT true,
    CONSTRAINT ck_users_local_password
        CHECK (auth_provider <> 'LOCAL' OR password_hash IS NOT NULL)
);
CREATE UNIQUE INDEX uq_users_username
    ON usrmgnt.users (lower(username)) WHERE is_deleted = false;
CREATE UNIQUE INDEX uq_users_email
    ON usrmgnt.users (lower(email)) WHERE is_deleted = false;
CREATE INDEX ix_users_employee_no ON usrmgnt.users (employee_no);

-- =====================================================================
-- 7. USER_GROUP_MEMBERS - User <-> Group per company
--    1 baris = "User X anggota Group Y untuk Company Z"
-- =====================================================================
CREATE TABLE usrmgnt.user_group_members (
    id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid            NOT NULL REFERENCES usrmgnt.users(id),
    user_group_id   uuid            NOT NULL REFERENCES usrmgnt.user_groups(id),
    company_id      uuid            NOT NULL REFERENCES usrmgnt.companies(id),
    valid_from      date            NOT NULL DEFAULT current_date,
    valid_to        date,                           -- NULL = tanpa batas
    -- audit fields
    created_by      varchar(100)    NOT NULL,
    created_at      timestamptz     NOT NULL DEFAULT now(),
    updated_by      varchar(100),
    updated_at      timestamptz,
    deleted_by      varchar(100),
    deleted_at      timestamptz,
    is_deleted      boolean         NOT NULL DEFAULT false,
    is_active       boolean         NOT NULL DEFAULT true,
    CONSTRAINT ck_user_group_members_period CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE UNIQUE INDEX uq_user_group_members
    ON usrmgnt.user_group_members (user_id, user_group_id, company_id) WHERE is_deleted = false;
CREATE INDEX ix_user_group_members_group   ON usrmgnt.user_group_members (user_group_id);
CREATE INDEX ix_user_group_members_company ON usrmgnt.user_group_members (company_id);

-- =====================================================================
-- 8. USER_GROUP_PERMISSIONS - Hak akses group terhadap action di sebuah menu
--    1 baris = "Group X boleh melakukan Action Y di Menu Z"
-- =====================================================================
CREATE TABLE usrmgnt.user_group_permissions (
    id                  uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_group_id       uuid            NOT NULL REFERENCES usrmgnt.user_groups(id),
    menu_action_id      uuid            NOT NULL REFERENCES usrmgnt.menu_actions(id),
    -- audit fields
    created_by          varchar(100)    NOT NULL,
    created_at          timestamptz     NOT NULL DEFAULT now(),
    updated_by          varchar(100),
    updated_at          timestamptz,
    deleted_by          varchar(100),
    deleted_at          timestamptz,
    is_deleted          boolean         NOT NULL DEFAULT false,
    is_active           boolean         NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX uq_user_group_permissions
    ON usrmgnt.user_group_permissions (user_group_id, menu_action_id) WHERE is_deleted = false;
CREATE INDEX ix_user_group_permissions_menu_action ON usrmgnt.user_group_permissions (menu_action_id);

-- =====================================================================
-- 9. Integrity triggers
-- =====================================================================

-- 9a. Parent menu harus berada di aplikasi yang sama
CREATE OR REPLACE FUNCTION usrmgnt.fn_validate_menu_parent()
RETURNS trigger AS $$
BEGIN
    IF NEW.parent_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM usrmgnt.menus p
        WHERE p.id = NEW.parent_id AND p.application_id = NEW.application_id
    ) THEN
        RAISE EXCEPTION 'Parent menu % tidak berada di aplikasi yang sama', NEW.parent_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_menus_validate_parent
    BEFORE INSERT OR UPDATE OF parent_id, application_id ON usrmgnt.menus
    FOR EACH ROW EXECUTE FUNCTION usrmgnt.fn_validate_menu_parent();

-- 9b. Group hanya boleh diberi permission atas menu dari aplikasi yang sama
CREATE OR REPLACE FUNCTION usrmgnt.fn_validate_group_permission()
RETURNS trigger AS $$
DECLARE
    v_group_app uuid;
    v_menu_app  uuid;
BEGIN
    SELECT application_id INTO v_group_app
      FROM usrmgnt.user_groups WHERE id = NEW.user_group_id;

    SELECT m.application_id INTO v_menu_app
      FROM usrmgnt.menu_actions ma
      JOIN usrmgnt.menus m ON m.id = ma.menu_id
     WHERE ma.id = NEW.menu_action_id;

    IF v_group_app IS DISTINCT FROM v_menu_app THEN
        RAISE EXCEPTION 'Group dan menu berasal dari aplikasi yang berbeda';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_group_permissions_validate
    BEFORE INSERT OR UPDATE OF user_group_id, menu_action_id ON usrmgnt.user_group_permissions
    FOR EACH ROW EXECUTE FUNCTION usrmgnt.fn_validate_group_permission();

-- 9b2. Company pada keanggotaan group wajib memiliki aplikasi dari group tersebut
--      (terdaftar aktif di company_applications)
CREATE OR REPLACE FUNCTION usrmgnt.fn_validate_group_member_company()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM usrmgnt.user_groups g
          JOIN usrmgnt.company_applications ca
            ON ca.application_id = g.application_id
         WHERE g.id = NEW.user_group_id
           AND ca.company_id = NEW.company_id
           AND ca.is_deleted = false
    ) THEN
        RAISE EXCEPTION 'Company % tidak memiliki aplikasi dari group %', NEW.company_id, NEW.user_group_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_group_members_validate_company
    BEFORE INSERT OR UPDATE OF user_group_id, company_id ON usrmgnt.user_group_members
    FOR EACH ROW EXECUTE FUNCTION usrmgnt.fn_validate_group_member_company();

-- 9c. Menu PAGE baru otomatis mendapatkan action default (CRUD)
CREATE OR REPLACE FUNCTION usrmgnt.fn_attach_default_actions()
RETURNS trigger AS $$
BEGIN
    IF NEW.menu_type = 'PAGE' THEN
        INSERT INTO usrmgnt.menu_actions (menu_id, action_id, created_by)
        SELECT NEW.id, a.id, NEW.created_by
          FROM usrmgnt.actions a
         WHERE a.is_default = true AND a.is_deleted = false AND a.is_active = true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_menus_default_actions
    AFTER INSERT ON usrmgnt.menus
    FOR EACH ROW EXECUTE FUNCTION usrmgnt.fn_attach_default_actions();

-- 9d. updated_at otomatis di semua tabel
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'companies','applications','company_applications','menus','actions','menu_actions',
        'user_groups','users','user_group_members','user_group_permissions'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON usrmgnt.%1$s
             FOR EACH ROW EXECUTE FUNCTION usrmgnt.fn_set_updated_at()', t);
    END LOOP;
END $$;

-- =====================================================================
-- 10. View: resolusi hak akses efektif per user
--     Dipakai backend untuk build menu & authorization check
-- =====================================================================
CREATE OR REPLACE VIEW usrmgnt.user_effective_permissions AS
SELECT DISTINCT
    u.id            AS user_id,
    u.username,
    c.id            AS company_id,
    c.company_code,
    a.id            AS application_id,
    a.app_code,
    m.id            AS menu_id,
    m.menu_code,
    m.menu_name,
    m.parent_id     AS menu_parent_id,
    m.route_path,
    m.sort_order    AS menu_sort_order,
    act.action_code
FROM usrmgnt.users u
JOIN usrmgnt.user_group_members       ug  ON ug.user_id = u.id
JOIN usrmgnt.user_groups       g   ON g.id = ug.user_group_id
JOIN usrmgnt.applications      a   ON a.id = g.application_id
JOIN usrmgnt.companies         c   ON c.id = ug.company_id
JOIN usrmgnt.company_applications ca ON ca.company_id = c.id AND ca.application_id = a.id
JOIN usrmgnt.user_group_permissions gp  ON gp.user_group_id = g.id
JOIN usrmgnt.menu_actions      ma  ON ma.id = gp.menu_action_id
JOIN usrmgnt.menus             m   ON m.id = ma.menu_id
JOIN usrmgnt.actions           act ON act.id = ma.action_id
WHERE u.is_deleted = false   AND u.is_active = true AND u.is_locked = false
  AND ug.is_deleted = false  AND ug.is_active = true
  AND current_date BETWEEN ug.valid_from AND COALESCE(ug.valid_to, 'infinity'::date)
  AND g.is_deleted = false   AND g.is_active = true
  AND a.is_deleted = false   AND a.is_active = true
  AND c.is_deleted = false   AND c.is_active = true
  AND ca.is_deleted = false  AND ca.is_active = true
  AND gp.is_deleted = false  AND gp.is_active = true
  AND ma.is_deleted = false  AND ma.is_active = true
  AND m.is_deleted = false   AND m.is_active = true
  AND act.is_deleted = false AND act.is_active = true;

-- =====================================================================
-- 11. Seed: action default
-- =====================================================================
INSERT INTO usrmgnt.actions (action_code, action_name, is_default, sort_order, created_by) VALUES
    ('CREATE',       'Create',          true,  1, 'system'),
    ('READ',         'Read',            true,  2, 'system'),
    ('UPDATE',       'Update',          true,  3, 'system'),
    ('DELETE',       'Delete',          true,  4, 'system'),
    ('PRINT',        'Print',           false, 5, 'system'),
    ('EXPORT_EXCEL', 'Export to Excel', false, 6, 'system');

COMMIT;
