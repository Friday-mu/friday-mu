-- FAD-native auth support.
-- Non-Ops migration: keeps password reset state on the canonical users table.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reset_token TEXT,
  ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_reset_token_active
  ON users (reset_token)
  WHERE reset_token IS NOT NULL;
