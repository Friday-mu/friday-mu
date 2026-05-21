-- Migration 027 — CIA Mauritius compliance tracking.
--
-- Construction Industry Authority Act 2023: projects above Rs 1M
-- (and/or any T1 renovation) require CIA registration before
-- construction work begins. The research handover (interior-design
-- best-practices.md) flagged this as a hidden legal landmine — Friday
-- has been operating without surfacing the requirement, and the team
-- can be fined / blocked from execution if they skip it.
--
-- Adds two columns to design_projects:
--   • cia_registration_status — workflow state for the CIA check.
--       'unknown'      — not yet evaluated (default for existing rows)
--       'not_required' — confirmed below threshold + no T1/T2-reno scope
--       'pending'      — required, application submitted, awaiting CIA
--       'registered'   — CIA cert received; cia_registration_ref must
--                        be populated for this state
--       'exempt'       — special-case override (e.g., scope reduced
--                        after evaluation); requires cia_notes to log
--                        the rationale
--   • cia_registration_ref — the registration number issued by CIA
--                            (free-text; CIA refs are in the form
--                            'CIA/REG/YYYY/NNNNN').
--   • cia_notes — free-form audit string for status transitions.

ALTER TABLE design_projects
  ADD COLUMN IF NOT EXISTS cia_registration_status TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS cia_registration_ref TEXT,
  ADD COLUMN IF NOT EXISTS cia_notes TEXT;

-- Idempotent CHECK — drop + recreate if signature differs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'design_projects_cia_status_check'
  ) THEN
    ALTER TABLE design_projects
      ADD CONSTRAINT design_projects_cia_status_check
      CHECK (cia_registration_status IN ('unknown', 'not_required', 'pending', 'registered', 'exempt'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_design_projects_cia_status
  ON design_projects(cia_registration_status)
  WHERE cia_registration_status IN ('unknown', 'pending');
