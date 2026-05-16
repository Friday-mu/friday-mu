-- Migration 046 — Stripe billing scaffolding.
--
-- Adds the columns needed to associate invoices + tenants with the
-- corresponding Stripe entities. tenants.stripe_customer_id already
-- exists (pre-dates the SaaS scaffolding work — see 036). The other
-- two columns + indexes are net-new.
--
-- This migration is a no-op for FR (still bank_transfer in v0). It
-- unblocks the plumbing so flipping a tenant's payment_method from
-- 'bank_transfer' to 'stripe' is a config flip rather than a schema
-- change.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE tenants  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Partial indexes — only the rows that actually carry a Stripe handle
-- need indexing. Keeps the index small until we go live.
CREATE INDEX IF NOT EXISTS idx_invoices_stripe
  ON invoices(stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_stripe_customer
  ON tenants(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
