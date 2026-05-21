# Overnight session handover — 2026-05-18

> Picking up from `dd07ea0` / `d098e74` (the 2026-05-17 session
> handover + locked decisions). Mathias may already have started his
> morning click-through; ping for findings.

## TL;DR

Five ships, all on `fad-design-os-v01-frontend`, all deployed to prod.
Backend at `6e5b767`, frontend at `2dec9aa` (the latter two ships are
backend-only).

| # | Commit | What | Deployed |
|---|---|---|---|
| 1 | `330d6e3` | TeamInbox threading UI — inline expandable threads + reply count badges | backend + frontend |
| 2 | `56f79d9` | Channel members admin drawer — replaces curl for membership | backend + frontend |
| 3 | `a52f1fa` | Email integration: mig 055 + backend skeleton (Gmail OAuth, classifier, threading, Pub/Sub push) | backend only |
| 4 | `2dec9aa` | TeamInbox file uploads — mig 056, drag/drop/paste/paperclip, public nginx static serve | backend + frontend |
| 5 | `6e5b767` | Unified outbound abstraction `/api/outbound/send` — federates Guesty + Resend + TeamInbox + Meta stub | backend only |

Migrations applied on prod: **055_email_integration.sql**,
**056_team_attachments.sql**. Verify with
`SELECT * FROM fad_schema_migrations ORDER BY applied_at DESC LIMIT 5`.

## Smoke-test plan (priority order)

### TeamInbox threading

1. Open `gms.friday.mu/fad/?m=team-inbox` → pick `#gm` or any
   public channel.
2. Hover any message → confirm the hover picker now shows **👀 ✅
   🙋 | 💬** (the 💬 is "Reply in thread", added next to the reaction
   emojis with a faint divider).
3. Click 💬 → confirm an inline thread surface opens below the
   parent (indented + left border), showing "Thread · 0 replies"
   + a small textarea + Reply button.
4. Type a reply, Cmd+Enter or click Reply → confirm it appears in
   the thread; the parent message gets a **"💬 1 reply"** badge under
   the body that's clickable to toggle the thread surface.
5. Send another reply → badge becomes "💬 2 replies".
6. Click the badge → thread closes; click again → thread re-opens.
7. Switch to a different channel → confirm the thread closes (state
   resets on selection change so it doesn't follow you).
8. Reload the page → confirm replies persist, badge persists.
9. DM threading: open a DM, send a reply via the thread surface,
   reload — same persistence.
10. Backend invariant check (psql): replies have
    `parent_message_id` set; top-level messages have it NULL. No
    nested threads possible (backend rejects parent that's itself a
    reply).

### Channel members admin drawer

11. In TeamInbox header, channel meta line now shows **Members** (or
    **Private · members** on private channels) as an underlined
    clickable text.
12. Click → drawer opens listing current members with display name,
    email, role badge ("Admin"), and a "(you)" tag on the caller's
    row.
13. As an admin (your director account), confirm "Add member" search
    input + clickable user rows appear at the bottom; non-admins see
    "Only channel admins can add or remove members."
14. Click a user row → confirm "adding…" indicator, then they appear
    in the current-members list; channel sidebar refreshes (private
    channels would appear/disappear from their sidebar accordingly).
15. Click "Remove" on a member → confirm row disappears.
16. Click "Remove" on yourself → confirm `confirm()` dialog appears
    asking if you want to lose access; cancel keeps you in.
17. Bootstrap path for private channels: as Ishant (`users.role =
    'admin'`), the drawer should let you add yourself to e.g.
    `#finance` even though you're not yet a channel admin — backend
    has a `system admin OR channel admin` gate.

### File uploads

20. In any TeamInbox channel/DM compose, click the **Attach** button
    → file picker opens. Pick a file → it uploads in parallel, appears
    as a removable chip above the textarea (thumbnail for images,
    📎 icon for other files) with filename + size.
21. Drag a file (or several) onto the compose area → dashed outline +
    "Drop files to upload" overlay → release → files queue up.
22. Copy an image to clipboard (Cmd+Shift+4 → opens preview, then copy)
    and paste in the textarea → image uploads. Confirm chip appears.
23. Click ×  on a chip to remove. Confirm Send disables when only
    uploads are queued AND uploads are in-flight.
24. Hit Send → message posts with attachments; images render as
    clickable thumbnails (max 320×240) in the timeline, other files
    render as 📎 cards linking to download.
25. Switch channels → confirm queued attachments clear (don't leak
    between contexts).
26. 25 MB cap per file — try a bigger one to confirm a clean error.

### Unified outbound abstraction

27. Public ping: `curl -s -X POST https://gms.friday.mu/api/outbound/send -H
    "Content-Type: application/json" -d '{}'` → expect `401
    Unauthorized` (auth gate fires).
28. With a real JWT, try `{"audience":"unclassified","channel":"email","contextId":"x","body":"hi"}`
    → expect `400 classify_first`.
29. With a real JWT, try `{"audience":"team","channel":"team-channel","contextId":"<channel-uuid>","body":"hello via outbound"}`
    → expect `200 { ok, messageId, sentAt }` and the message appears
    in TeamInbox.
30. Existing callers (Friday Consult send + TeamInbox compose) are
    NOT yet migrated to this endpoint — that's a separate cleanup
    commit. The endpoint is ready for new outbound (email integration,
    autonomous send) to adopt directly.

### Email integration status

18. Public ping: `curl https://gms.friday.mu/api/email/status` →
    expect `{ configured: false, provider: 'gmail', note: 'PARKED:
    set GMAIL_OAUTH_CLIENT_ID / SECRET / REDIRECT_URI to enable
    connections' }`. Confirms the router mounted.
19. No frontend surface yet — Settings module wiring is the next
    chunk once GCP is set up. The Notion UI plan can lag until then.

## What's locked / parked / blocked

### Email integration — blocked on GCP OAuth client (Ishant)

Schema + skeleton shipped. To unblock the real flow:

1. Create a GCP project (anything, e.g. `friday-mail-v1`).
2. Enable **Gmail API** + **Cloud Pub/Sub**.
3. OAuth consent screen → Internal user type (Friday workspace) →
   add scope `https://www.googleapis.com/auth/gmail.modify`.
4. Create an **OAuth 2.0 Client ID** (Web application). Add
   authorised redirect URI: `https://gms.friday.mu/api/email/oauth/callback`.
5. Create a Pub/Sub **Topic** (e.g. `gmail-push-friday`). Grant
   `serviceAccount:gmail-api-push@system.gserviceaccount.com` the
   `roles/pubsub.publisher` role on it.
6. Create a Pub/Sub **Push subscription** on that topic with
   endpoint `https://gms.friday.mu/api/email/pubsub/push`.

Drop client id / client secret / Pub/Sub topic name in chat; I'll set
these env vars on prod via `pm2 set` and the OAuth flow lights up:

```
GMAIL_OAUTH_CLIENT_ID=...
GMAIL_OAUTH_CLIENT_SECRET=...
GMAIL_OAUTH_REDIRECT_URI=https://gms.friday.mu/api/email/oauth/callback
GMAIL_OAUTH_DOMAIN_ALLOWLIST=friday.mu
EMAIL_TOKEN_ENCRYPTION_KEY=<64-hex from `node -e "..."`>
GMAIL_PUBSUB_TOPIC=projects/<project-id>/topics/gmail-push-friday
EMAIL_PULL_ENABLED=true
```

Also need an Anthropic API key (`ANTHROPIC_API_KEY`) for the LLM
fallback in the classifier; heuristic-only works without it.

### Slack import — still blocked on bot token (unchanged from prev session)

`docs/handover/slack-import-setup.md` for the 10-min app-creation
walkthrough.

### File uploads — SHIPPED (was deferred; Ishant green-lit the
public nginx path)

Public static serve under `/uploads/team/{channel,dm}/<id>/<uuid>.<ext>`
via the existing nginx `/uploads/` location (no nginx config change
needed — reuses the dir already serving design photos). 25 MB cap,
multer-only (no sharp dep, originals stored as-is). See smoke-test
items 20-26.

### Outbound abstraction — SHIPPED

`/api/outbound/send` is live. Existing callers (Friday Consult send,
TeamInbox compose) still use their direct paths — refactoring them
to go through the unified endpoint is a separate cleanup commit and
not strictly required (the endpoint stands alone for new callers like
the email integration outbound path + future autonomous send).

## Files touched

**Migrations:**
- `backend/migrations/055_email_integration.sql`

**Backend:**
- `backend/src/team_inbox/index.js` — threading queries, replies
  endpoint, parent validation, admin OR system-admin gate.
- `backend/src/email/` — entire directory (9 files).
- `backend/server.js` — mount `/api/email`, start pull_worker.

**Frontend:**
- `frontend/src/app/fad/_components/modules/inbox/TeamInbox.tsx`
- `frontend/src/app/fad/_components/modules/inbox/ChannelMembersDrawer.tsx` (new)
- `frontend/src/app/fad/_data/teamInbox.ts`
- `frontend/src/app/fad/_data/teamInboxClient.ts`

## API surface (new this session)

```
GET    /api/team/messages/:kind/:id/replies     Thread replies for parent

GET    /api/email/status                        Public — OAuth config indicator
GET    /api/email/oauth/init                    Build Google consent URL
GET    /api/email/oauth/callback                OAuth redirect target (no auth)
GET    /api/email/accounts                      Caller's connected accounts
GET    /api/email/accounts/pending              Tenant admin: pending non-allowlist
PATCH  /api/email/accounts/:id/authorize        Tenant admin: flip allowed=TRUE
DELETE /api/email/accounts/:id                  Disconnect
GET    /api/email/threads                       List threads (?audience= filter)
GET    /api/email/threads/:id                   Detail + messages
POST   /api/email/threads/:id/reclassify        Manual audience override
POST   /api/email/pubsub/push                   Pub/Sub push receiver (no auth)
```

## Autonomous decisions — flag if you disagree

1. **Thread-reply UI: inline expandable** (matches locked spec) with a
   left-border + indent. Side panel was the alternative; inline ships
   faster + works on mobile.
2. **Replies excluded from unread counts.** The channel sidebar badge
   means "new top-level messages I haven't seen" rather than counting
   hidden thread replies (which would be confusing — you'd see a
   badge with no visible message to read). Tradeoff: a new thread
   reply doesn't bump the channel badge until the parent is also
   unread, which is mild. Alternatives: per-thread unread indicator
   (more code).
3. **Backend allows system admin to manage any channel's membership**
   (in addition to channel admin). Bootstrap path — without this,
   private channels are unmanageable until someone is a channel
   admin, and nobody can become a channel admin without an existing
   one. Self-removal is always allowed regardless of role.
4. **Email schema uses bytea for encrypted tokens** with an AES-GCM
   helper (`backend/src/email/crypto_helper.js`). Key sourced from
   `EMAIL_TOKEN_ENCRYPTION_KEY` env var. Future key rotation can add
   a version byte to the wire format.
5. **No googleapis npm dep — raw fetch instead.** Smaller dep
   surface, more visible wire calls. Switch to `googleapis` package
   if scope grows beyond Gmail (Calendar / Drive / etc.).
6. **Classifier cache row is per (tenant, sender_email).** Manual
   override on a thread also writes the dominant sender to the cache
   so future messages from them classify the same way. Confidence
   stored when present.

## Pre-existing gotchas (unchanged)

- Guesty 429 cooldown — check `cat /var/www/friday-gms/.guesty-token-meta.json`.
- `INBOX_THREADS` / `TEAM_MESSAGES` empty fixture shims still
  imported — cleanup low-priority.
- OLD admin shell at `gms.friday.mu/` root still has dead legacy
  proxies (server.js:159-571).

## What's next (priority order)

| # | What | Effort | Blocker |
|---|---|---|---|
| A | Refactor Friday Consult send + TeamInbox compose to use `/api/outbound/send` | 1-2h | None — incremental |
| B | Email frontend (Settings panel for accounts + email-thread surfaces) | 1-2 days | GCP setup gates real connection, but skeleton/empty-state UI can land |
| C | Slack import run | 5-30 min | Bot token |
| D | Reservations + Properties wire to live Guesty | 2-3h | Cooldown clear |
| E | Per-message read-receipt popover UI | 1h | None |
| F | sharp for image compression on team attachments | 1h | Decide if needed — current uploads can be large |
| G | Cleanup job for unbound attachments (uploaded but never sent, >24h old) | 1h | None |

## Process state on prod (session end)

```
fad-backend   restart count: 76   status: online
friday-gms    uptime: ~2h         status: online
```

```
$ curl -s https://gms.friday.mu/version.json
{"version": "2dec9aa", "builtAt": "2026-05-17T04:44:46.996Z"}
```

Backend HEAD is `6e5b767` (outbound abstraction). The version.json
reflects frontend HEAD only — outbound is backend-only.

## API surface added this session (beyond the email schema)

```
POST   /api/team/channels/:id/attachments       Upload single file (multipart)
POST   /api/team/dms/:id/attachments             Upload single file to DM
       (Both update existing POST .../messages to accept attachmentIds)

POST   /api/outbound/send                        Unified outbound:
       Body: { audience, channel, contextId, body, meta? }
       Returns: { ok, messageId|draftId, sentAt, upstream }
```
