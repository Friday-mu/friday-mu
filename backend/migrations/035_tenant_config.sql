-- Migration 035 — widen design_annex_a into a per-tenant config row
--
-- Multitenant v0 follow-up. The `design_annex_a` table has been the per-
-- tenant settings home since mig 015 (PK = tenant_id). Until now it only
-- carried the Annex A fee schedule JSONB. To onboard a second tenant
-- without a fork, we need the brand strings / legal text / currency /
-- date format / AI vendor defaults that are currently hardcoded as
-- "Friday Retreats" / "Mauritius" / "Rs" / "Courts + La Foir Fouille +
-- Quality Decor + Kalachand" to come from this row.
--
-- Backend files consuming the new columns (via design/adapters.js's
-- new loadTenantConfig helper):
--   1. backend/src/design/agreement_evidence.js   — PDF footer + jurisdiction + currency
--   2. backend/src/design/ai_rough_budget.js      — company name + locale + vendor defaults
--   3. backend/src/design/ai_ask.js               — company name + locale
--   4. backend/src/design/ai_annex_b_edit.js      — company name + locale
--
-- This migration is additive and idempotent:
--   - ADD COLUMN IF NOT EXISTS for each new column.
--   - The FR row (tenant_id = 00000000-0000-0000-0000-000000000001) is
--     backfilled with the literal values currently in the codebase via
--     an UPDATE gated on the row already existing — we do NOT insert a
--     missing tenant row here. If the FR row doesn't exist yet, that's
--     a deployment problem upstream and we don't want to mask it.
--
-- Note on mig 027 (CIA Mauritius columns on design_projects):
--   Those columns remain. They default to 'unknown' on non-MU tenants
--   and are not actively harmful — just dead weight. Cleaning them up
--   (or moving them under a per-tenant feature flag) is left for a
--   future multitenant pass.

ALTER TABLE design_annex_a
  ADD COLUMN IF NOT EXISTS company_name            TEXT,
  ADD COLUMN IF NOT EXISTS pdf_footer_text         TEXT,
  ADD COLUMN IF NOT EXISTS legal_jurisdiction_text TEXT,
  ADD COLUMN IF NOT EXISTS currency_code           TEXT  NOT NULL DEFAULT 'MUR',
  ADD COLUMN IF NOT EXISTS date_format             TEXT  NOT NULL DEFAULT 'DD/MM/YYYY',
  ADD COLUMN IF NOT EXISTS vendor_defaults         JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Backfill the FR row with the literal values currently embedded in the
-- backend source. COALESCE so re-running this migration after someone
-- has tweaked the values via UI/PUT doesn't clobber their edits.
UPDATE design_annex_a
SET
  company_name            = COALESCE(company_name,            'Friday Retreats'),
  pdf_footer_text         = COALESCE(pdf_footer_text,         'Friday Retreats Design OS · Mauritius'),
  legal_jurisdiction_text = COALESCE(legal_jurisdiction_text, 'Mauritius law (Electronic Transactions Act 2000)'),
  -- currency_code + date_format already carry the right defaults via
  -- their NOT NULL DEFAULT; no UPDATE needed for FR.
  vendor_defaults = CASE
    WHEN vendor_defaults = '{}'::jsonb
      THEN '{"primary": "Courts", "small_decor": "La Foir Fouille", "fixtures": ["Quality Decor", "Kalachand"]}'::jsonb
    ELSE vendor_defaults
  END,
  updated_at = NOW()
WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
