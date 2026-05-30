-- Migration 011 — design_projects.floor_plan_furnished_image_id
--
-- Second-stage floor-plan asset: after the cleaned architectural plan
-- (floor_plan_image_id, migration 010) and after an owner approves a
-- moodboard, a Nanobanana pass overlays furniture/fixtures onto the
-- clean plan using the moodboard as a style reference. Pinned here so
-- the project surfaces "current furnished plan" without scanning every
-- asset row. FK + partial index mirror migration 009/010.

ALTER TABLE design_projects
  ADD COLUMN IF NOT EXISTS floor_plan_furnished_image_id TEXT
    REFERENCES design_assets(sha256) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_design_projects_floor_plan_furnished
  ON design_projects(floor_plan_furnished_image_id)
  WHERE floor_plan_furnished_image_id IS NOT NULL;
