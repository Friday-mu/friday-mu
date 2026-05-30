# Breezeway Reverse Engineering For FAD Operations

Date: 2026-05-19
Scope: Operations / Tasks replacement, with Property, Finance, HR, Reservations, and mobile field-app dependencies.

## Status

This is a preliminary but usable reverse-engineering report.

Evidence used:

- FAD codebase: current Operations/Tasks fixtures, Breezeway shim, Property Tasks tab, Finance task-cost integration.
- Notion: locked Properties scope, running decisions log, prior Breezeway Supplies analysis.
- Public Breezeway docs: task mobile flow, checklists/templates, subdepartments, property status, API reference, webhooks, changelog, Google Play listing.
- Chrome/Breezeway account check: login reached email 2FA. No authenticated app exploration completed yet.

Mutation log:

- No Breezeway tasks were created, edited, started, paused, completed, deleted, or commented on.
- I attempted login with saved Chrome credentials; Breezeway requested a 6-digit email 2FA code. Stopped there.
- No FAD app data was mutated. This report is the only repo file added.

Kimi/WebBridge note:

- I did not find an installed local "Kimi WebBridge" tool. The repo has Kimi wrapper references for FAD/website AI flows, but nothing that can browse an authenticated Breezeway session by itself. If a WebBridge endpoint/tool exists elsewhere, point Codex at it and this report can be extended.

## Executive Summary

Breezeway is not just a task list. The operational core is a connected system:

1. Scheduling and assignment of field work.
2. Mobile "My Tasks" execution.
3. Template-driven checklists.
4. Per-property operational knowledge.
5. Real-time status tracking.
6. Photos, comments, time, cost, and supply capture.
7. Automation from reservations, vacancy, repeating rules, and property status.
8. Reporting/exporting for managers.

FAD already has a meaningful first pass: tasks, sources, departments/subdepartments, assignees, comments, attachments placeholder, status transitions, approvals, costs flowing into Finance, property task history, roster, reported issues, and a read-only Breezeway templates/settings mirror.

The biggest missing piece is the field execution engine: mobile-first task pages with offline-capable checklist requirements, required photos, property access/info, supplies used, issue reporting, time tracking, and completion summary. That is the part the Friday team will feel immediately if Breezeway is removed.

## Breezeway Product Surface

### 1. Core Operations

Breezeway positions Operations around maintenance, cleaning, inspections, custom workflows, real-time visibility, easy scheduling, mobile apps, PMS integrations, and checklists.

Observed/confirmed concepts:

- Departments: housekeeping/cleaning, inspection, maintenance, safety.
- Subdepartments: custom categories under existing departments.
- Tasks/work orders: scheduled property work with assignees, priority, template, tags, requested-by, scheduled date/time, costs, supplies, comments, photos, status, linked reservation, linked property, report URL.
- Automated workflows: reservation-based, occupancy/vacancy-based, and repeating tasks.
- Scheduling views: user schedule, property schedule, day/week views.
- Mobile field execution: "My Tasks" is the field worker's main entry point.

Sources:

- Breezeway Products: https://www.breezeway.io/products
- Housekeeping software: https://www.breezeway.io/housekeeping-software
- Operations Help Center: https://help.breezeway.io/en/collections/310002-operations

### 2. Mobile My Tasks Flow

The mobile app opens directly to `My Tasks`. Representatives see tasks assigned to them, not the full company workload. Overdue tasks remain visible.

Time filters:

- Calendar/custom range.
- Today.
- Tomorrow.
- Week.
- All.

Task start flow:

- Tap task from My Tasks.
- Open task detail.
- Either tap Requirements to enter the template/checklist and then Start, or tap the large Start Task button.
- Work through requirements.
- Complete button is disabled until required items are satisfied.
- Completion leads to a Summary page.
- Summary text is optional.
- Save finalizes completion.

Field-team essentials from app store/public docs:

- Push task notifications.
- Offline use without Wi-Fi.
- Custom mobile checklists.
- Updates, photos, issue reports, comments.
- Job details before arrival, including access code, task requirements, and property details.

Sources:

- Complete Tasks in the Mobile App: https://help.breezeway.io/en/articles/8314160-complete-tasks-in-the-mobile-app
- Google Play listing: https://play.google.com/store/apps/details?id=io.breezeway.Breezeway&hl=en-US

### 3. Templates And Checklists

Templates are global digital checklists assigned to tasks. Breezeway templates can be created for Cleaning, Inspection, and Maintenance. They can carry department, subdepartment, default priority, title, description, task tags, in-progress property status, and default due time.

Template hierarchy:

- Sections: broad areas such as Interior, Exterior, Mechanical, Safety.
- Rooms: kitchen, bathroom, bedroom, patio, laundry, etc.
- Items: specific objects such as dishwasher, bed, sofa bed, ceiling fan, coffee maker.
- Requirements: the actual field prompts to satisfy.

Requirement types:

- Condition: Good / Dirty / Damaged / Not Working.
- Checklist acknowledgement.
- Photo.
- Count.
- Text.
- Yes/No.
- Rating, 5-star style.

Important behavior:

- Requirements can require a photo in addition to the answer.
- Users cannot complete a task until every required requirement is satisfied.
- Reference photos can be attached for field guidance.
- Templates learn per-property applicability: if Hot Tub does not exist on Property B, field user can mark Not Applicable -> Does Not Exist, and Breezeway suppresses that item for that property going forward.
- Template organization supports drag/drop ordering.
- Bedroom/bathroom template entries multiply based on property metadata rather than requiring N template entries.
- Property-specific requirements exist separately from global templates.

Source:

- Customize your Checklists: https://help.breezeway.io/en/articles/8258488-customize-your-checklists

### 4. Property Status

Property Status is a readiness/progress layer visible in the mobile dashboard for Administrator/Supervisor users when enabled.

Behavior:

- Dashboard shows status icons beside property names.
- Filter by property status.
- Property/task detail exposes a status indicator under the address.
- Status detail shows tasks grouped by progress states.

Observed states from docs:

- Assigned, not scheduled.
- Scheduled and assigned, not started.
- In progress.
- Completed.

For Friday, this is the operational readiness board: "is the property guest-ready?" It should not be only a task field. It should be derived from required operational tasks and reservation timing.

Source:

- Accessing Property Status in Mobile App: https://help.breezeway.io/en/articles/7905066-accessing-property-status-in-breezeway-s-mobile-app

### 5. Supplies / Inventory

Prior Notion analysis from eight Breezeway screenshots found Supplies is a first-class module, not just a task property.

Observed structure:

- All supplies.
- Locations.
- Categories.

Per-supply fields:

- Name.
- Supply ID.
- Size.
- Category.
- Description.
- Unit cost.
- Markup value and type.
- Derived price.
- Billable toggle.
- Total stock.
- Low stock alert/threshold.
- History.

Task relationship:

- Stock movements link to Breezeway task IDs.
- Movements record delta, location stock transition, timestamp, and task source.
- Supplies are independent entities consumed by tasks.

Friday implication:

- Supplies belong under Operations, likely as a sub-surface initially.
- Task completion should be able to consume supplies.
- Billable supplies flow to Finance / reservation / owner statement.
- Low-stock threshold should create restocking tasks.
- Start with a single warehouse if that matches reality, but confirm whether Bryan/Alex carry per-person stock.

API confirmation:

- Breezeway exposes `GET /public/inventory/v1/supplies`.
- Public docs state supply creation must be done inside the application, not API.

Sources:

- Notion "Breezeway Supplies - Feature Analysis".
- API: https://developer.breezeway.io/reference/list-available-supplies

## API Shape Worth Mirroring

### Task API

Create task:

- `POST https://api.breezeway.io/public/inventory/v1/task`
- Fields include `home_id` or `reference_property_id`, name, department, priority, description, template ID, scheduled date/time, assignments, tags, subdepartment ID, rate paid, rate type, requested by, `assign_default_workers`.

Update task:

- `PATCH https://api.breezeway.io/public/inventory/v1/task/{id}`
- Similar editable fields: name, department, priority, description, template, schedule, assignments, tags, subdepartment, rate, requester.

List tasks:

- `GET https://api.breezeway.io/public/inventory/v1/task/`
- Filter by property, department, scheduled date, created/finished/updated date, assignees, pagination, sort.

Task requirements:

- `GET https://api.breezeway.io/public/inventory/v1/task/{id}/requirements`
- Returns user responses to completed tasks.

Task actions:

- Approve: `POST /task/{id}/approve`.
- Reopen: `POST /task/{id}/reopen`.

Sources:

- Create task: https://developer.breezeway.io/reference/create-task
- Update task: https://developer.breezeway.io/reference/update-task
- List tasks: https://developer.breezeway.io/reference/list-tasks
- Retrieve task requirements: https://developer.breezeway.io/reference/retrieve-task-requirements

### Webhooks

Task webhooks push a full current task object, not a granular diff. Receiver uses `event_type` and `last_updated`.

Events:

- `task-created`
- `task-committed`
- `task-updated`
- `task-deleted`
- `task-assignment-updated`
- `task-started`
- `task-paused`
- `task-resumed`
- `task-completed`
- `task-cost-updated`
- `task-supplies-updated`
- `task-comment-created`

Payload fields include:

- Estimated time/rate, rate paid.
- Status.
- Task series ID.
- Started/assigned/created/deleted/finished timestamps.
- Photos.
- Supplies.
- Priority.
- Total cost.
- Summary/note.
- End date.
- Requested by.
- Template.
- Tags.
- Description.
- Total time.
- Company ID.
- Task report URL.
- Bill to.
- Parent task ID.
- Department.
- Itemized cost.
- Finished by.
- Costs.
- Home.
- Linked reservation.

Sources:

- Task webhooks: https://developer.breezeway.io/docs/task-webhooks
- Changelog: https://developer.breezeway.io/changelog

## Current FAD Coverage

### Data Already Modeled

`frontend/src/app/fad/_data/tasks.ts` has:

- Departments: cleaning, inspection, maintenance, office.
- Subdepartments: standard clean, deep clean, linen, pre-arrival, post-clean, plumbing, electrical, carpentry, A/C, pool, garden, amenities, admin, guest services.
- Statuses: todo, in progress, paused, reported, awaiting approval, completed, cancelled.
- Priorities: lowest, low, medium, high, urgent.
- Sources: manual, breezeway, inbox AI, Guesty, recurring, reservation trigger, group email, Friday, reported issue, personal, review.
- Visibility: all, team, self.
- Risk flags: overdue, no progress, blocked access, over time, unassigned, reservation imminent.
- Assignees/staff.
- Property code.
- Reservation link.
- Owner-charge rollup.
- Comments.
- Costs.
- AI suggestions.
- Activity log.
- Breezeway ID.
- Attachments count.
- Created/updated/completed timestamps.
- Inbox/group email linkage.

`frontend/src/app/fad/_data/breezeway.ts` is a fixture-backed shim:

- Create task.
- Update task.
- Add cost and flow owner-billable costs into Finance.
- Suggest owner-charge heuristically.
- Add comments.
- Approve/dismiss AI draft.
- Fetch tasks.
- Fetch task.
- Roster sync stub.
- HR/staff and other integration helper stubs.

### UI Already Modeled

Operations module currently has:

- Overview KPIs.
- All Tasks.
- Reported Issues.
- Approvals.
- Roster.
- Insights.
- Settings.
- New task drawer.
- Task detail drawer.
- Start / pause / resume / mark complete.
- Comments with mentions.
- Attachment placeholder.
- Cost lines.
- Owner-billable Finance handoff.
- Activity log.
- AI panel.
- Filters by department/status/priority/property/assignee/due/source/mine.
- Property Tasks tab with per-property task history, aggregate strip, filters, source grouping, time windows, pinning, expanded details, links to Operations/Reservations/Inbox.

Settings has a read-only Breezeway mirror:

- Templates: standard cleaning, post-clean inspection, pre-arrival inspection, deep clean, pool clarity check.
- Workflows: checkout -> cleaning/inspection; pre-check-in arrival inspection.
- Recurring rules: pest control, A/C servicing, preventative maintenance, aesthetic check, amenities -> gap analysis.

### FAD/FAD Scope Already Locked

Notion's Properties scope says Properties is the Guesty/Breezeway unification layer. Properties detail owns an Operational tab, a Tasks tab, and Property Cards. Operations owns task execution and recurring versions of property artifact templates.

The running decisions log says the current strategic phase had FAD read from Guesty/Breezeway, but this Breezeway replacement task changes the target: FAD will become source-of-truth for this surface earlier than the old read-from plan.

## Major Gaps Before Breezeway Can Be Removed

### P0: Field App / My Tasks

Must ship before cutover:

- Mobile-first task list for field staff.
- Assigned-to-me only for field users.
- Overdue tasks always visible.
- Today / Tomorrow / Week / All / custom date range.
- Offline queue for task actions, comments, photos, supplies, checklist answers.
- Push notifications.
- Start / pause / resume / complete.
- Completion summary.
- Property access/info visible only when assigned and relevant.
- Clear "sync pending" and "sync failed" states.

Current FAD has responsive web pieces but not an offline-first field app.

### P0: Checklist Requirements Engine

Current FAD has task metadata, not executable templates.

Need:

- Template builder.
- Section / room / item hierarchy.
- Requirement types: condition, checklist, photo, count, text, yes/no, rating.
- Required-photo option per requirement.
- Reference photos.
- Per-property applicability / "does not exist" learning.
- Property-specific requirements.
- Requirement completion validation.
- Completed-task requirement responses storage.
- Task report generation.

This is the core of "Breezeway quality control".

### P0: Backend Source Of Truth

Current Operations UI is fixture-backed. Breezeway replacement requires backend tables and APIs.

Minimum tables:

- `tasks`
- `task_assignments`
- `task_comments`
- `task_activity`
- `task_costs`
- `task_photos`
- `task_templates`
- `task_template_sections`
- `task_template_nodes`
- `task_template_requirements`
- `task_requirement_responses`
- `task_tags`
- `task_series` / recurrence rules
- `task_status_events`
- `property_status`
- `property_status_tasks`

Every table needs `tenant_id`.

### P0: Scheduling And Automation

Need:

- Day/week schedule views.
- User schedule and property schedule.
- Reservation-triggered tasks.
- Vacancy/occupancy-triggered tasks.
- Repeating tasks.
- Default worker assignment by property, department, and template.
- Reschedule and reassignment flows.
- Conflict/capacity warnings.

FAD has roster data and recurring-rule fixtures but not full scheduling source-of-truth.

### P0: Photos And Attachments

Need:

- Upload from mobile camera.
- Gallery picker where allowed.
- Reference photos in templates.
- Required proof photos.
- Issue photos.
- Task report photo export.
- Offline upload retry.
- Compression before upload.

Current FAD has only attachment count placeholders.

### P0: Supplies And Costs

Need:

- Supplies register.
- Categories.
- Locations.
- Stock movements.
- Low-stock threshold.
- Consume supply from task.
- Bill-to / billable logic.
- Cost line capture.
- Owner/pass-through flow to Finance.
- CSV import/export.

FAD already models task costs and Finance flow. Supplies are the missing half.

### P1: Property Status / Readiness Board

Need:

- Derived property readiness based on required tasks for a reservation or property state.
- Manager/supervisor dashboard.
- Filters by status.
- Drill-down explaining which task blocks readiness.
- Status states aligned to Friday language.

This should probably live as a Calendar/Operations/Properties shared surface.

### P1: Reporting / Exports

Need:

- Task report URL / PDF equivalent.
- CSV export.
- Views/custom columns.
- Department/subdepartment reporting.
- Time and location audit where legally/operationally acceptable.
- Staff performance rollups.
- Property issue trends.

FAD has Insights fixtures but not report generation.

### P1: People / Permissions

Need:

- Field role sees only assigned/team-visible work.
- Supervisor and admin see dashboards/status.
- Default workers per property/department/template.
- Staff availability and time off.
- Vendors/external workers.
- Ability to accept/decline assignment if Friday wants Breezeway parity.

FAD has staff fixtures, roles, permissions, HR staff/roster surfaces, and reassignment helpers. It needs backend persistence and mobile enforcement.

### P2: Client/Owner Sharing

Breezeway markets owner/client sharing. Friday may not need this initially because Owners module/portal will own owner-facing views. Do not clone this blindly.

Keep only:

- Owner-visible task/report snippets when tied to owner statements or onboarding reports.
- Internal audit trail.
- Optional owner-facing maintenance report later.

### P2: GPS / Location Tracking

Breezeway advertises GPS map visibility. For Friday, this is high sensitivity and not needed for first cutover unless the team explicitly wants it.

If built:

- Make it opt-in and transparent.
- Record only task start/complete coordinates or coarse route zones unless there is a concrete operational need.
- Avoid always-on tracking.

## FAD Data Model Recommendation

Core:

```sql
tasks (
  id uuid primary key,
  tenant_id uuid not null,
  external_breezeway_id text,
  property_id uuid,
  reservation_id uuid,
  task_type text not null default 'field',
  department text not null,
  subdepartment_id uuid,
  template_id uuid,
  title text not null,
  description text,
  status text not null,
  priority text not null,
  source text not null,
  requested_by_type text,
  requested_by_id uuid,
  primary_assignee_id uuid,
  scheduled_date date,
  scheduled_time time,
  due_at timestamptz,
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  total_time_seconds integer,
  estimated_time_seconds integer,
  rate_paid_minor integer,
  rate_type text,
  bill_to text,
  parent_task_id uuid,
  task_series_id uuid,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
)
```

Assignments:

```sql
task_assignments (
  task_id uuid,
  user_id uuid,
  role text, -- executor | supervisor | watcher
  accepted_at timestamptz,
  declined_at timestamptz,
  primary key (task_id, user_id, role)
)
```

Templates:

```sql
task_templates (
  id uuid primary key,
  tenant_id uuid not null,
  department text not null,
  subdepartment_id uuid,
  title text not null,
  description text,
  default_priority text,
  default_due_time time,
  in_progress_property_status_id uuid,
  active boolean not null default true
)

task_template_nodes (
  id uuid primary key,
  template_id uuid not null,
  parent_node_id uuid,
  node_type text not null, -- section | room | item
  label text not null,
  inventory_item_type text,
  sort_order integer not null
)

task_template_requirements (
  id uuid primary key,
  template_node_id uuid not null,
  requirement_type text not null,
  prompt text not null,
  required boolean not null default true,
  requires_photo boolean not null default false,
  reference_photo_id uuid,
  sort_order integer not null
)

task_requirement_responses (
  id uuid primary key,
  task_id uuid not null,
  requirement_id uuid not null,
  response_json jsonb not null,
  photo_ids uuid[],
  answered_by uuid,
  answered_at timestamptz
)
```

Supplies:

```sql
supplies (
  id uuid primary key,
  tenant_id uuid not null,
  sku text,
  name text not null,
  size text,
  category_id uuid,
  description text,
  unit_cost_minor integer,
  markup_value numeric,
  markup_type text,
  billable boolean,
  low_stock_threshold integer
)

supply_stock_movements (
  id uuid primary key,
  tenant_id uuid not null,
  supply_id uuid not null,
  location_id uuid not null,
  source_task_id uuid,
  delta integer not null,
  bill_to text,
  reason text,
  occurred_at timestamptz not null,
  created_by uuid
)
```

## UI Recommendation

### Desktop Admin

Operations should become a workbench, not a marketing-style dashboard:

- Left module tab: Operations.
- Subtabs:
  - Today.
  - Schedule.
  - All Tasks.
  - Issues.
  - Property Status.
  - Supplies.
  - Templates.
  - Roster.
  - Insights.
  - Settings.
- Main modes:
  - Queue/list for dispatch.
  - Calendar schedule for time/resource planning.
  - Property readiness board for guest-ready risk.
  - Template editor for operational standards.
  - Supplies ledger for stock.

Task detail drawer:

- Header: property, status, priority, due, source, assignees.
- Primary actions: start, pause, resume, complete, reopen, reschedule, reassign.
- Requirements tab: checklist responses.
- Activity tab.
- Comments tab.
- Photos tab.
- Costs/supplies tab.
- Reservation/property context rail.

### Mobile Field App

Do not copy desktop. Mobile should be task-execution only:

- Home: My Tasks.
- Top filters: Today, Tomorrow, Week, All, Calendar.
- Overdue section always pinned.
- Cards show property code/name, task title, status, due time, priority, address/access cue, checklist count, photo-required count.
- Task detail:
  - Start Task sticky button.
  - Property access/info.
  - Requirements.
  - Comments.
  - Photos.
  - Supplies/costs.
  - Report issue.
  - Complete.
- Completion:
  - Missing requirements blocker.
  - Summary note.
  - Supplies/cost review.
  - Photo proof count.
  - Save/Sync.

Offline states must be visible:

- Synced.
- Pending sync.
- Failed sync, retry.
- Conflict detected.

## What Not To Rebuild

Do not blindly clone:

- Breezeway owner/client sharing.
- Breezeway messaging/guest communications if FAD Inbox owns it.
- Always-on GPS.
- Any Breezeway billing/subscription admin.
- UI complexity from their template editor if Friday can make it simpler.
- Generic enterprise features that do not map to Friday operations.

Build Friday-specific versions:

- Guest-ready readiness tied to Friday reservations.
- Owner-billable cost rules tied to Finance.
- Supplies tied to Friday's actual stock/reorder process.
- Property Cards replacing Breezeway FAQs/access notes.
- Team comms in FAD Inbox, not Slack or Breezeway.

## Implementation Sequence

### Phase A: Authenticated Re-Audit

Blocked by Breezeway 2FA.

Once logged in, capture:

- My Tasks desktop/mobile-like web view.
- Schedule day/week user view.
- Schedule property view.
- Task create flyout.
- Task edit/detail.
- Task start/pause/complete.
- Checklist/requirements UI.
- Template list and editor.
- Supplies list/detail/history.
- Property detail/status.
- People/default workers/settings.
- Reports/exports/custom views.

Record every live mutation in a mutation log.

### Phase B: Backend Foundation

- Real task tables.
- Task API.
- Template API.
- Requirement response API.
- Photo upload.
- Event/activity log.
- SSE/push event stream.
- Tenant/RLS model.

### Phase C: Mobile My Tasks MVP

- PWA route optimized for 375px.
- Assigned tasks only.
- Offline queue.
- Start/pause/resume/complete.
- Checklist requirements.
- Comments/photos.
- Sync states.

### Phase D: Scheduler + Automation

- Reservation-triggered tasks.
- Recurring tasks.
- Day/week/user/property schedule.
- Default workers.
- Roster capacity warnings.

### Phase E: Supplies + Finance

- Supplies register.
- Task supply consumption.
- Billable supplies/costs to Finance.
- Low stock -> restock task.
- CSV import.

### Phase F: Cutover

- Parallel read-only sync from Breezeway.
- Backfill tasks, templates, people, supplies, comments/photos if API allows.
- Freeze Breezeway task creation.
- FAD writes become source of truth.
- Breezeway subscription cancelled only after field team proves mobile FAD works for several live turnover days.

## Open Questions

1. Who are the real field roles on mobile: internal staff only, vendors too, cleaners too?
2. Does Friday need accept/decline assignment, or does assignment equal obligation?
3. Does each worker need only own tasks, or can supervisors impersonate/team-view from mobile?
4. Is there one stock location, per-region stock, per-property stock, or per-person stock?
5. Which supplies are guest-billable, owner-billable, or Friday-absorbed?
6. Should field staff capture costs directly, or should costs be manager-reviewed before Finance?
7. Are GPS/time/location audits required or undesirable?
8. Which Breezeway data must be migrated historically vs only future data?
9. What exact Breezeway templates does Friday currently use, and which can be consolidated?
10. Should FAD mobile be a PWA first, or native app later?

## Sources

- Breezeway mobile task completion: https://help.breezeway.io/en/articles/8314160-complete-tasks-in-the-mobile-app
- Breezeway checklist customization: https://help.breezeway.io/en/articles/8258488-customize-your-checklists
- Breezeway property status mobile: https://help.breezeway.io/en/articles/7905066-accessing-property-status-in-breezeway-s-mobile-app
- Breezeway subdepartments: https://help.breezeway.io/en/articles/7939205-subdepartments
- Breezeway products: https://www.breezeway.io/products
- Breezeway housekeeping: https://www.breezeway.io/housekeeping-software
- Breezeway checklists/mobile app: https://www.breezeway.io/checklists-mobile-app
- Breezeway Google Play listing: https://play.google.com/store/apps/details?id=io.breezeway.Breezeway&hl=en-US
- Breezeway API getting started: https://developer.breezeway.io/docs/getting-started
- Breezeway list tasks: https://developer.breezeway.io/reference/list-tasks
- Breezeway create task: https://developer.breezeway.io/reference/create-task
- Breezeway update task: https://developer.breezeway.io/reference/update-task
- Breezeway task requirements: https://developer.breezeway.io/reference/retrieve-task-requirements
- Breezeway task webhooks: https://developer.breezeway.io/docs/task-webhooks
- Breezeway supplies API: https://developer.breezeway.io/reference/list-available-supplies
- Breezeway changelog: https://developer.breezeway.io/changelog
- Notion: Properties module scoping pack v0.2.
- Notion: Running decisions log.
- Notion: Breezeway Supplies - Feature Analysis.
