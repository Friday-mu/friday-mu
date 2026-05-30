-- Migration 007 — add external_ref column to design_tasks for
-- deterministic dedup of auto-emitted tasks (design-be-9).
--
-- The auto-task scanner (backend/src/design/jobs/auto_tasks.js) runs
-- every 5 minutes and would otherwise spam duplicates. Each row written
-- by the scanner carries an external_ref string of the form
--   "auto:<trigger>:<target_id>"
-- where <trigger> is one of blocker | approval_stale | payment_blocked |
-- budget_variance | task_overdue, and <target_id> is the stable upstream
-- identifier (project_id, approval_id, gate_id, budget_item_id, original
-- task id). The partial unique index gates inserts: a second pass on the
-- same trigger+target hits the index and a row is only inserted if the
-- previous one has been closed (done) and removed-or-renamed by the
-- scanner's "not already open" pre-check.
--
-- Hand-written tasks leave external_ref NULL and are unaffected.

ALTER TABLE design_tasks
  ADD COLUMN IF NOT EXISTS external_ref TEXT;

-- Partial unique index — only enforces uniqueness on OPEN auto-emitted
-- rows. The "status <> 'done'" clause is the load-bearing part: when an
-- auto-task is completed (status flipped to 'done') the index slot is
-- freed and the scanner can re-emit if the trigger fires again (e.g. a
-- blocker was resolved, then re-introduced on the same project). This
-- matches the brief's "not already done" semantics without requiring
-- the scanner to mutate the closed row.
--
-- Race-protection: the index also catches the (rare) case where two
-- scheduler runs overlap and both try to insert the same ref. The
-- second insert hits 23505 and the scanner swallows it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_design_tasks_external_ref
  ON design_tasks(project_id, external_ref)
  WHERE external_ref IS NOT NULL AND status <> 'done';
