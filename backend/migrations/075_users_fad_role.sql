-- 075 — Add `fad_role` to users so the FAD frontend can render the right
-- module/permission tree per logged-in identity.
--
-- Why a separate column from `role`:
--  - `role` is the existing coarse claim (admin/agent) used by middleware
--    and the public API. Keeping it untouched preserves every existing
--    permission check on the backend.
--  - The FAD frontend uses a finer taxonomy (director / commercial_marketing
--    / ops_manager / field / external) to decide which modules and which
--    sub-pages a given operator sees. Without this column, the frontend
--    defaulted to `director` for every login — Bryan (field) was seeing
--    the whole app. Reported by Ishant 2026-05-23.
--  - Nullable on purpose. Existing rows without a mapping (e.g. the
--    acme@example.com seed) will fall back to the derived heuristic in
--    the backend (admin → director, agent → field) so logins never break
--    on a NULL.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS fad_role TEXT;

-- Constraint: only known FAD roles or NULL.
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_fad_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_fad_role_check
  CHECK (fad_role IS NULL OR fad_role IN (
    'director',
    'commercial_marketing',
    'ops_manager',
    'field',
    'external'
  ));

-- Per-user mapping. Source: frontend/src/app/fad/_data/tasks.ts
-- (TASK_USERS) — confirmed with Ishant 2026-05-23.
UPDATE users SET fad_role = 'director'             WHERE LOWER(email) = 'ishant@friday.mu';
UPDATE users SET fad_role = 'director'             WHERE LOWER(email) = 'judith@friday.mu';
UPDATE users SET fad_role = 'commercial_marketing' WHERE LOWER(email) = 'mathias@friday.mu';
UPDATE users SET fad_role = 'ops_manager'          WHERE LOWER(email) = 'franny@friday.mu';
UPDATE users SET fad_role = 'field'                WHERE LOWER(email) = 'mary@friday.mu';
UPDATE users SET fad_role = 'field'                WHERE LOWER(email) = 'bryan@friday.mu';
UPDATE users SET fad_role = 'field'                WHERE LOWER(email) = 'catherine@friday.mu';
UPDATE users SET fad_role = 'field'                WHERE LOWER(email) = 'alex@friday.mu';

-- Index for filtering staff by FAD role (e.g. assignee dropdowns).
CREATE INDEX IF NOT EXISTS idx_users_fad_role ON users (fad_role);

COMMIT;
