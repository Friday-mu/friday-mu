-- Migration 045 — Multi-floor floor plans.
--
-- Properties commonly have multiple floors (ground / 1st / loft).
-- v1 introduced `design_floor_plans` with a single canvas per project;
-- this migration extends it so each project can have N floors, each
-- with its own version history.
--
-- Strategy:
--   • Add `floor_index` (0 = ground, 1, 2…) and `floor_label` (free text).
--   • Existing rows get floor_index = 0 by default — no data migration.
--   • Versioning is scoped per (project_id, floor_index) so each floor
--     has its own v1, v2, … sequence.
--   • is_final is also scoped per floor — one final plan per floor.

ALTER TABLE design_floor_plans
  ADD COLUMN IF NOT EXISTS floor_index INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS floor_label TEXT;

-- Drop and re-add the version uniqueness constraint to include floor_index.
ALTER TABLE design_floor_plans
  DROP CONSTRAINT IF EXISTS design_floor_plans_version_per_project;
ALTER TABLE design_floor_plans
  ADD CONSTRAINT design_floor_plans_version_per_project
  UNIQUE (project_id, floor_index, version);

-- Same for the partial unique index on is_final.
DROP INDEX IF EXISTS idx_design_floor_plans_one_final_per_project;
CREATE UNIQUE INDEX IF NOT EXISTS idx_design_floor_plans_one_final_per_project_floor
  ON design_floor_plans(project_id, floor_index) WHERE is_final = TRUE;

-- Lookup index for fetching versions per floor in descending order.
CREATE INDEX IF NOT EXISTS idx_design_floor_plans_floor
  ON design_floor_plans(project_id, floor_index, version DESC);
