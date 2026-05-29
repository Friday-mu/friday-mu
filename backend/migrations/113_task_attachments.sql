-- 113 — Task attachments (user-uploaded evidence / photos).
--
-- The #1 field-PWA gap: cleaning/inspection completion evidence (phone
-- photos, the occasional PDF) had no persistence — the TaskDetail picker
-- only queued files in local state. This adds durable per-task attachment
-- storage so field staff can capture completion proof and managers can
-- review it.
--
-- Mirrors the expense_receipts inline-base64 pattern (migration 076):
-- storage_kind='inline_base64' stores raw bytes in-row for now; the
-- 'do_spaces' object-store path is reserved for the same future swap as
-- receipts. Hash-dedup per task (re-uploading the same file is a no-op).
-- Distinct from the existing tasks.attachment_count column, which counts
-- Breezeway-sourced photo refs in source_payload, not user uploads — the
-- upload route GREATEST()-bumps that same counter so the UI badge stays
-- truthful for both sources.
--
-- The runner (src/database/migrate.js) wraps each file in its own
-- transaction, so no explicit BEGIN/COMMIT here (matches 109–112).

CREATE TABLE IF NOT EXISTS task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,

  -- Evidence kind. 'evidence' is the default field-completion photo; the
  -- before/after split supports turnover proof; 'document' for PDFs.
  kind TEXT NOT NULL DEFAULT 'evidence'
    CHECK (kind IN ('evidence', 'before', 'after', 'document', 'other')),

  -- Storage. inline_base64 for now (bytes in-row); do_spaces reserved.
  storage_kind TEXT NOT NULL DEFAULT 'inline_base64'
    CHECK (storage_kind IN ('inline_base64', 'do_spaces')),
  storage_ref TEXT,     -- object-store key when storage_kind='do_spaces'
  inline_base64 TEXT,   -- raw bytes when storage_kind='inline_base64'

  file_name TEXT,
  content_type TEXT,
  byte_size INTEGER,
  sha256_hash TEXT NOT NULL,
  caption TEXT,

  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT task_attachments_storage_data CHECK (
    (storage_kind = 'inline_base64' AND inline_base64 IS NOT NULL) OR
    (storage_kind = 'do_spaces' AND storage_ref IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task   ON task_attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_attachments_tenant ON task_attachments(tenant_id, uploaded_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_attachments_hash_per_task
  ON task_attachments(task_id, sha256_hash);
