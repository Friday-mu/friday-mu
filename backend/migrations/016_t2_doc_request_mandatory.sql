-- Migration 016 — T2 doc-request mandatory
--
-- T2 (mid-EPC) needs at least some document package — without an
-- existing floor plan / site plan, Friday would have to measure
-- everything from scratch which costs extra. doc-request becomes
-- mandatory for T2 (empty optionalStages array).
--
-- Migration 005 originally seeded T2 with doc-request as optional;
-- migration 013 fixed T3 but left T2 untouched. This patches T2 to
-- match the new locked rule.
--
-- Idempotent — re-applying against the corrected state is a no-op.

UPDATE design_annex_a
SET annex_a = jsonb_set(
      annex_a,
      '{tierStageRules, 2, optionalStages}',
      '[]'::jsonb,
      false
    ),
    updated_at = NOW()
WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
