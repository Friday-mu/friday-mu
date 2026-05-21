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
