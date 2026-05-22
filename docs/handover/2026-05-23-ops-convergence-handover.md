# Ops Convergence Handover - 2026-05-23

This document hands over the current Operations module state for the next FAD convergence session. It includes the Ops UI work that landed, current live SHA evidence, pending Ops backlog, and coordination boundaries.

## Current Git State

- Worktree used for this handover: `/Users/judith/.codex/worktrees/fad-ops-schedule-responsive-20260523`
- Ops code branch: `codex/fad-ops-schedule-responsive-20260523`
- Ops code head: `62c154205168ea5df3ca0f82f7dcb52335813b41`
- `origin/fad-rebuild`: `62c154205168ea5df3ca0f82f7dcb52335813b41`
- `origin/codex/fad-ops-schedule-responsive-20260523`: `62c154205168ea5df3ca0f82f7dcb52335813b41`
- Branch status before this handover doc: clean and fully pushed.
- Backend touched by Ops UI pass: no.

Live production evidence checked during handover:

- `https://admin.friday.mu/version.json` reports frontend commit `62c154205168ea5df3ca0f82f7dcb52335813b41`, deployed `2026-05-22T23:08:55Z`.
- `https://admin.friday.mu/api/version` reports backend commit `dc151ff76e736dc2f73126f56ff5961ace6d5c98`, built `2026-05-22T23:05:41Z`.
- This means the latest Ops UI work is live on the frontend. The backend is one commit behind the frontend because `62c1542` is frontend-only.

## Exact Ops Files Touched

The final Ops UI commits touched only:

- `frontend/src/app/fad/_components/modules/OperationsModule.tsx`
- `frontend/src/app/fad/fad.css`

Relevant commits now in `origin/fad-rebuild`:

- `2fd08a72d4e4b3a4f6244f49931919796594d6b4` - `Tighten Ops schedule and my task density`
- `62c154205168ea5df3ca0f82f7dcb52335813b41` - `Fix Ops schedule planner width`

This handover document is documentation-only and should not be treated as a frontend/backend product change.

## What Landed In Ops

Desktop/mobile density and schedule fixes:

- Schedule task cards were made tighter and less metadata-heavy.
- Schedule status visuals were made quieter and lifecycle-oriented instead of everything reading as heavy green blocks.
- Schedule grid width was fixed so late rows such as "After 8 PM" no longer extend beyond the viewport on the tested widths.
- Schedule page duplicate header `New task` action was removed; task creation should be driven by the main Operations task action rather than duplicated schedule header controls.
- My Tasks card density was reduced, with less repeated secondary metadata.
- Ops CSS was adjusted only for the Operations module schedule/task surfaces.

Live authenticated browser check after the responsive fix:

- URL checked: `https://admin.friday.mu/fad?m=operations&sub=schedule`
- Real production data loaded.
- Open task count observed: 19.
- Schedule right-edge gap was measured at about 1 px.
- New task drawer was not open by default in that check.
- Duplicate schedule header `New task` button was absent.
- Browser console had no new schedule errors in that smoke.

## Verification Run

The Ops UI work was verified with:

- `cd frontend && npx tsc --noEmit --pretty false --incremental false`
- `cd frontend && npm run build`
- `git diff --check`
- Local Playwright responsive checks at `1600`, `1440`, `1280`, `900`, and `390` widths.
- Authenticated live browser smoke against `admin.friday.mu` schedule with real data.

Data caveat:

- Direct shell `curl` to task endpoints without browser auth returns `401`, so authenticated in-browser evidence was used for live real-data UI checks.
- Local Playwright checks used deterministic mocked task data to verify responsive behavior.

## Calendar And Schedule Planner Assumptions

Schedule Planner:

- Backend schedule support is live:
  - `/api/tasks?unscheduled=true`
  - `/api/reservations?date_mode=overlap`
- The Schedule Planner should keep using real task and reservation data from those APIs.
- Imported or restricted tasks may show generic titles such as `Imported task (details restricted)` when source data is sparse or access-limited. Do not replace those with fake details.
- Source labels should remain operator-facing (`Imported`, `Reported`, `Reservation`, `Inbox AI`) rather than Breezeway-branded noise.
- Requirements should not appear on tasks unless the backend/task template actually has requirements. If production rows show requirement bleed, audit task data and template derivation before hiding it in CSS.

Calendar:

- Calendar is parked for the next coordinated FAD convergence slice.
- Known Calendar/Schedule-adjacent issue: duplicate/clipped/live-task wiring needs a separate audit.
- Do not fold Calendar into the Ops-only UI simplification pass unless explicitly coordinated.

## Known Blockers And Regressions To Recheck

PWA/stale client visibility:

- User reported not seeing some changes immediately.
- Likely needs a service worker/update-banner/cache invalidation audit.
- This is shared app shell/PWA territory, so coordinate before changing global update behavior.

New task drawer behavior:

- Duplicate `New task` action on Schedule header was removed.
- A later report said the old new-task panel kept appearing.
- Live smoke did not reproduce the drawer auto-opening, but it still needs a focused repro against URL params, local/session storage, PWA state, and `CreateTaskDrawer` lifecycle.

Full Breezeway-like Ops simplification is not finished:

- The first density pass reduced obvious schedule/My Tasks heaviness, but it did not complete every screen.
- Overview, All Tasks, Reported Issues, History, Roster, Insights, and Settings still need a screen-by-screen design pass.
- Keep the target as a dense operations cockpit: smaller typography, tighter rows, fewer repeated labels, clearer status, and more progressive disclosure.

Roster and Insights:

- Roster is wired to real team/task data, but earlier AI analysis/drafting affordances were lost during data wiring.
- Insights has been observed as thin/empty and needs a real-data audit.
- Do not add fake insight cards. Either derive from real task/HR data or show honest empty states.

AI task creation:

- User wants a top task input where an operator can type natural language like "assign this to Brian tomorrow because X happened", with AI filling title/description/assignee/date.
- Current task creation is not a real LLM-backed workflow.
- Any implementation should create real `/api/tasks` records and keep the editable details form as confirmation/correction.

Booking-triggered tasks:

- User asked whether Guesty booking events already create Ops tasks automatically.
- This needs verification from backend routes/jobs/webhook flow and production data.
- Do not assume it is live because schedule APIs exist.

Comments and mentions:

- Task comments should use Team Inbox-style `@` mention autocomplete rather than always-visible large mention chips.
- Existing historical handovers indicate comment mention plumbing exists, but the current UI should be rechecked for visual heaviness and compatibility.
- Coordinate before touching shared comments/mentions components or Inbox-owned surfaces.

Reported Issues and Field flow:

- Field staff should be able to report issues from My Tasks without duplicated issue buttons.
- Directors/managers create tasks rather than "report issues" in the field-staff sense, but the UX should make that clear.
- Recheck field role permissions:
  - no Reservations.
  - HR should be Time Off request/status and possibly personal stats only.
  - no Permissions, Money, Tenant Settings, Billing, Admin Analytics.

Requirements/demo data:

- User saw tasks with requirements that may not have real requirements.
- Audit whether this is persisted production data, template derivation, or leftover demo/cruft behavior.
- Do not solve by hiding real requirements globally; distinguish invalid/demo bleed from valid task checklists.

Responsive layout:

- Schedule width issue was fixed for tested desktop/tablet/mobile widths.
- Tablet and narrow laptop still use internal horizontal scroll for dense schedule grids; this is mechanically safe but may still feel heavy.
- Mobile pass remains pending. The next UI pass should make mobile smaller, more minimal, and more collapsible without losing key actions.

Global FAB overlap:

- Some mobile action areas can be affected by global floating controls.
- This is shared shell/FAB territory and should be handled in the OS Friday FAB convergence work, not by this Ops-only slice.

## Pending Ops Slices

1. Real-data Ops audit, screen by screen:
   - Overview
   - My Tasks
   - All Tasks
   - Schedule Planner
   - Reported Issues
   - History
   - Roster
   - Insights
   - Settings

2. Desktop UI simplification continuation:
   - Reduce typography scale and button/card bulk.
   - Convert repeated metadata into compact chips, hover details, drawers, or expanded rows.
   - Make status/completion visually obvious in Schedule and task lists.
   - Ensure sorting by time/overdue state is obvious in My Tasks and Reported Issues.
   - Make source/origin labels useful but quiet.

3. Mobile Ops pass:
   - Audit 320/375/390/430 widths.
   - Remove horizontal page overflow.
   - Keep one hierarchy per phone screen.
   - Use collapsible detail and drawer-first flows instead of showing every field by default.

4. Task creation assistant:
   - Design/implement natural-language task creation on top of real `/api/tasks`.
   - Keep editable confirmation fields.
   - Reuse existing assignee/property/date parsing where safe, but do not ship fake AI behavior as real AI.

5. Schedule Planner functional audit:
   - Confirm unscheduled task list.
   - Confirm reservation overlap context.
   - Confirm completion/status visibility.
   - Confirm real assignee names where available.
   - Confirm no fake individual task detail.

6. Roster/Insights recovery:
   - Restore useful roster analysis/draft affordances only if backed by real HR/team/task data.
   - Add honest empty/loading states.
   - Avoid demo staffing claims.

7. Booking automation audit:
   - Trace Guesty booking flow to Ops task creation.
   - Document what is live, what is planned, and what requires backend work.

8. Field access and HR permissions regression pass:
   - Verify field staff route visibility and module sidebar.
   - Verify HR shows only field-appropriate time-off/stat views.
   - Verify finance/admin/settings surfaces are hidden.

9. Comment mention UI cleanup:
   - Replace always-visible large chips with `@` autocomplete behavior.
   - Confirm task comments remain source-of-truth and TeamInbox/Notifications are event surfaces only.

10. Production stale-client/PWA update pass:
   - Coordinate because it touches shared app shell/PWA behavior.
   - Goal: users should reliably see newly deployed FAD assets without manual guessing.

## Shared Files And Areas To Avoid Until Coordinated

Avoid changing these in an Ops-only session:

- `backend/src/inbox/*`
- `backend/src/website_inbox/*`
- `backend/src/fad/friday.js`
- Inbox module files, Friday Consult, DraftPanel, inbox clients.
- Website AI handoff and human takeover/presence contracts.
- `backend/src/public/team_presence.js`
- WhatsApp burner bridge files.
- `frontend/src/app/fad/_components/FridayDrawer.tsx`
- `frontend/src/app/fad/_components/FridayFullscreen.tsx`
- `frontend/src/app/fad/_data/fridayClient.ts`
- shared `FadApp.tsx`, sidebar, module header, shell/FAB, global PWA/update behavior.
- shared comments/mentions components unless the exact intended file list is coordinated first.
- shared palette/layout primitives and broad `fad.css` changes unless scoped tightly and coordinated.
- Calendar files until the Calendar UX/data audit slice starts.

Ops-safe areas for future work:

- `frontend/src/app/fad/_components/modules/OperationsModule.tsx`
- `frontend/src/app/fad/_components/modules/operations/*`
- `frontend/src/app/fad/_components/modules/roster/*`
- Ops-only display helpers under `_data/*` only when needed for Operations UI cleanup.

## Handoff Recommendation

The next FAD convergence session should start from fresh latest `origin/fad-rebuild`, currently `62c154205168ea5df3ca0f82f7dcb52335813b41` at the time this handover was written.

Recommended order:

1. Recheck remote and live state.
2. Read this document and the older `docs/handover/2026-05-22-ops-desktop-audit-handover.md`.
3. Coordinate with the Inbox/FAD session before touching shared shell/FAB/global CSS.
4. Handle OS Friday FAB, Calendar UX/data audit, and push notifications in the convergence session.
5. Continue Ops UI simplification only inside the Ops-owned files unless a coordinated shared change is explicitly listed.
