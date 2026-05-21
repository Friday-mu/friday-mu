# Operations / Breezeway Cutover Wave 4B Handover

Date: 2026-05-21
Worktree: `/Users/judith/.codex/worktrees/7fa0/friday-admin-dashboard`
Branch target: `fad-rebuild`

## Shipped

- Added an Ops-owned pending-action conversion adapter in `frontend/src/app/fad/_data/tasksClient.ts`.
- Conversion maps pending actions to real task inputs with `externalRef = pending_action:<id>`, `source = inbox_ai`, `status = reported`, unassigned by default, property/reservation/conversation refs preserved, and urgency mapped to task priority.
- Fixed idempotent create retry behavior in `useApiTasks`: returned existing tasks now upsert into the local cache instead of duplicating.
- Added a manager-only Operations `Inbox AI` tab and sidebar subpage.
- The Inbox AI triage queue reads real `/api/tasks` records where `source = inbox_ai` and `status = reported`.
- Manager actions: single accept/dismiss/duplicate/stale/link-existing plus bulk accept/dismiss/stale.
- Field users remain assigned-only; a field user forced to `sub=inbox-ai` is routed back to `My tasks`.

## Ownership Boundary

- No Inbox-owned files were edited.
- This wave does not change pending-action detection, suppression, dedup, cleanup, PendingActions UI, draft/send flows, or proposal quality.
- Inbox can call `createTaskFromPendingAction(...)` or send the equivalent `POST /api/tasks` payload. Operations owns the resulting task records and manager triage.

## Verification

- `cd frontend && npx tsc --noEmit --pretty false --incremental false`
- `cd frontend && npm run build`
- `node --check backend/src/tasks/index.js`
- Browser plugin pass on `http://localhost:3021/fad?m=operations&sub=inbox-ai` with a local mock task API:
  - page identity and nonblank render passed
  - console error/warn log check passed
  - checkbox selection enabled bulk actions
  - bulk accept moved one Inbox AI task out of the reported queue
- Standalone viewport pass with local mock task API:
  - 320, 375, 430, 768, 1440
  - 0 document overflow
  - 0 triage-pane overflow
  - 0 triage-pane small targets
- Field role-gate smoke:
  - forced `field` role + `/fad?m=operations&sub=inbox-ai`
  - rendered `My tasks`
  - did not render `Inbox AI` or `All tasks` in the main Operations surface

## Screenshots

- `docs/handover/qa-screenshots-2026-05-21-wave4b/inbox-ai-triage-320.png`
- `docs/handover/qa-screenshots-2026-05-21-wave4b/inbox-ai-triage-375.png`
- `docs/handover/qa-screenshots-2026-05-21-wave4b/inbox-ai-triage-430.png`
- `docs/handover/qa-screenshots-2026-05-21-wave4b/inbox-ai-triage-768.png`
- `docs/handover/qa-screenshots-2026-05-21-wave4b/inbox-ai-triage-1440.png`

## Test Data

- Visual/interaction QA used a throwaway local mock API on `http://localhost:3333`.
- Mock task IDs used only in QA:
  - `task-inbox-1`
  - `task-inbox-2`
  - `task-manual-1`
- No persistent backend data was created by this wave.

## Demo Tags

- No fixture/demo production code added.
- No `frontend/DEMO_CRUFT.md` update needed.

## Blockers / Follow-Up

- Full pending-action accept buttons inside PendingActions UI remain Inbox-owned. Wire them from the Inbox session to the exported Ops adapter or equivalent `/api/tasks` call when that owner is ready.
- Backend route-level role authorization still depends on the broader FAD auth/gating layer; this wave preserved tenant-scoped task endpoints and frontend role gates.
- No live backend DB integration test was run for `external_ref` because the local verification used a mock API. The backend task service already has the tenant-scoped `external_ref` lookup and unique index from Wave 1.
