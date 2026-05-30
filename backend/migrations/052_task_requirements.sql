-- 052_task_requirements.sql
--
-- Operations task execution requirements. These replace Breezeway's
-- task-type checklist surface for the core Friday task templates while
-- keeping the state on the task row for this cutover slice.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS requirement_state JSONB NOT NULL DEFAULT '{"completedIds":[],"waivedIds":[]}'::jsonb;

COMMENT ON COLUMN tasks.requirements IS 'Task execution requirements/checklist definitions derived from Operations templates.';
COMMENT ON COLUMN tasks.requirement_state IS 'Per-task requirement completion/waiver state keyed by requirement id.';
