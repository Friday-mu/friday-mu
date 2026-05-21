-- Migration 068 — FAD-native analytics event ingestion.
--
-- The table already exists in the shared GMS database in current prod,
-- but FAD should be able to boot a clean/stage database without relying
-- on a GMS migration having created it first.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  user_id UUID,
  event_type VARCHAR(120) NOT NULL,
  event_data JSONB DEFAULT '{}'::jsonb,
  session_id VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_name VARCHAR(160)
);

ALTER TABLE analytics_events
  ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS event_type VARCHAR(120),
  ADD COLUMN IF NOT EXISTS event_data JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS session_id VARCHAR(160),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS user_name VARCHAR(160);

CREATE INDEX IF NOT EXISTS idx_analytics_events_tenant_created
  ON analytics_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_type_created
  ON analytics_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_session
  ON analytics_events (session_id)
  WHERE session_id IS NOT NULL;
