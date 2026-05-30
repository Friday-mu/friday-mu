# Ops Desktop Audit Handover - 2026-05-22

Worktree: `/Users/judith/.codex/worktrees/fad-ops-desktop-audit-20260522-2`
Branch: `codex/fad-ops-desktop-audit-20260522-2`
Base: `origin/fad-rebuild@8b3d718468fafc0300ba3a2ea2d2bc561a7fdcd6`

## Scope

Desktop-first Operations audit and small verified patches only. No deploy. No push.

## Source checks

- Fresh worktree was created from latest `origin/fad-rebuild`.
- `git ls-remote origin refs/heads/fad-rebuild` returned `8b3d718468fafc0300ba3a2ea2d2bc561a7fdcd6`, newer than the required `d9ae886`.
- Notion connector was attempted for current Ops/Breezeway scope, but MCP startup failed with `timed out awaiting tools/list after 30s`. Local mirrored docs were used instead.

## Live / local findings

- Live Overview had an error boundary. Console showed null-shape crashes from imported task rows: `subdepartment.replace` and later `localeCompare`.
- Live All Tasks loaded, but completed historical imports could still read as operationally overdue in some UI paths.
- Live Schedule loaded but repeated Date/Time/Assignee controls inside each task card, making the planner visually heavy.
- Field My Tasks still felt action-heavy; "Report issue" repeated across the list.
- Comment mention chips were always visible and too large for the task-detail comment flow.
- Local docs confirmed the locked decisions: Ops owns task execution/scheduling; Breezeway stays internal provenance; operator-facing labels should be `Imported`, `Reservation`, `Reported`, etc.; schedule should stay compact and drawer-first.

## Applied changes

- Replayed the three previously verified commits onto the fresh base:
  - `fix(ops): preserve my tasks routes and import titles`
  - `fix(fad): tighten field staff visibility`
  - `fix(ops): reduce desktop schedule noise`
- Added a new repair slice:
  - Hardened task API mapping against null/missing imported fields.
  - Added safe display/sort helpers for property, subdepartment, dates, timestamps, status, and source labels.
  - Stopped sparse imported tasks from crashing Overview, My Tasks, History, Schedule, Reported Issues, Approvals, and task detail.
  - Kept Breezeway operator labels hidden behind `Imported`.
  - Reduced field task-card action noise by shortening the per-card issue action to `Issue`.
  - Hid the task-comment mention picker until the operator types `@`, and made picker buttons smaller on desktop while keeping mobile tap targets.

## Verification

- `cd frontend && npx tsc --noEmit --pretty false --incremental false`
- `cd frontend && npm run build`
- `git diff --check`
- Local Playwright against `http://127.0.0.1:3101` with mocked production-shaped data:
  - Overview, All Tasks, Schedule, Reported Issues: no error boundary, no unauthorized state, no Breezeway text, no horizontal document overflow.
  - Field My Tasks: no Reservations/Finance sidebar exposure in screenshot, one global `Report issue` label, compact per-card `Issue` action.
  - Task detail comments: mention picker count `0` before typing `@`, then shows matching staff (`@Maya`) after typing `@`.

Screenshot evidence is under:

- `output/playwright/fad-ops-desktop/final-smoke/`
- `output/playwright/fad-ops-desktop/full-audit/`

These screenshots are local evidence artifacts and are not staged by default.

## Remaining plan

1. Desktop UX redesign pass, screen by screen:
   - Overview: reduce dashboard cards and make manager decisions more obvious.
   - My Tasks / History: tighter task cards, clearer status/time sorting, fewer repeated actions.
   - Schedule: make the laptop viewport more useful without horizontal hunting; status color should carry lifecycle meaning, not everything green.
   - Reported Issues: distinguish new field reports from historical accepted imports.
   - Roster / Insights: restore useful AI roster/analysis affordances, but base them on real HR/tasks data.
   - Settings: clarify which workflow rules are live, planned, or automatic.
2. Product/data slices:
   - Team online/offline availability for website handoff is still a separate priority and was not touched here.
   - Ops task source/scope model still needs the planned `field|office` and `property|reservation|building|internal|project` split.
   - Breezeway assignee backfill and HR/user identity cleanup remain data-side follow-ups.
   - AI task creation should be designed as a real task-create assistant on top of `/api/tasks`, not a separate task system.
