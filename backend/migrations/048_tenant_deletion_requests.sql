-- Migration 045 — tenant deletion requests (soft delete + GDPR-style
-- data request tracking).
--
-- A tenant admin calls POST /api/tenants/me/delete-request to wind
-- down their workspace. The route does NOT hard-delete data; it
-- flips tenants.active=false + subscription_status='cancelled' and
-- records the request here. An FR admin can later either:
--   • POST /api/tenants/admin/:id/restore         → undo (status='cancelled')
--   • POST /api/tenants/admin/:id/hard-delete    → expunge (status='hard_deleted')
--
-- The requireModule middleware caches subscription_status for 60s
-- so the tenant is locked out within one TTL of the delete-request.

CREATE TABLE IF NOT EXISTS tenant_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requested_by_user_id UUID,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'cancelled', 'hard_deleted')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  hard_deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tenant_deletion_status ON tenant_deletion_requests(status);
