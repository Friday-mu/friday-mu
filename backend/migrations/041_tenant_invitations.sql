-- Migration 041 — tenant invitations
--
-- Today one admin per tenant is created at signup; design studios want
-- 2-5 people on the same workspace. This adds an invitation flow:
--
--   admin POSTs /api/tenants/me/invitations  (email, role)
--      -> we create a tenant_invitations row with a random token + 7-day TTL
--      -> we email the invitee a link: /invitations?token=<token>
--      -> invitee opens the link, sets a password, accepts
--      -> we create a users row scoped to the tenant + mark invitation accepted
--
-- The invitation token is stored in plaintext (32 random bytes hex). The
-- attack surface is small: tokens are single-use, scoped to one tenant,
-- expire after 7d, and only let the holder create a user with a chosen
-- email/role that the admin already typed in. We can swap to a hashed
-- token if we ever store anything more sensitive against the invitation.
--
-- The partial unique index on (tenant_id, email) WHERE status='pending'
-- prevents duplicate active invitations to the same address inside a
-- tenant. Revoking / accepting an invitation flips its status out of
-- 'pending' which releases the slot for a future invite.

CREATE TABLE IF NOT EXISTS tenant_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('admin', 'agent')),
  token TEXT UNIQUE NOT NULL,
  invited_by_user_id UUID,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_invitations_tenant
  ON tenant_invitations(tenant_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_invitations_email_pending
  ON tenant_invitations(tenant_id, email) WHERE status = 'pending';
