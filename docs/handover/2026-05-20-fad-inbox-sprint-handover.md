# FAD Inbox Sprint Handover - 2026-05-20

## Repo / Worktree
- Repo root: `/Users/judith/repos/friday-admin-dashboard`
- Target worktree: `/Users/judith/repos/friday-admin-dashboard/.claude/worktrees/fad-design-os`
- Branch: `fad-design-os-v01-frontend`
- Preserve unrelated untracked file: `scripts/guesty-scraper/try-code.mjs`

## Current Blocker
Previous Codex session was started read-only:
- `sandbox_mode=read-only`
- `approval_policy=never`
So no files could be patched.

## Confirmed Findings
- Correct worktree exists and is on `fad-design-os-v01-frontend`.
- Property cards already exist:
  - `backend/knowledge/properties/TRR-4.json`
  - `backend/knowledge/properties/MV-1.json`
  - `backend/knowledge/properties/VA-3.json`
  - `backend/knowledge/properties/VA-4.json`
- FAD Inbox is current UI, not old GMS UI. Do not port GMS UI wholesale.
- Main Inbox module: `frontend/src/app/fad/_components/modules/InboxModule.tsx`
- TeamInbox: `frontend/src/app/fad/_components/modules/inbox/TeamInbox.tsx`
- Draft client: `frontend/src/app/fad/_data/draftsClient.ts`
- Inbox client: `frontend/src/app/fad/_data/inboxClient.ts`
- Team client: `frontend/src/app/fad/_data/teamInboxClient.ts`
- Consult: `frontend/src/app/fad/_components/FridayConsult.tsx`
- Backend send abstraction: `backend/src/outbound/index.js`
- Draft generation: `backend/src/inbox/draft_generator.js`
- Guesty webhook: `backend/src/inbox/guesty_message_webhook.js`
- Draft approve/send: `backend/src/inbox/drafts_send.js`
- Team backend: `backend/src/team_inbox/index.js`
- Server route mounts: `backend/server.js`

## Bugs Still To Fix
1. Guest operator sends in FAD use `mode: 'manual'`; should use real send path, likely `mode: 'direct_send'`.
2. Stale drafts are not consistently superseded after outbound guest replies.
3. Draft generator lacks latest-real-message guard before marking `draft_ready`.
4. WhatsApp template UI is placeholder only.
5. No FAD `/api/events/stream` SSE backend yet.
6. Push frontend hook exists, but backend `/api/push/vapid-key` and `/api/push/subscribe` do not.
7. TeamInbox parses/render mentions but send path does not reliably send parsed UUIDs.
8. Team chip unread count still depends on fixture arrays in InboxModule.
9. Friday Consult mostly resets session scope, but should fetch active/history on thread open and bind calls to `conversationId` + `draftId`.

## Implementation Priority
1. Backend notification/realtime primitives:
   - Add migration `058_inbox_realtime_notifications.sql`
   - Add `push_subscriptions`
   - Add `fad_notifications`
   - Add event/notification helper with `publishFadEvent`, `notifyUsers`, `resolveGmWatchers`
   - Add `/api/events/stream`
   - Add `/api/push/vapid-key`, `/api/push/subscribe`
2. Guest send truth:
   - Change FAD manual sends to `direct_send`
   - Supersede stale drafts after successful outbound
   - Surface `send_failed`, `send_queued`, `generation_failed`
3. Draft policy:
   - Only auto-draft after real inbound guest message
   - Before marking draft ready, check latest substantive message is still inbound
   - If latest is outbound/team, mark draft `superseded`
4. WhatsApp template:
   - Wire picker to `POST /api/inbox/conversations/:id/send-template`
   - Proxy to GMS/Guesty if available
   - Otherwise show blocked/manual state with backend reason
5. TeamInbox:
   - Parse typed mentions using `parseMentions`
   - Send UUIDs in channel, DM, and thread replies
   - Use live unread counts for Team chip
6. Tests/build:
   - `cd backend && npm test`
   - `cd backend && npm run build`
   - `cd frontend && npm run test`
   - `cd frontend && npx tsc --noEmit`
   - `cd frontend && npm run build`

## Resume Instruction
Start with write-enabled permissions, save this as:
`docs/handover/2026-05-20-fad-inbox-sprint-handover.md`

Then implement the sprint plan without importing old GMS UI.
