-- Migration 014 — design_tasks.category
--
-- Adds a discriminator so blockers and next-actions (previously stored
-- as single TEXT fields on design_projects) can be modelled as proper
-- multi-item lists with assignee / due_date / status — using the
-- existing design_tasks primitive.
--
-- Backfill: each non-empty design_projects.blocker / .next_action
-- becomes ONE design_tasks row with the matching category and status
-- 'todo' (the default status on design_tasks per migration 002). The
-- source TEXT columns are intentionally NOT dropped — they stay as a
-- legacy fallback during the transition. A future migration can drop
-- them once nothing reads them.

ALTER TABLE design_tasks
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general';

-- CHECK constraint added separately so re-running the migration doesn't
-- collide on the constraint name (ADD COLUMN IF NOT EXISTS is
-- idempotent; ADD CONSTRAINT is not without the conditional).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'design_tasks_category_check'
  ) THEN
    ALTER TABLE design_tasks
      ADD CONSTRAINT design_tasks_category_check
      CHECK (category IN ('general', 'blocker', 'next_action'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_design_tasks_project_category
  ON design_tasks(project_id, category);

-- Backfill from legacy text fields. Skip if text is null or empty
-- after trim. Status uses 'todo' (the table default per migration 002).
-- WHERE NOT EXISTS guards against re-running: only insert if no task
-- already exists for that project+category combination.
INSERT INTO design_tasks (project_id, title, category, status)
SELECT p.id, p.blocker, 'blocker', 'todo'
FROM design_projects p
WHERE p.blocker IS NOT NULL
  AND TRIM(p.blocker) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM design_tasks t
    WHERE t.project_id = p.id AND t.category = 'blocker'
  );

INSERT INTO design_tasks (project_id, title, category, status)
SELECT p.id, p.next_action, 'next_action', 'todo'
FROM design_projects p
WHERE p.next_action IS NOT NULL
  AND TRIM(p.next_action) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM design_tasks t
    WHERE t.project_id = p.id AND t.category = 'next_action'
  );
