-- 050_tasks.sql
--
-- Tenant-scoped operational tasks. Separate from `design_tasks` which
-- is anchored to a design project + only models blockers / next-actions
-- inside the design workflow. This table covers the broader Operations
-- module: maintenance, cleaning follow-ups, owner correspondence, any
-- to-do not tied to a design engagement.
--
-- Schema follows the next-session brief:
--   id, tenant_id, project_id (nullable, design_projects FK), title,
--   description, status (todo/in_progress/done/cancelled),
--   assignee_user_id (nullable, users FK), due_date, priority,
--   category, created_by_user_id, created_at, updated_at, completed_at
--
-- project_id is nullable because most ops tasks aren't design-anchored.
-- When present it lets the design module's project view show "open
-- ops tasks" alongside the existing design_tasks.

CREATE TABLE IF NOT EXISTS tasks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id          UUID REFERENCES design_projects(id) ON DELETE SET NULL,
  title               TEXT NOT NULL CHECK (length(title) > 0),
  description         TEXT,
  status              TEXT NOT NULL DEFAULT 'todo'
                        CHECK (status IN ('todo', 'in_progress', 'done', 'cancelled')),
  priority            TEXT NOT NULL DEFAULT 'medium'
                        CHECK (priority IN ('lowest', 'low', 'medium', 'high', 'urgent')),
  category            TEXT,
  assignee_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  due_date            DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tasks_tenant
  ON tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_status
  ON tasks(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_assignee
  ON tasks(tenant_id, assignee_user_id) WHERE assignee_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_due
  ON tasks(tenant_id, due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_project
  ON tasks(tenant_id, project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_open
  ON tasks(tenant_id, due_date)
  WHERE status IN ('todo', 'in_progress');
