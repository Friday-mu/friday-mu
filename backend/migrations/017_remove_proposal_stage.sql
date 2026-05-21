-- Migration 017 — remove 'proposal' stage from workflow
--
-- Stage 2 'proposal' (the "decide whether to pitch" qualification step)
-- was vestigial — no dedicated screen, no deliverable, and the same
-- decision happens naturally inside the Lead stage. Removed per Ishant
-- 2026-05-13. The workflow goes back to 17 stages (matches pre-floor-plan
-- count; floor-plan inserted at slot 9 in migration 010 keeps that total).
--
-- Defensive UPDATE: any project or task stuck at 'proposal' gets bumped
-- to 'lead' (the closest valid pre-proposal stage). On 2026-05-13 prod
-- had zero rows in either state, so this is no-op in practice.

UPDATE design_projects
SET current_stage = 'lead',
    updated_at = NOW()
WHERE current_stage = 'proposal';

UPDATE design_tasks
SET stage_key = 'lead',
    updated_at = NOW()
WHERE stage_key = 'proposal';
