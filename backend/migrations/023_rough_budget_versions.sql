-- Migration 023 — rough-budget versioning.
--
-- The frontend RoughBudget fixture has always carried a per-version
-- envelope (low/mid/high, tier, design+procurement fee, assumptions,
-- exclusions, risk_items, next_steps, status) but design_rough_budgets
-- was only ever line items. "Save new version" in RoughBudgetStage
-- never persisted anything — the button literally had no onClick, and
-- even if it did, no table could hold the version metadata.
--
-- Two changes:
--   • Create design_rough_budget_versions for the envelope (one row
--     per snapshot of the budget).
--   • Add version_id to design_rough_budgets so line items belong to a
--     version. Nullable to keep existing rows valid; new line items go
--     into a version when one exists.

CREATE TABLE IF NOT EXISTS design_rough_budget_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  low_minor BIGINT,
  mid_minor BIGINT,
  high_minor BIGINT,
  tier TEXT,
  classification_override TEXT,
  design_fee_minor BIGINT,
  procurement_fee_minor BIGINT,
  assumptions TEXT,
  exclusions TEXT,
  risk_items TEXT,
  next_steps TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT design_rough_budget_versions_status_check
    CHECK (status IN ('draft', 'sent', 'accepted')),
  CONSTRAINT design_rough_budget_versions_tier_check
    CHECK (tier IS NULL OR tier IN ('T1', 'T2', 'T3'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_design_rough_budget_versions_proj_ver
  ON design_rough_budget_versions(project_id, version_number);

CREATE INDEX IF NOT EXISTS idx_design_rough_budget_versions_project
  ON design_rough_budget_versions(project_id, version_number DESC);

-- Add version_id to design_rough_budgets so line items belong to a
-- version. Existing rows stay NULL — they belong to "no version yet"
-- and won't show up in any version snapshot. The frontend continues
-- to handle the no-version case (empty list).
ALTER TABLE design_rough_budgets
  ADD COLUMN IF NOT EXISTS version_id UUID;

CREATE INDEX IF NOT EXISTS idx_design_rough_budgets_version
  ON design_rough_budgets(version_id) WHERE version_id IS NOT NULL;
