# Multi-tenant safety audit — 2026-05-24

> Tracks T3.2 in [`FAD_BACKLOG.md`](FAD_BACKLOG.md).
> Scope: cross-tenant SQL leakage in backend. Phase 1 FAD tenant = FR; this audit prepares for non-FR rollout.
> Time-boxed sweep of high-traffic surfaces. **Not exhaustive.** Sections marked "DEFERRED" need a follow-up pass.

## TL;DR

- **Most FAD code is tenant-safe.** `tasks/`, `inbox/conversations_read`, `inbox/consult`, `mcp/`, `fad/friday`, `expenses/`, my W1 `properties/` + `reservations/`, and `ai_usage` all consistently filter SQL by `tenant_id`.
- **One major gap: `website_inbox/*`.** ~30 SQL sites operate on `inbox_threads` / `inbox_events` / `inbox_guesty_jobs` without tenant filters — because those tables don't have a `tenant_id` column. This is a **known limitation** documented in `backend/server.js:1024`: `// TODO: gate when tenant-scoped — website_inbox tables aren't yet`. Fixing requires a dedicated migration + backfill + 30+ SQL updates + flow regression. Not a one-session fix.
- **Several surfaces deferred** because they weren't load-bearing today: `ask_friday_*`, `design_*`, `hr_*`, `push_subscriptions`, `learning_events`, `kb_candidates`, `context_packs`. Spot-checks during W1 work showed these use tenant_id, but no thorough pass tonight.

## Verified SAFE (tenant_id filter present on every reviewed SQL site)

| Surface | Pattern |
|---|---|
| `backend/src/tasks/index.js` | `WHERE id = $1 AND tenant_id = $2` on every UPDATE/DELETE; LIST filters by `t.tenant_id = $1` |
| `backend/src/inbox/conversations_read.js` | `WHERE id = $1 AND tenant_id = $2` consistently |
| `backend/src/inbox/consult.js` | `WHERE id = $1 AND tenant_id = $2` |
| `backend/src/mcp/index.js` | `ctx.tenantId` plumbed through every query |
| `backend/src/fad/friday.js` loaders | `WHERE tenant_id = $1` on every context loader |
| `backend/src/finance/expenses.js` | `WHERE id = $1 AND tenant_id = $2` |
| `backend/src/properties/index.js` (W1 today) | Multi-tenant from day one; every route/sub-route filtered |
| `backend/src/reservations/index.js` (W1 today) | Multi-tenant from day one |
| `backend/src/tenants/ai_usage.js` (`recordUsage`) | Takes `tenantId` arg; INSERT always includes it |

## HIGH severity finding (known limitation)

**`backend/src/website_inbox/*`** — operates on tables that don't have a `tenant_id` column (mig 033 is pre-multi-tenant era).

Affected tables (created in `033_website_inbox.sql`):
- `inbox_threads` — no `tenant_id` column
- `inbox_events` — no `tenant_id` column
- `inbox_guesty_jobs` — no `tenant_id` column
- `inbox_drafts` (if it exists in 033 or elsewhere — check)

Affected files + leak count:
- `backend/src/website_inbox/threads.js` — 5 sites: lines 148, 207, 237, 282, 346, 450, 462 (SELECT/UPDATE WHERE id = $1)
- `backend/src/website_inbox/drafts.js` — 6 sites: lines 309, 337, 463, 616, 675, 757
- `backend/src/website_inbox/ai_handoff.js` — 3 sites: lines 323, 360, 486
- `backend/src/website_inbox/jobs.js` — 3 sites: lines 75, 117, 133
- `backend/src/website_inbox/webhook.js` — 2 sites: lines 108, 213
- `backend/src/inbox/drafts_read.js:53` — `SELECT * FROM drafts WHERE id = $1` (check if drafts is the website_inbox draft or a different table)

**Acceptable today** because FAD is FR-only, so all `inbox_threads` rows belong to FR by definition. **Blocker for non-FR rollout.**

Fix (separate sprint):
1. Add `tenant_id UUID NOT NULL DEFAULT '00000000-...001'::uuid REFERENCES tenants(id) ON DELETE CASCADE` to `inbox_threads`, `inbox_events`, `inbox_guesty_jobs`, `inbox_drafts`. Backfill existing rows to FR.
2. Update every SQL site to filter by `tenant_id` (use `req.tenantId` from `attachIdentity`). Some routes (GET /threads, PATCH /threads/:id) currently don't even use `attachIdentity` — add the middleware so `req.tenantId` is available.
3. Regression test the website_inbox flows: AI handoff, manual reply, mark paid, draft approval, Guesty confirm worker.
4. Verify the `publishFadEvent` calls don't leak cross-tenant.

Effort: M-L (1-2 days of focused work + careful testing of website handoff flow).

## Not yet audited (deferred to follow-up)

These subsystems have tenant_id columns and use tenant_id in spot-checked queries, but weren't exhaustively reviewed tonight:
- `ask_friday_*` tables — Ask Friday Core. Spot-check (mcp/index.js shows clean tenant scoping). Need to verify the analyzer worker + the kb_candidates publishing flow are tenant-isolated.
- `design_*` tables — design module. Wrapped in `requireDesignPerm` middleware; queries spot-checked OK in `ai_ask.js`. Need a deeper pass on the design CRUD routes.
- `hr_*` tables — HR roster. Need to confirm.
- `push_subscriptions` — when sending a push to a user, do we verify the subscription is in the same tenant?
- `learning_events`, `kb_candidates`, `context_packs` — Ask Friday Core learning loop. Verify the scheduler + analyzer don't leak across tenants.

## Audit method (what I did)

1. Counted SQL surfaces: ~1086 `query(` calls across 114 files.
2. Per high-risk tenant-scoped table (`guesty_listings`, `guesty_reservations`, `inbox_threads`, `tasks`, `expenses`, `push_subscriptions`, `ai_usage`, `fad_properties`, `fad_reservations`), grepped for `FROM/JOIN/UPDATE/INTO/DELETE FROM` references and counted hits.
3. For tables with >5 hits, sampled the most concerning patterns (`WHERE id = $1` without tenant guard).
4. Walked the actual route handlers to confirm whether `req.tenantId` is plumbed through.
5. Cross-referenced server.js comments + migration timestamps to distinguish "bug" from "known limitation".

## Audit method (what I didn't do)

- Did not parse every SQL string into AST + check each.
- Did not write automated test that proves cross-tenant leakage is impossible.
- Did not audit every route's auth middleware chain.
- Did not check service workers / background jobs as deeply as HTTP routes.
- Did not audit Friday Website's `/api/public/*` consumption surface (FAD as integration source per §5.7 lock).

## Recommendation

- **Before non-FR tenant rollout**: complete the website_inbox tenant-id migration (deferred follow-up) + finish the deferred subsystem audits.
- **For ongoing development**: write tenant safety into every new migration (always include `tenant_id NOT NULL REFERENCES tenants(id)` + indexes). The W1 properties + reservations work followed this pattern; keep it.
- **Optional**: add a CI lint rule that flags `WHERE id = $1` patterns on known-tenant-scoped tables without an accompanying `tenant_id` clause.
