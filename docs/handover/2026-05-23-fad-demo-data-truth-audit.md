# FAD Demo Data Truth Audit - 2026-05-23

## Purpose

This note tracks demo/fixture data risks that must be cleaned before FAD modules or Ask Friday treat data as operational truth.

The immediate trigger was a fake-looking Finance sidebar badge showing `6` even though Finance is not fully backend-wired. That count is almost certainly fixture-derived from finance approvals, not a live operational count.

## Current Baseline

- Canonical branch checked: `origin/fad-rebuild @ 62c154205168ea5df3ca0f82f7dcb52335813b41`
- Related branch already pushed: `origin/codex/fad-no-demo-data-20260523 @ 169ea9b36c6c8766df4e95a14342531c6abdbb20`
- That branch touches:
  - `frontend/src/app/fad/_components/modules/ReviewsModule.tsx`
  - `frontend/src/app/fad/_data/demoMode.ts`

Do not assume the no-demo branch fully solves the issue. It should be reviewed and either merged/cherry-picked or superseded by a broader truth gate.

## Immediate Findings

### Finance

Risk:

- `frontend/src/app/fad/_data/finance.ts` is fixture/demo data.
- `frontend/src/app/fad/_data/financeAnomalies.ts` is fixture/demo data.
- `frontend/src/app/fad/_data/pendingCounts.ts` imports finance fixture state and can surface misleading sidebar/subpage badges.

Required behavior:

- No Finance sidebar badge unless it is backed by a real API/source-of-truth count.
- Do not show fixture finance urgency in production.
- Finance can remain visible, but it must be truthful: empty state, coming-soon state, or limited real capture surface.

Near-term allowed Finance scope:

- Expense/cost capture tied to real Ops tasks.
- No full finance claims until backend truth exists.

### Notifications

Real path exists:

- `frontend/src/app/fad/_data/notificationsClient.ts`
- Backend route in `backend/src/realtime/index.js`
- Expected API surface includes `/api/events/notifications` and mark-read behavior.

Risk:

- Older/local notification sources still exist, including `frontend/src/app/fad/_data/notifications.ts` and bridge logic around task/comment mentions.
- The panel/sidebar must not fall back to invented notifications when real API data is empty.

Required behavior:

- Notifications panel uses real backend notifications only.
- Empty means empty; do not invent operator work.
- If notification delivery is incomplete, show a truthful empty/degraded state.

### Reviews

Risk:

- `frontend/src/app/fad/_data/reviews.ts` includes fixture/demo structures.
- `frontend/src/app/fad/_data/reviewsClient.ts` also exists and should be the live path where available.
- `origin/codex/fad-no-demo-data-20260523` includes a partial Reviews/demo-mode fix.

Required behavior:

- Verify live Reviews API behavior before treating Reviews as usable or Ask-Friday-readable.
- No persisted demo reviews in production.
- If the API is unavailable, show a truthful unavailable/empty state.

### HR

Risk:

- HR has live client code but also fixture staff/time-off data in older data files.
- Some pages may fall back to fixture staff/time-off values.

Required behavior:

- Confirm Staff, Time Off, Stats, Permissions use backend-wired data where claimed.
- Any fallback demo rows must be development-only or removed from production.
- Ask Friday must not infer staffing, time off, payroll, or permissions from fixture data.

### Training

Risk:

- Training/teachings were discussed as real/editable, but module surfaces may still contain old demo scaffolding.

Required behavior:

- Teachings must be real and editable through the current source of truth.
- Learning candidates/analyzer behavior must not be faked in production.
- Ask Friday can read teachings only from the real source.

### Design

Risk:

- Design was recovered from prior work and may hydrate from fixture arrays/adapters.

Required behavior:

- Confirm recovered projects are real/persisted where expected.
- If a Design sub-surface is demo-only, mark it unavailable to Ask Friday context.

### Calendar

Risk:

- User reported duplicate reservations, date-line UI breakage, and possible stale/regressed code.

Required behavior:

- Calendar should use real reservations/tasks.
- Cross-links should point to real modules.
- No dummy people/tasks/reservations in the operational view.

### Properties And Reservations

Risk:

- Historically built frontends may still use fixtures.
- User wants v1 layered over Guesty/FAD data, not a full Guesty replacement.

Required behavior:

- Properties and Reservations v1 should read from FAD-owned cached tables/services over Guesty data.
- Reservations is the cross-module anchor.
- Property cards/context must be real before Ask Friday uses them for guest replies or internal actions.

## Ask Friday Truth Policy

Ask Friday must not summarize, recommend, or execute based on fixture/demo data as if it were real.

Required context gate:

- Each context block should identify source and freshness.
- Demo/fixture-backed blocks should be excluded from production prompts by default.
- If a module is unavailable, Ask Friday should say it cannot see that live data yet.
- Internal actions should execute only against real APIs and auditable records.

## Recommended Implementation Order

1. Suppress Finance fixture-derived sidebar/subpage badges.
2. Force Notifications panel/sidebar to real-only.
3. Review and merge or supersede `origin/codex/fad-no-demo-data-20260523`.
4. Add a central production/demo context guard for Ask Friday.
5. Audit Reviews, HR, Training, Design, Calendar, Properties, Reservations before allowing Ask Friday to read them.
6. Add focused smoke checks proving empty/unavailable states are truthful.

## Acceptance Checks

- Finance sidebar does not show fake `6`.
- Notifications panel shows only real notifications or a truthful empty/degraded state.
- Reviews do not show fake persisted reviews.
- Ask Friday cannot cite fake Finance, HR, Review, Training, Calendar, Property, or Reservation data.
- Production build has no operational urgency derived from demo fixtures.
