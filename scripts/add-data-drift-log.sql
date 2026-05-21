-- Reconciler audit table.
--
-- When the scraper and the API disagree on the same logical record
-- (matched by confirmation_code for reservations, listing nickname for
-- listings, etc.), we log the diff here so:
--   1. The website / FAD can keep using the fresher value (scraper)
--      without losing visibility into the disagreement.
--   2. Ops can audit drift over time — if API consistently lags,
--      that's a Guesty support ticket worth filing.
--
-- The reconciler job (TODO: separate file) writes here on every batch.

BEGIN;

CREATE TABLE IF NOT EXISTS data_drift_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,

  -- Which surface drifted: 'reservation' | 'listing' | 'message'
  surface TEXT NOT NULL,
  -- The logical key the two sources agreed on (confirmation_code,
  -- listing nickname, message id, …)
  match_key TEXT NOT NULL,

  -- Which fields disagreed: {field_name: {api: …, scrape: …}}
  diff JSONB NOT NULL,

  -- Snapshot of both sides at the time of the diff. Lets us audit
  -- without re-fetching later.
  api_snapshot JSONB,
  scrape_snapshot JSONB,

  -- Resolution intent — chosen at write time, executed by reconciler.
  -- 'prefer-scrape' (default): website reads will use scraper value.
  -- 'prefer-api':              website reads will use API value.
  -- 'review':                  hold for human review (don't auto-resolve).
  resolution TEXT NOT NULL DEFAULT 'prefer-scrape',

  -- Has a human triaged this? Most rows stay false — we only flip when
  -- an admin opens the drift inbox and ack's. NULL = pending.
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE data_drift_log DROP CONSTRAINT IF EXISTS data_drift_log_surface_check;
ALTER TABLE data_drift_log ADD CONSTRAINT data_drift_log_surface_check
  CHECK (surface IN ('reservation', 'listing', 'message', 'pricing'));

ALTER TABLE data_drift_log DROP CONSTRAINT IF EXISTS data_drift_log_resolution_check;
ALTER TABLE data_drift_log ADD CONSTRAINT data_drift_log_resolution_check
  CHECK (resolution IN ('prefer-scrape', 'prefer-api', 'review'));

CREATE INDEX IF NOT EXISTS idx_data_drift_tenant_surface_created
  ON data_drift_log (tenant_id, surface, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_drift_unreviewed
  ON data_drift_log (tenant_id, surface, created_at DESC)
  WHERE reviewed_at IS NULL;

COMMIT;
