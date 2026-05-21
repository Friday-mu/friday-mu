# Operations Breezeway Cutover - Wave 7 Handover

Date: 2026-05-21
Worktree: `/Users/judith/.codex/worktrees/7fa0/friday-admin-dashboard`
Branch target: `fad-rebuild`

## Shipped

- Manager-only Operations Overview workbench: stale-open reminders, manager triage counts, supply-prep flags, unassigned-task count, and staff load.
- Pure signal helper in `frontend/src/app/fad/_data/managerWorkbench.ts` so manager oversight rules stay testable and do not create another task system.
- Overview actions route into existing task/subpage surfaces:
  - stale task row opens the task drawer;
  - reported issues opens `sub=issues`;
  - Inbox AI opens Ops-owned `sub=inbox-ai`;
  - all/unassigned opens `sub=all`;
  - roster opens `sub=roster` only when permission allows it.
- Mobile shell utility buttons keep 44px targets at phone widths after the 320px pass found squeezed brand/header icon buttons.

## Research Notes

- Current `fad-rebuild` already had the task surfaces Wave 7 needs, so the implementation connects manager decisions instead of introducing new routes.
- `origin/fad-design-os-v01-frontend` did not contain a better manager-workbench primitive to port.
- Feature Catalog `fad-dashboard-shell` confirmed this should use the existing hardcoded module router boundary.
- Notion Mobile UX Doctrine drove the one-hierarchy phone layout, visible actions, persistent labels, and 320/375/430/768/desktop QA.
- Breezeway mobile screenshots supported property-grouped agenda plus status/issue counts, but FAD keeps field staff out of create/schedule/triage controls.
- External references:
  - W3C WCAG 2.2 target-size guidance: https://w3c.github.io/wcag/understanding/target-size-minimum
  - MDN ARIA `status` role: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/status_role

## Verification

- `cd frontend && npx tsc --noEmit --pretty false --incremental false`
- `cd frontend && npm run build`
- Restored `frontend/next-env.d.ts` back to `./.next/dev/types/routes.d.ts`
- `cd frontend && npx tsc --noEmit --pretty false --incremental false`
- `git diff --check`
- Browser QA against local mock API:
  - `http://127.0.0.1:3335/api/tasks`
  - `http://127.0.0.1:3023/fad?m=operations&sub=overview`
  - Checked page identity, nonblank render, no framework overlay, 0 Browser console errors/warnings, Inbox AI navigation, stale-row task drawer open, and responsive viewport sweep.
  - Field role-gate smoke forced `sub=overview` while switched to Field and rendered assigned-only My Tasks with no manager workbench.

## QA Evidence

- Screenshots and metrics:
  - `docs/handover/qa-screenshots-2026-05-21-wave7/manager-workbench-320.png`
  - `docs/handover/qa-screenshots-2026-05-21-wave7/manager-workbench-375.png`
  - `docs/handover/qa-screenshots-2026-05-21-wave7/manager-workbench-430.png`
  - `docs/handover/qa-screenshots-2026-05-21-wave7/manager-workbench-768.png`
  - `docs/handover/qa-screenshots-2026-05-21-wave7/manager-workbench-1440.png`
  - `docs/handover/qa-screenshots-2026-05-21-wave7/metrics.json`
- Viewport results: 0 horizontal overflow at 320/375/430/768/1440; manager-workbench controls had 0 small targets.
- Residual shell note: the global Ask Friday search input itself measures 21px high at 768/desktop, but it sits inside the larger header search pill and was not changed in this Operations slice.

## Test Data

- Mock API was local-only and not committed.
- Mock tasks covered:
  - stale in-progress urgent task;
  - blocked access task;
  - `source=reported_issue`, `status=reported`;
  - `source=inbox_ai`, `status=reported`, `external_ref=pending_action:qa-1`;
  - supply requirement task;
  - unassigned open task;
  - assigned ready task for staff load.

## Blockers / Next

- Backend persistence was not touched in Wave 7.
- Push notifications/offline reminders are still later-wave work; stale-open reminders are visible in-app only.
- Manager schedule/weekly planning, property readiness board, restock inventory thresholds, template management, and reassignment flows remain for subsequent Wave 7 slices.
