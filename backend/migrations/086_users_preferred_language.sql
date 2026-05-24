-- 086_users_preferred_language.sql
--
-- T3.15 v0.3 — per-user preferred UI language so the FAD remembers
-- the operator's last language choice across devices. Without this
-- the FR toggle is per-device only (localStorage key `fad:lang`).
--
-- Defaults to NULL so existing rows are unaffected; null = "no
-- preference set, follow client default" (browser language). Frontend
-- treats null + 'en' as English; only 'fr' switches.
--
-- CHECK constraint locks values to the supported list. Adding a new
-- language later requires bumping this constraint (or replacing it
-- with a FOREIGN KEY into a languages lookup table if it grows).
--
-- Idempotent — safe to re-run.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferred_language text;

-- Drop + recreate the CHECK so re-running this migration with a wider
-- allowed list later just works.
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_preferred_language_check;

ALTER TABLE users
  ADD CONSTRAINT users_preferred_language_check
  CHECK (preferred_language IS NULL OR preferred_language IN ('en', 'fr'));
