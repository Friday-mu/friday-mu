-- Migration 012 — design_projects.{design,procurement}_fee_minor_override
--
-- The existing design_fee_minor / procurement_fee_minor columns
-- continue to exist for backward-compatibility. Frontend derivation
-- (tierForEpc → designFeeForTier / procurementFeeForTier) runs by
-- default. When a Director explicitly overrides via the edit drawer,
-- the override value is stored in *_override and takes precedence on
-- the read path (apiProjectToFixture). NULL = no override → derive.
-- BIGINT for monetary minor units (consistent with the rest of the
-- *_minor schema).

ALTER TABLE design_projects
  ADD COLUMN IF NOT EXISTS design_fee_minor_override BIGINT,
  ADD COLUMN IF NOT EXISTS procurement_fee_minor_override BIGINT;
