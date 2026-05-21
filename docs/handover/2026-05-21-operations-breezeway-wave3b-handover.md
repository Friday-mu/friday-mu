# Operations / Breezeway Cutover - Wave 3B Handover

## Shipped

- Extended `CreateTaskDrawer` into role-aware modes: manager schedule/report, standalone field issue report, and assigned-task issue report.
- Added field-visible `Report issue` / `Report property issue` entry points from Operations header, My Tasks header, task cards, and task detail.
- Field standalone reports require property, title, and description, create `status = reported`, `source = reported_issue`, no assignee, and no reservation/access context.
- Assigned-task reports inherit property/reservation context from the assigned task and write a safe provenance note into the new task description.
- Manager scheduling now includes property search, priority chips, department/subdepartment, template, element/category, attachment-name note, tags, requester, due date/time, estimated minutes, grouped assignee picker, and `Assign to me`.
- The global bug-report FAB is hidden while task detail or create/report drawers are open so it cannot intercept mobile primary actions.
- `createTask` now passes `template` through the existing `/api/tasks` adapter.

## Verification

- `frontend: npx tsc --noEmit --pretty false --incremental false` passed.
- `frontend: npm run build` passed.
- `backend: node --check backend/src/tasks/index.js` passed.
- In-app browser smoke passed on `http://localhost:3107/fad?m=operations&sub=my`: page identity correct, Operations content rendered, no console errors, no document/Operations overflow.
- Route-mocked Playwright QA passed across 320, 375, 430, 768, and 1440 widths.
- Screenshots and metrics: `docs/handover/qa-screenshots-2026-05-21-wave3b/`.
- `metrics.json`: 9 screenshots, 0 document overflow, 0 Operations/drawer overflow, 0 small targets in tested roots.

## QA Notes

- Standalone field report POST assertion: `status=reported`, `source=reported_issue`, `property=BS-1`, `assignees=[]`, `reservation=null`.
- Assigned-task report POST assertion: `status=reported`, `source=reported_issue`, `property=BS-1`, `assignees=[]`, `reservation=RSV-BS1-0521`, and safe inherited-context text present.
- Manager schedule POST assertion: `status=scheduled`, `source=manual`, `property=BS-1`, `due_time=14:30`.
- Existing adapter caveat: fixture staff ids like `u-bryan` / `u-franny` are intentionally filtered before POST because the backend expects UUIDs. The assignee/requester picker UI was exercised; persistence depends on production auth/users providing UUIDs.

## Demo Tags

- No new `@demo:*` tags were added in this wave.
- Existing `CreateTaskDrawer` NL parser remains tagged `@demo:logic` / `PROD-LOGIC-4`.

## Blockers / Deferred

- Voice dictation was researched and deferred because `voice-dictation-hook` depends on `/api/transcribe`, Gemini env, auth, and rate-limit behavior.
- Attachment upload remains not persisted; selected file names are truthfully noted in the task description until the upload service lands.
- Real UUID-backed assignee/requester persistence should be verified after auth/user plumbing replaces fixture ids.
