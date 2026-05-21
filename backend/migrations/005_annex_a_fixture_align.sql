-- Migration 005 — align Annex A with the fixture-locked pricing schedule
-- and clear over-eager tier overrides on seeded projects.
--
-- The 003 seed assumed flat percentages per tier (T1 12% / T2 10% /
-- T3 8% for design). That contradicted Annex A: design fee is 3% of
-- EPC only for Tier 1, and flat for T2 (Rs 45,000) + T3 (Rs 25,000).
-- This migration rewrites the Annex A JSONB to match the fixture's
-- ANNEX_A_DEFAULT in frontend/src/app/fad/_data/design.ts so the
-- Settings tab editor stays in sync with the runtime fee math.
--
-- Also clears tier overrides on the 3 seeded projects so tierForEpc()
-- derives at render time from EPC + Annex A thresholds — single source
-- of truth. UI override hook (tier_override column) is queued for v0.2.

UPDATE design_annex_a
SET annex_a = '{
  "designFee": {
    "tier3FlatMinor": 2500000,
    "tier2FlatMinor": 4500000,
    "tier1PercentOfEpc": 0.03
  },
  "procurementFurnishing": {
    "tier3Pct": 0.125,
    "tier2Pct": 0.10,
    "tier1Pct": 0.075
  },
  "procurementRenovation": {
    "tier3Pct": 0.175,
    "tier2Pct": 0.15,
    "tier1Pct": 0.125
  },
  "tierThresholds": {
    "tier3MaxMinor": 50000000,
    "tier2MaxMinor": 150000000
  },
  "tierStageRules": {
    "1": { "optionalStages": [] },
    "2": { "optionalStages": ["doc-request"] },
    "3": { "optionalStages": ["doc-request", "moodboard", "design-pack", "design-review"] }
  },
  "contingency_percent_default": 10,
  "currency": "MUR",
  "agreementTemplateVersion": "2025-09-nursoo"
}'::jsonb,
    updated_at = NOW()
WHERE tenant_id = '00000000-0000-0000-0000-000000000001';

-- Clear seed-time tier overrides so the runtime derivation (tierForEpc)
-- takes over. OH-2 has Rs 15M EPC → derives Tier 1 (was wrongly seeded
-- as Tier 2). Albion Rs 4M EPC → also Tier 1. OT-5 has no EPC yet so
-- tier stays NULL until an EPC is captured.
UPDATE design_projects
SET tier = NULL
WHERE slug IN ('oh-2', 'albion-tasleem', 'ot-5');
