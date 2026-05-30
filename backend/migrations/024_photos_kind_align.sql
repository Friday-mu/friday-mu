-- Migration 024 — align design_photos.kind enum with the frontend
-- PhotoKind type ('before' | 'context' | 'reference' | 'progress' |
-- 'after'). Migration 002 used a different vocabulary ('exterior' /
-- 'interior' / 'detail' / 'concept' / 'as-built') intended for
-- as-built / progress photos, but the frontend (SiteVisitStage,
-- DesignPack, RoomDetail) has always used the workflow-stage
-- vocabulary. Accept BOTH sets so existing rows + new rows coexist.

ALTER TABLE design_photos
  DROP CONSTRAINT IF EXISTS design_photos_kind_check;

ALTER TABLE design_photos
  ADD CONSTRAINT design_photos_kind_check
  CHECK (kind IN (
    -- frontend PhotoKind values
    'before', 'context', 'reference', 'progress', 'after',
    -- legacy migration-002 values (keep for backward compatibility)
    'exterior', 'interior', 'detail', 'concept', 'as-built'
  ));
