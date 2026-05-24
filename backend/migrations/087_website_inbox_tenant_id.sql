-- 087_website_inbox_tenant_id.sql
--
-- T3.7 — multi-tenant scoping for the website_inbox tables.
-- Until this lands, inbox_threads + inbox_events + inbox_guesty_jobs
-- are tenant-blind, blocking the non-FR rollout (any new tenant
-- would see / collide-with FR data).
--
-- Strategy:
--   1. Add `tenant_id uuid` column to each table.
--   2. Backfill existing rows to FR_TENANT_ID
--      ('00000000-0000-0000-0000-000000000001'). All current website-
--      inbox data is Friday Mauritius.
--   3. Set NOT NULL + DEFAULT FR_TENANT_ID once backfilled — webhook
--      and job paths can keep inserting without an explicit tenant
--      until they grow per-tenant routing.
--   4. Recreate the unique index on inbox_threads scoped by tenant so
--      two tenants can each have a `guest@example.com` thread without
--      collision.
--   5. Index by (tenant_id) for the FAD-side list query.
--
-- Idempotent — safe to re-run.

ALTER TABLE inbox_threads
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

ALTER TABLE inbox_events
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

ALTER TABLE inbox_guesty_jobs
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- Backfill any NULLs from pre-migration rows.
UPDATE inbox_threads
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
 WHERE tenant_id IS NULL;

UPDATE inbox_events
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
 WHERE tenant_id IS NULL;

UPDATE inbox_guesty_jobs
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
 WHERE tenant_id IS NULL;

-- Lock the column down + default future inserts (webhook + ai-handoff
-- can override with an explicit value when per-tenant routing lands).
ALTER TABLE inbox_threads
  ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE inbox_threads
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE inbox_events
  ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE inbox_events
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE inbox_guesty_jobs
  ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE inbox_guesty_jobs
  ALTER COLUMN tenant_id SET NOT NULL;

-- Replace the tenant-blind unique-by-email index with a tenant-scoped
-- one. Two tenants can now each have a `guest@example.com` thread
-- without collision.
DROP INDEX IF EXISTS idx_inbox_threads_email_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_threads_tenant_email_unique
  ON inbox_threads(tenant_id, LOWER(guest_email));

-- Active list is per-tenant — index on (tenant_id, last_event_at DESC)
-- keeps the FAD-side fetch snappy regardless of tenant count.
CREATE INDEX IF NOT EXISTS idx_inbox_threads_tenant_recent
  ON inbox_threads(tenant_id, last_event_at DESC);

CREATE INDEX IF NOT EXISTS idx_inbox_events_tenant_thread
  ON inbox_events(tenant_id, thread_id);

CREATE INDEX IF NOT EXISTS idx_inbox_guesty_jobs_tenant
  ON inbox_guesty_jobs(tenant_id);
