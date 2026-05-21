-- Adds a `source` column to feedback so reports from different apps
-- (FAD, friday.mu website, future surfaces) can be filtered apart in
-- the inbox + routed to separate Slack channels if needed.
--
-- Default 'fad' for existing rows + new inserts without an explicit
-- value — back-compat for the FAD shell which doesn't send `source`
-- yet. The website passes `source: 'website'`, the new mobile app
-- (when it ships) will pass its own.
--
-- Idempotent. Safe to re-run.

BEGIN;

ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'fad';

-- Tight allowlist so a typo can't pollute the column. Extend when a
-- new surface ships.
ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_source_check;
ALTER TABLE feedback ADD CONSTRAINT feedback_source_check
  CHECK (source IN ('fad', 'website', 'mobile', 'design-portal', 'owner-portal'));

-- Indexed for the inbox filter (per-tenant + per-source listing).
CREATE INDEX IF NOT EXISTS idx_feedback_tenant_source_created
  ON feedback(tenant_id, source, created_at DESC);

-- Sanity.
SELECT source, COUNT(*) FROM feedback GROUP BY source ORDER BY 2 DESC;

COMMIT;
