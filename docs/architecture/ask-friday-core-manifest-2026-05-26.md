# Ask Friday Core Manifest

Date: 2026-05-26
Status: recovery manifest and source map
Current canonical checkpoint: `origin/fad-rebuild` at `5c1e4b2a9135586eb8472fc46aae11bb77b89c1f`; live production remains `af513255723d68b3354de351c381f89532366efe`.

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

- Latest active Ask Friday Core worktree: `/Users/judith/.codex/worktrees/ask-friday-readiness-evals-20260529`
- Branch: `codex/ask-friday-post-pr59-plan-next-20260529`
- Base branch: `origin/fad-rebuild`
- Current origin SHA after PR #59 merge: `5c1e4b2a9135586eb8472fc46aae11bb77b89c1f`
- Current deployed code-bearing SHA: `af513255723d68b3354de351c381f89532366efe`
- Note: PR #59 is merged to `origin/fad-rebuild` but not deployed. Live production still reports `af513255`. Do not deploy without explicit coordination.
- PR #9: merged on 2026-05-27 as `da67c7be`.
- PR #13: merged and deployed on 2026-05-28 as `7caf6576`.
- PR #15: merged and deployed on 2026-05-29 as `c55e94c0`.
- PR #16: merged and deployed on 2026-05-29 as `75ef9bc8`; this restored Inbox conversation detail loading after the WhatsApp-window helper queried a non-existent `messages.communication_channel` column.
- PR #17: merged and deployed on 2026-05-29 as `205d8a91`; this rejects partial Consult model responses with non-normal provider finish reasons instead of showing cut-off advice as successful.
- PR #18: merged and deployed on 2026-05-29 as `c52f1a6e`; this adds bounded Ops Consult responses plus compact fallback context for broad schedule-review prompts.
- PR #20: merged and deployed on 2026-05-29 as `73dc8fec`; this split email-style multi-recipient Consult drafts into separate draft cards, suppressed duplicate same-session task suggestions, fixed Inbox textarea shortcut propagation, and made the WhatsApp timer source stricter.
- PR #21: merged and deployed on 2026-05-29 as `5d44d16d`; this tightened Ops schedule planner guardrails so drafts/apply paths account for assignable staff, unassigned visible work, occupancy blockers, and selected-day untimed work.
- PR #22: merged on 2026-05-29 as `45d3c066`; this added draft-only Website public context pack templates.
- PR #23: merged and deployed on 2026-05-29 as `b70c4087`; this fixed environment loading for the context-pack draft script.
- PR #24: merged on 2026-05-29 as `3b09772f`; this narrowed the Website guest hero context pack, kept FAB journal search, and removed feedback-specific blockers from Website public packs.
- PR #25: merged and deployed on 2026-05-29 as `7266f78a`; this added the deterministic Ops Consult fallback for persistent model length exhaustion and deployed PR #24 source code.
- PR #26: docs-only post-deploy ledger update.
- PR #27: merged on 2026-05-29 as `3fc7e848`; this suppresses Inbox Friday Consult draft updates when the operator explicitly asks for review-only/no-draft behavior.
- PR #28: docs-only ledger sync for the PR #27 deploy decision.
- PR #29: docs-only Ask Friday plan terminology sync.
- PR #30: merged and deployed on 2026-05-29 as `d19b8317`; this hardened Inbox/Consult bug flows by fixing schema-tolerant Website handoff context loading, message-level WhatsApp timer detection, controlled email-style draft recovery, Feedback FAB minimize/preserve behavior, tighter mobile FAB controls, and lower-friction Inbox Consult draft cards.
- PR #31: merged on 2026-05-29 as `3daa4920`; this recorded the unified FAD Ask Friday right-panel direction and added it to the FAD backlog.
- PR #32: docs-only ledger sync merged on 2026-05-29 as `00895279`; no deploy needed.
- PR #33: merged and deployed on 2026-05-29 as `fe3d5fab`; this hardens Ops Consult availability/pricing checks after live QA showed the model skipped this check when `calendar_pricing` objects existed but contained no usable price/availability values.
- PR #35: merged and deployed on 2026-05-29 as `f92d4df`; this fixes Inbox Consult JSON-envelope parsing when a provider returns a valid envelope plus a stray brace or malformed tail, preventing raw `response_text` JSON from leaking into the chat UI.
- PR #37: merged and deployed on 2026-05-29 as `5fd42245`; this removes the production-invalid `messages.communication_channel` WhatsApp-window query while keeping message-level WhatsApp detection via `messages.module_type`.
- PR #39: merged and deployed on 2026-05-29 as `ad2b1151`; this unpins compact Inbox Consult fallback so compact retries use the normal Gemini-first hierarchy unless an explicit fallback model env var is configured.
- PR #41: merged on 2026-05-29 as `61960837`; this adds staff-only TeamInbox context to global FAD Ask Friday.
- PR #42: merged on 2026-05-29 as `aa7e7f01`; this adds the sanitized page-focus envelope for the shared Ask Friday right panel and documents the frontend-to-Core contract.
- Coordinated deploy `81025039` includes PR #41, PR #42, the frontend performance/code-split pass, and owner-notification read-side filtering.
- Live deploy `9097f9bc` includes PR #44, PR #46, and commit `9097f9bc` (`feat(public): /api/public/experiences supply hub + Bokun ingestion + channel routing`, including migration `106_experiences.sql`). This deploy was not performed by this Ask Friday Core session.
- PR #44 merged on 2026-05-29 as `7d2f8732`; it starts large Ops roster consults in compact mode to avoid the observed 144s full-context length-failure pass before compact fallback. It is deployed in live `9097f9bc`; live roster re-smoke passed in about 12s with compact-first active and guardrails present.
- PR #45 merged on 2026-05-29 as `decee0fb`; it adds Plan 2 research/source matrices, reservation action subtype contracts, property field classification, and owner positioning docs. Docs-only; no deploy required.
- PR #46 merged on 2026-05-29 as `a06eda7e`; it adds migration `105_ask_friday_plan2_eval_seeds.sql` for Plan 2 deterministic eval scaffolding. It is deployed in live `9097f9bc`.
- PR #47 merged on 2026-05-29 as `d33f151b`; docs-only ledger/manifest sync after PR #46.
- PR #48 merged on 2026-05-29 as `31fbfd54`; it adds draft KB shells for Reservations/Calendar, Properties, and Owner Enquiry plus composer smoke coverage. It is deployed in live `af513255`.
- PR #49 merged on 2026-05-29 as `d7497305`; docs-only ledger/manifest sync after PR #48.
- Commit `12b02389` (`fix(experiences): route Bokun by real country (account is multi-country)`) was merged into `origin/fad-rebuild` at `b2840671`. It is deployed in live `af513255`.
- PR #50 merged on 2026-05-29 as `4574e0e7`; docs-only live `9097f9bc` ledger sync.
- PR #51 merged on 2026-05-29 as `62c8f1c1`; docs-only live compact-first roster smoke evidence.
- Commit `d44174a9` added FAD V2 redesign implementation docs; merge `7d3a52ba` is the current canonical origin checkpoint for this slice.
- PR #52 merged on 2026-05-29 as `b26982c8`; it adds migration `107_ask_friday_plan2_surface_readiness.sql`, staff shell draft context-pack templates, action-policy validation, deterministic `action_safety` eval checks, and focused tests. It is deployed in live `af513255`.
- PR #53 merged on 2026-05-29 as `e01945b5`; docs-only ledger sync after PR #52.
- PR #54 merged on 2026-05-29 as `0b9c9657`; it adds migration `108_ask_friday_website_public_action_scope.sql` so the `friday-website` API client can enqueue approval-gated public action requests for owner enquiry and feedback surfaces. It is deployed in live `af513255`.
- PR #57 merged on 2026-05-29; it adds global Ask Friday Core state/readiness loading.
- PR #58 merged on 2026-05-29; it fixes global Ask Friday learning-event scope drift.
- PR #59 merged on 2026-05-29 as `5c1e4b2a`; it adds migrations `109_ask_friday_learning_feedback_policies.sql`, `110_ask_friday_eval_readiness_coverage.sql`, and `111_ask_friday_active_runtime_context_pack_drafts.sql`, mirrors global Ask Friday page-aware learning into active module surfaces, adds generated active runtime context-pack templates for global Ask Friday / Inbox Consult / Ops Assistant, and seeds non-destructive draft rows for those packs. It is not deployed.
- Deployment status: live frontend and backend both report `af513255`, while `origin/fad-rebuild` is `5c1e4b2a`. Reviewed Website public context packs remain published through the gated publisher in production DB. PR #59 is merged but remains the current undeployed Ask Friday Core delta.
- Exact commit `4ce6deeb fix(fad): align ask friday context pack publishing` is not an ancestor of `origin/fad-rebuild`, but `git cherry origin/fad-rebuild 4ce6deeb` reports it as patch-equivalent (`-`), so do not re-port it without checking the current files first.
- Latest pushed continuation commits include:
  - `a496b217 docs(ask-friday): map public owner feedback surfaces`
  - `0a65333d feat(fad): strengthen ops roster consult context`
  - `9d48ab0f fix(fad): restore push setup and owner alert routing`
  - `03c08858 fix(fad): harden Ask Friday inbox flows`

## Canonical Recovery Docs

Read these first, in order:

1. `docs/architecture/ask-friday-completion-ledger-2026-05-26.md`
   - Source of truth for what is scoped, KB drafted, harness drafted, runtime wired, tested, deployed, and team-useful.
2. `docs/architecture/ask-friday-master-plan-v02-2026-05-26.md`
   - Current execution-grade master plan anchor: doctrine, phase map, subplan template, execution tree, and research basis.
3. `docs/architecture/ask-friday-surface-subplans-2026-05-26.md`
   - Execution subplans for Inbox, Ops, reservations/calendar, properties, Website, owner, feedback, guest portal, restricted modules, MCP, and internal agents.
4. `docs/architecture/ask-friday-kb-research-factory-2026-05-26.md`
   - Source-matrix method, trust tiers, privacy classes, first research waves, and initial KB rows.
5. `docs/architecture/ask-friday-eval-mining-adr-plan-2026-05-26.md`
   - Eval matrix, conversation-mining runbook, candidate review lanes, and ADR backlog.
6. `docs/handover/2026-05-26-ask-friday-autonomous-core.md`
   - Branch handover and implementation summary.
   - Current Website public wiring prompt: `docs/handover/2026-05-28-ask-friday-website-public-wiring-prompt.md`.
7. `docs/architecture/ask-friday-knowledge-harness-catalog-2026-05-26.md`
   - Surface catalog, knowledge classes, memory/session policy, and Plan 2 profiles.
8. `docs/architecture/ask-friday-core-v1-2026-05-23.md`
   - V1 architecture recommendation, contracts, API paths, eval plan, and implementation split.
9. `docs/architecture/ask-friday-agent-research-notes-2026-05-26.md`
   - Research synthesis for agent architecture, memory, evals, MCP authorization, and safety.
10. `docs/architecture/ask-friday-reservations-properties-source-matrix-2026-05-28.md`
   - Current Plan 3 source-truth packet for Reservations/Calendar and Properties: FAD API paths, Guesty/FAD/Breezeway ownership, harness implications, gaps, and first tool contracts.
11. `docs/architecture/ask-friday-reservation-property-tool-contracts-2026-05-28.md`
   - Design-only read-tool/action-request contracts for reservation, calendar, and property context.
12. `docs/architecture/ask-friday-website-owner-feedback-source-matrix-2026-05-28.md`
   - Current Plan 3 source-truth packet for Website public Ask Friday, owner enquiry/FAD owners assistant, and feedback/bug-learning surfaces.
13. `docs/architecture/ask-friday-public-owner-feedback-contracts-2026-05-28.md`
   - Contract draft for Website context-pack consumption, Website learning-event emission, owner lead capsules, feedback evidence capsules, and takeover alignment.
14. `docs/architecture/ask-friday-right-panel-focus-contract-2026-05-29.md`
    - Backend contract for the shared FAD Ask Friday right panel page-focus envelope: module/view/object/selection/visible-state context, action-boundary notes, and frontend wiring guidance.
15. `docs/architecture/ask-friday-plan2-research-wave1-2026-05-29.md`
    - Plan 2 research/source-matrix addendum for reservations/calendar, properties, Ops, Website public, owner enquiry, local Mauritius context, competitor/market signals, and eval candidates.
16. `docs/architecture/ask-friday-property-field-classification-2026-05-29.md`
    - Draft property privacy/field matrix for public, guest-scoped, owner-scoped, staff-private, and restricted property facts.
17. `docs/architecture/ask-friday-owner-positioning-source-matrix-2026-05-29.md`
    - Staff-private owner-positioning source matrix for competitor, market, compliance, and owner enquiry harness signals.
18. `docs/architecture/ask-friday-staff-use-evidence-runbook-2026-05-29.md`
    - Defines what counts as Mary/Franny/Ishant staff-usefulness proof for Inbox, Ops, and global Ask Friday.
19. `docs/architecture/ask-friday-plan2-kb-gap-tracker-2026-05-29.md`
    - Current gap tracker for planned surfaces that still lack KB files, context packs, evals, or runtime wiring.

## Master Plan And Subplans

The current execution-grade master plan anchor is repo-owned:

- Local: `docs/architecture/ask-friday-master-plan-v02-2026-05-26.md`
- Notion: `https://www.notion.so/36c43ca88492815d9644e44b14a297d0`

The repo-owned execution pack under the master plan is:

- `docs/architecture/ask-friday-surface-subplans-2026-05-26.md`
  - Notion: `https://www.notion.so/36c43ca8849281eea0e4da1ce36ca4cb`
- `docs/architecture/ask-friday-kb-research-factory-2026-05-26.md`
  - Notion: `https://www.notion.so/36c43ca8849281ed9593d4f16f96931b`
- `docs/architecture/ask-friday-eval-mining-adr-plan-2026-05-26.md`
  - Notion: `https://www.notion.so/36c43ca8849281cfa226f0102cabdf6a`
- `docs/architecture/ask-friday-reservations-properties-source-matrix-2026-05-28.md`
  - Notion: not mirrored yet; use repo as current source until mirror is created.
- `docs/architecture/ask-friday-reservation-property-tool-contracts-2026-05-28.md`
  - Notion: not mirrored yet; use repo as current source until mirror is created.
- `docs/architecture/ask-friday-website-owner-feedback-source-matrix-2026-05-28.md`
  - Notion: not mirrored yet; use repo as current source until mirror is created.
- `docs/architecture/ask-friday-public-owner-feedback-contracts-2026-05-28.md`
  - Notion: `https://www.notion.so/36e43ca8849281e39565c1d18a057827`
- `docs/architecture/ask-friday-plan2-research-wave1-2026-05-29.md`
  - Notion: not mirrored yet; use repo as current source until mirror is created.
- `docs/architecture/ask-friday-property-field-classification-2026-05-29.md`
  - Notion: not mirrored yet; use repo as current source until mirror is created.
- `docs/architecture/ask-friday-owner-positioning-source-matrix-2026-05-29.md`
  - Notion: not mirrored yet; use repo as current source until mirror is created.
- `docs/architecture/ask-friday-staff-use-evidence-runbook-2026-05-29.md`
  - Notion: not mirrored yet; use repo as current source until mirror is created.
- `docs/architecture/ask-friday-plan2-kb-gap-tracker-2026-05-29.md`
  - Notion: not mirrored yet; use repo as current source until mirror is created.

The original broad master plan and subplans are mirrored in Notion and also exist as local planning-pack files under `/Users/judith/.openclaw/workspace/tmp/`.

Read these after the canonical repo recovery docs when reconstructing the wider plan:

1. Planning Pack Index
   - Local: `/Users/judith/.openclaw/workspace/tmp/ask-friday-planning-pack-index-2026-05-26.md`
   - Notion: `https://www.notion.so/36c43ca88492819b82bbefdb25c62140`
2. Claude Code Handover
   - Local: `/Users/judith/.openclaw/workspace/tmp/ask-friday-claude-code-handover-2026-05-26.md`
   - Notion: `https://www.notion.so/36c43ca8849281baa862dacca0591bb0`
3. Master Architecture Plan
   - Local: `/Users/judith/.openclaw/workspace/tmp/ask-friday-intelligence-master-plan-2026-05-26.md`
   - Notion: `https://www.notion.so/36c43ca884928123bc72ceb547efe1a2`
4. Surface And Harness Catalog
   - Local: `/Users/judith/.openclaw/workspace/tmp/ask-friday-surface-harness-catalog-2026-05-26.md`
   - Notion: `https://www.notion.so/36c43ca8849281c2aa94e27ebef4dfef`
5. Learning Mining Eval Risk Plan
   - Local: `/Users/judith/.openclaw/workspace/tmp/ask-friday-learning-mining-eval-risk-plan-2026-05-26.md`
   - Notion: `https://www.notion.so/36c43ca8849281ab9f48dc3721688c3e`
6. Contract Drafts
   - Local: `/Users/judith/.openclaw/workspace/tmp/ask-friday-contract-drafts-2026-05-26.md`
   - Notion: `https://www.notion.so/36c43ca8849281aaa4aefb9cee93660b`
7. Implementation Prompts
   - Local: `/Users/judith/.openclaw/workspace/tmp/ask-friday-implementation-prompts-2026-05-26.md`
   - Notion: `https://www.notion.so/36c43ca8849281438e48ffc97f860823`
8. Planning Pack Consistency Audit
   - Local: `/Users/judith/.openclaw/workspace/tmp/ask-friday-doc-consistency-audit-2026-05-26.md`
   - Notion: `https://www.notion.so/36c43ca8849281c290bdf3e62443263b`
9. FAD Ops And Inbox Integration Audit
   - Local: `/Users/judith/.openclaw/workspace/tmp/ask-friday-fad-ops-inbox-integration-audit-2026-05-26.md`
   - Notion: `https://www.notion.so/36c43ca884928132b781e5213b2e4730`

These are planning artifacts, not proof of runtime readiness. Use the completion ledger to decide what is actually built, tested, deployed, and team-useful.

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

## Plan 2 KB Shells

These are draft KB shells only. They are not proof of dedicated runtime agents, UI wiring, or team-usefulness.

### Reservations / Calendar

- Runtime/KB shell:
  - `backend/knowledge/surfaces/reservations-calendar/SKILL.md`
  - `backend/knowledge/surfaces/reservations-calendar/availability-status-rules.md`
  - `backend/knowledge/surfaces/reservations-calendar/quote-and-channel-actions.md`
- Principle:
  - Availability, rates, reservation status, quotes, and channel-visible blocks remain live/source-dated tool facts or approval-routed action requests.

### Properties

- Runtime/KB shell:
  - `backend/knowledge/surfaces/properties-assistant/SKILL.md`
  - `backend/knowledge/surfaces/properties-assistant/field-classification.md`
  - `backend/knowledge/surfaces/properties-assistant/source-conflicts.md`
- Principle:
  - Property knowledge is field-classified before use: public, guest-scoped, owner-scoped, staff-private, or restricted.

### Owner Enquiry / Owners Assistant

- Runtime/KB shell:
  - `backend/knowledge/surfaces/owner-enquiry/SKILL.md`
  - `backend/knowledge/surfaces/owner-enquiry/lead-capsules.md`
  - `backend/knowledge/surfaces/owner-enquiry/positioning-safety.md`
- Principle:
  - Owner lead qualification can use competitor/market context internally, but public wording requires Ishant-approved positioning.

## Core Runtime Code Map

Ask Friday Core backend:

- `backend/src/ask_friday/index.js`
- `backend/src/ask_friday/contracts.js`
- `backend/src/ask_friday/context_tools.js`
- `backend/src/ask_friday/policy.js`
- `backend/src/ask_friday/publisher.js`
- `backend/src/ask_friday/context_pack_templates.js`
- `backend/src/ask_friday/analyzer.js`
- `backend/src/ask_friday/eval_runner.js`
- `backend/src/ask_friday/event_writer.js`
- `backend/src/ask_friday/action_writer.js`
- `backend/src/ask_friday/retention.js`
- `backend/src/ask_friday/scheduler.js`

Ask Friday Core scripts:

- `backend/scripts/ask-friday-context-pack-drafts.js`
  - Dry-run by default. Produces policy-validated draft context packs for `website_guest_hero` and `website_ask_friday_fab`.
  - `--include-fad-runtime` also includes active FAD runtime draft packs for global Ask Friday, Inbox Consult, and Ops Assistant.
  - `--include-plan2-shells` also includes draft staff shell packs for Reservations/Calendar, Properties, and the planned Owners shell.
  - `--apply` upserts draft rows only; it does not publish public-readable context packs.

Ask Friday Core migrations:

- `backend/migrations/074_ask_friday_core.sql`
- `backend/migrations/095_consult_conversation_locks.sql`
- `backend/migrations/096_ask_friday_surface_registry_v02.sql`
- `backend/migrations/097_ask_friday_seed_eval_cases.sql`
- `backend/migrations/098_ask_friday_candidate_review_lanes.sql`
- `backend/migrations/101_ask_friday_context_tools.sql`
- `backend/migrations/102_ask_friday_public_owner_feedback_evals.sql`
- `backend/migrations/103_ask_friday_public_contract_evals.sql`
- `backend/migrations/107_ask_friday_plan2_surface_readiness.sql`
  - Deployed in live `af513255`. Activates Reservations/Calendar and Properties as governed Core shells; keeps Owners planned.
- `backend/migrations/108_ask_friday_website_public_action_scope.sql`
  - Deployed in live `af513255`. Grants `friday-website` the API scope for approval-gated public action requests.
- `backend/migrations/109_ask_friday_learning_feedback_policies.sql`
  - Merged to origin in PR #59, not deployed. Adds explicit learning feedback policy per surface.
- `backend/migrations/110_ask_friday_eval_readiness_coverage.sql`
  - Merged to origin in PR #59, not deployed. Closes declared eval-suite coverage for active surfaces.
- `backend/migrations/111_ask_friday_active_runtime_context_pack_drafts.sql`
  - Merged to origin in PR #59, not deployed. Seeds non-destructive draft context-pack rows for active FAD runtime surfaces.

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
- Ask Friday Master Plan v0.2 - Execution Tree:
  - `https://www.notion.so/36c43ca88492815d9644e44b14a297d0`
- Ask Friday Surface Subplans - 2026-05-26:
  - `https://www.notion.so/36c43ca8849281eea0e4da1ce36ca4cb`
- Ask Friday KB Research Factory - 2026-05-26:
  - `https://www.notion.so/36c43ca8849281ed9593d4f16f96931b`
- Ask Friday Eval Mining ADR Plan - 2026-05-26:
  - `https://www.notion.so/36c43ca8849281cfa226f0102cabdf6a`
- Ask Friday Intelligence Master Plan:
  - `https://www.notion.so/36c43ca884928123bc72ceb547efe1a2`
- Ask Friday Surface And Harness Catalog:
  - `https://www.notion.so/36c43ca8849281c2aa94e27ebef4dfef`
- Ask Friday Learning Mining Eval Risk Plan:
  - `https://www.notion.so/36c43ca8849281ab9f48dc3721688c3e`
- Ask Friday Contract Drafts:
  - `https://www.notion.so/36c43ca8849281aaa4aefb9cee93660b`
- Ask Friday Implementation Prompts:
  - `https://www.notion.so/36c43ca8849281438e48ffc97f860823`
- Ask Friday Planning Pack Consistency Audit:
  - `https://www.notion.so/36c43ca8849281c290bdf3e62443263b`
- Ask Friday FAD Ops And Inbox Integration Audit:
  - `https://www.notion.so/36c43ca884928132b781e5213b2e4730`
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

Plan 1 has been deployed. Use this checklist to avoid confusing deployment with team-usefulness:

- Branch is based on latest `origin/fad-rebuild` or explicitly reconciled.
- No dirty generated artifacts are staged.
- Naming scan passes.
- Backend tests pass before code changes.
- Backend build passes before code changes.
- Frontend typecheck passes before frontend changes.
- Frontend build passes before frontend changes.
- Production startup logs after the `3daa4920` deploy showed migrations complete with `0 applied, 107 already-applied, 107 total`.
- Analyzer process mode remains decided:
  - default safe posture: keep analyzer out of web process unless PM2 worker is explicitly configured.
- Inbox smoke must confirm no user-facing harness regression after the live deploy.
- Ops smoke must confirm Franny can draft daily/weekly/monthly schedule or roster with useful constraints.
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

Current Plan 3 source-truth packet:

- `docs/architecture/ask-friday-reservations-properties-source-matrix-2026-05-28.md`
  - Reservations/Calendar and Properties are source-mapped but not built as dedicated agents.
  - Availability/rates stay live lookup or source-dated context.
  - FAD-local calendar blocks do not imply Guesty/OTA reflection until a verified write-through contract exists.
  - Property cards need richer privacy/access classification before public context-pack use.
- `docs/architecture/ask-friday-reservation-property-tool-contracts-2026-05-28.md`
  - Design-only contracts for `load_reservation_context`, `load_calendar_context`, `load_property_context`, and `request_reservation_action`.
  - Runtime note: the staff-only read tools are live behind `/api/ask-friday/core/context-tools/*`; they are not public Website context packs and do not perform write-through actions.
- `backend/knowledge/surfaces/reservations-calendar/*`
  - Draft KB shell for reservation status, availability, quote, and channel-visible action rules.
- `backend/knowledge/surfaces/properties-assistant/*`
  - Draft KB shell for property field classification and source-conflict handling.
- `backend/knowledge/surfaces/owner-enquiry/*`
  - Draft KB shell for owner lead capsules and positioning safety.
- `docs/architecture/ask-friday-website-owner-feedback-source-matrix-2026-05-28.md`
  - Website public Ask Friday, owner enquiry/FAD owners assistant, and feedback/bug-learning are source-mapped but not wired to Core runtime in this branch.
  - Public and owner-facing context needs Ishant review before published KB/context-pack use.
  - Feedback evidence needs retention/redaction policy before raw screenshots or diagnostics are mined.
  - Migration `102_ask_friday_public_owner_feedback_evals.sql` is live and seeds deterministic eval scaffolding for these scoped risks.
  - Production now has published public Website context packs for `website_guest_hero` and `website_ask_friday_fab`. Website public Core fetches should no longer return `context_pack_not_found` for those two surfaces.
- `backend/src/ask_friday/context_pack_templates.js`
  - Source templates exist for `website_guest_hero` and `website_ask_friday_fab`.
  - They remain the editable source for regenerated drafts. Reviewed v1 public Website context packs are now published in the production DB; dynamic facts still stay live-tool grounded and feedback evidence remains retention/redaction gated.

## Maintenance Rule

When adding a new Ask Friday doc, KB, Notion mirror, migration, or major surface:

1. Add it to this manifest.
2. Update the completion ledger status if it changes readiness.
3. If mirrored in Notion, add the Notion URL here.
4. Commit the manifest update with the same branch before handoff.
