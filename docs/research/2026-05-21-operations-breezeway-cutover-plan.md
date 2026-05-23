# Operations / Breezeway Cutover Research Lock

Date: 2026-05-21  
Repo: `/Users/judith/repos/friday-admin-dashboard`  
Branch: `fad-rebuild`  
Status: planning lock for the implementation sprint. No product code was changed in this pass.

## Executive Decision

FAD should not clone Breezeway screen-for-screen. The target is a FAD-native Operations system that replaces Breezeway for Friday's day-to-day field execution while keeping the parts that already work for the team:

- `My Tasks` is the primary mobile/PWA home for field staff.
- A task is the operational ledger for work, time, expenses, supplies, photos, comments, access context, reservation context, and completion evidence.
- Task comments remain canonical on the task, but `@mentions` create TeamInbox message cards and Notifications so staff see the conversation where they already work.
- Properties and Reservations remain the cross-module anchors. Operations executes the work; Properties owns durable property knowledge; Reservations owns stay context.
- Expenses and supply movements should be captured from the task by field staff, then propagated automatically to Finance, Inventory, Properties, Reservations, Owners, and Analytics.
- Field staff should see only assigned work. Sensitive access/reservation details are visible only when the staff member is assigned and the task is within the allowed execution window.
- Field staff can report property issues even when the issue is not tied to one of their assigned tasks that day. Those reports enter manager triage and do not grant extra access to sensitive reservation/access details.

This is a cutover project, but not a same-day Breezeway cancellation. Run FAD in parallel until a real turnover cycle proves that mobile execution, access gating, expense capture, supplies, notifications, and manager oversight work reliably.

## Evidence Reviewed

### Notion

- FAD Running Decisions Log: `https://www.notion.so/34f43ca88492819f8284ea6a89e8624e`
- FAD Scoping and module search results under `Operations`, `Tasks`, `My Tasks`, and `Breezeway`.
- FAD Mobile UX Doctrine + QA Plan - 2026-05-20: `https://www.notion.so/36643ca88492819bb26ec9144bb15396`
- Mobile PWA addendum: `https://www.notion.so/36643ca88492814092d7cedafa8c951b`
- Breezeway Supplies Feature Analysis: `https://www.notion.so/35443ca8849281038d35f4faac9d8f94`
- Properties v0.2 scope: `https://www.notion.so/34f43ca8849281f3a130f7def80a7c5d`
- Reservations v0.2 scope: `https://www.notion.so/34f43ca884928188a83ad290b1a13b1b`
- Reviews v0.2 scope: `https://www.notion.so/34f43ca8849281ec9a08eb46c3779831`
- Friday Design OS cross-module routing: `https://www.notion.so/35443ca8849281f8bd87eac0b1c5a054`

### Local Breezeway Evidence

- Existing report: `docs/research/2026-05-19-breezeway-reverse-engineering.md`
- Mobile screenshots: `/Users/judith/Desktop/breezeway screenshots/Mobile/`
- Missed mobile screenshots: `/Users/judith/Desktop/breezeway screenshots/Mobile/Mobile Missed/`
- Web screenshots: `/Users/judith/Desktop/breezeway screenshots/`
- Export samples:
  - `/Users/judith/Desktop/breezeway-task-summary-export.csv`
  - `/Users/judith/Desktop/breezeway-task-summary-export (1).csv`

Sensitive note: access, lockbox, Wi-Fi, and similar operational values were visible in screenshots. These must be treated as secrets and never copied into docs, fixtures, commits, screenshots, or AI prompts except through a secure secret/access-data workflow.

### Missed Mobile Screenshot Findings

The additional `Mobile Missed` screenshots materially change the mobile scope. Breezeway mobile is not only `My Tasks` plus a task detail page. It also includes:

- Task details/audit metadata: last updated, assignees, due date, priority, status, company/source, external task ID, created date, and created by.
- Task summary editor separate from description/comments.
- Active execution controls: sticky `Complete` button, pause/resume timer, elapsed time, and visible sync state.
- Completed task cards remaining visible in the list, plus `My history` grouped by date with completion duration.
- Mobile filters: department, priority, reservation state, date range/calendar, and sort/search.
- Mobile side navigation: Notifications, Dashboard, All tasks, Properties, My tasks, My history, and Payments. Payments was observed but is explicitly out of Operations scope for FAD v1.
- Mobile Dashboard: date selector, status KPI chips, property-grouped agenda rows, inline due-time editing, attachment/comment indicators, and status filters.
- Mobile property picker/search for task creation.
- Mobile task creation/report/schedule flow: priority chips, department, subdepartment, template, title, description, element, attachment, tag, requester, assignee picker, due date/time, `I completed this task`, and separate `Report` / `Schedule` actions. FAD should copy the useful shape, not the permission model: field staff can report issues from assigned task context, while scheduling and create-and-complete stay manager/supervisor-only or deferred.
- Mobile add-time calendar/time picker tied to a property/reservation timeline.
- Notifications inbox: Inbox/Archived tabs, filters for All/Mentions/Comments/Watching/Department, actor/action/task cards, archive action, unread dots, and expandable long comment previews.

Implication: FAD mobile v1 must include the daily worker loop and the lightweight manager loop. The field worker loop is `My Tasks -> execute -> complete -> history -> notifications`. The manager loop is `Dashboard -> all/open tasks -> report/schedule task -> assign -> watch comments/notifications`.

### Existing FAD Code

- Task types and fixtures: `frontend/src/app/fad/_data/tasks.ts`
- Breezeway frontend shim and task helpers: `frontend/src/app/fad/_data/breezeway.ts`
- Operations module: `frontend/src/app/fad/_components/modules/OperationsModule.tsx`
- Task drawer: `frontend/src/app/fad/_components/modules/operations/TaskDetail.tsx`
- Create task drawer: `frontend/src/app/fad/_components/modules/operations/CreateTaskDrawer.tsx`
- Add cost drawer: `frontend/src/app/fad/_components/modules/operations/AddCostDrawer.tsx`
- TeamInbox data model: `frontend/src/app/fad/_data/teamInbox.ts`
- TeamInbox UI: `frontend/src/app/fad/_components/modules/inbox/TeamInbox.tsx`
- Notifications data and ranking: `frontend/src/app/fad/_data/notifications.ts`
- Notifications UI: `frontend/src/app/fad/_components/modules/NotificationsModule.tsx`
- Push hook: `frontend/src/components/usePushNotifications.ts`
- PWA manifest: `frontend/public/manifest.json`
- Service worker: `frontend/public/sw.js`
- Push proposal handover: `docs/handover/2026-05-18-push-notifications-proposal.md`
- Property tasks and access patterns:
  - `frontend/src/app/fad/_components/modules/properties/PropertyDetail.tsx`
  - `frontend/src/app/fad/_components/modules/properties/PropertyTasksTab.tsx`
- Reservation notes and mention-picker pattern: `frontend/src/app/fad/_components/modules/reservations/ReservationDetail.tsx`
- Finance task-cost bridge: `frontend/src/app/fad/_data/finance.ts`
- HR staff and reassignment surfaces: `frontend/src/app/fad/_components/modules/hr/StaffPage.tsx`
- Existing responsive styles: `frontend/src/app/fad/fad.css`

## Current Reality In FAD

FAD already has a surprisingly useful Operations foundation:

- Task fixtures include properties, assignees, due dates, statuses, reservations, owner-charge flags, attachments, comments, costs, recurring/template metadata, tags, activity logs, inbox links, and approval flags.
- `TaskComment` already supports `mentions`.
- `TaskUser` already supports `external`, and there is an external/vendor-style fixture user.
- The Breezeway shim already exposes `createTask`, `updateTask`, `addCost`, `suggestOwnerCharge`, `addComment`, `fetchTasks`, and `fetchTask`.
- Task costs already create Finance expense records when relevant.
- TeamInbox already supports `task_link` messages, `mentions`, `linkedTaskId`, finance escalation cards, channels, DMs, and mention rendering.
- Notifications already understand mentions, module links, overdue tasks, operations alerts, and read state.
- The PWA manifest, service worker, push hook, and notification UI exist.

The implementation should reuse these primitives rather than building a second Operations system.

## Critical Gaps

These are the gaps that keep FAD from replacing Breezeway:

- No dedicated field-staff `My Tasks` mobile/PWA surface.
- No assigned-only field visibility model.
- No task access gating based on assigned user, task timing, task state, and reopen state.
- No real requirement/checklist/template engine for cleaning, inspection, preventative maintenance, home buildout, and amenities forms.
- No required completion flow with evidence, photos, supplies, costs, time, and close summary.
- No explicit `Completed` vs `Closed` split and no reopen workflow.
- No Supplies/Inventory domain in the task execution flow.
- No SRL/welcome-pack auto-loadout from property room/bed/bath rules.
- No task-comment mention bridge into TeamInbox and Notifications.
- No stale-open watchdog for tasks left started/open too long.
- No explicit offline action queue for mobile comments, start/stop, completion, photos, expenses, and supplies.
- No mobile `Dashboard`, `My history`, or role-gated side navigation equivalent.
- No mobile issue-reporting workflow for field staff, including standalone property issue reports, or manager/supervisor mobile task scheduling workflow with property picker, requester, tags, assignees, and due time.
- No mobile notification inbox/archive model with comment/watching/department filters.
- No task audit/source detail screen that shows external task ID, source company, created-by, created-at, and last-updated metadata.
- No native-feeling mobile date range, due-time, property, and assignee selectors.
- No live Inbox AI pending-action to Operations task contract. Current frontend fixtures already know `source: inbox_ai`, but pending actions are still proposal rows, not owned FAD Operations/My Tasks records.
- The current checkout does not contain the API-backed Operations task implementation, but the work exists on `origin/fad-design-os-v01-frontend`. It should be ported or carefully cherry-picked into `fad-rebuild`, not rebuilt from scratch.
- Current `fad-rebuild` also does not show the richer push/realtime backend that exists on `origin/fad-design-os-v01-frontend`; compare before implementing push or SSE primitives.

## Backend Blocker Resolution

The apparent backend blocker is resolved enough to plan from. `fad-rebuild` is missing the backend task implementation, but `origin/fad-design-os-v01-frontend` contains the source work:

- `backend/migrations/050_tasks.sql`: initial tenant-scoped `tasks` table.
- `backend/migrations/051_tasks_full.sql`: extends tasks with source, visibility, department, subdepartment, property/reservation links, multi-assignee UUID array, due time, estimated/spent minutes, AI suggestions, activity log, tags, `task_comments`, and `task_costs`.
- `backend/src/tasks/index.js`: Express router for `GET /api/tasks`, `GET /api/tasks/:id`, `POST /api/tasks`, `PATCH /api/tasks/:id`, `DELETE /api/tasks/:id`, `POST /api/tasks/:id/comments`, `POST /api/tasks/:id/costs`, and `DELETE /api/tasks/:taskId/costs/:costId`.
- `frontend/src/app/fad/_data/tasksClient.ts`: API adapter that mirrors the existing `breezeway.ts` task signatures and maps snake_case backend fields to existing camelCase `Task` consumers.
- `frontend/src/app/fad/_data/useApiTasks.ts`: module-level cache/hook used by Operations.
- `docs/handover/2026-05-16-priority-zero-verification.md`: prior verification note claiming end-to-end task create/comment/cost/status/filter flows worked in production at that time.

Decision: Wave 1 should begin by porting this exact task backend/client foundation into `fad-rebuild`, then extend it for Friday's Breezeway replacement requirements. Do not merge the whole branch blindly; inspect file-level diffs because `origin/fad-design-os-v01-frontend` contains broader Design OS/backend work.

Known gaps in the prior task backend that still need the Breezeway cutover sprint:

- It has `source: inbox_ai`, `inbox_thread_id`, and property/reservation links, but no idempotent `pending_action -> task` conversion endpoint or linkage.
- It does not add `external_ref` to Operations tasks yet. Design tasks already use the `external_ref` pattern, so Operations should copy that pattern instead of inventing a new one.
- It has comments but no TeamInbox/Notification mention bridge.
- It has task costs but not full expense receipts, supply movements, inventory, or owner-billing flow.
- It has estimated/spent minutes but not proper time-entry rows.
- It has `reported`, `todo`, `in_progress`, `paused`, `awaiting_approval`, `completed`, and `cancelled`, but not the final canonical lifecycle with `scheduled`, `ready`, `completed` vs `closed`, and reopen.
- It lacks access gating fields/events.
- It lacks requirement/checklist/template tables.
- It lacks offline queue integration.
- It uses UUID-only backend users, while current frontend fixtures still use IDs such as `u-judith`; keep the adapter boundary strict until tenant users are fully wired.

## Feature Mini-Research Rule

Yes, the feature-by-feature mini-research pass is worth it. It should be mandatory and timeboxed, because FAD, the GitHub feature catalog, prior branches, and current platform guidance already contain reusable pieces. The goal is not only to reuse existing code; it is to avoid missing an established Friday pattern or a known browser/platform constraint.

Before each feature slice, do this:

1. Search current `fad-rebuild` code for matching primitives, data models, UI patterns, and docs.
2. Search git history/branches for prior implementations, especially `origin/fad-design-os-v01-frontend`.
3. Search the GitHub Feature Catalog using the MCP tool or `/Users/judith/repos/feature-catalog`.
4. Check the relevant Notion scope or locked decision if the feature crosses modules.
5. Check the Breezeway screenshots/report/API evidence for the exact behavior.
6. Do external online research only when it is high leverage: browser/PWA support, offline sync, push notifications, security/auth, accessibility, file/photo capture, or a domain workflow where the implementation choice can go stale.
7. Decide `reuse`, `extend`, or `new`.
8. Write a 5 to 10 line note in the sprint log before touching implementation code.

Suggested timebox:

- Small UI behavior: 10 minutes.
- Cross-module behavior: 20 minutes.
- Backend/schema/offline/push/security behavior: 25 minutes.

This rule is especially important for TeamInbox mentions, notification events, cost capture, reservation context, property access, PWA push, HR roster/time, and Finance linkage because each already has partial FAD code.

Feature Catalog findings from the research pass:

- `fad-dashboard-shell`: use existing module routing and `fad.css` responsive primitives; do not make a separate mobile app shell unless PWA constraints force it.
- `saas-module-subscription-gate`: any new Operations backend routes must stay tenant-scoped and module-gated when moved beyond FR-only code.
- `voice-dictation-hook`: high-leverage candidate for task comments, issue reports, completion summaries, and field notes because field staff will use mobile/PWA.
- `playwright-ui-audit-harness`: use this pattern for the desktop/mobile/PWA visual QA sweep, especially 375px mobile.

High-leverage external references checked for PWA/offline/push planning:

- MDN Background Synchronization API: `https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API`
- MDN Offline and background operation for PWAs: `https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation`
- Chrome Workbox Background Sync docs: `https://developer.chrome.com/docs/workbox/reference/workbox-background-sync`
- MDN Push API: `https://developer.mozilla.org/en-US/docs/Web/API/Push_API`
- Apple Developer web push docs: `https://developer.apple.com/documentation/UserNotifications/sending-web-push-notifications-in-web-apps-and-browsers`

Planning implication: browser background sync and web push are useful but uneven across platforms. Build an app-visible offline queue first, with push/background sync as progressive enhancements. The user and manager must be able to see queued/failed work.

High-leverage external references checked for agentic coding execution:

- OpenAI Codex safety/operating controls: `https://openai.com/index/running-codex-safely/`
- OpenAI Codex working practice: `https://openai.com/business/guides-and-resources/how-openai-uses-codex/`
- OpenAI Codex launch docs on AGENTS.md, logs, tests, and verification: `https://openai.com/index/introducing-codex/`
- Anthropic Claude Code best practices: `https://code.claude.com/docs/en/best-practices`
- GitHub Copilot coding agent best practices: `https://docs.github.com/en/enterprise-cloud@latest/copilot/tutorials/cloud-agent/get-the-best-results`
- web.dev PWA offline data guidance: `https://web.dev/learn/pwa/offline-data`

Planning implication: the overnight implementation should be structured as small, well-scoped tasks with file/path anchors, explicit acceptance criteria, self-verification, and visible logs. Broad ambiguous feature prompts, unbounded refactors, and security-sensitive changes without tests are the main failure modes to guard against.

## Locked Product Decisions

### Clarifications From Ishant On 2026-05-21

- Payments and `Make payment` are not used in Breezeway today by Friday's team and do not belong in Operations v1. If FAD needs a payment/deposit/owner-billing workflow later, Finance owns it. Operations may still emit work items that Finance consumes.
- Field staff should not freely create, schedule, or create-and-complete tasks.
- Field staff may report issues from assigned task context, with property/reservation context inherited automatically and manager/supervisor review.
- Field staff may also report standalone property issues when they see, encounter, or hear something operationally relevant outside their assigned tasks that day. They must select/link a property and describe the issue; they do not receive reservation/access details unless separately assigned to a task within the access window.
- Managers and supervisors can create, schedule, assign, close, and reopen tasks.
- The Breezeway `I completed this task` shortcut is not a field-staff pattern for FAD. If historical backfill is ever needed, make it manager-only with explicit reason, timestamp, and audit trail, or defer it entirely.
- Notifications stay distinct from TeamInbox. TeamInbox is conversation/collaboration; Notifications is an event inbox/archive with links back to source records.
- Inbox AI owns detection/proposal in `pending_actions`; Operations owns real task execution. Inbox pending actions must be converted idempotently into Operations tasks before they appear in My Tasks or the manager task board.

### Users And Visibility

- Field staff are the primary users.
- External/vendor users should be supported in the model now, even if not critical for the immediate rollout.
- Field staff see assigned tasks only.
- Managers can see and manage the wider task board, schedule, properties, people, templates, supplies, and issues.
- Mobile navigation must be role-gated. Not every Breezeway mobile menu item should be visible to every field staff user.
- `My history` is required for staff trust, payroll/time disputes, completion proof, and manager audit.
- Mobile Dashboard is required for managers/supervisors and may have a scoped field-staff variant later.
- Sensitive access and reservation details are visible only when:
  - the staff member is assigned to the task,
  - the task is within the allowed task execution window, currently 12 hours before the scheduled start/date,
  - the task is not closed, or it has been explicitly reopened.
- Closed tasks hide sensitive access details again.

### Task Lifecycle

Use a lifecycle that supports real operations data:

- `reported`
- `scheduled`
- `ready`
- `in_progress`
- `paused`
- `blocked`
- `completed`
- `closed`
- `cancelled`

`Reported` means an intake item from field issue reporting, Inbox AI, Reviews, or another module. It needs manager triage before it becomes planned/executable work. `Todo` from the existing backend should be treated as a migration/back-compat alias, not the long-term status name.

`Completed` means the field worker has finished. `Closed` means a manager, automation, or validation process has accepted the task as final. A task can be reopened after accidental closure or failed validation.

Mobile completion must preserve the elapsed task duration and show that duration in `My history`. Completion should not erase the card immediately; it can remain visible in the current period/history without exposing sensitive access details after closure.

Mobile task creation needs two role-scoped modes:

- `Report`: field staff can report an issue from an assigned task context or from a standalone property observation when role policy allows it. Assigned-task reports inherit property/reservation context automatically. Standalone property reports require property selection and never expose sensitive access/reservation context by themselves. This creates a `reported` issue/task candidate with source context and audit trail, not an arbitrary scheduled task.
- `Schedule`: managers/supervisors create a future task with due date/time, assignees, templates, tags, requester, and source context.

The Breezeway `I completed this task` checkbox is intentionally excluded from field-staff FAD v1. Create-and-complete corrupts timing, assignment, and completion evidence if it is too easy. If needed later, treat it as manager-only historical backfill with reason, actor, timestamp, and explicit analytics exclusion or correction flags.

### Comments And TeamInbox

- Task comments are the canonical thread.
- When a comment includes staff mentions, FAD creates:
  - a TeamInbox message card in the relevant channel or DM context,
  - a Notification for each mentioned user,
  - a backlink to the task and the exact comment.
- TeamInbox should display a compact inline task-comment card, not duplicate the entire task detail UI.
- Reply behavior should either:
  - route the user back to the task comment thread, or
  - support a mirrored reply that writes back to the task thread.
- The event must be idempotent. Editing/resending a comment should not create duplicate mention spam.

### Inbox AI Pending Actions To Operations Tasks

This belongs in the Operations cutover. Do not leave Inbox AI pending actions as a separate pseudo-task system.

- Inbox owns detection and proposal. It writes `pending_actions` and keeps its suppression/dedup/guest-conversation logic.
- Operations owns real tasks, task execution, My Tasks, field visibility, manager triage, assignment, completion, close/reopen, time, expenses, supplies, comments, and notifications.
- Existing open `pending_actions` include stale/passive items. Do not bulk-convert historical rows blindly.
- Add an idempotent link from `pending_actions` to tasks. Preferred first implementation: `tasks.external_ref = 'pending_action:<id>'` with a tenant-scoped unique index for active/non-cancelled tasks. A join table is acceptable only if `external_ref` conflicts with the final task model.
- Add `source = 'inbox_ai'` and preserve `conversation_id`/`inbox_thread_id`, `property_code`, `reservation_guesty_id` when known, original pending-action ID, and source summary.
- Default converted tasks to `status = 'reported'`, not directly executable work. Managers/directors see the Inbox AI triage queue; field staff see only assigned tasks.
- Map `pending_action -> task` as:
  - `title`: cleaned action text,
  - `description`: source conversation link/summary plus original pending-action text,
  - `priority`: urgency mapping,
  - `assignee_user_ids`: empty unless detector confidence and policy are both strong,
  - `tags`: include `inbox-ai` plus category/source tags where useful.
- Provide either `POST /api/operations/tasks/from-pending-action` or `POST /api/tasks` with idempotent `external_ref` support. Prefer the latter if it keeps the task service clean and permissioned; add a thin semantic route only if Inbox needs a narrower contract.
- Add bulk triage actions for managers: create task, dismiss, mark duplicate, mark stale, and link to existing task.
- Operations UI must expose a source filter for `Inbox AI` in manager views and show these in the triage queue/task board. My Tasks should only show them after assignment.

### Expenses, Supplies, And Stock

- Field staff capture expenses from the task, not from generic Finance.
- Field staff can adjust supplies and stock consumption from the task.
- FAD handles Finance, owner billing, inventory movements, reservation P&L, and analytics automatically from those task events.
- SRL/welcome-pack items should auto-load into eligible cleaning or inspection tasks from property rules based on bedrooms, beds, bathrooms, and configured process templates.
- Staff can adjust actual quantities used when previous guests left items untouched.
- Inventory must cover more than guest consumables:
  - welcome-pack items,
  - cleaning stock,
  - maintenance materials,
  - maintenance equipment,
  - curtains,
  - chairs,
  - paint,
  - property-specific supplies,
  - store/warehouse stock.
- Start with manual stock management, but model stock movements so future purchase capture and supplier invoices can update inventory automatically.

### Time And Pay

- Start/stop/pause/resume is required for operational timing.
- The system should store task time entries in a way that can later support real pay tracking.
- Pay tracking should connect to HR and Finance but should not block the first My Tasks rollout.
- Timing data is strategically important for future AI scheduling, roster planning, task estimation, and performance analysis.

### PWA And Notifications

- PWA is the field staff app.
- Push notifications should work where the browser/platform supports them.
- Notifications must exist inside FAD even if browser push fails or is not granted.
- Notification inbox needs Inbox/Archived tabs and filters for mentions, comments, watching, and department.
- Long comment notification previews should be expandable, with a link back to the task/comment.
- Offline support cannot rely only on the service worker. FAD needs an app-level offline queue for:
  - start task,
  - pause/resume,
  - comments,
  - photos,
  - expenses,
  - supplies,
  - completion summaries,
  - issue reporting.
- Failed or queued actions must be visible to the worker and manager. Silent failure is unacceptable in Operations.
- A stale-open watchdog should notify staff and managers when tasks remain started/open beyond the expected window.

## Cross-Module Opportunities

| Source event | Operations behavior | Cross-module destinations |
| --- | --- | --- |
| Task comment with `@mention` | Create task comment, TeamInbox card, notification | TeamInbox, Notifications, HR activity, Training/knowledge extraction |
| Task started/paused/resumed/completed | Create time entries and activity | HR, Finance/pay, Analytics, Calendar, Notifications |
| Task closed/reopened | Lock or unlock sensitive details; create audit trail | Properties, Reservations, TeamInbox, Notifications |
| Access viewed | Audit sensitive-data access | Properties, Security/Auth, Analytics |
| Expense captured | Attach to task with receipt and owner-charge flags | Finance, Owners, Reservation P&L, Analytics |
| Supply consumed | Create stock movement and optional owner billable line | Inventory, Finance, Properties, Reservations |
| SRL auto-loadout created | Generate task supply checklist | Properties, Inventory, Reservations, Finance |
| Issue reported from task | Create or link maintenance task | Properties, Reservations, Reviews, Owners |
| Standalone property issue reported by field staff | Create `reported` issue with property context only | Operations triage, Properties, Notifications, Manager Dashboard |
| Inbox AI pending action accepted | Idempotently create/link `source=inbox_ai` Operations task | Inbox, Operations, TeamInbox, Notifications, Reservations/Properties if linked |
| Cleaning completed | Update property readiness | Properties, Calendar, Reservations, Guest comms |
| Inspection completed | Update readiness and defect status | Properties, Operations, Reviews, Owners |
| Preventative maintenance due | Create recurring task | Properties, Calendar, Finance, Analytics |
| Review mentions defect/staff | Create task or coaching signal | Reviews, Operations, HR, Properties |
| Staff offboarding or absence | Reassign open tasks | HR, Operations, Calendar, Notifications |
| Low stock threshold hit | Create restock task | Operations, Inventory, Finance, Vendors |
| Vendor assigned task | Role-scoped mobile task view | Vendor portal later, Operations, Finance |

## UX And Agentic Coding Guardrails

The FAD mobile doctrine changes how this should be built. Mobile is not a full desktop clone. It is the field execution and recovery surface: see today/mine/blocked, open a task, capture evidence or issue, comment, complete/block/escalate, and get back out quickly. Desktop remains the manager command center.

Apply these UX rules throughout the sprint:

- One hierarchy level per phone screen: list, detail, or action sheet. Do not stack nested panels/cards on mobile.
- Keep frequent actions visible: start, pause/resume, block, complete, comment, add photo, add expense, adjust supplies. Put rare controls in menus or sheets.
- Use shared FAD primitives where possible: mobile split-view shell, sticky mobile action bar, full-screen mobile drawer/sheet, filter sheet, table-to-card row, status chip, section message, compact tabs with overflow, mention picker/token.
- Mobile task forms need persistent labels, large inputs, inline errors, keyboard-safe layout, and no cramped modals under the keyboard.
- Task rows/cards must have stable dimensions and no horizontal overflow at 320, 375, 430, 768, and desktop widths.
- Touch targets should be at least 44-48px for the primary field workflow.
- Ask Friday or AI assistance, if added in this module, must be context-bound to the current task/property/reservation and must not hallucinate operational authority.
- Dense is acceptable for trained staff, but only when the hierarchy is stable and the next action is obvious.

Apply these agentic-coding rules during implementation:

- Slice work by wave and feature, then write the 5 to 10 line mini-research note before coding.
- Give every slice concrete acceptance criteria and verification commands before editing.
- Reuse existing FAD code, Feature Catalog entries, Notion decisions, Breezeway evidence, and prior branch work before inventing a new pattern.
- Port from `origin/fad-design-os-v01-frontend` file-by-file. Do not blind merge the whole branch.
- Avoid the common AI failure modes: generic card soup, duplicated task systems, untagged demo fixtures, fake buttons, broken role/access gates, desktop-only verification, skipped tests, and one giant commit that cannot be reviewed.
- Commit only coherent verified slices. Do not advance to the next dependent wave until the current gate is either green or explicitly parked with a blocker note.
- If a platform feature is uneven, such as push/background sync/offline media upload, implement a visible in-app state first and treat platform automation as progressive enhancement.
- After each wave, do a short self-critique: is there a simpler reuse path, is the data model still one source of truth, and did the UI drift from the mobile doctrine?

## Implementation Waves

### Wave 0: Research Lock And Session Hygiene

Goal: enter implementation with a single source of truth.

- Keep this document as the sprint control doc.
- Start from `fad-rebuild`.
- Fetch origin and confirm branch state.
- Preserve existing untracked research/worktree artifacts.
- Write a concise sprint log as work proceeds.

Exit criteria:

- Implementation scope is locked.
- No product code has been changed by the planning pass.

### Wave 1: Domain Model And Contracts

Goal: extend the current task model without UI churn.

Mini-research targets:

- `tasks.ts`, `breezeway.ts`, `teamInbox.ts`, `notifications.ts`, Finance fixtures, HR fixtures, service worker, backend server, database schema.

Build:

- Extend task lifecycle and task events.
- Add canonical `reported` intake status and compatibility mapping from existing `todo`/`awaiting_approval` semantics.
- Add `external_ref` or an equivalent idempotency/link table for cross-module task creation, including `pending_action:<id>`.
- Add task time entries.
- Add task comment mention event contract.
- Add access visibility contract.
- Add supplies/inventory movement contracts.
- Add completion/close/reopen contract.
- Add stale-open watchdog contract.
- Add source provenance fields needed for Inbox AI, field reports, Breezeway, recurring tasks, reviews, reservations, and manual tasks.
- Verify whether backend source-of-truth exists in another checkout/service. If it does not, write the backend schema/API plan before implementing persistence.

Exit criteria:

- One coherent type/service model exists.
- No second duplicate task system.
- Demo-only additions are tagged and registered in `frontend/DEMO_CRUFT.md`.

### Wave 2: Mobile Navigation, Dashboard, My Tasks, And History

Goal: build the mobile surfaces that replace Breezeway as the day-to-day app.

Mini-research targets:

- Breezeway mobile screenshots for side nav, Dashboard, My Tasks, My History, filters, and task cards.
- Existing Operations task cards and `fad.css` responsive primitives.
- Existing Operations overview/dashboard widgets.
- Existing Notifications module and FAD shell routing.
- PWA manifest shortcuts and service worker.

Build:

- Role-gated mobile side navigation.
- Mobile Dashboard with date selector, status counts/chips, property-grouped agenda, due-time display/edit affordance, attachments/comments indicators, and status filters.
- Dedicated `My Tasks` view under Operations.
- Today, Tomorrow, Week, All tabs.
- Search/filter/sort, including department, priority, reservation state, and date range.
- Assigned-only visibility for field role.
- Task cards with due/overdue, property, reservation context, status, comments, attachments, and offline/sync indicators.
- `My History` view grouped by completion date with completion duration and comment indicators.
- Mobile-first detail entry.
- PWA shortcuts for My Tasks and Notifications if compatible with static export.

Exit criteria:

- 375px mobile flow is usable as the field staff first screen and manager/supervisor daily check screen.
- Desktop manager Operations remains intact.

### Wave 3: Task Execution Detail

Goal: make a task executable without Breezeway.

Mini-research targets:

- `TaskDetail.tsx`, Breezeway mobile task detail screenshots, property access patterns, reservation detail patterns.

Build:

- Start, pause, resume, block, complete, close, reopen.
- Time entries.
- Sticky mobile timer controls with pause/resume and complete.
- Visible sync/queued state for task mutations.
- Completion summary.
- Task summary editor separate from the original description.
- Details/source screen with last updated, created by/date, source company/system, external task ID, assignees, priority, due date, and status.
- Required evidence placeholders for photos/files.
- Property context and issues.
- Reservation context with staff-safe fields.
- Access section gated by assignment, timing, and task state.
- Accidental close/reopen handling.
- No field-staff create-and-complete path.

Exit criteria:

- Field worker can execute a task from assignment to completed state.
- Manager can close or reopen.
- Sensitive information is hidden outside the allowed window.

### Wave 3B: Mobile Issue Reporting And Manager Scheduling

Goal: let field staff report operational issues from assigned task context or standalone property observation, and let managers/supervisors create and schedule operational work from mobile.

Mini-research targets:

- Missed Breezeway mobile screenshots for property picker, task create, assignee picker, add-time/date-time picker, Report/Schedule actions.
- Existing `CreateTaskDrawer.tsx`, reported issues flow, reservation task creation flow, property selectors, assignee selectors, and date/time inputs.
- Feature Catalog `voice-dictation-hook` for mobile title/description/comment capture.

Build:

- Field issue report flow from assigned task context, inheriting property/reservation context automatically.
- Standalone field issue report flow with required property selection, optional photo/comment, no sensitive access/reservation exposure, and `status = 'reported'`.
- Manager/supervisor mobile property picker/search.
- Priority chips, department, subdepartment, template, title, description, element, attachment, tag, requester, due date/time, and assignee selection.
- `Assign to me` shortcut only where role policy allows it, plus department-grouped assignee list for managers/supervisors.
- `Report` action for assigned-task and standalone property issue reporting, and `Schedule` action for manager/supervisor task creation.
- No field-staff arbitrary task creation, free scheduling, or create-and-complete.
- Optional manager-only historical backfill/create-and-complete only if it can be audited clearly; otherwise defer it.
- Optional dictation button on long text fields if the hook ports cleanly.

Exit criteria:

- Manager/supervisor can create a task from mobile without desktop.
- Field staff can report an issue/task from assigned task context or standalone property observation if role policy allows it.
- Standalone issue reporting does not reveal access/reservation details or place work directly into My Tasks unless assigned.
- Field staff cannot create, schedule, or create-and-complete arbitrary work.
- Create/report/schedule actions route through the same backend/task service as desktop.

### Wave 4: Comments, TeamInbox, And Notifications

Goal: make task communication first-class and cross-linked.

Mini-research targets:

- `TaskDetail.tsx` comment UI.
- Reservation mention picker.
- `teamInbox.ts` `task_link` messages.
- `TeamInbox.tsx` rendering.
- `notifications.ts` mention notifications.
- Missed Breezeway mobile notification inbox/archive screenshots.

Build:

- Mention picker in task comments.
- Mention parsing and user targeting.
- Task-comment event emitter.
- TeamInbox task-comment card.
- Notification event for mentioned users.
- Idempotency key per comment mention event.
- Backlinks from TeamInbox and Notifications to the task.
- Notification inbox/archive state.
- Filters for All, Mentions, Comments, Watching, and Department.
- Expandable long comment previews.

Exit criteria:

- Commenting `@staff` on a task creates the expected TeamInbox/Notification surfaces.
- The task remains the source-of-truth comment thread.

### Wave 4B: Inbox AI Pending Actions To Ops Tasks

Goal: make Inbox AI proposals become real Operations-owned tasks only through an idempotent, reviewable contract.

Mini-research targets:

- Current `pending_actions` schema, action detector, suppression/dedup rules, and pending action UI.
- Prior `origin/fad-design-os-v01-frontend` tasks backend.
- Existing Operations `source: inbox_ai` fixtures and source filter.
- Design module `external_ref` idempotency pattern.

Build:

- Confirm and document canonical Operations task fields/statuses before code changes.
- Add `external_ref` support or a join table linking pending actions to tasks.
- Add idempotent task creation for `pending_action:<id>`.
- Map pending-action fields to `source = 'inbox_ai'`, `status = 'reported'`, title, description, priority, property/reservation/conversation references, source metadata, tags, and optional assignee confidence.
- Add endpoint support via `POST /api/tasks` with `external_ref`, or a narrow `POST /api/operations/tasks/from-pending-action` route that delegates to the task service.
- Add manager/director triage queue filtered to `source = 'inbox_ai'` and `status = 'reported'`.
- Add bulk triage: create/accept task, dismiss, mark duplicate, mark stale, and link to existing task.
- Ensure historical/stale/passive pending actions are not bulk-converted automatically.

Exit criteria:

- Inbox owns detection/proposal; Operations owns execution.
- A repeated conversion call returns or links the same task, not duplicates.
- Managers/directors can triage Inbox AI actions in Operations.
- Field staff only see Inbox AI tasks after assignment.

### Wave 5: Requirements, Checklists, And Templates

Goal: replace Breezeway requirements for the core Friday task types.

Mini-research targets:

- Breezeway requirements/checklist screenshots.
- Notion form/template references.
- Operations template/recurring task fixtures.
- Properties recurring-artifact scope.

Build:

- Template model for:
  - cleaning,
  - post-clean inspection,
  - preventative maintenance,
  - home buildout,
  - amenities form.
- Checklist requirements.
- Required photos/files.
- Required supply/expense/time validation hooks.
- Template-to-task generation rules.

Exit criteria:

- Each core task type can carry task-specific requirements.
- Completion can validate required requirements.

### Wave 6: Expenses, Supplies, SRL, And Inventory

Goal: replace Breezeway costs/supplies for field execution.

Mini-research targets:

- Breezeway supply screenshots.
- Breezeway Supplies Feature Analysis.
- `AddCostDrawer.tsx`, `finance.ts`, property metadata, reservation cleaning arrangement.

Build:

- Supply catalog.
- Stock locations.
- Stock movements linked to task IDs.
- Add supply from task.
- Adjust quantity used.
- Billable toggle and owner-charge path.
- SRL/welcome-pack auto-loadout rules from property configuration.
- Low-stock threshold and restock task creation hook.

Exit criteria:

- Field staff can record supplies/expenses from a task.
- Finance and inventory receive usable downstream events.

### Wave 7: Manager Workbench

Goal: give managers control without Breezeway web.

Mini-research targets:

- Existing Operations overview/table/approvals/roster/insights.
- Breezeway web screenshots for task boards, property readiness, schedule, and user planning.
- HR staff open-task/reassignment UI.

Build:

- Today board.
- Mobile Dashboard parity for the manager/supervisor daily agenda.
- Property readiness board.
- Schedule/weekly planning view.
- Open issues.
- Inbox AI reported-task triage queue.
- Approvals.
- Stale-open tasks.
- Supplies/restock.
- Template management.
- Staff workload and reassignment.

Exit criteria:

- Managers can plan, supervise, and fix the day without opening Breezeway.

### Wave 8: Persistence, Realtime, Push, And Offline Queue

Goal: make the system reliable enough for real use.

Mini-research targets:

- Backend server/database state in this checkout and any active backend deployment.
- Push proposal handover.
- Current service worker.
- Existing SSE/event bus patterns from FAD/GMS.

Build:

- Backend tables/routes for tasks, comments, time entries, checklists, supplies, stock movements, expenses, notifications, pending-action links/idempotent external refs, and push subscriptions, unless a verified equivalent already exists.
- SSE or event stream for task/comment/notification changes.
- Push routes and subscription persistence.
- Offline action queue with retry, conflict handling, and visible sync state.

Exit criteria:

- No claim of Breezeway replacement is made until data persists outside local fixtures.
- Offline and failed actions are visible and recoverable.

### Wave 9: Verification, Commits, Push, And Deploy

Goal: ship only what passes real gates.

Required checks:

- `npm run build` from `frontend/`.
- `npx tsc --noEmit` from `frontend/`, with any legacy non-FAD noise separated from new errors.
- Desktop visual pass.
- Mobile visual/click-through pass at 320, 375, 430, and 768 widths, plus desktop.
- No horizontal overflow, clipped text, or overlapping controls in the mobile shell, My Tasks, task detail, report flow, notifications, and manager dashboard.
- 44-48px touch target pass for primary mobile actions.
- Keyboard/focus pass for mobile task forms, comments, expense capture, supplies, and issue reporting.
- Loading, empty, error, offline, queued, retrying, failed, disabled, and permission-denied state review.
- Perceived-delay pass for task open, filter open, comment composer focus, photo attach, expense attach, and module switch.
- PWA install/offline sanity pass.
- Task comment mention to TeamInbox/Notification pass.
- My Tasks assigned-only pass.
- Access gating pass.
- Field-staff cannot create/schedule/create-and-complete arbitrary work.
- Field-staff standalone property issue report pass, with no sensitive access/reservation leakage.
- Inbox AI pending-action conversion pass, including idempotent repeat call and no blind historical bulk conversion.
- Manager Inbox AI source filter/triage pass.
- Payments/Make payment does not appear in Operations mobile nav or scope.
- Expense/supply task capture pass.
- Stale-open watchdog pass, if implemented.

Git/deploy:

- Commit in coherent chunks on `fad-rebuild`.
- Push `fad-rebuild`.
- Verify Vercel preview.
- Deploy live only if the agreed gates pass and no backend/source-of-truth blocker remains.

Stop conditions:

- Do not live-deploy if sensitive access gating is uncertain.
- Do not call the system a Breezeway replacement if persistence is still fixture/localStorage-only.
- Do not silently downgrade push/offline tests if the environment cannot support them.
- If backend truth is missing or ambiguous, write the blocker and ship only the safe frontend/planning layer.

## Suggested Overnight Execution Contract

If the next session is meant to run while Ishant sleeps, use this contract:

1. Start by reading this document, `AGENTS.md`, project memory, and the existing Breezeway report.
2. Stay on `fad-rebuild`.
3. Work wave-by-wave in order. Do not skip investigation notes.
4. For each feature, do the mini-research pass first.
5. Commit after each coherent, verified slice.
6. Push after meaningful green checkpoints.
7. Use the mobile UX doctrine as a gate: one hierarchy per phone screen, visible primary actions, no cramped keyboard modals, no generic card soup, and screenshot/click-through verification.
8. Do not live-deploy if verification fails, sensitive data gating is incomplete, or persistence is not real.
9. Leave a handover doc with:
   - shipped features,
   - commits,
   - tests run,
   - screenshots/QA notes,
   - known blockers,
   - any demo tags added,
   - any tasks/data created for testing.

## Next-Session Launch Prompt

Use this prompt to start the implementation session:

```text
We are implementing the FAD Operations/Breezeway cutover sprint in /Users/judith/repos/friday-admin-dashboard on branch fad-rebuild.

Read first:
- AGENTS.md
- project memory for /Users/judith/repos/friday-admin-dashboard
- docs/research/2026-05-21-operations-breezeway-cutover-plan.md
- docs/research/2026-05-19-breezeway-reverse-engineering.md
- Breezeway screenshots under /Users/judith/Desktop/breezeway screenshots/Mobile/, especially /Users/judith/Desktop/breezeway screenshots/Mobile/Mobile Missed/

Work wave-by-wave in the 2026-05-21 plan. Do not jump ahead across dependent waves. For every feature slice, run the timeboxed mini-research pass before coding: current fad-rebuild code, git history/branches especially origin/fad-design-os-v01-frontend, GitHub Feature Catalog via MCP or /Users/judith/repos/feature-catalog, relevant Notion scope, Breezeway evidence, and high-leverage online research for PWA/offline/push/security/accessibility/platform behavior. Write a 5-10 line sprint-log note before touching code.

Locked decisions:
- Payments / Make payment is out of Operations. If needed later, Finance owns it.
- Field staff cannot freely create, schedule, or create-and-complete tasks.
- Field staff can report issues from assigned task context if role policy allows it; property/reservation context is inherited automatically.
- Field staff can also report standalone property issues when they see, encounter, or hear something relevant outside their assigned tasks. They must select/link a property and describe the issue, but this must not reveal sensitive reservation/access details.
- Managers/supervisors can create, schedule, assign, close, and reopen tasks.
- Notifications stay separate from TeamInbox. TeamInbox is conversation; Notifications is event inbox/archive.
- Inbox owns AI detection/proposal in pending_actions. Operations owns real tasks and execution. Add the idempotent pending_action -> task contract; do not leave Inbox AI actions as a separate pseudo-task system.
- Mobile/PWA is the field staff app. Desktop remains the manager command center.

Wave 1 starts by porting the existing task backend/client foundation from origin/fad-design-os-v01-frontend into fad-rebuild at file level, not by blind branch merge: backend/migrations/050_tasks.sql, backend/migrations/051_tasks_full.sql, backend/src/tasks/index.js, backend/server.js route/gate wiring, frontend/src/app/fad/_data/tasksClient.ts, frontend/src/app/fad/_data/useApiTasks.ts, and the Operations import swaps. Keep the adapter boundary strict. Extend the model with canonical status = reported/scheduled/ready/in_progress/paused/blocked/completed/closed/cancelled, with todo as a migration alias only. Add external_ref or an equivalent idempotent join for source-created tasks, including pending_action:<id>.

Then extend it for mobile Dashboard, role-gated mobile navigation, My Tasks PWA, My History, task execution, assigned-task issue reporting, standalone property issue reporting, manager scheduling, Inbox AI pending-action to Ops task triage, comments/mentions into TeamInbox and Notifications, notification inbox/archive, access gating, completed-vs-closed/reopen, expenses/supplies, SRL loadouts, inventory, stale-open reminders, offline queue, and manager oversight.

For Inbox AI pending actions: implement either POST /api/tasks with idempotent external_ref support or POST /api/operations/tasks/from-pending-action delegating to the task service. Map title = cleaned action text, description = source conversation link/summary + original pending action text, source = inbox_ai, status = reported, priority from urgency, property/reservation/conversation references preserved, assignee unassigned unless detector confidence and policy are strong. Add manager bulk triage: create/accept task, dismiss, duplicate, stale, link existing. Do not bulk-convert existing stale/passive pending_actions blindly.

UX gate: use the FAD Mobile UX Doctrine. One hierarchy per phone screen. Keep primary field actions visible. No generic card soup, nested cards, cramped mobile modals, clipped text, or horizontal overflow. Verify at 320, 375, 430, 768, and desktop widths with screenshots/click-through. Check touch targets, keyboard behavior, loading/empty/error/offline/queued/failed states, and perceived delay for task open, filter open, comment composer, photo attach, expense attach, and module switch.

Agentic coding guardrails: preserve unrelated untracked files, avoid duplicated task systems, tag any fixture/demo-only code with @demo:* and update frontend/DEMO_CRUFT.md in the same commit, commit coherent verified chunks to fad-rebuild, push after green checkpoints, and leave an audit trail. Do not live-deploy if backend persistence, access gating, offline failure visibility, or verification is incomplete. Leave a handover with shipped features, commits, tests, screenshots/QA notes, blockers, demo tags, and any tasks/data created for testing.
```
