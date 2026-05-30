-- Migration 029 — Feedback inbox (bug reports + feature requests + suggestions).
--
-- The "Report a bug" FAB on the FAD shell has been collecting input
-- into a modal that called setSubmitted(true) and discarded everything.
-- This migration stands up the table behind a real POST /api/feedback
-- so reports actually persist, and broadens the categories to
-- (bug | feature | suggestion) per the 2026-05-14 product review.
--
-- Screenshot strategy: stored as a data URL in TEXT (capped to ~5MB
-- by the route). The base64 inflation is acceptable for now given
-- expected volume; a v0.3 follow-up will swap this for object storage
-- via the same multer + nginx alias used for design photos
-- (/var/www/fad-uploads/feedback/<id>.jpg).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  title TEXT,
  description TEXT NOT NULL,
  severity TEXT,
  route_url TEXT,
  module_label TEXT,
  screenshot_data_url TEXT,
  user_id UUID,
  user_username TEXT,
  user_display_name TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent CHECK constraints — drop + recreate so re-runs don't fail.
ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_type_check;
ALTER TABLE feedback ADD CONSTRAINT feedback_type_check
  CHECK (type IN ('bug', 'feature', 'suggestion'));

ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_severity_check;
ALTER TABLE feedback ADD CONSTRAINT feedback_severity_check
  CHECK (severity IS NULL OR severity IN ('low', 'medium', 'high', 'critical'));

ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_status_check;
ALTER TABLE feedback ADD CONSTRAINT feedback_status_check
  CHECK (status IN ('new', 'triaged', 'in_progress', 'resolved', 'wontfix', 'duplicate'));

CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(type);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);
