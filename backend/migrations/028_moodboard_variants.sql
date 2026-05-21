-- Migration 028 — multi-moodboard variants (Tier A #5).
--
-- v0.1 generated one moodboard per Nanobanana call; the owner could
-- approve or request changes but couldn't compare alternatives. The
-- handover scoped Tier A #5 as "generate 2-3 moodboards simultaneously,
-- owner picks one in portal." That's the variant-group concept added
-- here.
--
-- Adds two columns to design_moodboards:
--   • variant_group_id — UUID grouping variants generated together.
--                        Single-variant moodboards (v0.1 generation
--                        path) have NULL here; new multi-variant
--                        generations share one group_id across the
--                        2-3 rows produced.
--   • variant_index — 1-based ordinal within the group (1, 2, 3).
--                      NULL for legacy single moodboards.
--
-- The version_number stays per-project; each variant in a group is
-- its own version. The frontend renders variants in a row when
-- variant_group_id matches the owner-visible version's group.

ALTER TABLE design_moodboards
  ADD COLUMN IF NOT EXISTS variant_group_id UUID,
  ADD COLUMN IF NOT EXISTS variant_index INTEGER;

CREATE INDEX IF NOT EXISTS idx_design_moodboards_variant_group
  ON design_moodboards(variant_group_id)
  WHERE variant_group_id IS NOT NULL;

-- Variant_index uniqueness within a group is enforced application-side
-- (the backend assigns 1..N atomically when creating a group); we
-- don't add a DB unique here because variant_group_id can repeat with
-- NULL variant_index for legacy rows.
