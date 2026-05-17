# Overnight session handover — 2026-05-18

> Picking up from `dd07ea0` / `d098e74` (the 2026-05-17 session
> handover + locked decisions). Mathias may already have started his
> morning click-through; ping for findings.

## TL;DR

Three ships, all on `fad-design-os-v01-frontend`, all deployed to
prod. Backend at `a52f1fa`, frontend at `56f79d9` (email skeleton is
backend-only).

| # | Commit | What | Deployed |
|---|---|---|---|
| 1 | `330d6e3` | TeamInbox threading UI — inline expandable threads + reply count badges | backend + frontend |
| 2 | `56f79d9` | Channel members admin drawer — replaces curl for membership | backend + frontend |
| 3 | `a52f1fa` | Email integration: mig 055 + backend skeleton (Gmail OAuth, classifier, threading, Pub/Sub push) | backend only |

Migrations applied on prod: **055_email_integration.sql**. Verify with
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

### TeamInbox file uploads — DEFERRED, needs your input

The locked decision (§8) says "local disk + nginx static serve". I
hesitated to ship that autonomously because publicly-served
attachments leak — private-channel files would be readable by anyone
who guessed the URL. Two options:

- **A (locked spec):** nginx static under `/var/www/fad-attachments/`,
  exposed at `https://gms.friday.mu/attachments/<uuid>`. Fast but
  unauthenticated. Acceptable if attachments are non-sensitive.
- **B (auth):** new `/api/team/attachments/:id` endpoint that streams
  the file after a channel-member / DM-participant check. Slower (Node
  serving binary) but safe. Same disk layout, different access path.

I'd prefer (B) for security parity with the rest of the inbox. ~30
min difference in implementation. Pick one and I'll ship.

(Also note: `multer` is already in `package.json`; would still need
to add `sharp` for image compression.)

### Unified outbound abstraction — designed not built

Decision §2 says BUILD UNIFIED. I didn't ship this overnight because
the contract has subtle policy decisions (e.g., "what does
`channel: 'whatsapp'` mean for a `team` audience — error or
TeamInbox DM?") and the refactor part touches currently-working
Friday Consult send + TeamInbox compose. Better as a focused session
when you can review the contract before I refactor callers.

The skeleton would land at `backend/src/outbound/` with a
`POST /api/outbound/send` route fed by an audience+channel routing
table. Ready to start when you greenlight the contract.

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
| A | File uploads — pick A or B from above | 3-4h | Your call on auth model |
| B | Unified outbound abstraction | 1-2 days | Your nod on contract |
| C | Email frontend (Settings panel for accounts + email-thread surfaces) | 1-2 days | GCP setup gates real connection, but skeleton/empty-state UI can land |
| D | Slack import run | 5-30 min | Bot token |
| E | Reservations + Properties wire to live Guesty | 2-3h | Cooldown clear |
| F | Per-message read-receipt popover UI | 1h | None |

## Process state on prod (session end)

```
fad-backend   restart count: 73   status: online
friday-gms    uptime: ~110m       status: online
```

```
$ curl -s https://gms.friday.mu/version.json
{"version": "56f79d9", "builtAt": "2026-05-17T04:16:57.175Z"}
```

Backend HEAD is `a52f1fa` (email skeleton) — version.json reflects
frontend HEAD only.
