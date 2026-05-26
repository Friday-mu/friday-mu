# Ask Friday Autonomous Core Handover - 2026-05-26

## Branch

- Worktree: `/Users/judith/.codex/worktrees/ask-friday-autonomous-core-20260526`
- Branch: `codex/ask-friday-autonomous-core-20260526`
- Base: `origin/fad-rebuild@19b9bf777dedd358686f1ee018bdfc30df1a2883`
- Deployed baseline before this branch: `19b9bf77`

This branch is not deployed.

## Naming

- Assistant/intelligence layer: Ask Friday.
- Whole product/platform: FridayOS.
- Do not reintroduce the retired assistant label in UI, docs, or public/product wording.
- Friday Consult is a staff module-mode alias under Ask Friday, not a separate public assistant product.

## What Changed

### Public Core policy guardrails

Added `backend/src/ask_friday/policy.js`.

Public Ask Friday Core routes now validate more than JWT scopes:

- target surface must be active and public/public-api/public-feedback class,
- `sourceSystem` must match the registered surface,
- public learning events must be redacted or explicitly `not_required`,
- public events may only reference the surface's allowed knowledge/tools,
- public action requests may only use the surface's allowed actions,
- public action requests must remain `pending` and `approvalRequired=true`,
- public identity links can enable durable memory only after granted consent,
- staff/private surfaces are blocked from public Core reads/writes.

Context-pack publishing now validates requested scopes/tools against the target surface before publishing. The later autonomous slice also requires either a passing eval run or explicit `evalGateOverride:true`; direct `/context-packs` writes can no longer publish by setting `status:"published"`.

### Surface registry v0.2

Added `backend/migrations/096_ask_friday_surface_registry_v02.sql`.

It adds/aligns registry profiles for:

- `fad_global_ask_friday`
- `fad_consult`
- `fad_ops_assistant`
- `fad_reservations_calendar_assistant`
- `fad_properties_assistant`
- `fad_legal_admin_assistant`
- `fad_hr_training_assistant`
- `fad_owners_assistant`
- `fad_analytics_intelligence`
- `guest_portal_ask_friday`
- `public_mcp`

Important: `fad_ops_assistant` now records `runtimeKnowledgeAlias:"ops-consult"` so the live Ops KB key is treated as a governed alias, not renamed casually.

### Eval seed cases

Added `backend/migrations/097_ask_friday_seed_eval_cases.sql`.

It seeds deterministic eval cases for:

- `website_guest_grounding`
- `website_fab_routing`
- `owner_scope`
- `feedback_repro_quality`
- `fad_consult_grounding`
- `ops_task_safety`
- `fad_global_grounding`
- `public_mcp_safety`
- `finance_privacy`
- `internal_agent_privacy`

### Candidate review lanes

Added `backend/migrations/098_ask_friday_candidate_review_lanes.sql`.

KB candidates now carry review metadata before any UI polish:

- `review_lane` separates public, staff ops, owner-private, restricted finance/legal, internal, and general queues.
- `reviewer_domain` records the expected reviewer domain.
- `allowed_surface_ids` records where a candidate is allowed to apply.
- `target_privacy_class` records the highest intended privacy class before approval.

Analyzer-created candidates now set those fields from their source surface and privacy signal, and staff can filter `/api/ask-friday/core/kb-candidates` by `reviewLane`.

### Durable Consult turn locks

Added migration `095_consult_conversation_locks.sql` and helper `backend/src/inbox/consult_lock.js`.

Inbox/Friday Consult still keeps the fast in-process same-conversation queue, but now wraps it in a database-visible lease with expiry and heartbeat. This removes the old single-process-only lock assumption before future scale-out.

The DB lease does not hold a Postgres connection during long model calls.

### Analyzer worker separation

The Ask Friday analyzer scheduler no longer starts inside `server.js` by default.

Run it explicitly with:

```bash
cd /Users/judith/.codex/worktrees/ask-friday-autonomous-core-20260526/backend
npm run ask-friday:analyzer
```

Set `ASK_FRIDAY_ANALYZER_IN_WEB=1` only for controlled single-process deployments.

### Staff learning-event emitters

Added `backend/src/ask_friday/event_writer.js`.

Active staff surfaces now emit compact, staff-private Core events:

- Inbox/Friday Consult -> `fad_consult`
- Operations Friday Consult -> `fad_ops_assistant`
- Global FAD Ask Friday -> `fad_global_ask_friday`

These writes are best-effort and non-canonical. Failures log warnings and do not block the staff response.

Staff event intake now validates the registered surface before writing:

- `surfaceId` must exist and be active,
- `sourceSystem` must match the surface registry,
- `knowledgeUsed` and `toolsUsed` must be allowed by the surface policy,
- high/restricted privacy events cannot be written as `unredacted`.

Staff event writes now also populate dedicated `ask_friday_evidence_refs` rows when an event includes evidence refs.

### Retention and action lifecycle

Added a dry-run-by-default retention path:

```bash
cd /Users/judith/.codex/worktrees/ask-friday-autonomous-core-20260526/backend
npm run ask-friday:retention
```

It only targets expired evidence refs and old rejected/expired candidates. It deliberately does not delete learning events, approved candidates, or context packs until Ishant reviews retention windows.

Action-request review updates now create compact lifecycle learning/evidence records, so approval/rejection/execution state can feed mining and audit instead of becoming a dead-end status change.

### Research note

Added `docs/architecture/ask-friday-agent-research-notes-2026-05-26.md`.

It summarizes current official and community signal around:

- typed memory,
- trace-level evals,
- tool/action guardrails,
- background memory/mining,
- public MCP authorization,
- LLM security risks.

### Knowledge and harness catalog

Added `docs/architecture/ask-friday-knowledge-harness-catalog-2026-05-26.md`.

It turns the planning pack into a repo-owned catalog covering surfaces, knowledge classes, session/memory policy, flow closure, and per-module profiles.

## Files Touched

- `backend/migrations/095_consult_conversation_locks.sql`
- `backend/migrations/096_ask_friday_surface_registry_v02.sql`
- `backend/migrations/097_ask_friday_seed_eval_cases.sql`
- `backend/migrations/098_ask_friday_candidate_review_lanes.sql`
- `backend/package.json`
- `backend/scripts/ask-friday-analyzer-worker.js`
- `backend/scripts/ask-friday-retention-worker.js`
- `backend/server.js`
- `backend/src/ask_friday/analyzer.js`
- `backend/src/ask_friday/analyzer.test.js`
- `backend/src/ask_friday/event_writer.js`
- `backend/src/ask_friday/event_writer.test.js`
- `backend/src/ask_friday/index.js`
- `backend/src/ask_friday/index.test.js`
- `backend/src/ask_friday/policy.js`
- `backend/src/ask_friday/policy.test.js`
- `backend/src/ask_friday/publisher.js`
- `backend/src/ask_friday/publisher.test.js`
- `backend/src/ask_friday/retention.js`
- `backend/src/ask_friday/retention.test.js`
- `backend/src/fad/friday.js`
- `backend/src/fad/friday.test.js`
- `backend/src/inbox/consult.js`
- `backend/src/inbox/consult_lock.js`
- `backend/src/inbox/consult_lock.test.js`
- `backend/src/operations/consult.js`
- `docs/architecture/ask-friday-agent-research-notes-2026-05-26.md`
- `docs/architecture/ask-friday-core-v1-2026-05-23.md`
- `docs/architecture/ask-friday-knowledge-harness-catalog-2026-05-26.md`

## Verification

Ran:

```bash
cd /Users/judith/.codex/worktrees/ask-friday-autonomous-core-20260526/backend
npm test -- ask_friday inbox operations
npm test -- ask_friday fad/friday
npm run build
```

Result:

- 23 test suites passed.
- 123 tests passed.
- Later targeted Ask Friday/FAD Ask tests passed: 9 suites, 68 tests.
- Backend TypeScript build passed.

`npm ci` was required in this fresh worktree before tests. It reported existing lockfile audit issues: 12 vulnerabilities, 9 moderate and 3 high. No dependency versions were changed.

## Remaining Work

Good next slices:

- Wire Website learning-event emitters and context-pack consumption in a separate Website worktree.
- Add concrete eval cases for the new public policy failures, staff event emissions, global FAD Ask Friday, and Ops action safety.
- Add review UI affordances for staff-private events/candidates using the new public, staff, restricted, owner-private, and internal review lanes.
- Review retention windows before enabling deletion in production.
- Add model-backed evals after deterministic eval coverage is stable.
- Keep finance/legal/owner-private module KBs design-only until redaction/access rules are locked.
- Decide whether global FAD Ask Friday staff-click safe actions should also mirror into `ask_friday_action_requests`, or whether only approval-risk actions belong there.

## Deploy Note

Do not deploy blindly.

This branch contains two new migrations and changes analyzer/retention process behavior. Before deploy:

1. Review PM2/process plan for `npm run ask-friday:analyzer`.
2. Decide whether `npm run ask-friday:retention` should run manual-only or scheduled, and keep dry-run default until retention windows are reviewed.
3. Confirm whether production should run the analyzer worker now or leave it manual.
4. Apply migrations `095_consult_conversation_locks.sql`, `096_ask_friday_surface_registry_v02.sql`, `097_ask_friday_seed_eval_cases.sql`, and `098_ask_friday_candidate_review_lanes.sql`.
5. Smoke `/api/ask-friday/core/surfaces`, public context-pack denial for `fad_consult`, eval-gated context-pack publishing, Inbox/Friday Consult, Ops Consult, and global FAD Ask Friday.
