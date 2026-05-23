# Ask Friday Core V1 Handover - 2026-05-23

## Branch

- Worktree: `/Users/judith/.codex/worktrees/ask-friday-core-v1-20260523`
- Branch: `codex/ask-friday-core-v1-20260523`
- Base: `origin/fad-rebuild@62c154205168ea5df3ca0f82f7dcb52335813b41`
- Scope: FAD backend/core only.

## What Changed

Added a FAD-owned Ask Friday Core V1 scaffold:

- Migration: `backend/migrations/074_ask_friday_core.sql`
- Contract normalizers: `backend/src/ask_friday/contracts.js`
- Manual analyzer: `backend/src/ask_friday/analyzer.js`
- Core router: `backend/src/ask_friday/index.js`
- Server mount: `backend/server.js` at `/api/ask-friday/core`
- Tests:
  - `backend/src/ask_friday/contracts.test.js`
  - `backend/src/ask_friday/analyzer.test.js`
  - `backend/src/ask_friday/index.test.js`
- Architecture note: `docs/architecture/ask-friday-core-v1-2026-05-23.md`

## Runtime Tables

Migration 074 creates:

- `ask_friday_surfaces`
- `ask_friday_context_packs`
- `ask_friday_learning_events`
- `ask_friday_evidence_refs`
- `ask_friday_kb_candidates`
- `ask_friday_action_requests`
- `ask_friday_eval_cases`
- `ask_friday_eval_runs`
- `ask_friday_identity_links`
- `ask_friday_consent_events`

Seeded surfaces include Website guest/FAB/owner/feedback, FAD Consult/Ops/Finance, internal agent bridge, and public MCP as planned.

## API Routes

Mounted at `/api/ask-friday/core`.

Public API client routes:

- `POST /events` with `ask-friday:events:write`
- `GET /context-packs/:surfaceId` with `ask-friday:context:read`
- `POST /action-requests/public` with `ask-friday:actions:write`
- `POST /identity-links/public` with `ask-friday:identity:write`

FAD staff routes:

- `GET /surfaces`
- `POST /surfaces`
- `POST /context-packs`
- `GET /kb-candidates`
- `POST /kb-candidates`
- `PATCH /kb-candidates/:candidateId`
- `GET /action-requests`
- `POST /action-requests`
- `PATCH /action-requests/:actionId`
- `POST /identity-links`
- `POST /analyzer/run`
- `GET /eval-cases`
- `POST /eval-cases`

## Verification

Ran:

```bash
cd /Users/judith/.codex/worktrees/ask-friday-core-v1-20260523/backend
npm ci
npm test -- ask_friday
```

Result after analyzer slice: 3 suites passed, 15 tests passed.

Note: `npm ci` reported existing dependency audit issues from the repo lockfile: 12 vulnerabilities, 9 moderate and 3 high. This branch did not change dependencies.

## Boundaries Preserved

Did not edit the active FAD FAB polish files:

- `frontend/src/app/fad/_components/FridayDrawer.tsx`
- `frontend/src/app/fad/_components/FridayFullscreen.tsx`
- `frontend/src/app/fad/_data/fridayClient.ts`
- `frontend/src/app/fad/fad.css`
- `frontend/src/app/fad/_components/icons.tsx`

Did not edit Friday Website.

Did not alter existing Inbox send, handoff, public chat, MCP, or Consult behavior.

## Naming

User-facing AI name remains Ask Friday.

No new public/product surface should use the earlier mistaken label. FridayOS remains only the broader system/product label where already canonical.

## Parked

- Scheduled/background learning analyzer worker.
- Review queue UI.
- Context-pack publisher UI/process.
- Eval runner.
- Website emitters and context-pack consumption.
- Public MCP implementation.
- Direct booking/payment/write execution.
- Full raw trace/screenshot retention pipeline.

## Next Safe Slices

1. FAD backend analyzer worker:
   - Convert the manual `/analyzer/run` path into a scheduled or explicit staff-triggered workflow.
   - Keep dry-run as default until review queue is active.
   - Do not auto-publish.

2. FAD review queue:
   - List/filter pending KB candidates.
   - Approve/reject/needs-info with Ishant as default reviewer.
   - Publish a new context pack only after explicit approval.

3. Website emitters:
   - Guest hero, Ask Friday FAB, owner enquiry, feedback FAB.
   - Compact summaries only.
   - Preserve takeover stop conditions.

4. Eval runner:
   - Start with JSON fixtures from `ask_friday_eval_cases`.
   - Score grounding, routing, handoff, action safety, privacy, language match.

## Coordination Notes

- Start future FAD implementation slices from latest `origin/fad-rebuild`.
- If touching Ask Friday FAB UI files, first merge/cherry-pick/park `codex/fad-ask-friday-fab-polish-20260523@15a3560`.
- If touching Website handoff contracts, coordinate with the Website session and preserve:
  - `human_takeover` or `aiMayReply:false` stops Website AI replies.
  - Visitor follow-ups after takeover go to the FAD visitor-message proxy.
  - Staff messages from FAD render as team replies.
  - FAD public presence remains public-safe only.
  - Owner Ask Friday stays owner-scoped.

## Paste-Ready Status

```plain text
Ask Friday Core V1 backend scaffold is on FAD branch codex/ask-friday-core-v1-20260523.

It adds migration 074, contract normalizers, a manual analyzer, /api/ask-friday/core routes, tests, and docs. It does not touch Website or active FAD FAB UI files. Focused tests pass: npm test -- ask_friday, 3 suites / 15 tests.

Public routes are API-client scoped:
- ask-friday:events:write
- ask-friday:context:read
- ask-friday:actions:write
- ask-friday:identity:write

Staff routes are standard FAD JWT auth.

Next safe slice: review queue or scheduled analyzer workflow. Do not implement auto-publish. Do not expose private staff/owner/guest/payment/secret data. User-facing name is Ask Friday.
```
