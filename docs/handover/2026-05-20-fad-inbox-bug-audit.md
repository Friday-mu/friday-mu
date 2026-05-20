# FAD Inbox Bug Audit — 2026-05-20

## Sources Checked

- Notion: `FAD Inbox Sprint Prep — 2026-05-20`
- Notion: `TeamInbox Sprint — Scoping + Decisions (2026-05-17)`
- Notion: `Running decisions log`
- Notion: `Multi-Agent Tactical Brief (Week of 2026-05-19)`
- Repo handovers under `docs/handover`
- Local configured `feedback` table
- Current code paths for Inbox send, WhatsApp templates, TeamInbox mentions, and feedback capture

## Current Live Feedback Table

The configured local database currently has zero feedback rows.

Audit found a schema bug: `backend/src/feedback.js` inserts `feedback.source`, but local migrations did not create that column. New feedback submissions could fail before reaching the inbox. Fixed by migration `060_feedback_source.sql`; applied locally during verification.

## Fixed In This Pass

### TeamInbox Mentions

Problem:
- Frontend only parsed token-style mentions such as `@mary`.
- Typed display-name mentions such as `@Ishant Ayadassen` only captured `@Ishant`.
- Public channel mentions could be dropped if the target user was not already present in `team_channel_members`.

Fix:
- `parseMentions` now resolves `@username`, `@Display Name`, `@DisplayName`, and unique `@FirstName`.
- Public channel backend validation now accepts any active tenant user.
- Private channel validation remains member-only.
- Added frontend tests for full-name, compact-name, username, unique first-name, ambiguous first-name, and email-fragment cases.

### Feedback Capture Schema

Problem:
- Feedback route wrote `source`; schema lacked it.

Fix:
- Added migration `060_feedback_source.sql` with source column, check constraint, and source/date index.

## Confirmed Open / Not Fully Wired

### WhatsApp Template Selection And Send

State:
- Backend endpoint exists: `POST /api/inbox/conversations/:id/send-template`.
- If `GMS_TEMPLATE_SEND_PATH` is not configured, backend returns a truthful blocked/manual state.
- UI has a closed-window `Pick template` action that sends the default `guest_reply_window_closed` template id.

Gap:
- There is no real template picker/list UI yet.
- Real upstream send depends on `GMS_TEMPLATE_SEND_PATH` or the future Meta/Guesty template sender being configured.

Risk:
- Operators should not assume arbitrary template selection works yet. Current behavior is either default-template attempt or blocked/manual guidance.

### Friday Consult

State:
- Friday Consult is the Ask Friday review/refine side panel inside Inbox.
- It is the intended surface for operators to ask Friday to draft, revise, summarize, or explain.

Gap:
- Needs a reliability pass for session isolation/history:
  - fetch active/history when a thread opens,
  - bind calls to `conversationId`,
  - bind draft actions to `conversationId + draftId`,
  - prevent cross-thread context leakage.

### Visual/UI Smoke Notes

Verified:
- `/fad` loads after login.
- Inbox loads with guest list and Team chip.
- TeamInbox loads channels, DMs, private-channel join bucket, and compose surface.

Observed:
- Desktop screenshot still shows a wide horizontal overflow/duplicated right-side slice around the shell/Ask Friday area. This appears pre-existing and unrelated to this mention parser/backend change, but should be audited in a frontend layout pass.

## Verification Run

- `frontend npm run test` — pass, 12 files / 160 tests
- `frontend npx tsc --noEmit` — pass
- `frontend npm run build` — pass
- `backend npm test` — pass, with existing Jest `process.exit(0)` warning
- `backend npm run build` — pass
- Browser visual smoke on `http://localhost:3000/fad` — pass for load/navigation; noted layout overflow above
