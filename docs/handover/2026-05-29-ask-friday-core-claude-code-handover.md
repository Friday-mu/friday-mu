# Ask Friday Core - Claude Code Handover

Date: 2026-05-29
Audience: Claude Code continuation session
Repo: `/Users/judith/repos/friday-admin-dashboard`
Canonical branch: `origin/fad-rebuild`

## Current Truth

As of this handover:

- `origin/fad-rebuild`: `2a118654fa7ea2121f530284da4c13198af629a6`
- Live frontend: `https://admin.friday.mu/version.json` reports `2a118654`
- Live backend: `https://admin.friday.mu/api/version` reports `2a118654`
- This means the latest Ask Friday Core work described below is already included in the live deployed SHA, bundled with the FAD frontend/Ops evidence upload work.

Do not deploy just to sync docs-only work. If you make backend changes, coordinate and deploy FE+BE together from the same SHA.

## Naming

- Assistant/intelligence layer: **Ask Friday**
- Runtime/control plane: **Ask Friday Core**
- Whole product/platform: **FridayOS**
- Do not use the retired assistant label in UI, docs, prompts, handovers, or public/product wording.

## Recovery Order

Start from a fresh worktree, not a dirty checkout:

```bash
cd /Users/judith/repos/friday-admin-dashboard
git fetch origin --prune
git ls-remote origin refs/heads/fad-rebuild
git worktree add /Users/judith/.codex/worktrees/<your-ask-friday-worktree> origin/fad-rebuild
cd /Users/judith/.codex/worktrees/<your-ask-friday-worktree>
git status --short --branch
curl -fsS https://admin.friday.mu/version.json
curl -fsS https://admin.friday.mu/api/version
```

Before pushing:

```bash
git fetch origin --prune
git ls-remote origin refs/heads/fad-rebuild
git merge-base --is-ancestor origin/fad-rebuild HEAD
```

Never force-push. If remote moved, rebase or merge cleanly first.

## Read These First

Primary anchors:

- `/Users/judith/repos/friday-admin-dashboard/docs/architecture/ask-friday-core-manifest-2026-05-26.md`
- `/Users/judith/repos/friday-admin-dashboard/docs/architecture/ask-friday-completion-ledger-2026-05-26.md`
- `/Users/judith/repos/friday-admin-dashboard/docs/architecture/ask-friday-master-plan-v02-2026-05-26.md`
- `/Users/judith/repos/friday-admin-dashboard/docs/architecture/ask-friday-surface-subplans-2026-05-26.md`
- `/Users/judith/repos/friday-admin-dashboard/docs/architecture/ask-friday-plan2-kb-gap-tracker-2026-05-29.md`

Important supporting docs:

- `/Users/judith/repos/friday-admin-dashboard/docs/architecture/ask-friday-kb-research-factory-2026-05-26.md`
- `/Users/judith/repos/friday-admin-dashboard/docs/architecture/ask-friday-eval-mining-adr-plan-2026-05-26.md`
- `/Users/judith/repos/friday-admin-dashboard/docs/architecture/ask-friday-staff-use-evidence-runbook-2026-05-29.md`
- `/Users/judith/repos/friday-admin-dashboard/docs/architecture/ask-friday-feedback-retention-redaction-policy-2026-05-29.md`
- `/Users/judith/repos/friday-admin-dashboard/docs/architecture/ask-friday-right-panel-focus-contract-2026-05-29.md`
- `/Users/judith/repos/friday-admin-dashboard/docs/architecture/ask-friday-reservations-properties-source-matrix-2026-05-28.md`
- `/Users/judith/repos/friday-admin-dashboard/docs/architecture/ask-friday-reservation-property-tool-contracts-2026-05-28.md`
- `/Users/judith/repos/friday-admin-dashboard/docs/architecture/ask-friday-website-owner-feedback-source-matrix-2026-05-28.md`
- `/Users/judith/repos/friday-admin-dashboard/docs/architecture/ask-friday-public-owner-feedback-contracts-2026-05-28.md`

## Recent Ask Friday Core Work Now In `fad-rebuild`

Key commits:

- `a90eebba fix(ask-friday): harden ops and reservation planning signals`
  - Fixed reservation overlap semantics to include check-in and exclude checkout.
  - Added missing calendar-cache caveats.
  - Added deterministic Ops lunch coverage signal.
  - Added global-to-module learning event mirror test.
- `9caca8b2 feat(ask-friday): seed plan2 context pack drafts`
  - Added migration `112_ask_friday_plan2_context_pack_drafts.sql`.
  - Seeds non-destructive draft context-pack rows for Reservations/Calendar, Properties, and planned Owners shell.
- `f1246531 docs(ask-friday): add plan2 knowledge shells`
  - Added KB shells for Feedback Learning, Analytics, Finance, Legal/Admin, HR/Training, Guest Portal, Public MCP, and Internal Agent Bridge.
  - Indexed them in `backend/knowledge/index.json`.
- `dc819d80 feat(ask-friday): draft plan2 shell context packs`
  - Added generated draft context-pack templates for the broader Plan 2 shells.
  - Extended tests so template previews include the new shells.
- `2a118654` current live merge also includes Ops task evidence/photo upload work from the frontend/Ops session:
  - `backend/migrations/113_task_attachments.sql`
  - `backend/src/tasks/index.js`
  - `frontend/src/app/fad/_components/modules/operations/TaskDetail.tsx`
  - `frontend/src/app/fad/_data/taskAttachmentsClient.ts`

## Runtime Code Map

Ask Friday Core:

- `/Users/judith/repos/friday-admin-dashboard/backend/src/ask_friday/index.js`
- `/Users/judith/repos/friday-admin-dashboard/backend/src/ask_friday/context_pack_templates.js`
- `/Users/judith/repos/friday-admin-dashboard/backend/src/ask_friday/context_tools.js`
- `/Users/judith/repos/friday-admin-dashboard/backend/src/ask_friday/policy.js`
- `/Users/judith/repos/friday-admin-dashboard/backend/src/ask_friday/publisher.js`
- `/Users/judith/repos/friday-admin-dashboard/backend/src/ask_friday/analyzer.js`
- `/Users/judith/repos/friday-admin-dashboard/backend/src/ask_friday/eval_runner.js`
- `/Users/judith/repos/friday-admin-dashboard/backend/src/ask_friday/retention.js`

Inbox / Friday Consult:

- `/Users/judith/repos/friday-admin-dashboard/backend/src/inbox/consult.js`
- `/Users/judith/repos/friday-admin-dashboard/backend/src/inbox/whatsapp_window.js`
- `/Users/judith/repos/friday-admin-dashboard/backend/src/inbox/consult_lock.js`

Ops / Friday Consult:

- `/Users/judith/repos/friday-admin-dashboard/backend/src/operations/consult.js`

Global FAD Ask Friday:

- `/Users/judith/repos/friday-admin-dashboard/backend/src/fad/friday.js`

Knowledge shells:

- `/Users/judith/repos/friday-admin-dashboard/backend/knowledge/index.json`
- `/Users/judith/repos/friday-admin-dashboard/backend/knowledge/surfaces/`

Important migrations:

- `074_ask_friday_core.sql`
- `096_ask_friday_surface_registry_v02.sql`
- `097_ask_friday_seed_eval_cases.sql`
- `101_ask_friday_context_tools.sql`
- `105_ask_friday_plan2_eval_seeds.sql`
- `107_ask_friday_plan2_surface_readiness.sql`
- `109_ask_friday_learning_feedback_policies.sql`
- `110_ask_friday_eval_readiness_coverage.sql`
- `111_ask_friday_active_runtime_context_pack_drafts.sql`
- `112_ask_friday_plan2_context_pack_drafts.sql`
- `113_task_attachments.sql`

## What Is Actually Done

Plan 1:

- Inbox/Friday Consult has strong existing runtime harness and bug fixes.
- Ops/Friday Consult has meaningful guardrails for schedule/roster/task planning:
  - assignment guardrails;
  - occupied-property constraints;
  - availability/pricing caveats;
  - lunch coverage;
  - compact-first broad roster handling;
  - deterministic fallback for model exhaustion.
- Global FAD Ask Friday has Core state/readiness loading, page-focus envelope, TeamInbox context, and module learning mirrors.
- Website public Ask Friday Core wiring exists in the Website branch/session and FAD public context packs/scopes are live.

Plan 2:

- Reservations/Calendar and Properties are active governed Core shells, not full UI agents.
- Owners, Finance, Legal/Admin, HR/Training, Analytics, Guest Portal, Public MCP, and Internal Agent Bridge are planned/restricted shells.
- KB shells now exist for all of the above.
- Generated draft context-pack templates now exist for the broader Plan 2 shells.
- None of the restricted/planned shells should be treated as runtime-ready dedicated agents.

## What Is Not Done

Do not mark these complete:

- No published staff context packs for most staff shells.
- No dedicated UI agents for Reservations/Calendar, Properties, Owners, Finance, Legal/Admin, HR/Training, Analytics, Guest Portal, Public MCP, or Internal Agent Bridge.
- Feedback raw evidence retention/redaction policy is drafted but not approved/enforced end to end.
- Guest Portal needs separate stay-token/authenticated policy and route, not public Website context-pack route.
- Public MCP is contract/KB only; no MCP server implementation.
- Internal Agent Bridge is KB/contract only; no runtime intake harness yet.
- Finance/Legal/HR remain restricted planned shells. Do not expose them broadly or publish packs without review.
- Mary/Franny real staff-use proof remains the team-usefulness gate for Inbox/Ops, especially after the V2 UI settles.

## Coordination Boundaries

Recent frontend/Ops redesign session owns or has been touching:

- Operations module frontend
- GM screens
- `OperationsModule.tsx`
- Task detail/create drawers
- Ops data clients
- guest Inbox shell / V2 skin, if they proceed there
- global FAD CSS when coordinated

Ask Friday Core should avoid broad UI work unless explicitly coordinated.

Safe Ask Friday Core areas:

- `backend/src/ask_friday/*`
- `backend/knowledge/surfaces/*`
- Ask Friday docs under `docs/architecture/*`
- additive migrations for Ask Friday Core
- additive tests

Coordinate before changing:

- `backend/src/fad/friday.js`
- `backend/src/inbox/consult.js`
- `backend/src/inbox/whatsapp_window.js`
- `backend/src/operations/consult.js`
- frontend Ask Friday panel/composer
- guest Inbox shell files
- Operations frontend files currently owned by redesign/Ops work

## Current Verification Evidence

Before the final Ask Friday pushes, the Codex session ran:

```bash
npm --prefix backend test -- src/ask_friday/context_pack_templates.test.js src/ask_friday/index.test.js --runInBand
npm --prefix backend run build
npm --prefix backend test -- --runInBand
node --check backend/src/ask_friday/context_pack_templates.js backend/src/ask_friday/index.js
node -e "JSON.parse(require('fs').readFileSync('backend/knowledge/index.json','utf8'))"
git diff --check
rg -n 'O[S][ -]Friday|O[S]FRIDAY' docs backend frontend --glob '!frontend/node_modules/**' --glob '!backend/node_modules/**' --glob '!frontend/out/**' --glob '!frontend/.next/**'
```

Latest full backend run before the final push passed:

- 57 test suites
- 385 tests
- backend build passed

After fast-forwarding to `2a118654`, this session did not rerun the full suite again. Claude should rerun focused smoke/tests before further pushes.

## Immediate Smoke For Claude

Run after startup:

```bash
curl -fsS https://admin.friday.mu/version.json
curl -fsS https://admin.friday.mu/api/version
```

Then authenticated staff smoke if credentials/session are available:

- `/api/auth/me`
- `/api/ask-friday/core/readiness`
- `/api/ask-friday/core/context-pack-templates?includeWebsite=false&includePlan2Shells=true`
- `/api/ask-friday/core/context-tools/reservations`
- `/api/ask-friday/core/context-tools/properties`
- `/api/friday/ask`
- Ops Consult route used by `backend/src/operations/consult.js`
- Inbox Consult route used by `backend/src/inbox/consult.js`

Also verify migration state:

- `112_ask_friday_plan2_context_pack_drafts.sql`
- `113_task_attachments.sql`

## Recommended Next Slice

Best next Ask Friday-only slice:

1. Re-run current live/Core smoke from latest `origin/fad-rebuild`.
2. Inspect `/api/ask-friday/core/readiness` and list remaining warnings/blockers by surface.
3. Add eval seeds/review-lane coverage for newly shelled planned surfaces:
   - Finance: owner-statement privacy, no invented numbers, FR-only entity caveat, no payment mutation.
   - Legal/Admin: no legal advice, source citation, no contract/filing mutation.
   - HR/Training: restricted HR reviewer lane, no private HR/performance leak.
   - Guest Portal: wrong-stay access denial, access window, human takeover.
   - Public MCP: direct write denial, scope/registry denial, public-only grounding.
   - Internal Agent Bridge: raw transcript rejection, secret-like content rejection, provenance required.
   - Feedback: redacted summary quality and no raw screenshot-to-KB promotion.
   - Analytics: minimum cohort/confidence/source freshness checks.
4. Keep all restricted/planned shells non-runtime until Ishant approves source/privacy/reviewer policy.
5. Once the redesign session stabilizes UI, resume staff-use proof for Inbox and Ops with Mary/Franny.

Do not start with runtime wiring for Finance/Legal/HR/Public MCP/Guest Portal. The safer path is evals + review lanes + readiness reporting first.

## Paste-Ready Launch Prompt For Claude Code

```text
Continue Ask Friday Core work in Friday Admin Dashboard.

Repo: /Users/judith/repos/friday-admin-dashboard
Canonical branch: origin/fad-rebuild

First read:
- docs/handover/2026-05-29-ask-friday-core-claude-code-handover.md
- docs/architecture/ask-friday-core-manifest-2026-05-26.md
- docs/architecture/ask-friday-completion-ledger-2026-05-26.md
- docs/architecture/ask-friday-master-plan-v02-2026-05-26.md
- docs/architecture/ask-friday-plan2-kb-gap-tracker-2026-05-29.md

Start by:
1. git fetch origin --prune
2. git ls-remote origin refs/heads/fad-rebuild
3. create a fresh worktree from latest origin/fad-rebuild
4. verify live https://admin.friday.mu/version.json and /api/version
5. inspect /api/ask-friday/core/readiness and context-pack template preview
6. continue the next backend-safe Ask Friday Core slice

Current live expected at handover: 2a118654.

Guardrails:
- User-facing AI surface is Ask Friday.
- Runtime/control plane is Ask Friday Core.
- FridayOS is the broader product/platform.
- Do not use the retired assistant label.
- Do not deploy without explicit coordination.
- If backend changes are made, deploy FE+BE together from the same SHA.
- Do not touch active Operations/Inbox redesign UI files unless coordinated.
- Keep Finance, Legal/Admin, HR/Training, Guest Portal, Public MCP, and Internal Agent Bridge as planned/restricted shells until source/privacy/review policy and evals are ready.

Recommended next slice:
Add eval seeds and review-lane coverage for the newly shelled Plan 2 surfaces, then re-run backend tests/build. Do not runtime-wire restricted shells yet.
```
