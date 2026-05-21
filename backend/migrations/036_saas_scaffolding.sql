-- Migration 036 — SaaS scaffolding: subscription + modules + invoices.
--
-- Background: tenants table predates the design module (originally
-- introduced for GMS-side multitenancy). It already has: id, name,
-- slug, stripe_customer_id, plan, active. This migration extends it
-- for the SaaS sell motion and adds two new sibling tables.
--
-- New surface:
--   tenants                  + subscription_status / trial / payment_method / country / locale
--   tenant_modules           which modules a tenant has subscribed to
--   invoices                 bank-transfer + future-Stripe billing trail
--
-- v0 sells the design module only. Schema is multi-module so other
-- modules become saleable later without re-modelling.

-- ─────────────────────────── tenants extensions ──────────────────────────

ALTER TABLE tenants
  -- State machine independent of `plan` (plan = which tier, status =
  -- where they are in the lifecycle).
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  -- bank_transfer in v0; stripe schema-ready (stripe_customer_id
  -- already on the row from earlier work). Switching a tenant from
  -- bank_transfer to stripe is a status flip + Stripe customer
  -- creation; no schema change.
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'bank_transfer',
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS locale TEXT,
  ADD COLUMN IF NOT EXISTS billing_email TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_subscription_status_check') THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_subscription_status_check
      CHECK (subscription_status IN ('trial','active','past_due','cancelled','suspended'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_payment_method_check') THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_payment_method_check
      CHECK (payment_method IN ('bank_transfer','stripe'));
  END IF;
END $$;

-- Backfill the FR row to 'active' + bank_transfer + Mauritius. We
-- already serve them; they're not on trial.
UPDATE tenants
SET subscription_status = 'active',
    subscription_started_at = COALESCE(subscription_started_at, created_at),
    payment_method = COALESCE(payment_method, 'bank_transfer'),
    country = COALESCE(country, 'MU'),
    locale = COALESCE(locale, 'en-MU')
WHERE id = '00000000-0000-0000-0000-000000000001';

-- ─────────────────────────── tenant_modules ──────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_modules (
  tenant_id    UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_key   TEXT    NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT true,
  enabled_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disabled_at  TIMESTAMPTZ,
  notes        TEXT,
  PRIMARY KEY (tenant_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_modules_active
  ON tenant_modules(tenant_id)
  WHERE enabled = true;

-- FR backfill: enable every module that today's FAD shell exposes.
-- The list mirrors the sidebar entries the team uses daily — if any
-- of these is missing, that tenant's sidebar would silently hide a
-- module they've always had. Source of truth for module keys is
-- backend/src/tenants/modules.js (added in this commit).
INSERT INTO tenant_modules (tenant_id, module_key, enabled)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'design',          true),
  ('00000000-0000-0000-0000-000000000001', 'inbox',           true),
  ('00000000-0000-0000-0000-000000000001', 'reservations',    true),
  ('00000000-0000-0000-0000-000000000001', 'calendar',        true),
  ('00000000-0000-0000-0000-000000000001', 'operations',      true),
  ('00000000-0000-0000-0000-000000000001', 'finance',         true),
  ('00000000-0000-0000-0000-000000000001', 'hr',              true),
  ('00000000-0000-0000-0000-000000000001', 'analytics',       true),
  ('00000000-0000-0000-0000-000000000001', 'reviews',         true),
  ('00000000-0000-0000-0000-000000000001', 'training',        true),
  ('00000000-0000-0000-0000-000000000001', 'settings',        true),
  ('00000000-0000-0000-0000-000000000001', 'website-inbox',   true),
  ('00000000-0000-0000-0000-000000000001', 'tenant-settings', true),
  ('00000000-0000-0000-0000-000000000001', 'billing',         true)
ON CONFLICT (tenant_id, module_key) DO NOTHING;

-- ─────────────────────────── invoices ────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  invoice_number    TEXT NOT NULL,
  amount_minor      BIGINT NOT NULL,
  currency_code     TEXT NOT NULL DEFAULT 'USD',
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  due_date          DATE NOT NULL,
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at           TIMESTAMPTZ,
  paid_by           TEXT,
  bank_transfer_ref TEXT,
  pdf_url           TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id, status, issued_at DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_status_check') THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_status_check
      CHECK (status IN ('pending','paid_pending_confirmation','paid','overdue','cancelled','refunded'));
  END IF;
END $$;
