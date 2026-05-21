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

## 2026-05-21 Backend Full-Convergence Mini-Research

- Current Ops worktree is clean and detached at `origin/fad-rebuild` `0f39b15`; the main checkout still has local `fad-rebuild` checked out at an older local commit, so this worktree remains the integration workspace.
- Live `/var/www/fad-backend` was copied to `/tmp/fad-live-backend-convergence` excluding `.env`, caches, `node_modules`, uploads, and knowledge content; no secrets were imported.
- Production backend is effectively the full design/inbox backend plus Ops task migrations 052/053; the current Ops branch backend is the smaller task/import backend plus a temporary `inboxCompat` bridge.
- `origin/fad-design-os-v01-frontend` has the fuller backend source, additional tests, migration 067, and the paused Inbox route implementations; production has route parity but is missing some tests and migration 067.
- Ops branch has newer Operations-owned pieces not present in design/production: canonical task lifecycle/external_ref edits, Breezeway import migration 054, Breezeway import service/scripts, and task import routes.
- Feature Catalog confirms multi-tenant module gating and AI usage code came from the design backend; keep those route guards when converging rather than flattening everything into the simpler Ops server.
- Notion running decisions confirm FAD stays multi-tenant, FAD is the shared integration owner, TeamInbox is the internal comms surface, and Operations owns real task execution/source conversion.
- Express docs confirm production reverse-proxy settings need deliberate `trust proxy` configuration and security middleware/rate limits; keep the design backend's production middleware posture.
- Decision: seed backend from the full design backend, then layer in production-only Ops task migrations 052/053 and branch-only Ops import/task deltas, deleting the temporary `inboxCompat` bridge once full routes are present.

## 2026-05-21 Backend Full-Convergence Checkpoint

- Converged `fad-rebuild` backend from the full design/inbox backend while preserving Ops task execution, canonical lifecycle, supplies/inventory, and Breezeway import tooling.
- Removed the temporary `backend/src/inboxCompat` bridge because full `/api/inbox/*`, `/api/team/*`, and `/api/outbound/send` routes are now present in source.
- Swapped Ops task auth/assignment notifications onto the design backend auth/email stack instead of keeping the temporary standalone identity helper.
- Redacted imported backend knowledge values for Wi-Fi/access/passcode/lockbox-style fields and verified JSON validity before commit.
- Verified backend build/tests, frontend typecheck/build, route-mount smoke, and pushed convergence commit `a4ed602` to `origin/fad-rebuild`.
- Production DB inspection showed `tasks.status` still used the old `todo` default/check and old open index, so deploying the converged backend requires a forward-only reconciliation migration.
- Added `071_tasks_ops_lifecycle_reconcile.sql` and fixed 051 fresh-migration ordering so canonical status writes happen only after the old check constraint is dropped.

## 2026-05-21 Backend Full-Convergence Live Deploy

- Pushed migration fix commit `9eb54d8` to `origin/fad-rebuild`.
- Backed up live backend runtime to `/var/backups/fad-backend-20260521-150523`.
- Rsynced converged backend source to `/var/www/fad-backend`, preserving live `.env`, `node_modules`, caches, uploads, and generated dist output boundaries.
- Ran `npm install --omit=dev` on the server; npm reports 6 audit vulnerabilities (4 moderate, 2 high), unchanged for this deploy scope.
- Manually ran the migration runner before restart; it applied `054_breezeway_task_import.sql` and `071_tasks_ops_lifecycle_reconcile.sql`.
- Restarted PM2 `fad-backend`; process is online and the boot log reports `74 already-applied, 74 total`.
- Production schema now has canonical task status default `scheduled`, full Ops status check, `external_ref`, Breezeway import provenance columns, and updated open/import indexes.
- Public smoke: `/fad` 200, `/api/version` 200, `/api/inbox/conversations` 401, `/api/team/channels` 401, `/api/tasks` 401, `/api/inbox/pending-actions` 401, `/api/inbox/website/threads` 200; no checked route returned 404.
- Existing Consult/Inbox logs still show full-context timeouts and model length failures; treat Inbox/Consult product behavior as a separate cleanup/rebuild pass, not as protected baseline work.

## 2026-05-21 Breezeway Real CSV Bundle Preview

- Real exports are in `/Users/judith/Desktop/Friday/Friday OS/Ops Module`; old Desktop sample CSVs were not used.
- Added a preview-only bundle script for the five-file Breezeway export set, joining summary/cost/payroll/supplies by `Task ID` and validating custom export enrichment by row order.
- Improved property-code extraction so property values like `VA-4`, `SD-10`, and `GBH-B4 - ...` resolve without a manual map.
- Generated `docs/handover/breezeway-import-preview-2026-05-21/bundle-preview.json` and a README summary.
- Summary export preview: 5,174/5,174 valid rows, 0 existing `external_ref` matches, 2 unresolved property groups, 24 unresolved assignee groups, one unknown priority value (`Watch` on 12 rows).
- Supplemental join preview: cost export has 208 cost/supply-like line rows; payroll has 5,791 assignee/payroll rows; supplies has 1 row; custom export has 5,174 row-order matches, property-code labels on 4,483 rows, and task report links on all rows.
- No production import/apply was run.

## 2026-05-21 Ops Frontend Live Check + Breezeway API Validation

- Investigated the user-visible concern that Ops frontend changes were not obvious on `admin.friday.mu`.
- Live `/version.json` now reports `fad-rebuild` at `9e032dad0269`; `/fad` returns 200 and the live `0~wbfu_3mwmtv.js` chunk hash matches the local exported chunk.
- The matched live chunk contains the new Ops strings: `Manager workbench`, `Supply capture required`, `Inbox AI task proposals`, `My agenda`, and `Source = Inbox AI`.
- If the UI still looks unchanged in-browser, the likely remaining causes are role/subpage gating or a stale service worker/browser cache, not a missing server artifact.
- Judith confirmed current Breezeway import guidance: current CSV folder is `/Users/judith/Desktop/Friday/Friday OS/Ops Module`, summary is primary, custom export is row-order enrichment, skip admin/aggregate rows, and unknown historical assignees should not block import.
- Added a safer temporary API validator that supports `--custom-csv`, `--out`, 24h token caching, direct Task ID retrieval, property validation, import-policy exclusions, and sanitized API field-presence reporting.
- Generated `docs/handover/breezeway-import-preview-2026-05-21/api-validation.json`; it found all 29 CSV Breezeway home IDs in the API, 0 reference-property mismatches, 50/50 sampled importable tasks retrieved, 0 field diffs, and 5,174/5,174 custom rows aligned after redaction-aware title checks.
- API-only enrichment observed in the 50-task sample includes report URLs, assignment objects, created/finished/requested-by objects, photos/tags, and one linked reservation; CSV remains the primary migration source.
- No production import/apply was run.

## 2026-05-21 Breezeway Source-of-Truth Import Preparation

- Extended the Breezeway importer from single summary CSV to the real five-file export bundle: summary, custom, cost, payroll, and supplies.
- Kept CSV as the primary source and API as validation evidence only; no ongoing Breezeway runtime dependency was added.
- Added default import policy skips for Breezeway admin/office rows and aggregate `GBH` rows so field-staff-visible Ops work is created only for actual property tasks.
- Preserved provenance with `source = breezeway`, `external_ref = breezeway:<Task ID>`, `bz_id`, `import_batch_id`, original source timestamps, redacted source payload, task report links, custom/cost/payroll/supply raw context, and idempotent inserts.
- Inserted explicit Breezeway cost and supply lines into Ops child tables during apply; payroll rows remain historical provenance inside `source_payload` rather than creating thousands of labor cost rows.
- Removed Ops demo/static intake data from the frontend by replacing separate `Reported issues` and `Inbox AI` demo pages with one live `/api/tasks` Intake queue for `reported_issue`, `inbox_ai`, `group_email`, and `review` sources.
- Reworked Ops Approvals and Insights to derive from live tasks instead of `APPROVAL_REQUESTS`, `TASK_INSIGHTS`, or `REPORTED_ISSUES` fixtures; Settings remains because it is current workflow policy, not discarded demo content.
- Generated `docs/handover/breezeway-import-preview-2026-05-21/bundle-apply-preview.json`: 5,174 total rows, 4,483 valid/importable rows, 691 policy-skipped admin/aggregate rows, 0 unknown statuses/priorities/departments, 962 sensitive redactions, custom export 5,174/5,174 row-order joinable, 208 explicit cost rows, 1 supply row, and 5,791 payroll provenance rows.
- Verification before apply checkpoint: `backend npm test` passed 18 suites / 76 tests, `frontend npx tsc --noEmit` passed, and `frontend npm run build` passed.

## 2026-05-21 Breezeway Production Import

- Pushed `e4ae355` to `origin/fad-rebuild`, deployed the static frontend to `/var/www/fad`, deployed scoped backend task import files to `/var/www/fad-backend`, and restarted PM2 `fad-backend`.
- Live `https://admin.friday.mu/version.json` reports version `e4ae355`; live chunks include the new `0xt39~6lk80ir.js` Ops bundle and no longer include the previous `0~wbfu_3mwmtv.js` bundle.
- Backups before deploy: `/var/backups/fad-frontend-e4ae355` and `/var/backups/fad-backend-e4ae355`.
- Copied only the current CSV exports from `/Users/judith/Desktop/Friday/Friday OS/Ops Module` to `/tmp/fad-breezeway-import-e4ae355` on the VPS; old Desktop sample CSVs were not used.
- Production preview matched the local readiness report: 5,174 total rows, 4,483 valid/importable rows, 691 policy-skipped admin/aggregate rows, no existing Breezeway external refs, no unknown statuses/priorities/departments, no unknown properties, 22 unknown historical assignee groups, 962 sensitive redactions, and custom export joinable.
- Production apply committed import batch `breezeway-2026-05-21T16-35-33-326Z-384298`: 4,483 tasks inserted, 193 explicit cost rows inserted, 1 supply row inserted, 1 stock movement inserted, 0 failures.
- Direct production DB verification: 4,483 `source = breezeway` tasks, 4,483 `external_ref LIKE 'breezeway:%'`, statuses = 3,770 completed / 344 closed / 342 scheduled / 27 in_progress, 193 Breezeway task costs, 1 Breezeway task supply, 1 Breezeway stock movement.
- Safety verification after apply: 0 imported admin/aggregate policy leaks and 0 source-payload matches for password/passcode/lockbox/gate-code/access-code/key-safe/PIN/Wi-Fi redaction keywords.
- Follow-up live chunk inspection found the old `TASKS` fixture array still bundled as a compatibility fallback; removed those task rows from `_data/tasks.ts` and left only an empty `TASKS` export for legacy imports. `frontend/DEMO_CRUFT.md` now no longer lists `PROD-DATA-2`.

## 2026-05-21 Ops Schedule Calendar Mini-Research

- Current `origin/fad-rebuild` is at `65bac54` and clean in the isolated `/Users/judith/.codex/worktrees/7fa0/friday-admin-dashboard` worktree; no Inbox-owned files need to be edited for this slice.
- Operations already has manager scheduling through `CreateTaskDrawer`, but there is no Ops-owned calendar/schedule tab; the generic Calendar module is not a replacement for task assignment planning.
- Backend `/api/tasks` already supports tenant-scoped `due_after` / `due_before`, pagination, canonical statuses, and PATCH for `due_date`, `due_time`, and UUID assignees, so no duplicate task system or new scheduling endpoint is needed.
- Task list responses include `assignee_display_names`, but the frontend mapper drops them; schedule needs that field so imported/API tasks can show real staff names without relying on demo `TASK_USERS`.
- Breezeway mobile evidence shows day planning needs a date selector, status chips, time column, property/task rows, inline due-time assignment, and a staff selector; desktop per-user day view should be the manager command-center version of that pattern.
- Feature Catalog confirms the FAD shell/module-routing boundary; add this as an Operations subpage rather than changing the global Calendar module.
- Notion/project memory direction still treats FAD as the operations cockpit and Operations as the real task-execution owner; field users stay on My Tasks/My History only.
- External platform research favors explicit schedule controls over first-pass HTML drag/drop because touch, keyboard, and pointer handling need separate rigor in a PWA.
- Decision: ship a manager-only `Schedule` tab backed by `/api/tasks`, grouped by staff/day with unassigned work visible, explicit date/time/assignee controls, and mobile-safe responsive layout.

## 2026-05-21 Ops Schedule Calendar Checkpoint

- Added a manager-only Operations `Schedule` tab; field users still only get `My tasks` and `My history`.
- The schedule is backed by live `/api/tasks` day filters and PATCHes `due_date`, `due_time`, and UUID `assignee_user_ids`; no new task backend or generic Calendar-module dependency was added.
- Added a small Operations staff-directory client for `/api/team/users` and mapped task `assignee_display_names` into the frontend task type so real assignee names show without relying on demo staff IDs.
- Staff Day view shows per-user columns plus Unassigned, with explicit time and assignee controls; Property Day gives a property-grouped scheduling view for the same task records.
- Added an unscheduled open-work queue that can put a reported/scheduled task onto the selected date without bulk-converting history.
- Updated task due-date rendering in All Tasks to use human dates/times instead of raw ISO strings, and changed the Breezeway source label to `Imported` in the UI.
- Browser QA used mocked `/api/tasks` and `/api/team/users`: time edit, assignee edit, unscheduled add-to-date, and Property Day toggle all hit the expected task PATCH paths.
- Responsive QA screenshots live in `docs/handover/qa-screenshots-2026-05-21-schedule/`; 320/375/430/768/1440 checks showed 0 document overflow, 0 Operations overflow, and 0 undersized controls after the final CSS pass.
- Verification passed: `git diff --check`, frontend `npx tsc --noEmit`, and frontend `npm run build`.

## 2026-05-21 Ops UI Cleanup + HR Roster Mini-Research

- Current `fad-rebuild` already has API-backed tasks, but Operations still leaks fixture-era labels/person lookups in TaskDetail, All Tasks filters/cards, Insights, and the Roster page.
- Backend task responses already include source provenance and imported Breezeway enrichment fields; the frontend client does not map them, so enriched history is invisible and raw UUIDs appear when fixture users do not match live users.
- `origin/fad-design-os-v01-frontend` is not a better source for this slice; current `fad-rebuild` has the newer task lifecycle and import/enrichment shape.
- Feature Catalog has generic FAD shell guidance only; no reusable Ops roster/history pattern was found.
- Notion scope confirms pending actions resolve in Operations / Reported Issues, while FAD is the canonical owner for shared integrations and Ops should not expose Breezeway as a permanent runtime dependency.
- Breezeway evidence supports source metadata, comments, attachments, assignments, and history, but FAD should present those as imported provenance rather than live Breezeway surfaces.
- HR backend exists at `/api/hr/staff`, but its permission matrix is narrower than the frontend Ops/HR permission model, so Ops roster needs a non-sensitive HR read path for ops managers.
- Decision: clean the existing Ops UI in place, rename Intake to Reported issues, map backend display/provenance fields, show imported history cleanly, and replace the Operations roster's hardcoded staff with HR-backed staff data without adding a second roster system.

### Checkpoint

- Shipped labels/data cleanup: Intake -> Reported issues, source -> operator-facing Origin/Imported labels, provider-prefixed external refs hidden in the drawer, and overdue due dates formatted with weekday/month/year.
- Removed fake task-drawer details: no demo property address/capacity, no demo reservation guest details, no placeholder attachment tiles, no demo Finance expense lookup for owner-charge cost rows.
- Roster now reads non-sensitive staff from `/api/hr/staff?status=active`, falls back to `/api/team/users`, and shows live task workload from `/api/tasks`.
- Imported-history drawer panel now surfaces source people, dates, time, cost, batch, attachment/comment/cost/supply counts, and API enrichment note without exposing secrets or raw source payloads.
- Verification passed: `git diff --check`, frontend `npx tsc --noEmit`, frontend `npm run build`, backend `node --check`, backend `npm run build`, and backend `npm test -- --runInBand`.
- Rendered QA used mocked `/api/tasks` + `/api/hr/staff` at 320/375/430/768/1440; body horizontal overflow stayed at viewport width and no visible `Intake`, `Breezeway`, fake property capacity, or fake attachment labels leaked.
- Screenshots: `docs/handover/qa-screenshots-2026-05-21-ops-cleanup/`.
