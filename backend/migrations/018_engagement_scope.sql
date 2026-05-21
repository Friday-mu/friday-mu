-- Migration 018 — design_projects.engagement_scope
--
-- Some Friday clients take design-only engagements: they pay for the
-- moodboard / floor plan / design pack, but procurement + execution is
-- out of scope (the owner buys + installs furniture themselves, or
-- hires their own contractor). Prior to this column the workflow
-- assumed every project went design → execution → reconciliation.
--
-- Two values today (locked 2026-05-13 per Ishant):
--   'design_and_execution'  full project (default — matches all existing rows)
--   'design_only'           moodboard + design pack only; stages 14-17 are
--                           rendered out-of-scope on the frontend.
--
-- The default backfills every existing row because every prior project
-- was implicitly full-scope. No data migration needed.

ALTER TABLE design_projects
  ADD COLUMN IF NOT EXISTS engagement_scope TEXT NOT NULL DEFAULT 'design_and_execution';

-- CHECK constraint added separately + idempotently so re-running the
-- migration doesn't error if the column already exists from a prior
-- partial apply.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'design_projects_engagement_scope_check'
  ) THEN
    ALTER TABLE design_projects
      ADD CONSTRAINT design_projects_engagement_scope_check
      CHECK (engagement_scope IN ('design_only', 'design_and_execution'));
  END IF;
END$$;
