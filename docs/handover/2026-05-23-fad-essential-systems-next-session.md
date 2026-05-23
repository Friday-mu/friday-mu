# FAD Essential Systems Next Session Handover - 2026-05-23

## Purpose

This handover is the restart point for the next FAD session. It consolidates the current Ask Friday, Inbox/Consult, Calendar/Ops, notifications, real-data, multi-tenant, and parked-work priorities so the next session can start from a clean baseline instead of reconstructing decisions from chat.

Do not treat this file as proof that any implementation is live. Verify remote and production truth first.

## Current Branch Truth

- Repo: `/Users/judith/repos/friday-admin-dashboard`
- Canonical implementation branch: `origin/fad-rebuild`
- Remote `origin/fad-rebuild` observed after fetch on 2026-05-23: `62c154205168ea5df3ca0f82f7dcb52335813b41`
- This handover worktree: `/Users/judith/.codex/worktrees/fad-next-session-handover-20260523`
- This handover branch: `codex/fad-next-session-handover-20260523`

Important related branches:

- Ask Friday FAB polish: `origin/codex/fad-ask-friday-fab-polish-20260523 @ 15a35603b0255b5b07fe58c2214f5e33bde1a2ba`
- No-demo-data partial fix: `origin/codex/fad-no-demo-data-20260523 @ 169ea9b36c6c8766df4e95a14342531c6abdbb20`
- Notification email backoff: `origin/codex/fad-notification-email-backoff-20260523 @ dc151ff76e736dc2f73126f56ff5961ace6d5c98`

The main checkout `/Users/judith/repos/friday-admin-dashboard` was behind remote and had unrelated untracked files when this handover was written. Do not write there directly unless you first reconcile that state.

## Sources Rechecked

Repo handovers:

- `docs/handover/2026-05-22-fad-auth-inbox-consult-handover.md`
- `docs/handover/2026-05-22-ops-desktop-audit-handover.md`
- `origin/codex/fad-ask-friday-fab-polish-20260523:docs/handover/2026-05-23-fad-convergence-pending-tasks.md`

Notion scoping:

- FAD Scoping: `https://www.notion.so/34f43ca88492812baca2def8dd92eb27`
- Running decisions log: `https://www.notion.so/34f43ca88492819f8284ea6a89e8624e`
- FAD Backend Wiring v1: `https://www.notion.so/35e43ca8849281b1942fc3a4ced59a19`
- FAD Inbox Sprint Prep: `https://www.notion.so/36543ca8849281e981d2c942caddd3f4`
- FAD Module Build Tracker: `https://www.notion.so/35143ca8849281a6ae13c23872e54507`

Durable Notion decisions:

- FAD is the control and AI layer over Guesty for most Phase 1 surfaces.
- Operations tasks have moved to FAD as source of truth; Breezeway task data is migration/backfill input only.
- Multi-tenancy is non-negotiable across schema, API auth, credential storage, route guards, RLS, and AI prompt isolation.
- Inbox proposes guest communication and actions; Ops owns real task execution.
- Notifications are separate from TeamInbox. TeamInbox is conversation; Notifications is event inbox/archive.
- Built frontend does not imply production-ready backend. Demo/fixture truth must be audited before AI consumes module data.

## Priority Order

### 1. Startup And Coordination

Start every implementation slice from a fresh worktree off latest `origin/fad-rebuild`.

Required startup checks:

1. `git fetch origin --prune`
2. `git ls-remote origin refs/heads/fad-rebuild`
3. Confirm the working branch descends from the current remote tip.
4. Inspect current worktrees if another FAD session is active.
5. Verify live frontend with `https://admin.friday.mu/version.json`.
6. Verify backend version/health if backend work is in scope.
7. Do not deploy until explicitly coordinated.

### 2. Data Truth Gate

Before expanding Ask Friday or cross-module AI context, make sure FAD is not showing or consuming demo data as operational truth.

Immediate truth fixes:

- Remove the fake Finance sidebar count derived from fixture finance approvals.
- Force the notifications panel/sidebar to real-only data.
- Prevent Ask Friday from reading fixture/demo module data as real context.
- Audit Reviews, HR, Training, Design, Calendar, Finance, and Notifications for fake persisted/demo rows before treating them as usable AI context.

See `docs/handover/2026-05-23-fad-demo-data-truth-audit.md`.

### 3. Ask Friday Core

User-facing name is **Ask Friday**. Do not use "OS Friday" in UI, handovers, or product/public wording. Internal specialist modes should use role names, not separate public personas.

Current Ask Friday UI polish lives on `origin/codex/fad-ask-friday-fab-polish-20260523 @ 15a3560`. Do not overwrite those frontend files without merging, cherry-picking, or explicitly parking that branch.

Ask Friday next goals:

- Verify all FAD/FAB/Consult model paths.
- Gemini 3.5 Flash should be primary where applicable; Kimi should be fallback.
- Keep polished chat UX, dictation, Cmd/Ctrl+Enter send, Stop while generating, request-id stale response protection, and explicit action cards.
- Add true backend/tool telemetry later instead of simulated progress.
- Add streaming later if needed; current stop behavior cannot recover hidden partial model work.
- Allow direct execution for clear internal commands only when actions are safe, audited, and reversible. High-risk actions remain approval-routed.

See `docs/handover/2026-05-23-ask-friday-coordination-boundaries.md`.

### 4. Website AI Handoff Into FAD

Website side reports readiness for the newer handoff contract, but full live verification depends on FAD endpoints being deployed.

Preserve:

- `human_takeover` or `aiMayReply:false` stops website AI replies.
- Visitor follow-ups after takeover go to FAD visitor-message proxy, not `/api/ask-friday`.
- Staff messages from FAD render as team replies on the website.
- Public team presence must expose only public-safe aggregate state, not staff names, schedules, workload, or internal status.
- Owner Ask Friday stays owner-scoped and does not use public web search unless separately approved.

Product decision still needed:

- When FAD takes over a website chat, the website Ask Friday box becomes a live team chat surface until the team closes it or moves the conversation to email. WhatsApp is not configured yet, so email is the current continuation path after closure.

### 5. Inbox And Friday Consult

Continue from the shipped auth/root hotfix; do not redo it unless verification shows regression.

Repair goals:

- Fix missed website inquiry drafts.
- Rework awaiting-reply behavior and placement.
- Add full reservation side panel context: guest count, payment/financial details, payment status, reservation status, stay context.
- Fix stale draft superseding and full-message-history grounding.
- Verify draft and Consult context includes reservation, financial, property, availability, brand voice, platform rules, STR/support/sales/ops knowledge, teachings, action feedback, and fallback behavior.
- Preserve backend send truth and human approval.
- Friday Consult remains an operator chat/refine surface, not a reject workflow.

Ownership:

- Inbox owns guest communication, detection/proposal quality, and conversation context.
- Ops owns real task creation/execution.
- Finance owns real finance records.

### 6. Calendar, Ops, Notifications

Calendar/Ops:

- Audit duplicate reservations.
- Fix date-line clipping/broken UI.
- Confirm real reservations and real tasks are wired.
- Confirm cross-linking into Operations, Reservations, Properties, and Inbox.
- Recover the most recent prior Calendar work if current code regressed.
- Avoid Ops-owned UI files while the Ops session is active unless explicitly coordinated.

Notifications:

- Browser permission flow.
- Service worker/PWA notification registration.
- In-app notification feed wiring.
- Backend realtime notification creation and SSE delivery.
- Email fallback/backoff behavior.
- Update banner/stale-client detection so users know when a new FAD version is available.

### 7. First Usable Module Loop

The next strategic goal is to make a small set of real-data modules usable together, not to polish every screen.

Target loop:

- Inbox usable.
- Ops usable.
- Reviews real-only verified.
- HR real-only verified.
- Calendar real-data/cross-link pass.
- Properties v1 layered over Guesty/FAD data.
- Reservations v1 layered over Guesty/FAD data.
- Guests v1.
- Owners lite.
- Finance capture tied to tasks/expenses, without pretending full Finance backend is done.
- Design recovered/verified.
- Training teachings real/editable.
- Settings feedback/password verified.

Do not turn Properties/Reservations into a Guesty replacement yet. For v1, use FAD-owned cached tables/services over Guesty data and make sense of the information inside FAD.

## Parked But Preserved

- Manage / multi-tenant recovery.
- Full multi-tenant correctness audit across Ask Friday, Inbox, Ops, Website handoff, Notifications, and module clients.
- Friday Stay Portal FAD contract and Inbox/Ops handoff.
- Mary QA FAD-native staff task/message path.
- WhatsApp burner bridge prototype.
- Legal/Admin full module.
- Finance full backend and Mathias additions.
- Syndic/Design/Finance specialist Ask Friday modes after the global surface stabilizes.
- Public/team-safe presence endpoint architecture.
- Website AI live display in FAD while AI is responding, with takeover lockout to prevent double replies.

## Verification Gate

Before calling any next slice done:

- Run focused backend tests for touched API paths.
- Run frontend typecheck.
- Run frontend production build.
- Run desktop and mobile browser smoke.
- For live/deploy work, verify `admin.friday.mu/version.json`, backend health/version, and the touched user flow.
- If backend and frontend both changed, deploy and verify them together from the same SHA.
