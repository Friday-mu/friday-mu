# Operations/Breezeway Cutover Wave 6 Handover

Date: 2026-05-21
Worktree: `/Users/judith/.codex/worktrees/7fa0/friday-admin-dashboard`
Branch target: `fad-rebuild`

## Scope

Wave 6 added task-linked supply capture, starter SRL/welcome-pack loadouts, and inventory movement events. It did not build a full Inventory module UI; this checkpoint keeps the execution surface in Operations and creates durable downstream records for Inventory/Finance.

## Shipped

- `backend/migrations/053_task_supplies_inventory.sql`
  - Adds `stock_movements` for inventory ledger events.
  - Adds `task_supplies` for task-linked supply consumption.
  - Supports owner-billable supply rows and optional links to generated task cost lines.
- `backend/src/tasks/index.js`
  - Adds supply shaping/loading on task detail/idempotent create responses.
  - Adds `POST /api/tasks/:id/supplies`.
  - Adds `DELETE /api/tasks/:taskId/supplies/:supplyId`.
  - Owner-billable supply rows with a unit cost create a linked `task_costs` material line.
- `frontend/src/app/fad/_data/tasks.ts`
  - Adds `TaskSupply`, `TaskSupplyCategory`, and `supply_used` activity kind.
- `frontend/src/app/fad/_data/tasksClient.ts`
  - Maps server supplies and adds `addSupply`.
- `frontend/src/app/fad/_data/supplies.ts`
  - Starter supply catalog, stock locations, and SRL/welcome-pack loadout helper.
  - Tagged `@demo:data` / `PROD-DATA-50`; `frontend/DEMO_CRUFT.md` updated.
- `frontend/src/app/fad/_components/modules/operations/AddSupplyDrawer.tsx`
  - Mobile-safe supply capture drawer with native labels, decimal input hints, inline errors, stock location, owner-billable toggle, and estimated cost.
- `frontend/src/app/fad/_components/modules/operations/TaskDetail.tsx`
  - Shows Supplies section, suggested loadouts, recorded supply rows, owner-billable Finance note, and activity evidence.
  - Supply requirements are automatically satisfied by recorded supplies.
- `frontend/src/app/fad/fad.css`
  - Adds responsive supply drawer/rows/loadout styles with 44px mobile targets.

## Verification

- `node --check backend/src/tasks/index.js` passed.
- `cd frontend && npx tsc --noEmit --pretty false --incremental false` passed.
- `cd frontend && npm run build` passed.
- Restored `frontend/next-env.d.ts` after build changed it, then reran typecheck successfully.
- `git diff --check` passed.
- Browser plugin interaction QA:
  - URL: `http://127.0.0.1:3022/fad?m=operations&sub=all&task=qa-supply-1`.
  - Mock API: `http://127.0.0.1:3334`.
  - Opened task detail, opened Add supply from suggested loadout, checked owner-billable, submitted Bath towel x 6, verified supply row, generated cost row, requirements `3/3`, and completion to `completed`.
  - Browser console: 0 errors, 0 warnings.
- Playwright viewport sweep:
  - 320, 375, 430, 768, 1440 screenshots saved under `docs/handover/qa-screenshots-2026-05-21-wave6/`.
  - No visible horizontal overflow or clipped primary action controls.
  - Playwright console had 0 errors and one Next dev font-preload timing warning.

## Evidence

- `docs/handover/qa-screenshots-2026-05-21-wave6/supply-flow-320.png`
- `docs/handover/qa-screenshots-2026-05-21-wave6/supply-flow-375.png`
- `docs/handover/qa-screenshots-2026-05-21-wave6/supply-flow-430.png`
- `docs/handover/qa-screenshots-2026-05-21-wave6/supply-flow-768.png`
- `docs/handover/qa-screenshots-2026-05-21-wave6/supply-flow-1440.png`
- `docs/handover/qa-screenshots-2026-05-21-wave6/supply-row-browser.png`
- `docs/handover/qa-screenshots-2026-05-21-wave6/metrics.json`

## Research Inputs

- Current `fad-rebuild` task/cost implementation.
- `origin/fad-design-os-v01-frontend` Add Cost implementation: no supply/inventory primitive to port.
- Feature Catalog: no inventory primitive; currency picker note only.
- Notion Mobile UX Doctrine: persistent labels, inline errors, visible primary actions, 44-48px touch targets.
- Breezeway mobile screenshots: Costs and Supplies as first-class task rows.
- Local cost-to-Finance brief: preserve owner-billable cost path.
- Online references:
  - MDN `inputmode`: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inputmode
  - MDN `input type="number"`: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/number
  - W3C WAI form validation: https://www.w3.org/WAI/tutorials/forms/validation/

## Blockers / Risks

- The supply catalog/loadout rules are starter data, tagged as demo/config until Inventory exposes real catalog and stock locations.
- Full Inventory UI, stock counts, restock/transfer flows, and reconciliation are not implemented in this wave.
- PWA offline durable queue for supplies is still a later wave; this slice only preserves the existing visible offline failure pattern in task execution.

## Test Data

- Mock task ID: `qa-supply-1`.
- Mock supply created during QA: Bath towel, quantity 6, linen cupboard, owner-billable.
- Mock generated task cost: `Supply: Bath towel x 6 pc`, MUR 1,140.
