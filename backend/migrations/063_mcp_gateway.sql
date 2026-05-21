-- 063_mcp_gateway.sql
--
-- Approval ledger for FridayOS MCP high-risk actions. The MCP gateway
-- can read data and perform safe internal writes directly, but guest-
-- facing or revenue-impacting actions must first create a request here.

CREATE TABLE IF NOT EXISTS mcp_action_requests (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requested_by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  requested_by_client_id  TEXT,
  approved_by_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action_type             TEXT NOT NULL,
  risk_level              TEXT NOT NULL DEFAULT 'high'
                           CHECK (risk_level IN ('medium', 'high', 'critical')),
  status                  TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),
  reason                  TEXT,
  payload                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  result                  JSONB,
  error                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at             TIMESTAMPTZ,
  executed_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mcp_action_requests_tenant_recent
  ON mcp_action_requests(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mcp_action_requests_status
  ON mcp_action_requests(tenant_id, status, created_at DESC);
