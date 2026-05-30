-- 095_consult_conversation_locks.sql
--
-- Durable lease locks for FAD Consult conversation turns.
--
-- The old Consult route serialized same-conversation turns with a
-- process-local Map. That works for one Node process, but it cannot protect
-- against duplicate draft/session work after a restart or under future
-- horizontal scaling. This table provides a database-visible lease without
-- holding a Postgres connection during long model calls.

CREATE TABLE IF NOT EXISTS consult_conversation_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  lock_key TEXT NOT NULL,
  lock_scope TEXT NOT NULL DEFAULT 'consult_turn',
  holder_token TEXT NOT NULL,
  holder_ref TEXT,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tenant_id, lock_key, lock_scope)
);

CREATE INDEX IF NOT EXISTS idx_consult_conversation_locks_expiry
  ON consult_conversation_locks (tenant_id, expires_at);
