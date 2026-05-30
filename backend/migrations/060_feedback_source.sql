-- Migration 060 — feedback source discriminator.
--
-- backend/src/feedback.js writes `feedback.source` so FAD can split
-- reports from the admin app, website, mobile, and future portals. The
-- route shipped before the schema column existed in this branch; add it
-- idempotently so the feedback FAB does not 500 on submit.

ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'fad';

ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_source_check;
ALTER TABLE feedback ADD CONSTRAINT feedback_source_check
  CHECK (source IN ('fad', 'website', 'mobile', 'design-portal', 'owner-portal'));

CREATE INDEX IF NOT EXISTS idx_feedback_source_created
  ON feedback(source, created_at DESC);
