-- 051_tasks_full.sql
--
-- Operations module fleshes out tasks. The narrow mig 050 schema
-- (todo/in_progress/done/cancelled, single assignee, no cross-links)
-- doesn't model what the frontend already shows — multi-assignee,
-- canonical Breezeway-cutover lifecycle, property + reservation
-- cross-links, source provenance, idempotent source references,
-- comments + cost lines.
--
-- This migration extends the existing `tasks` table in place (no
-- data loss; the smoke tenant's test rows are already cleared) and
-- adds two child tables: `task_comments` + `task_costs`. Activity log
-- and AI suggestions stay on the row as JSONB for now — promote to
-- tables when querying them becomes a thing.

-- ─── Extend `tasks` ──────────────────────────────────────────────
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS bz_id                  TEXT,
  ADD COLUMN IF NOT EXISTS external_ref           TEXT,
  ADD COLUMN IF NOT EXISTS source                 TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS visibility             TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS department             TEXT,
  ADD COLUMN IF NOT EXISTS subdepartment          TEXT,
  ADD COLUMN IF NOT EXISTS property_code          TEXT,
  ADD COLUMN IF NOT EXISTS reservation_guesty_id  TEXT,
  ADD COLUMN IF NOT EXISTS requester_user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS due_time               TEXT,
  ADD COLUMN IF NOT EXISTS estimated_minutes      INTEGER,
  ADD COLUMN IF NOT EXISTS spent_minutes          INTEGER,
  ADD COLUMN IF NOT EXISTS is_recurring           BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS template               TEXT,
  ADD COLUMN IF NOT EXISTS inbox_thread_id        TEXT,
  ADD COLUMN IF NOT EXISTS group_email_id         TEXT,
  ADD COLUMN IF NOT EXISTS awaiting_human_approval BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tags                   TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS assignee_user_ids      UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_suggestions         JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS activity_log           JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attachment_count       INTEGER NOT NULL DEFAULT 0;

-- Backfill assignee_user_ids from the legacy single assignee_user_id.
-- Idempotent: only fires when the array is empty AND the single column
-- is populated. The single column stays for back-compat with read code
-- that hasn't been swept yet.
UPDATE tasks
SET assignee_user_ids = ARRAY[assignee_user_id]
WHERE assignee_user_id IS NOT NULL
  AND (assignee_user_ids IS NULL OR cardinality(assignee_user_ids) = 0);

-- Normalise migration-era statuses into the canonical Operations
-- lifecycle. `todo` is only a migration/back-compat alias; new writes
-- should use `scheduled`.
UPDATE tasks
SET status = CASE status
  WHEN 'todo' THEN 'scheduled'
  WHEN 'done' THEN 'completed'
  WHEN 'awaiting_approval' THEN 'blocked'
  ELSE status
END
WHERE status IN ('todo', 'done', 'awaiting_approval');

-- Replace the narrow status check with the full set. Drop the old
-- one first; CHECK constraints can't be ALTERed in place.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_status_check'
  ) THEN
    ALTER TABLE tasks DROP CONSTRAINT tasks_status_check;
  END IF;
END $$;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN (
    'reported',
    'scheduled',
    'ready',
    'in_progress',
    'paused',
    'blocked',
    'completed',
    'closed',
    'cancelled'
  ));
ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'scheduled';

-- Visibility check — same shape.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_visibility_check'
  ) THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_visibility_check
      CHECK (visibility IN ('all', 'team', 'self'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_property
  ON tasks(tenant_id, property_code) WHERE property_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_reservation
  ON tasks(tenant_id, reservation_guesty_id) WHERE reservation_guesty_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_inbox_thread
  ON tasks(tenant_id, inbox_thread_id) WHERE inbox_thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_source
  ON tasks(tenant_id, source);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_external_ref
  ON tasks(tenant_id, external_ref)
  WHERE external_ref IS NOT NULL AND status <> 'cancelled';
CREATE INDEX IF NOT EXISTS idx_tasks_department
  ON tasks(tenant_id, department) WHERE department IS NOT NULL;
DROP INDEX IF EXISTS idx_tasks_open;
CREATE INDEX idx_tasks_open
  ON tasks(tenant_id, due_date)
  WHERE status IN ('reported', 'scheduled', 'ready', 'in_progress', 'paused', 'blocked');
-- GIN on the assignee array so "tasks for user X" stays fast.
CREATE INDEX IF NOT EXISTS idx_tasks_assignees
  ON tasks USING gin (assignee_user_ids);

-- ─── task_comments ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_comments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id               UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  author_user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  text                  TEXT NOT NULL CHECK (length(text) > 0),
  mentions              UUID[] NOT NULL DEFAULT '{}',
  synced_to_breezeway   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_comments_task
  ON task_comments(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_comments_tenant
  ON task_comments(tenant_id);

-- ─── task_costs ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_costs (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id                     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type                        TEXT NOT NULL,
  amount_minor                BIGINT NOT NULL,
  currency_code               TEXT NOT NULL,
  description                 TEXT,
  added_by_user_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  owner_charge                BOOLEAN NOT NULL DEFAULT FALSE,
  -- Forward link to a finance_expenses row once the design-be-N finance
  -- expense table lands. Nullable, no FK yet.
  flowed_to_finance_expense_id UUID,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT task_costs_type_check CHECK (type IN (
    'labor','material','expense','tax',
    'skilled_labor','unskilled_labor','mileage','markup'
  ))
);
CREATE INDEX IF NOT EXISTS idx_task_costs_task
  ON task_costs(task_id);
CREATE INDEX IF NOT EXISTS idx_task_costs_tenant
  ON task_costs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_costs_owner_charge
  ON task_costs(tenant_id, owner_charge) WHERE owner_charge = TRUE;
