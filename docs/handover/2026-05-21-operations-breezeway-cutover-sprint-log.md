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
