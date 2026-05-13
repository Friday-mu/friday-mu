-- Migration 030 — link budget items to their source selection / pack.
--
-- The audit on 2026-05-14 surfaced that the Design Pack → Final Budget
-- chain was broken: approving a design pack didn't materialise its
-- picked selections into design_budget_items, so the team had to
-- re-enter every selection by hand on the Final Budget stage. This
-- migration adds the back-link columns; a follow-up backend change
-- makes the pack approval endpoint insert the budget rows.
--
-- The partial unique index on source_selection_id ensures idempotency:
-- if the approval flow runs twice (e.g. retry), the second attempt
-- won't duplicate the rows.

ALTER TABLE design_budget_items
  ADD COLUMN IF NOT EXISTS source_selection_id UUID
    REFERENCES design_selections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_pack_id UUID
    REFERENCES design_packs(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_design_budget_items_source_selection
  ON design_budget_items(source_selection_id)
  WHERE source_selection_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_design_budget_items_source_pack
  ON design_budget_items(source_pack_id)
  WHERE source_pack_id IS NOT NULL;
