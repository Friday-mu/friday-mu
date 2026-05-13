-- Migration 015 — add vatRate to design_annex_a JSONB
--
-- Annex A rates are VAT-EXCLUSIVE — every design fee, procurement & execution
-- fee, and internal service rate listed in the schedule is quoted excluding
-- VAT. Mauritius applies 15% VAT on top of all these fees. Until now the
-- JSONB schedule had no place to record the rate; the frontend defaulted to
-- 0.15 in-memory but persisted overrides could drop it entirely on the next
-- save.
--
-- This migration backfills the missing `vatRate` field (set to 0.15 — the
-- Mauritius standard rate) only when it isn't already present. Idempotent
-- per the `NOT (annex_a ? 'vatRate')` guard: re-running over the patched
-- state is a no-op because the row will already carry the key.
--
-- (Locked 2026-05-13 per Ishant.)

UPDATE design_annex_a
SET annex_a = jsonb_set(
      annex_a,
      '{vatRate}',
      '0.15'::jsonb,
      true  -- create_missing: insert if absent, do not overwrite an explicit rate
    ),
    updated_at = NOW()
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND NOT (annex_a ? 'vatRate');
