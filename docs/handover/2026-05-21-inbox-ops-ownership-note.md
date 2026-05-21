# Inbox / Operations Ownership Note — 2026-05-21

## Decision

Operations owns real task execution, My Tasks, field reporting, manager triage, task lifecycle, and accepted pending-action conversion.

Inbox owns guest/team message detection, draft/send truth, pending-action proposal quality, suppression, deduplication, cleanup, and Inbox-side PendingActions review UI.

## Contract

When Ops accepts an Inbox proposal and creates a task:

- `tasks.source = 'inbox_ai'`
- `tasks.status = 'reported'`
- `tasks.external_ref = 'pending_action:<id>'`
- `pending_actions.fad_task_id` may link back to the created task

The `external_ref` must make conversion idempotent. Existing stale/passive `pending_actions` must not be bulk-converted.

## Correction From Commit `38cac13`

Commit `38cac13` made Friday Consult and teachings FAD-native, which remains correct. It also added Inbox-side automatic pending-action-to-task conversion, which crosses the new ownership line.

The intended correction is:

- Remove automatic task creation from `backend/src/inbox/action_detector.js`.
- Remove Inbox-owned `POST /api/inbox/pending-actions/:id/convert-to-task`.
- Keep `GET /api/inbox/pending-actions` for proposal review.
- Keep DB/link contract fields so Ops can implement accepted conversion safely.

Do not push shared-file changes without coordinating with the Operations/Breezeway cutover session.

## GMS Migration Follow-Up Scope

Inbox session may touch `backend/server.js` only to remove/replace remaining GMS proxy routes that belong to Inbox/FAD platform plumbing:

- `/api/inbox/drafts/:id/revise`
- `/api/inbox/conversations/:id/translate`
- `/api/analytics/events/batch`
- `/api/version`

This does not change the Ops ownership split above and does not create or convert Operations tasks.
