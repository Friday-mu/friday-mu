# Ask Friday Core Manifest

Date: 2026-05-26
Status: recovery manifest and source map
Branch: `codex/ask-friday-autonomous-core-20260526`

## Purpose

This is the first file to read when resuming Ask Friday Core work.

It points to the docs, Notion mirrors, runtime KBs, handovers, and recovery checks needed to reconstruct the full plan after compaction, interruption, or parallel-agent handoff.

## Naming Rules

- Assistant/intelligence layer: Ask Friday.
- Runtime/control plane: Ask Friday Core.
- Whole platform/product: FridayOS.
- FAD staff module alias: Friday Consult.
- Retired/wrong assistant label: do not use it in UI, docs, public/product wording, prompts, handovers, branch names, or Notion titles.

## Immediate Resume Order

1. Read this manifest.
2. Read the completion ledger: `docs/architecture/ask-friday-completion-ledger-2026-05-26.md`.
3. Check repo and live truth:
   - `git status --short --branch`
   - `git fetch origin --prune`
   - `git rev-parse HEAD`
   - `git rev-parse origin/fad-rebuild`
   - live `https://admin.friday.mu/version.json`
   - live `https://admin.friday.mu/api/version`
4. Run naming scan:
   - `rg -n "\bO[S][ -]Friday\b|O[S]FRIDAY" docs backend frontend --glob '!frontend/node_modules/**' --glob '!backend/node_modules/**' --glob '!frontend/out/**' --glob '!frontend/.next/**'`
5. Choose one active plan:
   - Plan 1: production-useful Inbox and Ops agents.
   - Plan 2: broader agent/KB buildout.
6. Before coding, update or confirm the ledger status for the target surface.

## Current Branch Truth

- Worktree: `/Users/judith/.codex/worktrees/ask-friday-autonomous-core-20260526`
- Branch: `codex/ask-friday-autonomous-core-20260526`
- Base branch: `origin/fad-rebuild`
- Latest pushed ledger commit when this manifest was created: `2b3d96f0 docs(ask-friday): add completion ledger`
- Previous code commit: `8b01fb2c fix(fad): enforce ops scheduling constraints`
- Deployment status: not deployed from this branch at manifest creation time.

## Canonical Recovery Docs

Read these first, in order:

1. `docs/architecture/ask-friday-completion-ledger-2026-05-26.md`
   - Source of truth for what is scoped, KB drafted, harness drafted, runtime wired, tested, deployed, and team-useful.
2. `docs/handover/2026-05-26-ask-friday-autonomous-core.md`
   - Branch handover and implementation summary.
3. `docs/architecture/ask-friday-knowledge-harness-catalog-2026-05-26.md`
   - Surface catalog, knowledge classes, memory/session policy, and Plan 2 profiles.
4. `docs/architecture/ask-friday-core-v1-2026-05-23.md`
   - V1 architecture recommendation, contracts, API paths, eval plan, and implementation split.
5. `docs/architecture/ask-friday-agent-research-notes-2026-05-26.md`
   - Research synthesis for agent architecture, memory, evals, MCP authorization, and safety.

## Plan 1 Runtime Docs

These are the high-priority production-useful surfaces.

### Inbox / Friday Consult

- Runtime KB:
  - `backend/knowledge/surfaces/inbox-drafts/SKILL.md`
  - `backend/knowledge/surfaces/inbox-drafts/discount-bounds.md`
  - `backend/knowledge/surfaces/inbox-drafts/refund-bounds.md`
  - `backend/knowledge/surfaces/inbox-advisory/SKILL.md`
  - `backend/knowledge/surfaces/inbox-advisory/platform-compliance.md`
  - `backend/knowledge/surfaces/inbox-advisory/ops-workflows.md`
- Relevant handovers:
  - `docs/handover/2026-05-22-fad-auth-inbox-consult-handover.md`
  - `docs/handover/2026-05-21-inbox-frontend-merge-conflict-note.md`
- Principle:
  - Existing Inbox harness remains dominant.
  - Ask Friday Core wraps it for events, evidence, evals, mining, and review without disrupting user-facing draft/send behavior.

### Ops / Friday Consult

- Runtime KB:
  - `backend/knowledge/surfaces/ops-consult/SKILL.md`
  - `backend/knowledge/surfaces/ops-consult/scheduling-methodology.md`
  - `backend/knowledge/surfaces/ops-consult/staff-roster-rules.md`
  - `backend/knowledge/surfaces/ops-consult/task-duration-skill-matrix.md`
  - `backend/knowledge/surfaces/ops-consult/property-data-sources.md`
  - `backend/knowledge/surfaces/ops-consult/property-ops-metadata.md`
  - `backend/knowledge/surfaces/ops-consult/owner-terms-approval-rules.md`
  - `backend/knowledge/surfaces/ops-consult/vendors-maintenance-pricing.md`
  - `backend/knowledge/surfaces/ops-consult/turnover-maintenance-quality.md`
  - `backend/knowledge/surfaces/ops-consult/srl-supplies-rules.md`
  - `backend/knowledge/surfaces/ops-consult/field-location-dispatch.md`
  - `backend/knowledge/surfaces/ops-consult/learning-and-controls.md`
- Repo mirror:
  - `docs/operations/2026-05-26-ops-friday-consult-kb.md`
  - `docs/operations/2026-05-26-ops-property-metadata-preview.json`
- Relevant research/history:
  - `docs/research/2026-05-19-breezeway-reverse-engineering.md`
  - `docs/research/2026-05-21-operations-breezeway-cutover-plan.md`
  - `docs/handover/2026-05-21-operations-breezeway-cutover-sprint-log.md`
- Principle:
  - Ops can be more strongly formalized by Ask Friday Core because the harness is still young.
  - Preserve reversible draft/apply/clear/undo behavior and human approval for mutations.

## Core Runtime Code Map

Ask Friday Core backend:

- `backend/src/ask_friday/index.js`
- `backend/src/ask_friday/contracts.js`
- `backend/src/ask_friday/policy.js`
- `backend/src/ask_friday/publisher.js`
- `backend/src/ask_friday/analyzer.js`
- `backend/src/ask_friday/eval_runner.js`
- `backend/src/ask_friday/event_writer.js`
- `backend/src/ask_friday/action_writer.js`
- `backend/src/ask_friday/retention.js`
- `backend/src/ask_friday/scheduler.js`

Ask Friday Core migrations:

- `backend/migrations/074_ask_friday_core.sql`
- `backend/migrations/095_consult_conversation_locks.sql`
- `backend/migrations/096_ask_friday_surface_registry_v02.sql`
- `backend/migrations/097_ask_friday_seed_eval_cases.sql`
- `backend/migrations/098_ask_friday_candidate_review_lanes.sql`

Plan 1 surface code:

- Inbox/Consult:
  - `backend/src/inbox/consult.js`
  - `backend/src/inbox/consult_lock.js`
- Ops/Consult:
  - `backend/src/operations/consult.js`
  - `frontend/src/app/fad/_components/modules/OperationsModule.tsx`
  - `frontend/src/app/fad/_data/operationsConsultClient.ts`
  - `frontend/src/app/fad/_data/reservationsClient.ts`
- Global FAD Ask Friday:
  - `backend/src/fad/friday.js`

## Notion Mirrors

Use Notion as mirror/collaboration layer, but keep runtime source in repo for code/KBA wiring.

- Ask Friday Core Manifest:
  - `https://www.notion.so/36c43ca8849281fe896acb4a1b07fdb0`
- Ask Friday Completion Ledger:
  - `https://www.notion.so/36c43ca8849281a8a711eaa733572f7a`
- Ask Friday Claude Code Handover:
  - `https://www.notion.so/36c43ca8849281baa862dacca0591bb0`
- Ask Friday Intelligence Layer Planning Pack:
  - `https://www.notion.so/36c43ca8849281c090d2e4e5e07e534c`
- Ask Friday Planning Pack Index:
  - `https://www.notion.so/36c43ca88492819b82bbefdb25c62140`
- Ask Friday Intelligence Master Plan:
  - `https://www.notion.so/36c43ca884928123bc72ceb547efe1a2`
- Ask Friday Contract Drafts:
  - `https://www.notion.so/36c43ca8849281aaa4aefb9cee93660b`
- Ask Friday Implementation Prompts:
  - `https://www.notion.so/36c43ca8849281438e48ffc97f860823`
- FAD Ops Scheduling, Roster and Task Policy:
  - `https://www.notion.so/36b43ca8849281b0b1b3db967c4a2b73`
- Ask Friday Unified AI Learning Loop - Scope 2026-05-23:
  - `https://www.notion.so/36843ca884928173946fc5aa32341a3b`
- Friday System Atlas:
  - `https://www.notion.so/34c43ca8849281b9a10de9f264141c37`
- Friday Knowledge Base - Batch 1 Product AI Ops:
  - `https://www.notion.so/36843ca8849281bcb455d16626653122`
- 05 Ask Friday Product Register:
  - `https://www.notion.so/36843ca88492813a9373dce2d2700b3d`

## Plan 1 Readiness Checklist

Do not deploy Plan 1 until these are checked:

- Branch is based on latest `origin/fad-rebuild` or explicitly reconciled.
- No dirty generated artifacts are staged.
- Naming scan passes.
- Backend tests pass.
- Backend build passes.
- Frontend typecheck passes.
- Frontend build passes.
- Migrations `095` through `098` are reviewed for production.
- Analyzer process mode is decided:
  - default safe posture: keep analyzer out of web process unless PM2 worker is explicitly configured.
- Inbox smoke confirms no user-facing harness regression.
- Ops smoke confirms Franny can draft daily/weekly/monthly schedule or roster with useful constraints.
- No deploy happens without backend and frontend deploy coordination.

## Plan 2 Research/KB Rules

Before calling any future module agent "ready", ensure its KB includes, where relevant:

- Friday-specific truth and policy.
- Source-of-truth owner.
- Competitor/market positioning where useful.
- Industry best practices.
- Mauritius/local context.
- Legal/tax/regulatory caveats with source dates.
- Operational stats or benchmark ranges where useful.
- Privacy/access classification.
- Freshness/expiry rule.
- Eval cases and failure examples.
- Explicit assumptions requiring Ishant review.

Do not load competitor/industry/local context globally. Scope it per surface:

- public owner/sales surfaces: positioning and market context;
- guest surfaces: public/local travel and accommodation context;
- Ops: STR, field-service, turnover, maintenance practices;
- finance/legal: source-dated and reviewed compliance context only;
- internal strategy: staff/internal only.

## Maintenance Rule

When adding a new Ask Friday doc, KB, Notion mirror, migration, or major surface:

1. Add it to this manifest.
2. Update the completion ledger status if it changes readiness.
3. If mirrored in Notion, add the Notion URL here.
4. Commit the manifest update with the same branch before handoff.
