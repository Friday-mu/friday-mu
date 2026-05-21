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
