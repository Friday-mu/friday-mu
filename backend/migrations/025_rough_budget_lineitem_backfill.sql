-- Migration 025 — backfill version_id on orphaned design_rough_budgets rows.
--
-- Migration 023 added version_id (nullable) so line items belong to a
-- rough-budget version snapshot. Pre-migration rows stayed NULL — they
-- were "orphan-parented" and silently excluded from any version view.
-- This migration creates a synthetic "v0 — imported" version per project
-- that has unparented rows, and points those rows at it. Subsequent
-- "Save new version" actions still produce v1, v2 … fresh from the UI.
--
-- Idempotent: if a project already has version_number=0 we skip and
-- only re-point rows; if no orphans exist for a project nothing happens.

DO $$
DECLARE
  proj RECORD;
  v_id UUID;
BEGIN
  FOR proj IN
    SELECT DISTINCT rb.project_id
    FROM design_rough_budgets rb
    WHERE rb.version_id IS NULL
  LOOP
    -- Reuse a pre-existing v0 envelope if there is one (re-run safety),
    -- otherwise create a fresh one tagged with status='draft' and a
    -- synthetic narrative so the audit trail explains where it came from.
    SELECT id INTO v_id
    FROM design_rough_budget_versions
    WHERE project_id = proj.project_id AND version_number = 0
    LIMIT 1;

    IF v_id IS NULL THEN
      INSERT INTO design_rough_budget_versions (
        project_id, version_number, status, assumptions
      ) VALUES (
        proj.project_id,
        0,
        'draft',
        'Auto-created during migration 025 to adopt pre-existing rough_budgets line items that predated migration 023 versioning. Replace by saving v1 from the UI.'
      )
      RETURNING id INTO v_id;
    END IF;

    UPDATE design_rough_budgets
    SET version_id = v_id, updated_at = NOW()
    WHERE project_id = proj.project_id AND version_id IS NULL;
  END LOOP;
END$$;
