# Operations / Breezeway Cutover Wave 1 Handover

## Shipped in This Slice

- Ported the task foundation from `origin/fad-design-os-v01-frontend` at file level into this isolated worktree, without merging the branch.
- Added tenant-scoped `/api/tasks` route wiring in `backend/server.js`.
- Added backend task service, DB pool, and JWT identity middleware for task list/detail/create/update/delete, comments, and cost lines.
- Added migrations `050_tasks.sql` and `051_tasks_full.sql` for the Operations task table, task comments, task costs, multi-assignee support, canonical status lifecycle, and `external_ref` idempotency.
- Canonical status set is now `reported/scheduled/ready/in_progress/paused/blocked/completed/closed/cancelled`; `todo`, `done`, and `awaiting_approval` are migration/back-compat aliases only.
- Added frontend task API adapter (`tasksClient.ts`) and shared cache hook (`useApiTasks.ts`).
- Swapped Operations list/detail/create/cost mutations to the API client boundary instead of direct fixture mutation.
- Kept Inbox-owned files untouched. Pending actions remain proposals; Operations now has the idempotent task write primitive needed for later accepted `pending_action:<id>` conversion.

## Verification

- `node -c backend/src/tasks/index.js`
- `node -c backend/src/auth/identity.js`
- `node -c backend/src/database/client.js`
- `node -c backend/server.js`
- `npm run build` in `backend`: blocked by existing `backend/src/server.ts` errors for `ai_suggested_reply_translated` at lines 305 and 310; the new `pg` type error was fixed with `@types/pg`.
- `npm test -- --runInBand` in `backend`: no tests configured in this tree.
- Backend route smoke on port `4107`:
  - `GET /health` returned 200.
  - `GET /api/tasks` without JWT returned 401, confirming the route is mounted and auth-gated.
  - `GET /api/tasks` with a test JWT reached DB and returned 500 because the local test database does not exist.
- `npx tsc --noEmit --pretty false` in `frontend`: passed.
- `npm run build` in `frontend`: passed.

## QA Notes

- Dev frontend ran on `http://localhost:3107`.
- Operations Overview rendered at `320`, `375`, `430`, `768`, and `1440` widths with no detected horizontal document overflow.
- Operations All Tasks rendered at `375`.
- New Task drawer opened at `375`; screenshot confirms the drawer contents are visible and touch-sized.
- Offline sanity at `375`: the already-loaded Operations page remains rendered when the browser is put offline, but there is no explicit offline/queued/failed state yet.
- Screenshots saved in `docs/handover/qa-screenshots-2026-05-21/`:
  - `operations-overview-320.png`
  - `operations-overview-375.png`
  - `operations-overview-430.png`
  - `operations-overview-768.png`
  - `operations-overview-1440.png`
  - `operations-all-375.png`
  - `operations-new-task-drawer-375.png`
  - `operations-offline-loaded-375.png`

## Blockers / Not Done

- No live deploy. Persistence, real local tenant DB verification, access gating beyond the existing frontend permissions layer, and offline failure visibility are incomplete.
- Full task create/update/comment/cost idempotency could not be exercised end-to-end because this worktree has no local task database.
- Inbox AI pending-action manager triage UI is not implemented in this slice; this slice only provides the API/client primitive for idempotent task creation via `external_ref`.
- TeamInbox/Notifications comment mention bridge is not implemented in this slice.
- Expenses/supplies/SRL loadouts/inventory/stale-open reminders/offline queue/manager oversight remain later waves.

## Demo Tags / Test Data

- No new demo-only behavior was introduced.
- Existing demo tags in fixture files were preserved.
- No task records or external data were created. Browser QA only generated local screenshots under `docs/handover/qa-screenshots-2026-05-21/`.
