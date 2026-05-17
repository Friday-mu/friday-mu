# Launch prompt — next FAD session (2026-05-18)

> Copy the block below into a fresh Claude Code session as the first
> message. Self-contained — assume cold start, no prior context.
>
> **Updated 2026-05-17 after Ishant locked all 8 open architecture +
> email-integration questions.** No more decisions blocking the build.

---

## Copy-paste this

# ACP Brief: FAD next session — power through threading + admin UIs + Slack import + email integration build

You're picking up the FAD / Friday-Inbox codebase after the 2026-05-17 overnight session. That session shipped: Friday Consult v2 as the default reply surface, AI Draft review with send preflight + 5s undo, TeamInbox MVP (13 channels, DMs, @mentions, search, reactions), Slack import scaffolding (parked on bot token), and a fully-decided architecture v0.1. 18+ FAD commits, 5 friday-gms commits, 5 docs.

**Ishant has answered all 8 open questions.** All decisions locked — see "Locked decisions" section below. No design-gate blocking the build queue. He explicitly said "power through" — don't sandbag on session length.

## Read these first (in order)

1. `docs/handover/2026-05-17-session-handover.md` — full breakdown of what shipped, what's parked, what to test, the autonomous decisions to confirm/flip
2. `docs/handover/2026-05-17-friday-as-nervous-system.md` — architecture v0.1 (7-layer, multi-audience, autonomous mode, prompt injection, FridayContext seam, phased build plan). §10 has all 8 answered questions.
3. `docs/handover/slack-import-setup.md` — Slack app creation walkthrough — needed when Ishant shares the bot token
4. Repo `CLAUDE.md` + global `~/.claude/CLAUDE.md`
5. `memory/fad_gms_dependency_map.md` — how FAD ↔ GMS are coupled
6. [Notion: TeamInbox Sprint — Scoping + Decisions](https://www.notion.so/36343ca884928180a38bcd2a433661df) — channel set + parked items + decisions

## Working directory

```bash
cd /Users/judith/repos/friday-admin-dashboard/.claude/worktrees/fad-design-os
git fetch origin && git status
git log --oneline -8    # last commit on session handover branch
```

Branch `fad-design-os-v01-frontend`. Migrations 052, 053, 054 applied on prod.

## Locked decisions (no more design gates)

### Architecture
1. **Sprint 9 sequencing:** wait for `gms-v6.33.0-sprint9-final` to ship before touching `friday-gms/src/routes/consult.ts` for Phase 3 tool calling. Don't tangle two verification stages.
2. **Multi-audience outbound abstraction:** BUILD UNIFIED. New `fad-backend` API `sendMessage(audience, channel, body, contextId)` federates internally to Guesty / Resend / Meta-when-live / TeamInbox. First callers: TeamInbox compose + Friday Consult send. Build it as you wire those — pays off the moment the second channel exists.

### Email integration
3. **Provider:** Gmail-only for v1. Design schema generic (`provider`, `provider_account_id` columns) so adding Outlook/M365 later is layered, not a retrofit.
4. **Sync model:** Gmail API push notifications via Cloud Pub/Sub for real-time + full history pull every N hours as a gap-filler safety net.
5. **OAuth:** per-user authentication. `@friday.mu` domain allowlist by default; non-friday.mu addresses default to `allowed=false` with a pending-Ishant-override flag. Schema needs `allowed: bool` + `authorized_by` + reason on `email_accounts`.
6. **Classification:** hybrid. Heuristics first (sender-domain match against known owners/vendors/guests lists from the Properties + Owners modules + Guesty data). LLM fallback for ambiguous cases. Cache classifier decisions per (sender, audience-pattern) — never re-classify the same sender twice.
7. **Threading:** both Message-ID/References headers (cross-provider standard) AND Gmail thread_id (Gmail-specific assist). Fall back to message-id chain if thread_id missing.
8. **Storage:** headers + bodies + attachments. Full storage. Attachments share the storage layer with TeamInbox file uploads — default to local disk + nginx static serve for v1 unless Ishant requests S3 later.

## Priority 1 — Slack import (when Ishant shares the bot token)

Per `docs/handover/slack-import-setup.md`. Once Ishant creates the Slack app + shares `xoxb-...`:

```bash
curl -X POST https://gms.friday.mu/api/team/slack-import/start \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"botToken": "xoxb-..."}'
```

Defaults: 180-day floor, channels auto-mapped by name with `frgm`→`gm`, `general`→`random`, `guest-services`→`ops`. Unmatched Slack channels skipped. Watch progress via `GET /api/team/slack-import/runs`.

If Ishant hasn't shared the token, skip and continue with P2.

## Priority 2 — TeamInbox Day 2-3: threading + file uploads (~5-7h)

**Threading UI (~2-3h):**
- `parent_message_id` column already exists on `team_channel_messages` + `team_dm_messages`
- Backend's POST message endpoint already accepts `parentMessageId` in body
- Just frontend UI work:
  - `frontend/src/app/fad/_components/modules/inbox/TeamInbox.tsx` — add inline expandable thread surface (right below parent message, keeps scroll position) OR side-panel pattern — operator preference, faster ship is inline
  - `frontend/src/app/fad/_data/teamInboxClient.ts` — extend message loader to fetch thread replies separately

**File uploads (~3-4h):**
- Decision: local disk + nginx static serve (default per locked decisions). Multer for upload. `sharp` for image compression. `preserve_upload_quality=true` flag on `team_channels` table bypasses compression for the `photoshoot` channel.
- Backend: new POST `/api/team/channels/:id/upload` + `/dms/:id/upload`. Schema: add `attachments` table or JSONB column on messages.
- Frontend: drag-drop zone in compose, thumbnail preview, paste-image support.
- Storage path: `/var/www/fad-attachments/` with nginx config to serve under `/attachments/...` (need to add nginx config to deploy notes).

## Priority 3 — Build the unified outbound abstraction (~1-2 days)

Per locked decision #2. New `fad-backend/src/outbound/` module exposes:

```js
// POST /api/outbound/send
// Body: { audience: 'guest'|'owner'|'vendor'|'team'|'unclassified',
//         channel: 'whatsapp'|'airbnb'|'booking'|'email'|'team-channel'|'team-dm',
//         contextId: '<conversation_id|channel_id|dm_id>',
//         body: '<message body>',
//         meta?: { ... } }
// Returns: { ok, messageId | draftId, sentAt }
```

Implementation routes internally:
- `audience=guest, channel=whatsapp|airbnb|booking|email` → existing Guesty path (via friday-gms's compose)
- `audience=owner|vendor, channel=email` → Resend (already wired in `website_inbox/resend.js`)
- `audience=team, channel=team-channel|team-dm` → TeamInbox internal send
- `audience=owner|vendor, channel=whatsapp` → Meta Hub stub (Meta blocked; return clear error pointing at the blocker)
- `unclassified` → reject with `error: 'classify_first'`

Then refactor Friday Consult's send + TeamInbox compose to use this single endpoint instead of their per-channel calls. Cleanup commit after.

## Priority 4 — Email integration build (~1 week, autonomous start)

All 8 design questions answered. Start the build immediately.

### Schema (mig 055)

```
email_accounts (per-user OAuth tokens)
  - id, user_id (FK), tenant_id (FK)
  - provider ('gmail'|'outlook'), provider_account_id
  - email_address, allowed (bool, default FALSE for non-@friday.mu),
    authorized_by_user_id (nullable), authorized_reason (nullable),
    authorized_at (nullable)
  - access_token_encrypted, refresh_token_encrypted (use existing
    bytea-encryption pattern from tenants.guesty_api_key)
  - watch_expiration (gmail users.watch expires every 7 days max)
  - history_id (last-seen for incremental sync)
  - created_at, updated_at

email_threads
  - id, tenant_id, account_id (FK email_accounts)
  - provider_thread_id (Gmail thread_id or null)
  - subject, participants (jsonb array of {email, name})
  - classified_audience ('guest'|'owner'|'vendor'|'unclassified')
  - classified_by ('heuristic'|'llm'|'manual'), classified_at
  - linked_guest_email, linked_owner_id, linked_vendor_id (nullable
    cross-module references resolved by classifier)
  - first_message_at, last_message_at, message_count
  - status ('open'|'archived'|'spam')

email_messages
  - id, thread_id (FK email_threads), tenant_id
  - provider_message_id, message_id_header (RFC822 Message-ID)
  - in_reply_to_header, references_header (jsonb)
  - from_email, from_name, to_emails (jsonb array), cc_emails, bcc_emails
  - subject, body_text, body_html
  - sent_at, received_at
  - direction ('inbound'|'outbound')
  - raw_headers (jsonb), labels (jsonb array, Gmail-specific)

email_attachments
  - id, message_id (FK), filename, content_type, size_bytes
  - storage_path (local disk relative or s3 key), inline (bool, for CID
    references in HTML body)

email_classification_cache
  - sender_email (PK), classified_audience, confidence
  - classifier ('heuristic'|'llm'), classified_at
  - When the same sender writes again, hit the cache before running
    heuristic/LLM again
```

### Backend (`fad-backend/src/email/`)

- `index.js` — router mount + endpoints
- `oauth.js` — Gmail OAuth flow (init, callback, refresh). `@friday.mu` allowlist check.
- `gmail_client.js` — wrapped Gmail API client per-user (uses refresh_token to get fresh access_token)
- `watcher.js` — Cloud Pub/Sub push receiver + history-id-based incremental sync
- `pull_worker.js` — periodic safety-net pull (every 4h?) via Gmail history.list
- `classifier.js` — heuristics first + LLM fallback. Heuristic checks: sender domain in owners table, in vendors table, in guests/reservations (via Guesty), or unknown → LLM.
- `threading.js` — Message-ID + Gmail thread_id resolver
- `attachments.js` — download from Gmail + store to local disk

### Frontend

- New audience chip in inbox filter: `Unclassified` (alongside All / Guest / Owner / Vendor / Team)
- Email thread rendering: similar shape to guest threads but no AI draft pipeline (yet — email-draft generation is a Phase 6+ thing)
- Account-management UI in Settings module: list connected Gmail accounts, "Connect Gmail" button (triggers OAuth flow), show allowed/pending status

### Blockers requiring Ishant input (start the rest while waiting)

- **GCP OAuth client setup** — Ishant creates a project in GCP console, enables Gmail API + Cloud Pub/Sub, creates an OAuth 2.0 client (web app type), shares the client ID + secret + adds redirect URL `https://gms.friday.mu/api/email/oauth/callback`. Until done, the OAuth flow can't connect to real Gmail. While waiting: build the schema + backend skeleton + IMAP+App-Password test path for end-to-end validation.

## Priority 5 — TeamInbox admin UI (~2h)

Drawer or panel listing current members of the active channel + an "Add user" picker. Replaces the curl commands operators currently need to add private-channel members. Wire to existing `POST /api/team/channels/:id/members` + `DELETE /api/team/channels/:id/members/:userId` endpoints.

## Priority 6 — Backlog cherry-pick (pick based on time remaining)

| What | Effort |
|---|---|
| Per-message read-receipt popover UI in TeamInbox | 1h |
| Sent-draft attribution: capture `reviewed_by` from GMS draft row | 30 min |
| Pending teachables count in send preflight modal | 30 min |
| Confirm-channel-mapping UI for Slack import | 2h |
| Reservations + Properties: wire to live Guesty once cooldown clears | 2-3h |
| Website-inbox fold into unified inbox (`source: website` chip) | 2-3h |

## State at handover

- **HEAD:** check `git log --oneline -3` — last commit is the doc-update from session-end (dd07ea0 + this update)
- **Live prod version:** `gms.friday.mu/version.json`
- **Migrations applied:** 052, 053, 054 (verify with `SELECT * FROM fad_schema_migrations ORDER BY applied_at DESC LIMIT 5`)
- **Backend on prod:** online, mounts `/api/team/*` + 15+ new `/api/inbox/*` routes
- **friday-gms:** online, additional guesty.ts hardening landed after prior session (daily-quota persistence, `__dirname` cache path, `GuestyDailyLimitError` class)
- **Guesty:** by morning the 6h cooldown should have cleared. First mint attempt happens automatically on next poll. If still 429, another 6h cooldown.

## Anti-goals

- Don't touch `friday-gms/src/routes/consult.ts` for tool calling until Sprint 9 ships — locked decision #1.
- Don't build per-channel send paths anywhere new — go through the unified outbound abstraction.
- Don't touch `main` branch.
- Don't reuse the `pending_actions` panel in Inbox UI — actions flow to Operations' Reported Issues.
- Don't autonomous-send anything in TeamInbox — team chat is operator-assist only.
- Don't enable autonomous mode anywhere yet — shadow mode first per architecture doc Phase 5.
- Don't classify any email without first checking the classification cache.

## Style + conventions (unchanged)

- Terse. Infer context. Don't over-explain.
- Push back with reasoning when Ishant is wrong.
- Visual thinker — diagrams + tables for architecture.
- Direct push to `fad-design-os-v01-frontend`. No PRs.
- Commits authored "Judith Friday".
- Always `git fetch origin` before assessing repo state.
- Verify before declaring done.
- Pre-commit hook runs full repo tsc — fix any pre-existing errors that block as side-effect cleanup.
- Ishant said "power through" — don't sandbag on session length. Verify, commit, move on.

## Deploy flow (unchanged)

Backend:
```bash
rsync -avz -e "ssh -i $HOME/.ssh/do_friday_admin" \
  backend/src/ root@gms.friday.mu:/var/www/fad-backend/src/
rsync -avz -e "ssh -i $HOME/.ssh/do_friday_admin" \
  backend/server.js backend/package.json backend/package-lock.json \
  root@gms.friday.mu:/var/www/fad-backend/
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu 'pm2 restart fad-backend'
```

Frontend (uses prod env vars — DO NOT use plain `npm run build`):
```bash
cd frontend && npm run deploy
```

**IMPORTANT:** run `npm run deploy` AFTER the git commit lands, not before — the build embeds `version.json` from current HEAD at build time. Mis-ordering → version.json reflects pre-commit state.

Migrations:
```bash
scp -i ~/.ssh/do_friday_admin backend/migrations/<NNN>.sql root@gms.friday.mu:/tmp/
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  "set -a && . /var/www/fad-backend/.env && set +a && \
   psql \"\$DATABASE_URL\" -f /tmp/<NNN>.sql && \
   psql \"\$DATABASE_URL\" -c \"INSERT INTO fad_schema_migrations (filename) VALUES ('<NNN>.sql') ON CONFLICT DO NOTHING\""
```

friday-gms (separate repo, separate deploy — cherry-pick approach since prod is on a different commit line than master):
```bash
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  'cd /var/www/friday-gms && git fetch origin master && git cherry-pick <SHA> && npm run build && pm2 restart friday-gms'
```

## Open coordination items (will be resolved during session as Ishant provides)

- **Slack bot token** — needed for P1; setup walkthrough in `docs/handover/slack-import-setup.md`
- **GCP OAuth client** — needed for P4 Gmail integration to connect real accounts; create at console.cloud.google.com (project, enable Gmail API + Pub/Sub, OAuth 2.0 client, web app, redirect URL `https://gms.friday.mu/api/email/oauth/callback`)
- **Storage choice for attachments** — defaulting to local disk; Ishant can override to S3/DO Spaces if needed
- **Mathias's morning click-through** — surface any bugs early

Also at this path so the next session can re-read on disk:
`docs/handover/2026-05-18-NEXT-SESSION-PROMPT.md`
