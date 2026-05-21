-- 054_breezeway_task_import.sql
--
-- One-time Breezeway historical task import provenance. The imported
-- tasks remain normal Operations tasks (`source = 'breezeway'`) and are
-- idempotent through tasks.external_ref = 'breezeway:<Task ID>'.
-- Source timestamps stay separate from FAD's own created_at/updated_at
-- audit columns so the import event and the original Breezeway event are
-- both recoverable.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS import_batch_id      TEXT,
  ADD COLUMN IF NOT EXISTS source_payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_created_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_updated_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_started_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_due_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_completed_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tasks_import_batch
  ON tasks(tenant_id, import_batch_id)
  WHERE import_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_source_created
  ON tasks(tenant_id, source, source_created_at DESC)
  WHERE source_created_at IS NOT NULL;

COMMENT ON COLUMN tasks.import_batch_id IS 'One-time migration batch identifier for historical imports.';
COMMENT ON COLUMN tasks.source_payload IS 'Redacted source-system payload/provenance for imported or source-created tasks.';
COMMENT ON COLUMN tasks.source_created_at IS 'Original source-system created timestamp, when available.';
COMMENT ON COLUMN tasks.source_updated_at IS 'Original source-system updated timestamp, when available.';
COMMENT ON COLUMN tasks.source_started_at IS 'Original source-system started timestamp, when available.';
COMMENT ON COLUMN tasks.source_due_at IS 'Original source-system due timestamp, when available.';
COMMENT ON COLUMN tasks.source_completed_at IS 'Original source-system completed timestamp, when available.';
