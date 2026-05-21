# FAD Mobile UI Audit — 2026-05-20

Worktree: `/Users/judith/repos/friday-admin-dashboard/.claude/worktrees/fad-design-os`
Branch: `fad-design-os-v01-frontend`
Viewport: `375x812`

## Scope

- Bryan / field-staff tenant visibility and direct-route access.
- Director route sweep across current FAD modules.
- Mobile shell interactions: hamburger nav, command palette, notification bell, Ask Friday drawer.
- Layout checks: blank screens, horizontal overflow, direct deep links, full-screen drawer behavior.
- PWA/staff-facing audit pass after Notion research addendum.

Evidence folder: `/tmp/fad-mobile-audit-2026-05-20`

Notion research:

- Parent: `FAD Mobile UX Doctrine + QA Plan — 2026-05-20`
- Addendum: `FAD Mobile PWA UX Deep Research Addendum — 2026-05-20`
- Addendum URL: `https://www.notion.so/36643ca88492814092d7cedafa8c951b`

## Bryan / Field Staff

Status: pass after patch.

- JWT resolves `bryan@friday.mu` to `realRole=field`.
- Stale local `fad:dev-role` no longer grants View-as access to non-directors.
- `/fad?m=inbox` renders Inbox with only the `Team` chip.
- Guest, owner, vendor, and other external inbox chips are hidden.
- Guest thread content is not visible.
- View-as switcher is hidden.
- Direct URLs for `finance`, `tenant-settings`, `billing`, `admin-analytics`, `notifications`, `properties`, and `design` render the permission-denied state.
- Field-accessible modules still render: `operations`, `reservations`, `hr`, `settings`.
- Ask Friday suggestions for Finance, guest inbox, and owner/intelligence prompts are hidden for field users.

Latest 375px evidence:

- `/tmp/fad-mobile-audit-2026-05-20/field-inbox.png`
- `/tmp/fad-mobile-audit-2026-05-20/field-operations.png`
- `/tmp/fad-mobile-audit-2026-05-20/field-calendar.png`
- `/tmp/fad-mobile-audit-2026-05-20/field-admin-analytics-denied.png`
- `/tmp/fad-mobile-audit-2026-05-20/field-finance-denied.png`
- `/tmp/fad-mobile-audit-2026-05-20/field-properties-denied.png`

## Director Route Sweep

Status: pass.

Routes checked at 375px:

- `/fad?m=inbox`
- `/fad?m=operations`
- `/fad?m=calendar`
- `/fad?m=reservations`
- `/fad?m=properties`
- `/fad?m=design`
- `/fad?m=finance`
- `/fad?m=hr`
- `/fad?m=notifications`
- `/fad?m=settings`
- `/fad?m=tenant-settings`
- `/fad?m=billing`
- `/fad?m=admin-analytics`

Results:

- No blank screens.
- No document-level horizontal overflow.
- Module deep links keep `?m=` instead of being erased by Friday fullscreen initialization.
- Main mobile header stays usable.
- Hamburger navigation opens the sidebar overlay.
- Command palette opens and stays within viewport.
- Ask Friday drawer opens full-width on mobile with no overflow.

Latest 375px route sweep:

- `/tmp/fad-mobile-audit-2026-05-20/home-friday.png`
- `/tmp/fad-mobile-audit-2026-05-20/inbox-guest.png`
- `/tmp/fad-mobile-audit-2026-05-20/inbox-team-clicked.png`
- `/tmp/fad-mobile-audit-2026-05-20/operations-overview.png`
- `/tmp/fad-mobile-audit-2026-05-20/operations-all.png`
- `/tmp/fad-mobile-audit-2026-05-20/calendar.png`
- `/tmp/fad-mobile-audit-2026-05-20/reservations-overview.png`
- `/tmp/fad-mobile-audit-2026-05-20/reservations-all.png`
- `/tmp/fad-mobile-audit-2026-05-20/properties-overview.png`
- `/tmp/fad-mobile-audit-2026-05-20/properties-all.png`
- `/tmp/fad-mobile-audit-2026-05-20/finance-overview.png`
- `/tmp/fad-mobile-audit-2026-05-20/notifications.png`

The audit script used a 375x812 mobile context with stubbed auth/module endpoints to avoid fake-token 401 redirects while preserving module rendering. Some live backend requests still 401 locally with the synthetic token (`/api/tasks`, `/api/reservations`, `/api/team/users`), so content-density conclusions for those live-data panels should be re-run with a real local login.

## Findings

### P0 — Field Staff Needs A Real My Tasks Mobile Surface

`Operations` still opens as an admin-style module with sub-tabs, a search/filter slab, and an All tasks mental model. That is not the daily field workflow. Mobile field staff need a dedicated `My Tasks` surface that starts with today/next assigned work and exposes:

- start / pause / complete
- checklist
- photo upload
- comments / mentions
- expense capture
- offline queue / sync state

Current evidence:

- `/tmp/fad-mobile-audit-2026-05-20/field-operations.png`
- `/tmp/fad-mobile-audit-2026-05-20/operations-all.png`

### P0 — TeamInbox Empty State Is Stale For Field Staff

Field users correctly see only the `Team` chip, but the empty state still says internal team chat lands with the next inbox sprint. TeamInbox is now a committed daily surface, so this copy is misleading and undermines trust.

Fix direction: replace with a live-data empty state: no channels/DMs yet, mention setup/sync status, and keep the composer hidden until a channel or DM exists.

Evidence:

- `/tmp/fad-mobile-audit-2026-05-20/field-inbox.png`
- `/tmp/fad-mobile-audit-2026-05-20/inbox-team-clicked.png`

### P1 — Mobile Feedback FAB Occludes Work Surfaces

The global feedback FAB sits over bottom-left content on every mobile module. It visibly covers property cards and would compete with task/photo/comment/expense controls in a field workflow.

Fix direction: hide the FAB on phone/PWA and expose feedback through the header help menu, or dock it only in a non-overlapping utility sheet.

Evidence:

- `/tmp/fad-mobile-audit-2026-05-20/properties-overview.png`
- `/tmp/fad-mobile-audit-2026-05-20/operations-all.png`
- `/tmp/fad-mobile-audit-2026-05-20/calendar.png`

### P1 — Inbox Chip Row Can Clip The Active Context

The guest inbox chip row scrolls horizontally. After switching to `Team`, the row can leave earlier chips partly clipped at the left edge. It is not blocking, but it makes the current filter row feel unstable and cheap on mobile.

Fix direction: make the selected chip scroll into view, add edge fades, or replace the long chip row with a segmented primary switch plus filter sheet.

Evidence:

- `/tmp/fad-mobile-audit-2026-05-20/inbox-guest.png`
- `/tmp/fad-mobile-audit-2026-05-20/inbox-team-clicked.png`

### P1 — Calendar Should Be Agenda-First On Mobile

Calendar defaults to `Week` controls and category chips. On a phone/PWA, staff need immediate answers: where, when, property, task/reservation, assignee, and next action. A week/month visual model should be secondary to a today/next-days agenda.

Evidence:

- `/tmp/fad-mobile-audit-2026-05-20/calendar.png`

### P2 — Mobile Header Is Usable But Too Heavy

The header technically fits at 375px, but the full brand mark, wide search pill, Friday icon, and avatar consume too much first-viewport space. For a field PWA, this should become a compact app bar with command/search behind one control and more vertical space for work.

Evidence:

- All screenshots in `/tmp/fad-mobile-audit-2026-05-20`

## Notes / Non-Blocking Polish

- Settings uses a horizontally scrollable tab row; this is acceptable on 375px, but the final tab can sit offscreen until swiped.
- Notification toggle dots are visually small, though their row height remains tappable.
- Local audit used synthetic JWTs. Remaining `401` responses in the route sweep are from backend endpoints that verify JWT signatures and should be re-run under a real dev login before content-density decisions.
- Offscreen sidebar elements appear in automated overflow lists because the mobile sidebar is translated off-canvas while closed; screenshots confirm no document-level horizontal scroll.

## Verification

- `cd frontend && npm run test` — passed.
- `cd frontend && npx tsc --noEmit` — passed.
- `cd frontend && npm run build` — passed.
- Mobile audit script: 17 routes at `375x812`, screenshot evidence in `/tmp/fad-mobile-audit-2026-05-20`.
