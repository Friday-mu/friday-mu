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

Context-pack publishing now validates requested scopes/tools against the target surface before publishing.

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

These writes are best-effort and non-canonical. Failures log warnings and do not block the staff response.

### Research note

Added `docs/architecture/ask-friday-agent-research-notes-2026-05-26.md`.

It summarizes current official and community signal around:

- typed memory,
- trace-level evals,
- tool/action guardrails,
- background memory/mining,
- public MCP authorization,
- LLM security risks.

## Files Touched

- `backend/migrations/095_consult_conversation_locks.sql`
- `backend/package.json`
- `backend/scripts/ask-friday-analyzer-worker.js`
- `backend/server.js`
- `backend/src/ask_friday/event_writer.js`
- `backend/src/ask_friday/event_writer.test.js`
- `backend/src/ask_friday/index.js`
- `backend/src/ask_friday/index.test.js`
- `backend/src/ask_friday/policy.js`
- `backend/src/ask_friday/policy.test.js`
- `backend/src/ask_friday/publisher.js`
- `backend/src/ask_friday/publisher.test.js`
- `backend/src/inbox/consult.js`
- `backend/src/inbox/consult_lock.js`
- `backend/src/inbox/consult_lock.test.js`
- `backend/src/operations/consult.js`
- `docs/architecture/ask-friday-agent-research-notes-2026-05-26.md`
- `docs/architecture/ask-friday-core-v1-2026-05-23.md`

## Verification

Ran:

```bash
cd /Users/judith/.codex/worktrees/ask-friday-autonomous-core-20260526/backend
npm test -- ask_friday inbox operations
npm run build
```

Result:

- 23 test suites passed.
- 123 tests passed.
- Backend TypeScript build passed.

`npm ci` was required in this fresh worktree before tests. It reported existing lockfile audit issues: 12 vulnerabilities, 9 moderate and 3 high. No dependency versions were changed.

## Remaining Work

Good next slices:

- Wire Website learning-event emitters and context-pack consumption in a separate Website worktree.
- Add eval cases for the new public policy failures and staff event emissions.
- Decide whether `ops-consult` should become a formal alias row for `fad_ops_assistant` or remain a knowledge-composer-only key.
- Add review UI affordances for staff-private events/candidates so Ishant can distinguish public, staff, and restricted review lanes.
- Design retention/deletion jobs for events, evidence refs, and rejected candidates.
- Add model-backed evals after deterministic eval coverage is stable.
- Keep finance/legal/owner-private module KBs design-only until redaction/access rules are locked.

## Deploy Note

Do not deploy blindly.

This branch contains a new migration and changes analyzer process behavior. Before deploy:

1. Review PM2/process plan for `npm run ask-friday:analyzer`.
2. Confirm whether production should run the analyzer worker now or leave it manual.
3. Apply migration `095_consult_conversation_locks.sql`.
4. Smoke `/api/ask-friday/core/surfaces`, public context-pack denial for `fad_consult`, Inbox/Friday Consult, and Ops Consult.

