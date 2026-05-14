-- Migration 031 — Room detail fields for the Site Visit stage.
--
-- The RoomDetail form in SiteVisitStage.tsx has had 12 input fields
-- since v0.1 (dimensions, windows, doors, condition notes, issues,
-- furniture to keep/remove, design opportunity, access logistics,
-- utilities) — all bound with `defaultValue` and no onChange handler.
-- None of these were ever sent to the backend; only `name`, `sqft`,
-- `usage_kind` were ever persisted.
--
-- Mathias hit this immediately on 2026-05-14 (feedback rows
-- 2ec29048-f828-... and 24ff91f3-9152-...): "All data input
-- disappeared after collapsing a room tab" and "Save and continue
-- later doesn't save dimensions".
--
-- Adds typed columns for dimensions/counts (used by floor plan
-- generator + sqft calc) and TEXT columns for the free-text fields.
-- All nullable so existing rows stay valid; no backfill needed.

ALTER TABLE design_rooms
  ADD COLUMN IF NOT EXISTS length_m NUMERIC(8, 2),
  ADD COLUMN IF NOT EXISTS width_m NUMERIC(8, 2),
  ADD COLUMN IF NOT EXISTS height_m NUMERIC(8, 2),
  ADD COLUMN IF NOT EXISTS windows INTEGER,
  ADD COLUMN IF NOT EXISTS doors INTEGER,
  ADD COLUMN IF NOT EXISTS condition_notes TEXT,
  ADD COLUMN IF NOT EXISTS issues TEXT,
  ADD COLUMN IF NOT EXISTS keep_furniture TEXT,
  ADD COLUMN IF NOT EXISTS remove_furniture TEXT,
  ADD COLUMN IF NOT EXISTS design_opportunity TEXT,
  ADD COLUMN IF NOT EXISTS access_notes TEXT,
  ADD COLUMN IF NOT EXISTS utilities_notes TEXT;
