# Ask Friday Right Panel Focus Contract

Date: 2026-05-29
Status: backend contract slice; frontend wiring pending

## Purpose

The FAD V2 direction uses one shared Ask Friday right panel across modules. The panel should know where the operator is working, what object is selected, and what safe page actions are available, without sending raw DOM, private screenshots, or whole module state to the model.

This file defines the compact focus envelope accepted by `/api/friday/ask`.

## Contract

Frontend may send `focus` with any subset of these fields:

```json
{
  "module": "operations",
  "surfaceId": "fad_ops_assistant",
  "host": "fad_right_panel",
  "route": "/fad?m=operations",
  "pageUrl": "/fad?m=operations&view=schedule",
  "view": "schedule_planner",
  "threadId": "web-00000000-0000-0000-0000-000000000000",
  "focusMessageId": "message_123",
  "teamTarget": "channel:ops",
  "focusedObject": {
    "type": "task",
    "id": "task_123",
    "label": "Fix AC at GBH-C8"
  },
  "selection": {
    "selectedIds": ["task_123"],
    "cursorRange": null,
    "summary": "Three unassigned tasks selected."
  },
  "visibleState": {
    "summary": "Weekly schedule view with unassigned tasks visible.",
    "activeTab": "schedule",
    "filters": {
      "date": "2026-05-29",
      "team": "field"
    },
    "counts": {
      "tasks": 18,
      "unassigned": 3
    }
  },
  "allowedActions": [
    "create_task",
    "assign_task",
    "apply_schedule_after_approval"
  ],
  "privacyClass": "staff_private",
  "stalenessMs": 1500
}
```

## Backend Behavior

- The backend sanitizes and caps every field before including it in `operatorFocus`.
- `module`, `surfaceId`, `view`, `route`, `pageUrl`, `threadId`, `teamTarget`, and `focusedObject.type` can force-load the relevant context module.
- Focus only loads existing registered context families: `inbox`, `team`, `operations`, `hr`, `reviews`, `design`, `reservations`, and `properties`.
- `threadId` continues to force focused Inbox context.
- `teamTarget` continues to force TeamInbox context through staff visibility gates.
- `visibleState` is attention context only. The model must still use `context.sections` and owning module tools for operational truth.

## Safety Rules

- Do not send raw DOM, raw screenshots, full table rows, secrets, access codes, payment data, owner-private data, or guest-sensitive private content in `focus`.
- Send IDs, filters, selected IDs, counts, and compact human-readable summaries.
- Browser-provided `allowedActions` is advisory. Server-side action policy and module APIs remain the enforcement layer.
- If `focus.stalenessMs` is high or context loaders fail, Ask Friday should say that its page context may be stale.

## Frontend Wiring Notes

- The shared panel should always send `module`, `host`, `route` or `pageUrl`, and `view`.
- Module surfaces should add IDs instead of copied object bodies:
  - Inbox: `threadId`, `focusMessageId`, optional `focusedObject.type = "thread"`.
  - TeamInbox: `teamTarget`, optional `focusMessageId`.
  - Operations: task IDs, date filters, staff filters, view name, visible counts.
  - Reservations: reservation IDs and date window.
  - Properties: property/listing IDs or property codes.
- The right panel can be one UI surface while Core routes to the smallest relevant context module behind it.

## Current Implementation

Implemented in:

- `backend/src/fad/friday.js`
- `backend/src/fad/friday.test.js`

Verification:

- `npm --prefix backend test -- src/fad/friday.test.js`
- `npm --prefix backend run build`
- `git diff --check`
