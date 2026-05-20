-- 058_inbox_realtime_notifications.sql
--
-- FAD-native realtime + notification primitives for Inbox and TeamInbox.
-- SSE is the live delivery rail; push_subscriptions stores browser push
-- endpoints so a later web-push worker can deliver when the app is closed.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint        TEXT NOT NULL,
  p256dh_key      TEXT,
  auth_key        TEXT,
  subscription    JSONB NOT NULL,
  user_agent      TEXT,
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);

-- A legacy dashboard push table may already exist with id SERIAL and
-- keys_p256dh / keys_auth columns. CREATE TABLE IF NOT EXISTS leaves
-- that shape untouched, so normalize it before adding indexes or using
-- the FAD-native upsert path.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'push_subscriptions' AND column_name = 'keys_p256dh'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'push_subscriptions' AND column_name = 'p256dh_key'
  ) THEN
    ALTER TABLE push_subscriptions RENAME COLUMN keys_p256dh TO p256dh_key;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'push_subscriptions' AND column_name = 'keys_auth'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'push_subscriptions' AND column_name = 'auth_key'
  ) THEN
    ALTER TABLE push_subscriptions RENAME COLUMN keys_auth TO auth_key;
  END IF;
END $$;

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS p256dh_key TEXT,
  ADD COLUMN IF NOT EXISTS auth_key TEXT,
  ADD COLUMN IF NOT EXISTS subscription JSONB,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE push_subscriptions
  ALTER COLUMN p256dh_key DROP NOT NULL,
  ALTER COLUMN auth_key DROP NOT NULL,
  ALTER COLUMN subscription SET DEFAULT '{}'::jsonb;

UPDATE push_subscriptions
   SET subscription = jsonb_build_object(
         'endpoint', endpoint,
         'keys', jsonb_build_object('p256dh', p256dh_key, 'auth', auth_key)
       )
 WHERE subscription IS NULL;

ALTER TABLE push_subscriptions
  ALTER COLUMN subscription SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_tenant_user
  ON push_subscriptions(tenant_id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_user_endpoint
  ON push_subscriptions(user_id, endpoint);

CREATE TABLE IF NOT EXISTS fad_notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT,
  url             TEXT,
  source          TEXT NOT NULL DEFAULT 'fad',
  source_id       TEXT,
  priority        TEXT NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fad_notifications_user_unread
  ON fad_notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fad_notifications_tenant_recent
  ON fad_notifications(tenant_id, created_at DESC);
