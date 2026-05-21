# Operations / Breezeway Cutover Sprint Log

## 2026-05-21 Wave 1 Mini-Research

- Worktree is isolated at `/Users/judith/.codex/worktrees/7fa0/friday-admin-dashboard`, detached at `origin/fad-rebuild` (`e9ecfbb`), avoiding the main checkout used by another FAD session.
- Required research docs exist only in the main checkout as untracked/local files; read them from `/Users/judith/repos/friday-admin-dashboard/docs/research/` without copying unrelated state.
- `fad-rebuild` currently has fixture-backed Operations (`tasks.ts`, `breezeway.ts`, `OperationsModule.tsx`) but no API task service/client files.
- `origin/fad-design-os-v01-frontend` has the reusable task backend/client foundation, but its backend depends on broader branch infrastructure, so Wave 1 must port the task files and adapt the smallest support layer for `fad-rebuild`.
- Feature Catalog reuse: keep the existing FAD dashboard shell and use the Playwright audit harness pattern later for 320/375/430/768/desktop verification.
- Notion scope confirms Operations is tenant-scoped, mobile field execution is distinct from desktop command center, and `Notifications` remains separate from TeamInbox.
- Breezeway evidence shows the v1 backbone needs task details, source metadata, filters, comments, costs, status updates, and mobile-safe execution primitives before deeper supplies/offline/push work.
- External PWA research confirms offline queue must be app-visible first; Background Sync and web push are progressive enhancements because support is uneven across browsers.
- Wave 1 decision: reuse/extend the design-branch task service, enforce canonical Operations status names, add `external_ref` idempotency, and swap Operations task mutations through the adapter boundary without touching Inbox-owned files.

## 2026-05-21 Wave 2 Mini-Research

- Current `fad-rebuild` has Operations overview/all/issues/approvals/roster/insights/settings, but no role-gated `My tasks` or `My history`; field users can still reach a broad task board if the tab exists.
- Prior `origin/fad-design-os-v01-frontend` has a useful mobile `MyTasksPage` prototype, but it uses older status semantics and lacks Wave 2 filters/history; reuse the shape, not the branch wholesale.
- Feature Catalog says to stay inside the existing FAD shell/module routing and use the Playwright viewport audit pattern for 320/375/430/768/desktop QA.
- Notion Mobile UX Doctrine and PWA addendum lock the product direction: one hierarchy per phone screen, role-scoped daily execution, visible loading/error/offline states, and no desktop squeeze-down.
- Breezeway mobile evidence shows the relevant patterns: My Tasks date tabs, filters, due cards with status/priority/reservation chips, My History with completion duration, and manager Dashboard agenda rows.
- PWA shortcut research confirms manifest shortcuts must stay within app scope and are surfaced only where browser/OS support exists; add direct `My Tasks` and keep Notifications as progressive app entry points.
- Accessibility references reinforce 44px practical field controls even though WCAG 2.2 minimum target size is lower; use large mobile buttons/chips for task actions and filters.
- Wave 2 decision: extend the existing Operations module with role-gated tabs, assigned-only field visibility, mobile dashboard/list/history surfaces, and PWA shortcuts without touching Inbox-owned files or adding a second task system.

## 2026-05-21 Wave 2 Checkpoint

- Implemented field-only `My tasks` / `My history`, manager dashboard agenda, PWA shortcut updates, and Operations-only live date handling.
- No Inbox-owned files touched; Operations stayed on the Wave 1 `/api/tasks` adapter.
- Visual QA screenshots live in `docs/handover/qa-screenshots-2026-05-21-wave2/`; metrics show 0 document overflow, 0 Operations overflow, and 0 small targets inside Operations surfaces.
- Typecheck and frontend build passed after the final 320px task-detail and primary-action layout fixes.

## 2026-05-21 Wave 3 Mini-Research

- Current `TaskDetail.tsx` has API-backed status buttons, comments, costs, AI suggestions, reservation context, and attachment placeholders, but no execution timer, mutation state, summary editor, source details, or access gate.
- `origin/fad-design-os-v01-frontend` has the same older detail shape with legacy `todo` / `awaiting_approval` statuses, so Wave 3 should extend the rebuilt adapter surface instead of porting branch JSX wholesale.
- Feature Catalog reuse remains the viewport/overflow/touch-target Playwright audit pattern; dictation is useful for later report/comment fields but is not needed for the execution-detail base.
- Notion Mobile UX Doctrine and PWA addendum require one hierarchy per phone screen, visible task actions, large controls, and honest queued/failed states for start-stop, completion, comments, photos, and expenses.
- Breezeway mobile evidence shows the target detail structure: property header, priority/status, reservation block, requirements/attachments/comments entry points, sticky Complete/timer controls, Summary editor, and Details/source metadata.
- Property access patterns already hide access cards for Field with a day-of-task message; Wave 3 should keep secrets out of Operations UI and show only a policy/access-window state until the vault-backed access endpoint exists.
- External platform research: `capture="environment"` is a progressive hint on mobile file inputs, Page Visibility should prevent trusting client intervals as authoritative background time, and WCAG 2.2 target-size guidance supports maintaining 44px+ field controls for primary actions.
- Wave 3 decision: implement executable task detail in-place using `/api/tasks` status/spent-minutes/comments, persist completion summaries as task comments, and make evidence/access gaps explicit without adding a second task system or touching Inbox-owned files.

## 2026-05-21 Wave 3A Checkpoint

- Implemented task execution detail in `TaskDetail.tsx`: start/pause/resume/block/complete, manager close/reopen with confirm-close, timer/spent-minute patching, summary comments, sync/saved/queued/failed state, evidence local queue, source metadata, property context, staff-safe reservation context, and access-window policy messaging.
- Patched the backend task lifecycle so reopening from `closed` back to an active status clears `completed_at`.
- Field staff remain limited to assigned task execution; manager/supervisor close/reopen stays role-gated; no field create/schedule/create-and-complete path was introduced.
- Sensitive property access values are never rendered; field access only shows an assigned/time-window policy state, while managers see audit policy text without codes.
- Visual QA screenshots live in `docs/handover/qa-screenshots-2026-05-21-wave3a/`; metrics show 15 screenshots with 0 document overflow, 0 Operations overflow, and 0 task-detail small targets across 320/375/430/768/1440.
- Typecheck and frontend build passed after final mobile target and summary-editor layout fixes.

## 2026-05-21 Wave 3B Mini-Research

- Current `CreateTaskDrawer.tsx` already routes through `/api/tasks`, but it is desktop-shaped, uses hardcoded demo dates in the NL parser, and does not distinguish field reporting from manager scheduling.
- Current Operations already has a manager-only reported-issues triage page; Wave 3B should add field-origin issue creation without adding another task backend or touching Inbox-owned proposal code.
- Breezeway missed-mobile evidence shows a property-first flow: plus button, property search, priority chips, department/subdepartment/template, title/description/element/attachment/tag/requester, due date/time, assignee picker, and separate `Report` / `Schedule` actions.
- FAD policy differs from Breezeway: field staff must not see create-and-complete or free scheduling; standalone field reports require a property and description and must not reveal reservation/access context.
- Feature Catalog `voice-dictation-hook` is available on `origin/fad-design-os-v01-frontend`, but it needs `/api/transcribe`, Gemini env, and auth/rate-limit behavior, so it is deferred out of this focused slice.
- Notion Mobile UX Doctrine keeps the mobile form to one hierarchy per screen, persistent labels, large touch controls, visible sync failure, and no cramped nested modals.
- External platform check: native `datetime-local` normalizes value format but has browser-specific UI and no timezone payload; Wave 3B stores date/time separately through the existing task adapter.
- Wave 3B decision: extend `CreateTaskDrawer` with role-aware variants for manager scheduling, standalone field issue reporting, and assigned-task issue reporting, all backed by `createTask`.

## 2026-05-21 Wave 3B Checkpoint

- Implemented role-aware Operations reporting/scheduling through the existing `/api/tasks` adapter without touching Inbox-owned files or adding a duplicate task system.
- Field standalone issue reports now require property/title/description, create unassigned `reported` tasks with `source = reported_issue`, and deliberately omit reservation/access context.
- Assigned-task issue reports inherit property/reservation context from the assigned task, close the task detail before opening the report drawer, and include safe provenance text without guest/access details.
- Managers can schedule from mobile with property search, priority chips, department/subdepartment, template, element/category, tags, requester, date/time, minutes, grouped assignee picker, and `Assign to me`.
- The global bug-report FAB is hidden while Operations create/report drawers are open, fixing a visual-QA failure where it intercepted the sticky Schedule button.
- `createTask` now passes `template` to the backend task service; fixture staff ids for assignees/requesters are still filtered by the adapter until production auth/users provide UUIDs.
- Visual QA screenshots live in `docs/handover/qa-screenshots-2026-05-21-wave3b/`; metrics show 9 screenshots with 0 document overflow, 0 Operations/drawer overflow, and 0 small targets across 320/375/430/768/1440.
- Typecheck, frontend build, and backend task-service syntax check passed.

## 2026-05-21 Wave 4 Mini-Research

- Current `TaskDetail.tsx` has comments and mention rendering, but comment send does not parse mentions or emit TeamInbox/Notifications events.
- Backend `POST /api/tasks/:id/comments` already accepts a `mentions` array, so the bridge can stay on the existing task comment endpoint.
- `teamInbox.ts` already has `task_link` message kind, `mentions`, and `linkedTaskId`; `TeamInbox.tsx` renders regular text/call/roster messages but not task-comment cards yet.
- `notifications.ts` already models `isMention`, module links, read state, local context, and a rev subscription; it lacks archive state and dynamic task-comment mention notifications.
- Breezeway notification screenshot `IMG_3252.png` shows Inbox/Archived tabs, horizontal filters for All/Mentions/Comments/Watching/Department, long comment previews, unread dots, and archive controls.
- Notion/plan doctrine: task comments remain source-of-truth; TeamInbox/Notifications are event surfaces with backlinks to the exact task/comment, not duplicate threads.
- Feature Catalog did not have a more specific task-comment bridge; the existing voice dictation hook remains useful later for comment input but is deferred because Wave 4 is event plumbing.
- External platform research confirms browser/system notifications are permission- and support-dependent, so this slice keeps FAD in-app Notifications first and leaves push for later.
- Wave 4 decision: implement a local idempotent task-comment mention bridge, wire comment mention picker/parsing, add TeamInbox task-comment card rendering, and upgrade Notifications with archive/category filters plus expandable comment previews.

## 2026-05-21 Wave 4 Checkpoint

- Implemented task-comment mention parsing, mention chips, and API `mentions` payloads in the Operations task detail composer.
- Added an idempotent local task-comment bridge: one TeamInbox `task_link` card per comment and one targeted Notification per mentioned user.
- TeamInbox now merges dynamic task-comment messages with seeded team messages and shows the newest task event first with task/property/comment backlinks.
- Notifications now has Inbox/Archived tabs, All/Mentions/Comments/Watching/Department filters, expandable long previews, archive/restore actions, and task/comment backlinks.
- Backlinks from Notifications/TeamInbox can open Operations directly by task query param; task comments remain the source-of-truth thread.
- Fixed the notification row nested-button hydration warning by making rows keyboard-accessible containers while keeping Archive/Read as real buttons.
- Visual QA screenshots live in `docs/handover/qa-screenshots-2026-05-21-wave4/`; 320/375/430/768/1440 checks showed no horizontal overflow, and the remaining tiny checkbox is inside a larger label target.
- Typecheck, frontend build, backend task-service syntax check, and browser console rerun passed after the row-container fix.

## 2026-05-21 Wave 4B Mini-Research

- Current `fad-rebuild` already has the backend contract this slice needs: `POST /api/tasks` accepts `external_ref`, returns the active existing task for repeat calls, and defaults `source = inbox_ai` to `status = reported`.
- Current frontend task client passes `externalRef`, but repeated idempotent creates still prepend duplicate cache rows locally; fix that before adding any Inbox AI conversion helper.
- `origin/fad-design-os-v01-frontend` only has the older `createTask` task client shape for this area, so the rebuilt adapter should be extended in place instead of branch-merging.
- The cutover plan is explicit: Inbox owns pending-action detection/proposal/UI; Operations owns only the idempotent conversion into real tasks and manager triage of those task records.
- Notion sprint scope confirms pending actions should not become a standalone Inbox task panel; action resolution belongs in Operations/Reported Issues while TeamInbox remains internal comms.
- Breezeway mobile evidence supports property-first, priority-visible triage and notification/comment backlinks, but FAD must keep field staff out of pending-action creation/scheduling paths.
- Feature Catalog reuse is the idempotent/shared-state write-safety mindset plus the existing viewport audit harness; no more specific pending-action component exists.
- OWASP API guidance keeps object-level authorization central for ID-bearing APIs, so this slice stays tenant-scoped and does not expose a broad pending-action lookup surface.
- IETF/MDN idempotency guidance supports deterministic retry keys for unsafe methods; FAD uses `external_ref = pending_action:<id>` as the task-domain idempotency key rather than a generic header.
- Wave 4B decision: add an Ops-owned pending-action-to-task mapper, upsert idempotent create results in the task cache, and add a manager-only Inbox AI task triage queue without editing Inbox-owned files.

## 2026-05-21 Wave 4B Checkpoint

- Added `pendingActionToTaskInput` / `createTaskFromPendingAction` in the Operations task client, mapping pending action IDs to `external_ref = pending_action:<id>`, `source = inbox_ai`, and `status = reported`.
- Fixed the API task cache so idempotent create retries replace existing task rows instead of duplicating them locally.
- Added a manager-only Operations `Inbox AI` tab backed by live `/api/tasks` records filtered to `source = inbox_ai` and `status = reported`.
- Manager triage now supports accept, dismiss, stale, duplicate, and link-existing actions on converted Inbox AI task records, including bulk accept/dismiss/stale.
- Field role routing remains assigned-only: forcing `sub=inbox-ai` lands field users on `My tasks`; no Inbox AI triage or All Tasks surface is visible.
- No Inbox-owned pending-action detector/proposal/UI files were touched; Inbox can call the exported conversion helper or send the equivalent `POST /api/tasks` payload.
- Visual QA screenshots live in `docs/handover/qa-screenshots-2026-05-21-wave4b/`; 320/375/430/768/1440 checks showed 0 document overflow, 0 triage-pane overflow, and 0 triage-pane small targets.
- Browser interaction check passed with a local mock API: page identity, nonblank render, no console errors, checkbox selection, bulk accept, and manager source/detail controls.
- Typecheck, frontend build, backend task-service syntax check, and field role-gate smoke passed.
