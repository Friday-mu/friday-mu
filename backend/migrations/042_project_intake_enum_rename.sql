-- Migration 042 — rename Friday-branded intake enums to neutral values
--
-- Wave C1 multitenant cleanup. The lead_source and pm_link fields on
-- design_projects currently carry "Friday"-branded enum IDs that leak
-- through the API and into other tenants' UI labels. Rename to neutral
-- IDs so the frontend can render tenant-agnostic labels.
--
-- Mappings:
--   lead_source:
--     'friday_outreach'           → 'outreach'
--     ('existing_owner', 'owner_referral', ... unchanged)
--   pm_link:
--     'managed_by_friday'         → 'managed_by_company'
--     'will_be_managed'           → 'will_manage'
--     'not_managed'               → 'not_managed' (unchanged)
--
-- entry_path is frontend-only (not persisted), so no DB change for that.
--
-- Idempotent: re-running has no effect because the mapped-FROM values
-- will no longer exist after the first run.

BEGIN;

UPDATE design_projects
SET lead_source = CASE
  WHEN lead_source = 'friday_outreach' THEN 'outreach'
  ELSE lead_source
END
WHERE lead_source IN ('friday_outreach');

UPDATE design_projects
SET pm_link = CASE
  WHEN pm_link = 'managed_by_friday' THEN 'managed_by_company'
  WHEN pm_link = 'will_be_managed'   THEN 'will_manage'
  ELSE pm_link
END
WHERE pm_link IN ('managed_by_friday', 'will_be_managed');

-- design_leads.source uses the same enum vocabulary (per LeadIntakeDrawer
-- + apiLeadToFixture round-tripping). Apply the same rename.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'design_leads' AND column_name = 'source'
  ) THEN
    UPDATE design_leads
    SET source = 'outreach'
    WHERE source = 'friday_outreach';
  END IF;
END $$;

COMMIT;
