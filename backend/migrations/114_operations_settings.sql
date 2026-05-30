-- 114 — Operations settings (per-tenant editable config).
--
-- Turns the static Ops Settings page (task templates, booking-trigger
-- policies, recurring rules — formerly the hardcoded SETTINGS_* fixtures,
-- PROD-CONFIG-10) into editable, persisted per-tenant config. One JSONB
-- blob per tenant: the lists are small and read together, and a blob keeps
-- the shape extensible without a migration per field.
--
-- Each item carries an `enabled` (live/paused) flag. NOTE: the
-- booking-trigger / recurring automation JOB that *acts* on this config is
-- a separate future slice — this migration + its routes make the config
-- configurable and durable now (managers can edit + pause/resume), they do
-- not yet auto-create tasks from it.
--
-- The runner wraps each file in a transaction (no explicit BEGIN/COMMIT).

CREATE TABLE IF NOT EXISTS operations_settings (
  tenant_id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
