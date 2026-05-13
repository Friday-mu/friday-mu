-- Migration 021 — change orders schema alignment with frontend fixture.
--
-- The frontend ChangeOrder fixture has always carried a `title` and a
-- per-project sequence `number` (CO-001, CO-002 …) used in the owner
-- approval card. Migration 002 only modelled `reason + line_items +
-- status`, so the frontend createChangeOrder silently dropped title
-- and refresh wiped any change order drafted this session.
--
-- Adds:
--   • title     — human-facing change order name shown on the approval
--                 card and used by the change-order ledger row label.
--   • co_number — per-project sequence (1, 2, 3 …). Rendered as
--                 "CO-001" by the frontend (renumber not allowed, gaps
--                 expected on rejected/deleted COs).
--
-- The co_number is assigned by the API on insert as `MAX + 1` per
-- project; we model it as a plain INTEGER with a unique partial index
-- per (project_id, co_number) so concurrent inserts can't collide.

ALTER TABLE design_change_orders
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS co_number INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS uq_design_change_orders_proj_num
  ON design_change_orders(project_id, co_number)
  WHERE co_number IS NOT NULL;

-- Backfill existing rows so the unique constraint holds even when the
-- migration runs against a DB with pre-existing rows. Each project's
-- existing COs are numbered in created_at order.
WITH numbered AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at) AS rn
  FROM design_change_orders
  WHERE co_number IS NULL
)
UPDATE design_change_orders co
SET co_number = numbered.rn
FROM numbered
WHERE co.id = numbered.id;
