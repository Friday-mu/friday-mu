# Session handover — 2026-05-18 (full day)

> Picking up from `dd07ea0` / `d098e74` (the 2026-05-17 session
> handover + locked decisions). 18+ ships landed today across cutover,
> RBAC, accounts, analytics, bug fixes, and inbox UX iteration based
> on live Ishant feedback.

## TL;DR

**Production state:**
- Backend + frontend on prod at **`3ce6be2`** (working branch `fad-design-os-v01-frontend`).
- **admin.friday.mu** now serves FAD (cutover completed today). gms.friday.mu kept as a working alias / fallback.
- GMS backend (port 3001, friday-gms repo) continues to run as the proxied dependency.
- DB migrations applied this session: **055_email_integration.sql**, **056_team_attachments.sql**.
- 6 active FR-tenant users seeded with credentials; 5 still on `must_change_password=TRUE`, Ishant cleared.

**Team is using FAD as of today.** Slack DMs went out with credentials. Mathias's morning click-through was the trigger for many of the iterations below.

## What shipped today (chronological)

Listed newest-first. Every commit deployed to prod unless noted.

| Commit | Subject |
|---|---|
| `3ce6be2` | fix(inbox): explicit X close on internal note compose |
| `30af231` | fix(inbox): wire the inert +Compose button to a clear toast |
| `3cb718f` | feat(inbox): Friday Consult collapsed by default + unified compose |
| `3304ed4` | feat(inbox): DMs auto-populate + Friday Consult compose redesign |
| `a1acf62` | feat: fix bugs A/B/C/D/#6, wire analytics, dynamic login roster |
| `7b84b23` | feat(rbac): JWT-driven real role + lock finance/approvals/permissions to director |
| `c8aee98` | docs: QA findings — 6 ship-related bugs + 3 pre-existing |
| `29e3d67` | fix(qa): 5 bugs found during heavy browser QA pass |
| `adcf004` | feat(auth): force-change-password modal + legacy /-route redirect + analytics proxy |
| `3cd525d` | docs: handover update — file uploads + outbound abstraction shipped |
| `6e5b767` | feat(outbound): unified /api/outbound/send — federates Guesty, Resend, Meta-stub, TeamInbox |
| `2dec9aa` | feat(team-inbox): file uploads — drag, drop, paste, paperclip; nginx static serve |
| `a142926` | docs: overnight session handover — 3 ships, what's parked, what's next |
| `a52f1fa` | feat(email): mig 055 + backend skeleton — Gmail OAuth, classifier, threading |
| `56f79d9` | feat(team-inbox): channel members admin drawer — add / remove from UI |
| `330d6e3` | feat(team-inbox): threading UI — inline thread surface, reply count badges |

## Locked decisions (carry forward — do not re-litigate)

Beyond the 8 already locked on 2026-05-17, today added:

1. **admin.friday.mu = FAD's primary URL.** Old GMS UI no longer served there. GMS backend (port 3001 internal) stays alive as the proxied dependency. `GMS_BASE_URL=http://localhost:3001` on fad-backend.
2. **FAD usage analytics flow via /api/analytics → GMS** (the legacy events table). 13 event types instrumented across FAD today.
3. **Force-change-password modal** is the only password-change path (no Settings entry yet). Users hit modal on first sign-in; must set new password before reaching the shell.
4. **RBAC roles mapped by email** (PermissionsProvider reads JWT, maps email → fad_role). Hard-coded:
   - ishant@friday.mu → director
   - mathias@friday.mu → commercial_marketing
   - franny@friday.mu → ops_manager
   - mary / bryan / catherine → field
5. **Finance locked to director only.** ops_manager + commercial_marketing + field all have `finance: {}`. Time-off approval also director-only.
6. **TeamInbox file attachments** = public nginx static serve via `/uploads/team/...` (Ishant green-lit "attachments-as-company-info, terms-of-use govern misuse").
7. **Friday Consult collapsed by default**, auto-opens on activeDraft. Single unified compose at the bottom — no duplicate "Write a reply" surface flicker. Internal compose form inside FridayConsult was removed; the inbox-compose's ▾ dropdown routes typed text to consult via the `pendingQuery` prop.
8. **DMs auto-populate** for every non-self team member. Virtual rows lazy-create the actual DM via `openDm()` on first click. No more `+ New DM` button.

## Test credentials

| User | Email | Password | must_change |
|---|---|---|---|
| Ishant | ishant@friday.mu | `2027isouryear!` | FALSE (cleared) |
| Mathias | mathias@friday.mu | `Friday2026!` | TRUE |
| Franny | franny@friday.mu | `Friday2026!` | TRUE |
| Mary | mary@friday.mu | `Friday2026!` | TRUE |
| Bryan | bryan@friday.mu | `Friday2026!` | TRUE |
| Catherine | catherine@friday.mu | `Friday2026!` | TRUE |
| (test) acme | acme@example.com | `FadTest-2026-Test!` | FALSE |

If anyone's locked out after a botched password change, re-seed via psql with a fresh bcrypt — never edit `password_hash` inline (bash interpolates `$2` and `$10` from the bcrypt prefix, mangles the hash).

## Production state (end of session)

```
$ curl -s https://admin.friday.mu/version.json
{"version": "3ce6be2", "builtAt": "..."}
```

```
pm2 list (gms.friday.mu VPS)
  fad-backend   port 3002   online   (last restart count ~ 82)
  friday-gms    port 3001   online   (lifetime restarts ~ 3203)
```

```
nginx /etc/nginx/sites-enabled/
  default              # admin.friday.mu — serves FAD (/var/www/fad)
  gms.friday.mu        # alias — same content, kept as fallback
  mcp.friday.mu, mission.friday.mu  # unrelated
```

```
fad-uploads layout (nginx /uploads/ serves /var/www/fad-uploads/)
  /uploads/photos/...       design module photos (existing)
  /uploads/team/channel/<channel_id>/<uuid>.<ext>   team channel attachments
  /uploads/team/dm/<dm_id>/<uuid>.<ext>             team DM attachments
```

## API surface (added today)

```
GET    /api/auth/login-roster               Public — active @friday.mu users for the LoginScreen chips
POST   /api/auth/change-password            Verify current_password, set new + must_change=FALSE
GET    /api/auth/me                         Augmented with must_change_password from DB
POST   /api/auth/login                      Augmented with must_change_password from DB

GET    /api/version                         Proxied to GMS (legacy poll endpoint)
GET    /api/analytics/*                     Proxied to GMS (legacy events table)

GET    /api/team/channels                   Now returns isMember flag; system admins also see non-member private channels
GET    /api/team/messages/:kind/:id/replies Thread replies for parent message
POST   /api/team/channels/:id/attachments   Multipart upload (multer)
POST   /api/team/dms/:id/attachments        Same for DMs
POST   /api/team/channels/:id/messages      Now accepts attachmentIds + parentMessageId
POST   /api/team/dms/:id/messages           Same for DMs

POST   /api/outbound/send                   Unified — federates Guesty, Resend, TeamInbox; Meta stub
GET    /api/email/*                         Skeleton — see oauth.js for GCP setup steps
```

## Known gaps + parked

### Build queue (priority order)

| # | What | Effort | Blocker |
|---|---|---|---|
| A | **Schedule send + WhatsApp template picker + "send when awake"** — dropdown items are stubbed; clicks fire toasts. Actual flows need a date-time modal + GMS template-fetch endpoint + Meta Hub wiring. | 1-2 days | Decision on Meta Hub timeline |
| B | **Settings → Change password** entry point — currently force-modal is the only way to change. Operator who already changed once can't change again without me toggling `must_change_password` in DB. | 1-2h | None |
| C | **New-conversation Compose flow** — the top-right `+ Compose` button is a toast stub. Needs guest picker + channel chooser + outbound-via-Guesty wiring. Likely depends on the unified outbound abstraction (already shipped). | 1 day | Contact-source decision |
| D | **Task creation from Friday Consult** — Sprint 9 tool-calling work. Parked on `gms-v6.33.0-sprint9-final`. | post-Sprint-9 | gms-v6.33.0-sprint9-final |
| E | **Slack history import** — schema + worker ready (mig 054, slack_import.js). Parked on bot token + admin UI for channel mapping confirmation. | 2-3h after token | Slack bot token |
| F | **Email integration runtime** — schema + backend skeleton shipped (mig 055, `backend/src/email/`). Real Gmail connection blocked on GCP OAuth client. Frontend Settings panel for accounts not built. | 1 week after GCP | GCP project + OAuth client + Pub/Sub topic |
| G | **Refactor Friday Consult send + TeamInbox compose to use `/api/outbound/send`** — endpoint shipped, callers still use per-channel paths. Cleanup commit. | 1-2h | None |
| H | **sharp for image compression on team attachments** — currently storing originals. | 1h | Decide if needed (current cap is 25 MB) |
| I | **Cleanup job for unbound attachments** (uploaded but never sent > 24h old). | 1h | None |
| J | **Reservations + Properties wire to live Guesty** post-cooldown. | 2-3h | Cooldown clear |
| K | **Per-message read-receipt popover** in TeamInbox. | 1h | None |
| L | **Website-inbox fold** into unified inbox. | 2-3h | None |

### Bugs found today (all fixed)

| Bug | Fix commit |
|---|---|
| /api/version 404 after cutover | `adcf004` |
| nginx 403 on trailing-slash routes (pre-existing) | `3ce6be2` and earlier — nginx config patched directly on server |
| Members drawer admin gate didn't fire for system admin | `29e3d67` |
| File uploads landed at wrong nginx path (FAD_UPLOAD_DIR collision) | `29e3d67` |
| /api/auth/me read userId from wrong field — modal never fired | `29e3d67` |
| /api/auth/login same bug as auth/me | `7b84b23` |
| Bug-report FAB intercepted Send button | `a1acf62` (moved to bottom-left) |
| Author shows "Unknown" on every message (fixture/JWT UUID mismatch) | `a1acf62` (useJwtUserId hook + authorName fallback) |
| DM filter never matched (same root cause) | `a1acf62` |
| Reaction "I reacted" highlight never triggered (same root cause) | `a1acf62` |
| Private channels invisible to system admin via API | `a1acf62` |
| `+ Compose` button no-op (no onClick) | `30af231` |
| Internal note compose had no X close button | `3ce6be2` |

### Inbox QA — verified working

Browser-tested via playwright today:

- Login at admin.friday.mu, chip pre-fill, redirect to /fad ✅
- Force-change-password modal blocks shell when must_change=TRUE, success path closes it, DB updated ✅
- Inbox loads 150 guest conversations from GMS ✅
- Filter chips (All / Guest / Owner / Vendor / Team) — all switch ✅
- Conversation selection, thread render, draft inline ✅
- Friday Consult auto-open on activeDraft, manual close, manual re-open ✅
- Friday Consult collapse-by-default when no draft ✅
- Send button on guest compose ✅
- Send dropdown ▾ opens; Ask Friday routes text to consult; Internal note switches mode; click-outside closes ✅
- Internal note X close → back to reply mode + Friday Consult re-opens ✅
- Left rail collapse / expand ✅
- Right rail collapse / expand ✅
- Ask Friday side drawer open + close ✅
- Schedule call drawer open + close ✅
- TeamInbox: 9 public channels + 4 private (Ishant only) + 5 DMs auto-populated ✅
- Channel messages send, attachment upload, thread reply, reaction add ✅
- Members drawer: opens, lists members with admin badges, add/remove for system admin ✅
- DM click on virtual row → lazy-create + send message ✅

### Stubs (intentional, not bugs)

Operator clicks these → toast explains. Backend wiring needed:

- Send ▾ → Schedule send
- Send ▾ → Send WhatsApp template
- Send ▾ → Send when guest is awake
- `+ Compose` (new conversation)

## How to deploy (unchanged)

```bash
# Frontend
cd frontend && npm run deploy
# (build:prod + rsync to /var/www/fad/)

# Backend
rsync -avz -e "ssh -i $HOME/.ssh/do_friday_admin" \
  backend/src/ root@gms.friday.mu:/var/www/fad-backend/src/
rsync -avz -e "ssh -i $HOME/.ssh/do_friday_admin" \
  backend/server.js root@gms.friday.mu:/var/www/fad-backend/server.js
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu 'pm2 restart fad-backend'

# Migration
scp -i ~/.ssh/do_friday_admin backend/migrations/<NNN>.sql root@gms.friday.mu:/tmp/
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  "set -a && . /var/www/fad-backend/.env && set +a && \
   psql \"\$DATABASE_URL\" -f /tmp/<NNN>.sql && \
   psql \"\$DATABASE_URL\" -c \"INSERT INTO fad_schema_migrations (filename) VALUES ('<NNN>.sql') ON CONFLICT DO NOTHING\""
```

**IMPORTANT:** `npm run deploy` after git commit lands (the build embeds `version.json` from current HEAD at build time).

## References

- **2026-05-17 session handover:** `docs/handover/2026-05-17-session-handover.md`
- **2026-05-17 architecture v0.1 (locked decisions §10):** `docs/handover/2026-05-17-friday-as-nervous-system.md`
- **2026-05-18 QA findings:** `docs/handover/2026-05-18-qa-findings.md`
- **CLAUDE.md** (repo root) — FAD conventions
- **~/.claude/CLAUDE.md** — global workspace rules
- **Notion: Friday System Atlas** — `34c43ca8849281b9a10de9f264141c37`
- **Notion: Friday Code Index** — `35143ca88492810d9a73d46b0101c436`
- **Notion: TeamInbox sprint** — `36343ca884928180a38bcd2a433661df`
