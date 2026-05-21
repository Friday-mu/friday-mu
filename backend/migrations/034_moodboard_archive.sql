-- Migration 034 — moodboard variant soft delete.
--
-- Mathias feedback f82e1dea (2026-05-14): when "Create 3 variants"
-- fires three Nanobanana generations he often wants to discard the
-- two he likes least. Hard delete would orthogonally destroy approval
-- history + activity log references; soft delete (is_archived flag)
-- lets us hide rejected variants from the workbench while preserving
-- audit trail.
--
-- Pattern mirrors HR staff archiving (migration 001): three columns
-- (is_archived, archived_at, archived_by). Default false so all
-- existing rows stay visible. Partial index on the active set keeps
-- the existing version-DESC list query fast as archive volume grows.

ALTER TABLE design_moodboards
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID;

CREATE INDEX IF NOT EXISTS idx_design_moodboards_active
  ON design_moodboards(project_id, version_number DESC)
  WHERE is_archived = false;
