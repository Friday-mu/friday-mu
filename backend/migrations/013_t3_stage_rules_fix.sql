-- Migration 013 — fix T3 tierStageRules
--
-- Migration 005 seeded T3 with moodboard as OPTIONAL and floor-plan as
-- (implicitly) MANDATORY. That's the reverse of the actual T3 client
-- agreement:
--
--   • The T3 contract stops at the moodboard — moodboard IS the
--     deliverable, so it must be MANDATORY.
--   • Design Pack + Owner Design Review are not part of the T3 agreement
--     and should stay optional.
--   • Floor Plan is OPTIONAL for T3 — Friday still generates one
--     internally as the base layer for design work, but it isn't a
--     contractual deliverable. Marked as optional so the workflow
--     accepts "skipped" without flagging it as blocked.
--
-- Patches the design_annex_a JSONB in place. Idempotent — re-applying
-- this against the corrected state is a no-op (the new value already
-- contains the new array).

UPDATE design_annex_a
SET annex_a = jsonb_set(
      annex_a,
      '{tierStageRules, 3, optionalStages}',
      '["doc-request", "floor-plan", "design-pack", "design-review"]'::jsonb,
      false
    ),
    updated_at = NOW()
WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
