-- Migration 037 — tenant-scope the feedback inbox.
--
-- Multitenant follow-up. Until now `feedback` had no tenant_id, so bug
-- reports from any tenant landed in the same inbox — FR's admins saw
-- everyone's reports. Once a second tenant onboards, that's both a
-- privacy issue (their team's bug context leaks to FR) and a triage
-- mess (FR's inbox fills with reports about modules FR doesn't run).
--
-- Backfill strategy:
--   The DEFAULT clause on the new column backfills every existing row
--   to FR's tenant_id ('00000000-0000-0000-0000-000000000001').
--   That's correct: every feedback row that exists today was filed
--   by an FR user (FR is the only live tenant pre-mig 037).
--
-- Idempotency:
--   ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS — re-running
--   this migration is a no-op.
--
-- Follow-up in backend/src/feedback.js + backend/server.js:
--   - POST writes req.tenantId into the new column.
--   - GET filters WHERE tenant_id = req.tenantId.
--   - server.js skip-list adds `/api/feedback` so non-FR tenants
--     reach the route (the FR-lockdown was blocking them).

ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL
    DEFAULT '00000000-0000-0000-0000-000000000001'
    REFERENCES tenants(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_feedback_tenant_created
  ON feedback(tenant_id, created_at DESC);
