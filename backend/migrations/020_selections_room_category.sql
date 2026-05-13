-- Migration 020 — selections schema alignment with frontend fixture.
--
-- The frontend DesignSelection fixture has been authoritative for the
-- UI shape since day 1, but design_selections was stripped down at
-- migration 002 (title + pack_id + options + status only). Two fields
-- the UI relies on never reached the backend, so createSelection on the
-- frontend silently dropped them and refresh wiped any selection drafted
-- this session.
--
-- Adds:
--   • room_id        — links a selection to a specific room (e.g. "the
--                      living-room sofa") so RoomDetail / DesignPack can
--                      group selections by room and the procurement
--                      Kanban can filter by room.
--   • category_code  — budget category bucket so the Owner Picker view
--                      can group "All furniture selections" / "All
--                      lighting selections" etc. Matches the
--                      design_budget_items.category_code domain so the
--                      same category enum is honoured across surfaces.

ALTER TABLE design_selections
  ADD COLUMN IF NOT EXISTS room_id UUID,
  ADD COLUMN IF NOT EXISTS category_code TEXT;

CREATE INDEX IF NOT EXISTS idx_design_selections_room
  ON design_selections(room_id) WHERE room_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_design_selections_category
  ON design_selections(category_code) WHERE category_code IS NOT NULL;
