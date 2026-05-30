# Operations/Breezeway Cutover - Wave 5 Handover

Date: 2026-05-21
Worktree: `/Users/judith/.codex/worktrees/7fa0/friday-admin-dashboard`
Branch target: `fad-rebuild`

## Shipped

- Persisted Operations task requirements:
  - `backend/migrations/052_task_requirements.sql`
  - `tasks.requirements JSONB`
  - `tasks.requirement_state JSONB`
- Extended `/api/tasks` create, patch, list/detail shaping to accept and return `requirements` and `requirement_state`.
- Added frontend requirement types and template helpers in `frontend/src/app/fad/_data/taskRequirements.ts`.
- Added core requirement templates:
  - Standard clean
  - Post-clean inspection
  - Preventative maintenance
  - Home buildout
  - Amenities form
- Manager task creation now attaches template-derived requirements through the existing task adapter.
- Task detail now renders Requirements with:
  - required/optional state
  - manual checklist and supply confirmation
  - manager waiver controls
  - automatic gates for photo/file evidence, expense lines, time capture, and execution summary
  - inline completion blockers before `status = completed`

## Boundary Notes

- No Inbox-owned pending-action detector/proposal/UI files were touched.
- No second task system was added; all work stays behind `/api/tasks` and `tasksClient`.
- Field issue reports still create unassigned `reported` manager-triage tasks; they do not gain free create/schedule/create-and-complete privileges.
- Supplies/inventory are only represented as requirement gates/manual confirmations in this wave. Real supplies/inventory capture belongs to later waves.

## Verification

- `node --check backend/src/tasks/index.js`
- `cd frontend && npx tsc --noEmit --pretty false --incremental false`
- `cd frontend && npm run build`
- Restored `frontend/next-env.d.ts` to the dev routes import after build.
- `cd frontend && npx tsc --noEmit --pretty false --incremental false`
- `git diff --check`
- Browser plugin interaction QA on `http://localhost:3021/fad?m=operations&sub=all&task=qa-req-1` with local mock API:
  - page identity and task detail loaded
  - no console errors/warnings from the Browser pass
  - Complete blocked with required reset/photo/supply/summary missing
  - manual reset/supply completion, manager photo waiver, and summary allowed completion
- Responsive viewport QA used standalone Playwright fallback because Browser viewport screenshots were blank while DOM was present:
  - 320, 375, 430, 768, 1440 widths
  - 0 document overflow
  - 0 task-detail overflow
  - 0 small actionable targets

## QA Artifacts

- `docs/handover/qa-screenshots-2026-05-21-wave5/task-requirements-playwright-320.png`
- `docs/handover/qa-screenshots-2026-05-21-wave5/task-requirements-playwright-375.png`
- `docs/handover/qa-screenshots-2026-05-21-wave5/task-requirements-playwright-430.png`
- `docs/handover/qa-screenshots-2026-05-21-wave5/task-requirements-playwright-768.png`
- `docs/handover/qa-screenshots-2026-05-21-wave5/task-requirements-playwright-1440.png`
- `docs/handover/qa-screenshots-2026-05-21-wave5/metrics.json`

## Test Data

- Local mock API task only:
  - `qa-req-1`
  - title `Standard clean completion QA`
  - template `Standard clean`
  - property `LB-2`
- No live task rows were created or changed.

## Remaining Work

- Real persisted evidence upload is still not implemented; queued evidence can satisfy the session-level completion gate, but uploads remain local until the later offline/evidence wave.
- Real supplies, inventory, SRL loadouts, and expense policy automation are later waves.
- Live DB migration/application was not run in this worktree.
