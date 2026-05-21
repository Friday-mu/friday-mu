-- 071_tasks_ops_lifecycle_reconcile.sql
--
-- Production had already marked 051_tasks_full.sql as applied before the
-- Operations cutover canonicalized the task lifecycle. Reconcile the live
-- schema forward without replaying 051.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS external_ref TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'tasks_status_check'
       AND conrelid = 'tasks'::regclass
  ) THEN
    ALTER TABLE tasks DROP CONSTRAINT tasks_status_check;
  END IF;
END $$;

UPDATE tasks
SET status = CASE
  WHEN status = 'todo' THEN 'scheduled'
  WHEN status = 'done' THEN 'completed'
  WHEN status = 'awaiting_approval' THEN 'blocked'
  WHEN status IN (
    'reported',
    'scheduled',
    'ready',
    'in_progress',
    'paused',
    'blocked',
    'completed',
    'closed',
    'cancelled'
  ) THEN status
  ELSE 'blocked'
END
WHERE status IS NULL
   OR status NOT IN (
    'reported',
    'scheduled',
    'ready',
    'in_progress',
    'paused',
    'blocked',
    'completed',
    'closed',
    'cancelled'
  );

ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'scheduled';

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_external_ref
  ON tasks(tenant_id, external_ref)
  WHERE external_ref IS NOT NULL AND status <> 'cancelled';

DROP INDEX IF EXISTS idx_tasks_open;
CREATE INDEX idx_tasks_open
  ON tasks(tenant_id, due_date)
  WHERE status IN ('reported', 'scheduled', 'ready', 'in_progress', 'paused', 'blocked');
