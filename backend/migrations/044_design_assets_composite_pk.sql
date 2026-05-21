-- Migration 044 — design_assets composite primary key
--
-- Wave C3 multitenant cleanup. Today design_assets.sha256 is the sole
-- primary key, which collapses the asset namespace across tenants:
-- two tenants generating an identical image (same bytes → same sha256)
-- would collide on insert, and ON CONFLICT DO NOTHING silently merges
-- their rows. With a composite (tenant_id, sha256) PK each tenant gets
-- their own namespace.
--
-- Safe because design_assets.tenant_id is already NOT NULL (migration
-- 002) with a default of the FR seed tenant; backfilled rows already
-- carry the correct tenant.
--
-- FK references to design_assets(sha256) on design_projects need to
-- update too — Postgres won't keep a FK referencing a column whose
-- unique constraint is being dropped. The fix: change them to composite
-- FKs (tenant_id, <id>) → design_assets(tenant_id, sha256). Both
-- referencing columns (floor_plan_image_id, floor_plan_furnished_image_id)
-- live on design_projects which already has tenant_id NOT NULL.
--
-- Idempotent guards: every step is wrapped in EXISTS checks so re-running
-- is a no-op.

BEGIN;

-- 1) Drop existing FK constraints on design_projects → design_assets.
--    These have Postgres-auto-generated names; look them up by referenced
--    table to stay robust against renames.
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  FOR fk_name IN
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class c_from ON c_from.oid = con.conrelid
      JOIN pg_class c_to   ON c_to.oid   = con.confrelid
     WHERE con.contype = 'f'
       AND c_from.relname = 'design_projects'
       AND c_to.relname   = 'design_assets'
  LOOP
    EXECUTE format('ALTER TABLE design_projects DROP CONSTRAINT %I', fk_name);
  END LOOP;
END $$;

-- 2) Drop the single-column PK on design_assets and add the composite PK.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'design_assets_pkey'
       AND conrelid = 'design_assets'::regclass
  ) THEN
    -- Only drop + re-add if we're not already on the composite PK.
    IF NOT EXISTS (
      SELECT 1
        FROM pg_constraint con
        JOIN pg_attribute a1 ON a1.attrelid = con.conrelid AND a1.attnum = ANY (con.conkey)
        JOIN pg_attribute a2 ON a2.attrelid = con.conrelid AND a2.attnum = ANY (con.conkey)
       WHERE con.conname  = 'design_assets_pkey'
         AND con.conrelid = 'design_assets'::regclass
         AND a1.attname   = 'tenant_id'
         AND a2.attname   = 'sha256'
         AND array_length(con.conkey, 1) = 2
    ) THEN
      ALTER TABLE design_assets DROP CONSTRAINT design_assets_pkey;
      ALTER TABLE design_assets ADD PRIMARY KEY (tenant_id, sha256);
    END IF;
  ELSE
    -- No existing PK — add directly.
    ALTER TABLE design_assets ADD PRIMARY KEY (tenant_id, sha256);
  END IF;
END $$;

-- 3) Recreate the composite FKs from design_projects → design_assets.
--    These are tenant-scoped: each row's (tenant_id, <id>) pair maps to
--    the asset row in the same tenant's namespace.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'design_projects_floor_plan_image_fkey'
       AND conrelid = 'design_projects'::regclass
  ) THEN
    ALTER TABLE design_projects
      ADD CONSTRAINT design_projects_floor_plan_image_fkey
      FOREIGN KEY (tenant_id, floor_plan_image_id)
      REFERENCES design_assets(tenant_id, sha256) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'design_projects_floor_plan_furnished_image_fkey'
       AND conrelid = 'design_projects'::regclass
  ) THEN
    ALTER TABLE design_projects
      ADD CONSTRAINT design_projects_floor_plan_furnished_image_fkey
      FOREIGN KEY (tenant_id, floor_plan_furnished_image_id)
      REFERENCES design_assets(tenant_id, sha256) ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
