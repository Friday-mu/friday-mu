# FAD Auth Hotfix + Inbox/Consult Handover - 2026-05-22

## Current State

- Repo: `/Users/judith/repos/friday-admin-dashboard`
- Working worktree used for the hotfix: `/Users/judith/.codex/worktrees/fad-root-redirect-hotfix-20260522`
- Branch: `codex/fad-root-redirect-hotfix`
- Canonical branch pushed: `origin/fad-rebuild`
- Live version: `599beda`
- Live URL: `https://admin.friday.mu`
- Production frontend root: `/var/www/fad`
- Production backend root: `/var/www/fad-backend`
- Production backend process: PM2 `fad-backend`

## Hotfix Shipped

Two commits were pushed to `fad-rebuild` and deployed:

- `846880d fix(auth): route root to FAD and use native login`
- `599beda fix(auth): skip legacy inbox load after login`

The live issue was not DNS. `admin.friday.mu` pointed to the FAD bundle, but the root `/` route still rendered the old GMS-style authenticated shell for users with a token.

Fixed behavior:

- Unauthenticated `/` shows the FAD login screen.
- Unauthenticated `/fad` redirects to `/`.
- Authenticated `/` redirects to `/fad`.
- Login uses FAD-native `/api/auth/login`.
- Reset password exists on login and `/reset-password`.
- Password reset default links now point to `https://admin.friday.mu/reset-password`.
- The root login path no longer briefly loads old `/api/conversations`, which triggered GMS `/pending` noise.

Production migration:

- `backend/migrations/072_fad_native_auth.sql`
- Applied on production. It registered successfully in `fad_schema_migrations`.

Backups before deploy:

- `/var/backups/fad-frontend-846880d`
- `/var/backups/fad-backend-auth-hotfix-846880d`

## Verification Completed

Local:

- `git diff --check` passed.
- Backend focused tests passed:
  - `src/inbox/conversations_translate.test.js`
  - `src/auth/session.test.js`
- Frontend `npx tsc --noEmit` passed.
- Frontend `npm run build` passed.

Live:

- `https://admin.friday.mu/version.json` returns `599beda`.
- `/` shows FAD login.
- `/fad?m=inbox` without token redirects to login.
- Login with `judith@friday.mu` succeeded. Do not store or print the password.
- Authenticated `/` redirects to `/fad`.
- Desktop and mobile `/fad?m=inbox` load.
- No visible `Friday GMS` label in the live FAD route.
- Authenticated API checks:
  - `/api/inbox/conversations` returns 200 with conversations.
  - `/api/inbox/pending-actions` returns 200.
  - `/api/team/channels` returns 200.

## Important Findings

### Translation Audit

FAD mostly matches the old GMS translation model:

- Inbound worker translates inbound messages only.
- Emoji-only messages fall back to conversation language.
- Outbound send-time translation sends guest-language content and retains English original metadata.
- Conversation language fallback exists.

Open translation decisions:

- Manual conversation translate route currently translates outbound rows too. Old GMS translated inbound only. Decide whether to align to inbound-only or keep this as an explicit metadata repair tool.
- Language memory is conversation-level, not guest-level across multiple reservations. The proposed guest-level preferred-language memory is not implemented yet.
- Add focused tests for multi-message guest bursts, attachments/images, emoji reactions, and language fallback.

### Notion Scope Recheck

Notion docs support the product direction Ishant described:

- Friday Consult should be the review/refine/chat surface.
- No old reject workflow in Consult unless explicitly re-scoped.
- Inline widgets are expected later for task proposals, finance captures, and learning.
- Inbox proposes pending actions; Ops owns converting accepted actions into real tasks.
- Learning should happen inline in Consult. Send preflight should only summarize already-captured learning, not ask "learn / don't learn".

Docs checked:

- FAD Inbox Sprint Prep: `https://www.notion.so/36543ca8849281e981d2c942caddd3f4`
- Running Decisions Log: `https://www.notion.so/34f43ca88492819f8284ea6a89e8624e`
- FAD Architecture & Integrations: `https://www.notion.so/36443ca884928155861cdbf0dba4fe22`
- TeamInbox Sprint: `https://www.notion.so/36343ca884928180a38bcd2a433661df`

### Production Concern

The VPS root disk is around 90% full. This is not blocking the current repair, but should be cleaned soon.

## Remaining Work

Recommended order:

1. Continue from latest `origin/fad-rebuild` in a fresh worktree.
2. Repair Inbox/Friday Consult from current `fad-rebuild`, not from `fad-design-os-v01-frontend` as product truth.
3. Fix auto-drafting regressions, including Lia Fasstenau-style missed drafts.
4. Restore the good Consult interaction model: operator chats with Consult, no reject workflow, no extra draft box unless intended.
5. Build shared draft/Consult context wiring:
   - brand voice
   - emoji interpretation
   - STR practices
   - platform rules
   - discount/refund frameworks
   - team/ops knowledge
   - sales knowledge
   - property cards
   - availability context
   - financial/reservation context
   - teachings
   - action feedback
   - full message history
6. Fix draft root causes:
   - full-context/model-length timeouts
   - degraded draft quality
   - wrong KB/context usage
   - stale summaries
   - fake status assumptions
   - session/draft isolation
   - stale draft safety
7. Decide translation parity changes.
8. Implement inline Consult proposals for actions/learnings/finance captures, keeping ownership boundaries:
   - Inbox owns pending action detection/proposal quality and UI only.
   - Ops owns real tasks.
   - Finance owns real payment/finance records.
9. Later, during knowledge-eval phase, research and define answerability score vs confidence score.
10. Later, fix push notifications and email ingestion with loop prevention.

## Protected Boundaries

Do not edit Ops-protected migrations without coordination:

- `backend/migrations/050_tasks.sql`
- `backend/migrations/051_tasks_full.sql`
- `backend/migrations/052_task_requirements.sql`
- `backend/migrations/053_task_supplies_inventory.sql`
- `backend/migrations/054_breezeway_task_import.sql`
- `backend/migrations/071_tasks_ops_lifecycle_reconcile.sql`

Do not alter these surfaces casually:

- `/api/tasks`
- task lifecycle semantics
- Breezeway import tooling
- Operations/My Tasks field execution UI/backend

No bulk conversion of old `pending_actions`.

## Paste-Ready Next Session Prompt

Continue FAD Inbox/Friday Consult repair from latest `origin/fad-rebuild`.

Repo: `/Users/judith/repos/friday-admin-dashboard`

Create a fresh separate worktree from latest `origin/fad-rebuild`. Do not use `fad-design-os-v01-frontend` as product truth; reference only.

First read:

- `docs/handover/2026-05-22-fad-auth-inbox-consult-handover.md`
- latest project `AGENTS.md`
- project memory and Notion routing if needed

Live auth/root hotfix is already deployed at `599beda`; do not redo it unless verification shows regression.

Now continue the real Inbox/Consult repair:

- Inspect latest live bugs/screenshots and route behavior.
- Fix missed auto-drafts, stale drafts, wrong context/KB wiring, timeouts, and degraded draft quality.
- Restore Consult as operator chat/refine surface, not reject workflow.
- Verify draft/Consult wiring includes full message history, reservation/financial context, property cards, availability, brand voice, platform rules, STR/support/sales/ops knowledge, teachings, action feedback, and fallback behavior.
- Preserve backend send truth and stale-draft safety.
- Keep Inbox/Ops/Finance ownership boundaries.
- Run backend focused tests, frontend typecheck/build, and live browser/mobile smoke before saying fixed.
