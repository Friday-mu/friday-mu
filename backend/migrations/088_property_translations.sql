-- 088_property_translations.sql
--
-- Per the website session's brief: FAD becomes the canonical source
-- for per-listing translated copy (name + description). The website
-- consumes the new `translations` field via /api/public/listings and
-- falls back to the existing top-level `name`/`description` when FR
-- isn't authored yet.
--
-- Shape:
--   translations: {
--     en?: { name?: text, description?: text },
--     fr?: { name?: text, description?: text }
--   }
--
-- The brief mentioned `tagline` but that field doesn't exist in
-- fad_properties or in Guesty's listing schema today. Skipped here;
-- if the website team confirms what they mean by "tagline" we add a
-- third key in a follow-up migration.
--
-- Backward-compatible: existing consumers (website, FAD frontend)
-- continue to read top-level `name`/`description`. The overlay is
-- additive — null/missing fr falls back to en falls back to the
-- top-level Guesty-sourced value.
--
-- Backfill: every existing fad_properties row gets translations.en
-- populated from its current name + description so the response
-- contract always has a usable EN block. translations.fr stays empty
-- — the team authors it via the new admin UI.
--
-- Idempotent — safe to re-run.

ALTER TABLE fad_properties
  ADD COLUMN IF NOT EXISTS translations jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill: populate translations.en from current top-level values.
-- Only writes when translations.en is missing so re-running this
-- migration is safe + doesn't overwrite human-authored EN edits.
UPDATE fad_properties
   SET translations = jsonb_set(
         COALESCE(translations, '{}'::jsonb),
         '{en}',
         jsonb_strip_nulls(jsonb_build_object(
           'name', NULLIF(name, ''),
           'description', NULLIF(description, '')
         )),
         true
       )
 WHERE (translations -> 'en') IS NULL
   AND (name IS NOT NULL OR description IS NOT NULL);

-- GIN index on the jsonb so we can later query "rows missing FR" or
-- "rows where translations.fr.name is set" without a full scan.
CREATE INDEX IF NOT EXISTS idx_fad_properties_translations_gin
  ON fad_properties USING GIN (translations);
