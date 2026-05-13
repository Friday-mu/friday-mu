-- Migration 022 — site visit metadata alignment with frontend fixture.
--
-- The SiteVisitStage metadata form has had four uncontrolled inputs
-- since day 1 (visited_by, walkthrough_video_url, marketing_photo_consent,
-- visited_at as timestamp not just date). They've never saved — the
-- inputs use defaultValue without onChange handlers, so they look
-- editable but never reach React state. To make the form's Save action
-- meaningful, the backend needs columns for them.
--
-- Also: design_site_visits is a list (multiple visits per project), but
-- the frontend has consistently used a single "site visit" per project
-- — the active visit. We don't try to flatten that here; the frontend
-- gets the most-recent visit per project via the existing ORDER BY
-- visit_date DESC.
--
-- Adds:
--   • visited_at         — full TIMESTAMPTZ (visit_date is DATE only,
--                          loses time-of-day). Either can be set; the
--                          API prefers visited_at when both present.
--   • visited_by_user_id — single user reference. The original
--                          attendees TEXT[] stays for multi-attendee
--                          tracking but the form is single-visitor in
--                          v0.1.
--   • walkthrough_video_url — Drive / YouTube / direct URL to the
--                              walkthrough video. Useful for designers
--                              not present at the visit.
--   • marketing_photo_consent — whether the owner consented to
--                                marketing-photo use per agreement §12.
--                                Locked at agreement level today; the
--                                checkbox echoes that.

ALTER TABLE design_site_visits
  ADD COLUMN IF NOT EXISTS visited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS visited_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS walkthrough_video_url TEXT,
  ADD COLUMN IF NOT EXISTS marketing_photo_consent BOOLEAN,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'in_progress';

-- status maps to the frontend SiteVisit.status enum:
--   not_started  — placeholder row not in use today; frontend default
--                   when no visit row exists
--   in_progress  — visit data being captured (the "save and continue
--                   later" button leaves this state)
--   closed       — capture complete (the "close site visit" button
--                   advances to this)
-- Constraint is added in a separate IF-NOT-EXISTS pattern so the
-- migration is idempotent on re-run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'design_site_visits_status_check'
  ) THEN
    ALTER TABLE design_site_visits
      ADD CONSTRAINT design_site_visits_status_check
      CHECK (status IN ('not_started', 'in_progress', 'closed'));
  END IF;
END$$;

-- Backfill visited_at from visit_date for existing rows (midnight UTC
-- of the visit day). NULL stays NULL for rows that never had a date.
UPDATE design_site_visits
SET visited_at = visit_date::timestamptz
WHERE visited_at IS NULL AND visit_date IS NOT NULL;
