-- 057_api_clients.sql
-- API client credentials for the public /api/public/* surface.
--
-- Per roadmap §5.2.1 (ADR-003 locked 2026-05-18): OAuth 2.0
-- client_credentials grant → short-lived JWTs. Initial consumer is
-- the friday.mu website; long-term every external tenant gets a row.
--
-- Schema mirrors what /api/auth/token expects and what
-- scripts/issue-api-client.js generates.

CREATE TABLE IF NOT EXISTS api_clients (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           TEXT NOT NULL UNIQUE,
  client_secret_hash  TEXT NOT NULL,
  tenant_id           UUID NOT NULL,
  scopes              JSONB NOT NULL DEFAULT '[]'::jsonb,
  description         TEXT,
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at        TIMESTAMPTZ,
  revoked_at          TIMESTAMPTZ,
  CONSTRAINT api_clients_scopes_array_check CHECK (jsonb_typeof(scopes) = 'array')
);

-- Look up by client_id on every token issuance — keep it cheap.
CREATE INDEX IF NOT EXISTS idx_api_clients_client_id ON api_clients (client_id);

-- Audit table — append-only log of every issuance + every refusal.
-- Lets ops debug "the website got 401s for an hour" by grepping client_id.
CREATE TABLE IF NOT EXISTS api_client_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     TEXT NOT NULL,
  event         TEXT NOT NULL,  -- 'token_issued' | 'token_refused' | 'rotated' | 'revoked'
  reason        TEXT,
  request_ip    TEXT,
  request_ua    TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_client_audit_client_id_created
  ON api_client_audit (client_id, created_at DESC);
