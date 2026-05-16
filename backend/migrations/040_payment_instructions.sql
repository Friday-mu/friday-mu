-- Migration 040 — per-tenant payment instructions
--
-- Today the BillingModule frontend hardcodes Banque des Mascareignes /
-- Friday Retreats Ltd / MUR account details. For v0 the rails are still
-- "everyone pays into FR's account" but a US tenant might prefer Wise,
-- a EU tenant a SEPA IBAN, etc. Make the receiving-account block a
-- per-tenant JSONB so non-MU tenants can render their own instructions
-- without a code change.
--
-- Semantics:
--   `tenants.payment_instructions` holds the bank/transfer details the
--   tenant uses to PAY FR for their FridayOS subscription. (Not the
--   tenant's own customer-billing rails — that's a separate concern.)
--   For v0 simplicity each tenant gets their own copy; FR admin can
--   override per-tenant via PATCH /api/tenants/:id.
--
-- JSONB shape (all keys optional, all strings except where noted):
--   {
--     "bank_name":       string,
--     "account_name":    string,
--     "account_number":  string,
--     "iban":            string,
--     "swift":           string | null,
--     "currency":        string,        -- ISO 4217, used for display
--     "instructions":    string         -- free-text, shown under the bank rows
--   }
--
-- Empty object ('{}') = "not yet configured"; the frontend falls back
-- to a "contact support" message in that case.
--
-- Backfill: only the FR tenant row gets the legacy hardcoded BdM block.
-- Other tenants stay at the default '{}'::jsonb until configured.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS payment_instructions JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE tenants
SET payment_instructions = jsonb_build_object(
  'bank_name', 'Banque des Mascareignes',
  'account_name', 'Friday Retreats Ltd',
  'account_number', '60000000XXXXX',
  'iban', 'MU17BOMM0101101030300200000MUR',
  'swift', NULL,
  'currency', 'MUR',
  'instructions', 'Use the invoice number as the transfer reference.'
)
WHERE id = '00000000-0000-0000-0000-000000000001'
  AND payment_instructions = '{}'::jsonb;
