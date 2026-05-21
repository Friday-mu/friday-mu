-- Migration 010 — rename design_projects.site_plan_image_id → floor_plan_image_id
--
-- We mislabeled the column in migration 009: in real-estate terms, "site plan"
-- means landscaping / outdoor layout, whereas this column tracks INTERIOR
-- floor plans (the Nanobanana-cleaned CAD-style top-down view of the unit).
-- Renaming both the column and its partial index. FK to design_assets(sha256)
-- preserved by ALTER ... RENAME COLUMN. Idempotent guards on the index ops so
-- replays are safe.

ALTER TABLE design_projects
  RENAME COLUMN site_plan_image_id TO floor_plan_image_id;

DROP INDEX IF EXISTS idx_design_projects_site_plan;
CREATE INDEX IF NOT EXISTS idx_design_projects_floor_plan
  ON design_projects(floor_plan_image_id) WHERE floor_plan_image_id IS NOT NULL;
