# Inbox Frontend Merge Conflict Note - 2026-05-21

## Context

- Current Ops worktree: `/Users/judith/.codex/worktrees/7fa0/friday-admin-dashboard`
- Current HEAD / `origin/fad-rebuild`: `be67b91` (`Add Breezeway task import tooling`)
- Inbox source branch: `origin/fad-design-os-v01-frontend`
- Inbox source tip inspected: `c68f9e2` (`fix(inbox): restore consult launcher`)

## Decision

Do not merge `origin/fad-design-os-v01-frontend` wholesale into `fad-rebuild`.

The branch merge is not conflict-free and would overwrite current Ops work. A dry merge-tree shows conflicts, including current Ops task/supply code. The source branch also deletes or replaces files owned by the Ops sprint.

## Hard Conflicts / Unsafe Overwrites

Full branch diff includes these unsafe Operations reversions:

- Deletes `frontend/src/app/fad/_components/modules/operations/AddSupplyDrawer.tsx`
- Deletes `frontend/src/app/fad/_data/managerWorkbench.ts`
- Deletes `frontend/src/app/fad/_data/supplies.ts`
- Deletes `frontend/src/app/fad/_data/taskCommentBridge.ts`
- Deletes `frontend/src/app/fad/_data/taskRequirements.ts`
- Deletes `backend/src/tasks/breezewayImport.js`
- Deletes `backend/migrations/052_task_requirements.sql`
- Deletes `backend/migrations/053_task_supplies_inventory.sql`
- Deletes `backend/migrations/054_breezeway_task_import.sql`
- Modifies `backend/src/tasks/index.js`, `backend/server.js`, `frontend/src/app/fad/_data/tasksClient.ts`, and `frontend/src/app/fad/_data/useApiTasks.ts`

These are all current Ops-owned surfaces and should not be overwritten by an Inbox frontend merge.

## Frontend-Only Conflict

The apparent Inbox frontend slice is still not a blind checkout because `frontend/src/app/fad/_data/teamInbox.ts` is shared:

- Current `fad-rebuild` version contains the Ops task-comment mention bridge helpers:
  - `recordTaskCommentTeamMessage`
  - `taskCommentTeamMessages`
  - `allTeamMessages`
  - `TeamMessage.taskComment`
- Inbox branch version expands live TeamInbox types and removes the Ops local task-comment bridge helpers.

Replacing this file would break the current Operations comment-to-TeamInbox bridge.

## Backend Coupling

The pushed Inbox frontend depends on backend routes/modules that are not present in current `fad-rebuild`:

- `frontend/src/app/fad/_data/inboxClient.ts` calls `/api/inbox/*`
- `frontend/src/app/fad/_data/draftsClient.ts` calls `/api/inbox/drafts/*`, `/api/outbound/send`
- `frontend/src/app/fad/_data/teamInboxClient.ts` calls `/api/team/*`
- `frontend/src/app/fad/_data/websiteInboxClient.ts` calls `/api/inbox/website/*`

Those routes live on the Inbox/design branch under `backend/src/inbox`, `backend/src/outbound`, `backend/src/team_inbox`, `backend/src/website_inbox`, and migrations `052_team_inbox` onward. Pulling those backend files directly would collide with Ops migration numbering and task migrations.

## Safe Merge Path

Recommended next step:

1. Inbox session creates a branch based on current `origin/fad-rebuild`, not the old design branch base.
2. Port only Inbox frontend files needed for the current live UI:
   - `frontend/src/app/fad/_components/FridayConsult.tsx`
   - `frontend/src/app/fad/_components/modules/InboxModule.tsx`
   - `frontend/src/app/fad/_components/modules/inbox/*`
   - `frontend/src/app/fad/_data/inboxClient.ts`
   - `frontend/src/app/fad/_data/inboxTimeline.ts`
   - `frontend/src/app/fad/_data/draftsClient.ts`
   - `frontend/src/app/fad/_data/outboundClient.ts`
   - `frontend/src/app/fad/_data/teamInboxClient.ts`
   - `frontend/src/app/fad/_data/websiteInboxClient.ts`
   - `frontend/src/components/types.ts` for `resolveApiBase` and `formatConfidencePercent`
3. Manually reconcile `frontend/src/app/fad/_data/teamInbox.ts` so it keeps both:
   - Inbox live TeamInbox type expansion
   - Ops `taskComment` bridge compatibility exports
4. Separately plan backend Inbox route integration with renumbered migrations after current Ops migrations, preserving `050_tasks.sql` through `054_breezeway_task_import.sql`.
5. Run frontend build/typecheck and at least an Inbox smoke pass before pushing.

Until that reconciliation is done, merging the pushed Inbox frontend into `fad-rebuild` would not be safe or complete.
