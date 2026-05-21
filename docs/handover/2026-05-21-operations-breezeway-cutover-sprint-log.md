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

## 2026-05-21 Wave 5 Mini-Research

- Current `fad-rebuild` has `template` on tasks and a manager template picker, but no persisted task requirements, checklist state, required evidence, or completion validation.
- Current `TaskDetail.tsx` already has execution summary, local evidence queue, costs, timer/spent minutes, and status mutation hooks; Wave 5 should attach requirements there rather than create a second task execution system.
- `origin/fad-design-os-v01-frontend` has the same broad task fixture shape but no reusable checklist/requirement model for this slice.
- Feature Catalog has no FAD-specific checklist primitive; reuse the existing adapter boundary and viewport QA harness pattern.
- Notion Mobile UX Doctrine requires persistent labels, large controls, inline errors, one hierarchy per phone screen, and no fake complete states.
- Breezeway evidence shows task detail rows for Costs, Supplies, Task details, Task tags, Summary, comments, attachments, and a sticky Start/Complete model; FAD should preserve the useful task-specific requirement concept but not Breezeway's field create-and-complete shortcut.
- External platform/accessibility research reinforces native form semantics plus explicit text errors for validation; required completion blockers must be visible in the task detail, not only toast/color state.
- Wave 5 decision: add persisted `requirements` / `requirement_state`, derive core templates for cleaning/inspection/maintenance/buildout/amenities, and block completion until required requirements are satisfied.

## 2026-05-21 Wave 5 Checkpoint

- Added persisted task `requirements` and `requirement_state` JSONB columns through migration 052 and wired them through `/api/tasks` create/patch/detail responses.
- Added core Operations requirement templates for Standard clean, Post-clean inspection, Preventative maintenance, Home buildout, and Amenities form, with legacy template aliases preserved.
- Manager scheduled tasks now attach generated requirement definitions through the existing task adapter; field issue reports stay manager-triage-first and do not create executable checklist shortcuts.
- Task detail now shows a first-class Requirements section, manual checklist/supply confirmation, manager waivers, automatic photo/file/expense/time/summary gates, and inline completion blockers.
- Completion now refuses to set `status = completed` while required requirements are missing; the blocker is visible in the execution sync state and requirements panel, not only toast state.
- Browser interaction QA used a local mock `/api/tasks` task: missing requirements blocked Complete, marking reset/supplies, waiving photo, and adding a summary allowed completion to `completed`.
- Responsive QA screenshots live in `docs/handover/qa-screenshots-2026-05-21-wave5/`; 320/375/430/768/1440 showed 0 document overflow, 0 task-detail overflow, and 0 small actionable targets.
- Typecheck, frontend build, restored `next-env.d.ts`, rerun typecheck, backend task-service syntax check, and `git diff --check` passed.

## 2026-05-21 Wave 6 Mini-Research

- Current `fad-rebuild` has task costs persisted in `task_costs` plus `AddCostDrawer`, but no supply catalog, stock locations, task supply movements, or inventory events.
- `TaskDetail.tsx` already has a clear Costs section and Wave 5 Requirements can gate supplies manually; Wave 6 should add actual task-linked supply capture next to costs, not another execution surface.
- `origin/fad-design-os-v01-frontend` matches the current Add Cost implementation and has no supply/inventory primitive to port.
- Feature Catalog has only a currency-picker note relevant to MUR/current rates; no inventory/stock movement primitive exists, so model the domain locally.
- Notion Mobile UX Doctrine keeps this to one mobile hierarchy, visible primary actions, persistent labels, inline errors, and 44-48px targets.
- Breezeway mobile evidence shows `Costs` and `Supplies` as first-class task rows below task context, with a sticky Start/Complete model; FAD should surface supplies in task detail without copying Breezeway's field create-and-complete shortcut.
- Existing FAD task cost-to-Finance brief already defines owner-billable cost flow; Wave 6 should preserve that path and add inventory movements as separate downstream events.
- MDN/W3C checks: mobile quantity/cost inputs should use native labels, `inputmode`/numeric hints, and text error messages associated near invalid fields instead of color-only state.
- Wave 6 decision: add `task_supplies` persistence plus a frontend supply catalog/loadout helper, show SRL/welcome-pack suggested loadouts from property size, and let field staff record used quantities/billable supply lines from the task.

## 2026-05-21 Wave 6 Checkpoint

- Added migration 053 with `task_supplies` and `stock_movements`, preserving task-linked execution while giving Inventory a downstream ledger.
- Extended `/api/tasks/:id` detail responses with supplies and added `POST /api/tasks/:id/supplies`; owner-billable supply use can create a linked material cost line for the existing Finance path.
- Added a starter supply catalog/loadout helper tagged `@demo:data` as `PROD-DATA-50`; `frontend/DEMO_CRUFT.md` was updated in the same checkpoint.
- Task detail now shows Supplies beside task execution/costs, suggested SRL/welcome-pack loadouts from property capacity/task type, recorded supply rows, stock location, owner-billable state, and cost-line creation.
- Supply requirements now satisfy automatically when a task has a recorded supply line; manual confirmation remains available for exception cases.
- Browser QA with mock task API: opened task, used suggested Bath towel loadout, marked it owner-billable, verified supply row, linked cost row, requirements `3/3`, and task completion to `completed`.
- Responsive screenshots live in `docs/handover/qa-screenshots-2026-05-21-wave6/`; 320/375/430/768/1440 checks showed no visible horizontal overflow or clipped primary controls.
- Verification passed: backend task-service syntax check, frontend typecheck, frontend build, restored `next-env.d.ts`, rerun typecheck, and `git diff --check`.

## 2026-05-21 Wave 7 Mini-Research

- Current `fad-rebuild` already has manager Overview, All Tasks, Reported Issues, Inbox AI triage, Approvals, Roster, and Insights; Wave 7 should connect these into one manager workbench instead of creating a parallel Operations dashboard.
- Current task data exposes status, source, due date, risk flags, assignees, elapsed/estimated minutes, requirements, and supplies; this is enough for stale-open, open issue, Inbox AI, staff load, and supply-readiness signals without backend churn.
- `origin/fad-design-os-v01-frontend` has no better manager workbench primitive to port; its Operations files mainly overlap with the current task foundation.
- Feature Catalog confirms the dashboard shell is hardcoded module routing on `fad-rebuild`; this slice should pass subpage navigation through the existing Operations module boundary.
- Notion Mobile UX Doctrine keeps the phone rule: one hierarchy per screen, frequent actions visible, persistent labels, and 320/375/430/768/desktop verification.
- Breezeway mobile evidence shows a property-grouped daily dashboard with status counts, due-time slots, issue/comment/attachment indicators, and quick task creation; FAD should add manager-only exception lanes above the agenda without exposing field create/schedule controls.
- W3C WCAG 2.2 target-size guidance supports maintaining at least 24px targets with spacing, while FAD doctrine keeps manager mobile actions at the existing 44px control rhythm.
- MDN `role=status` guidance is relevant for non-interrupting reminder/count updates, but this slice stays visible/in-app rather than adding push notifications.
- Wave 7 decision: add manager workbench signals and actions to Overview, with stale-open reminders, reported issues, Inbox AI reported tasks, supply-readiness flags, and staff load/reassignment shortcuts wired to existing subpages.

## 2026-05-21 Wave 7 Checkpoint

- Added a pure `managerWorkbench` signal helper for stale-open reminders, reported issue triage, Inbox AI reported tasks, supply-prep flags, unassigned tasks, and staff load.
- Added a manager-only `Fix today` workbench to Operations Overview; field users still route only to My Tasks/My History and do not get manager scheduling or triage controls.
- Workbench actions route into existing Operations surfaces: stale task opens the task drawer, reported issues opens Reported Issues, Inbox AI opens the Ops-owned triage queue, and Roster opens staff context when permitted.
- Stale-open logic stays in-app for this slice: blocked, over-estimate, old in-progress, paused, and past-due tasks are visible reminders without adding push notifications yet.
- Supply-prep flags reuse Wave 6 supply loadout/requirements data and do not create a second inventory system.
- Mobile utility buttons in the shell brand/utility area now keep 44px targets at phone widths after the 320px QA pass found squeezed icon buttons.
- Browser QA used mock `/api/tasks` data covering stale, blocked, reported issue, Inbox AI, supply, unassigned, and staff-load cases; console errors/warnings were 0 in the Browser run.
- Field role-gate smoke forced `sub=overview` while switched to Field and rendered assigned-only My Tasks with no manager workbench.
- Responsive screenshots live in `docs/handover/qa-screenshots-2026-05-21-wave7/`; 320/375/430/768/1440 showed 0 horizontal overflow and 0 small targets inside the manager workbench.
- Residual shell note: the global Ask Friday search input itself measures 21px high at 768/desktop, but it sits inside the larger header search pill and was not changed in this Operations slice.
- Verification passed: frontend typecheck, frontend build, restored `next-env.d.ts`, rerun typecheck, and `git diff --check`.

## 2026-05-21 Breezeway Historical Import Mini-Research

- Current `fad-rebuild` task schema already has `source = breezeway`, `bz_id`, and tenant-scoped `external_ref`; the import should extend that model, not create a second historical task system.
- Sample Breezeway CSV exports have 36 columns including Task ID, property IDs/names, lifecycle dates/times, assignees/employee IDs, summary/description/tags, time, rate/cost, currency, and bill-to.
- Existing samples contain `Finished`, `Closed`, and `Not Started`; map to `completed`, `closed`, and `scheduled`, but leave historical open rows unassigned unless an explicit user map resolves them.
- Current backend has no durable source-payload/import-batch fields, so add additive task provenance columns and keep original Breezeway timestamps separate from FAD import audit timestamps.
- Feature Catalog/local search found no reusable import pipeline; reuse the Operations task service and existing `external_ref` idempotency pattern.
- Notion confirms Supplies/Tasks migration should be CSV-first and task-linked, with Breezeway as a temporary source only; Running Decisions now says Operations is already on the Breezeway replacement path.
- Breezeway API docs confirm List Tasks filters by Breezeway or reference property IDs and auth tokens are 24h with a 1 request/min token endpoint; API validation should be optional and token-cached.
- OWASP CSV Injection guidance means any preview/export-style report must guard spreadsheet formula-leading values; imported text also needs sensitive access/Wi-Fi/lockbox redaction.
- Decision: implement CSV preview/apply tooling with default CSV-only behavior, idempotent `external_ref = breezeway:<Task ID>`, source provenance, unknown mapping reports, and a separate optional API validation script.

## 2026-05-21 Breezeway Historical Import Checkpoint

- Added migration 054 for import batch ID, redacted source payload, and original Breezeway source timestamps on `tasks`.
- Added Operations-owned CSV preview/apply service and manager-gated routes under `/api/tasks/imports/breezeway/*`.
- Added CLI preview/apply tooling plus a temporary opt-in Breezeway API validator that reads Keychain only when explicitly invoked.
- Preview reports include total/valid/insertable rows, duplicate task IDs/external refs, existing refs, unknown properties/users/statuses/priorities/departments, empty critical fields, skipped rows, redactions, formula escapes, and sanitized samples.
- Sample exports parsed cleanly: 8/8 and 40/40 valid with 0 skipped; property/user mappings remain unresolved until a confirmed map is provided.
- Apply mode inserts only non-existing `external_ref = breezeway:<Task ID>` records; historical open rows remain unassigned by default to avoid field-staff-visible stale work.
- Fixed a legacy `backend/src/server.ts` TypeScript shorthand bug so backend `npm run build` is green.
- Live coordination note: after Ops `87b26bc` was deployed, another session deployed frontend `35d86ef` from `origin/fad-design-os-v01-frontend`; do not overwrite it without merging/coordination.

## 2026-05-21 Inbox Frontend/Ops Backend Coordination Mini-Research

- `origin/fad-rebuild` is clean at `45e12f9`; the selected Inbox frontend files now match paused Inbox branch `e8e7a84`.
- Full `origin/fad-design-os-v01-frontend` merge is still unsafe: it deletes Ops Wave 5/6/Import files and replaces task/backend migrations.
- The live symptom to fix in this Ops worktree is `/api/inbox/*` and `/api/team/*` returning 404 after the Inbox frontend port.
- Existing `backend/server.js` already has a GMS-backed `/api/conversations` adapter, so Inbox guest read routes should reuse that shape instead of importing the design backend wholesale.
- TeamInbox persistence tables are not present on `fad-rebuild`; Team read routes should return truthful empty compatibility payloads while mutating/send routes fail explicitly.
- Keep send/draft/teaching actions guarded as not implemented until the Inbox backend can be integrated without risking false live sends.
- Preserve Operations ownership of `/api/tasks`, migrations 052-054, Breezeway import tooling, and manager/field task execution surfaces.

## 2026-05-21 Inbox Frontend/Ops Backend Coordination Checkpoint

- Added an authenticated `/api` Inbox compatibility router without touching Ops task execution code.
- Ported the latest Inbox-owned `FridayConsult.tsx` frontend fix from `e8e7a84`, keeping full-thread intent as a backend flag instead of duplicating the entire thread into the prompt.
- `/api/inbox/conversations` and detail reads now reuse the existing GMS `/pending` bridge and return the shape expected by the ported Inbox frontend.
- `/api/team/*`, `/api/inbox/website/threads`, consult history/session reads, and read/unread calls now return non-404 compatibility payloads so the UI can render cleanly.
- Mutating/send routes for drafts, outbound send, Friday Consult, Team creation/uploads/reactions, and website replies return explicit `501 not_implemented` responses to avoid false live sends or fake persistence.
- Kept TeamInbox persistence as a later backend slice because `fad-rebuild` has no team/website inbox tables and the design branch backend conflicts with Ops migrations.
- Raised the global Express rate-limit default to 1000 requests per 15 minutes via `API_RATE_LIMIT_MAX` after browser QA hit 429s during normal Inbox reload/poll bursts.
- Mock-GMS route QA confirmed no `/api/inbox/*` or `/api/team/*` 404s and no bad statuses across 80 requests in 320/375/430/768/1440 width sweeps.
- QA screenshot: `docs/handover/qa-screenshots-2026-05-21-inbox-compat/fad-inbox-compat-375.png`.

## 2026-05-21 Production Reconciliation

- `origin/fad-rebuild` is pushed through `51de64c`.
- `admin.friday.mu/fad` is live and returns 200; `/var/www/fad/version.json` reports frontend version `e8e7a84`, which includes the latest paused Inbox frontend fix ported here.
- Live `fad-backend` is an rsynced runtime tree, not a git checkout; it already has full `/api/inbox/*`, `/api/team/*`, `/api/outbound/send`, and `/api/tasks` routes mounted.
- Live public HTTPS route smoke returns `401 Unauthorized` for `/api/inbox/conversations` and `/api/team/channels`; `/api/inbox/website/threads` returns `200` with website-thread JSON. None of the checked routes return `404`.
- I did not overwrite `/var/www/fad-backend` with this `fad-rebuild` backend tree because live currently contains the fuller Inbox backend; doing a blind backend deploy from this branch would be a regression.
