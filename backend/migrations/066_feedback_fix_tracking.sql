-- 066_feedback_fix_tracking.sql
--
-- Make feedback triage auditable. `status = resolved` alone was not
-- enough to answer "what fixed this, when was it deployed, and did
-- anyone verify it against the screenshot/report?". These columns keep
-- fix provenance on the feedback row so Settings -> Feedback inbox can
-- be used as the product-quality source of truth.

ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS triaged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS triaged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fixed_commit TEXT,
  ADD COLUMN IF NOT EXISTS fixed_branch TEXT,
  ADD COLUMN IF NOT EXISTS fix_deployed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fix_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fix_verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fix_verification_note TEXT,
  ADD COLUMN IF NOT EXISTS root_cause TEXT;

CREATE INDEX IF NOT EXISTS idx_feedback_fix_status
  ON feedback(tenant_id, status, fix_verified_at DESC, created_at DESC);

