# Launch prompt — next FAD session (2026-05-19+)

> Copy the block below into a fresh Claude Code session as the first
> message. Self-contained — assume cold start, no prior context.

---

## Copy-paste this

# ACP Brief: FAD next session — operator feedback iteration + parked build queue

You're picking up the FAD codebase after the 2026-05-18 full-day session that did the admin.friday.mu cutover, seeded all team accounts, locked RBAC, wired analytics, fixed a stack of bugs, and iterated the inbox UX based on Ishant's live feedback. The team is **actively using FAD now** (Slack DMs went out with credentials). Mathias's morning click-through drove most of today's iterations.

**Ishant has been at the keyboard giving feedback all day.** If he's still around, treat as direct mode. If you find a fresh ACP Brief from Judith spawning you, treat as ACP and use best judgment within scope.

## Read these first (in order)

1. `docs/handover/2026-05-18-session-handover.md` — full breakdown of today's 16+ ships, locked decisions added today, test credentials, prod state, build queue with priorities.
2. `docs/handover/2026-05-18-qa-findings.md` — bug catalogue (all fixed) + the 3 root-cause patterns to watch for in new code.
3. `docs/handover/2026-05-17-friday-as-nervous-system.md` — architecture v0.1, §10 has the original 8 locked decisions from 2026-05-17 (all still apply).
4. Repo `CLAUDE.md` + global `~/.claude/CLAUDE.md`.
5. `memory/fad_gms_dependency_map.md` — how FAD ↔ GMS are coupled.

## Working directory

```bash
cd /Users/judith/repos/friday-admin-dashboard/.claude/worktrees/fad-design-os
git fetch origin && git status
git log --oneline -8    # last commit on session handover branch
```

Branch `fad-design-os-v01-frontend`. Migrations 052, 053, 054, 055, 056 applied on prod. HEAD `3ce6be2`.

## Production state (snapshot at handover)

- **URL:** https://admin.friday.mu (FAD UI) + https://gms.friday.mu (alias)
- **Backend HEAD:** `3ce6be2` on fad-backend (port 3002) + friday-gms (port 3001) running as proxied dep
- **Frontend version:** `3ce6be2` (check `curl -s https://admin.friday.mu/version.json`)
- **6 team accounts seeded.** 5 still on `must_change_password=TRUE` (temp = `Friday2026!`). Ishant cleared (his password = `2027isouryear!`).
- **Migrations applied:** 052_team_inbox, 053_team_inbox_search, 054_slack_import, 055_email_integration, 056_team_attachments.

## What lands first today (priority queue)

| # | What | Effort | Blocker |
|---|---|---|---|
| 1 | **Schedule send + WhatsApp template + send-when-awake** — currently stub toasts. Build the actual flows. Schedule send needs a date-time picker + GMS-side queue. WA templates need a GMS template-fetch endpoint + variable substitution. Send-when-awake needs guest timezone resolution. | 1-2 days total | Decision on WA Meta Hub timeline (already designed in handover) |
| 2 | **Settings → Change password** entry point — currently only the force-modal lets users change. Add a section in Settings module that fires the same `ChangePasswordModal` (or a sibling inline form). Reuses `POST /api/auth/change-password`. | 1-2h | None |
| 3 | **Refactor Friday Consult send + TeamInbox compose → /api/outbound/send** (locked decision §2 from 2026-05-17 — endpoint shipped today, callers not refactored). Cleanup commit. | 1-2h | None |
| 4 | **New-conversation Compose flow** — currently `+ Compose` is a toast stub. Build guest picker (search by name/email/phone) + channel chooser + outbound-via-Guesty wiring. | 1 day | Decision on contact source (Guesty CRM vs ad-hoc) |
| 5 | **Operator UX polish from Mathias's morning click-through** — Ishant may have a list of small things by morning. Check Slack DMs first. | varies | Ishant feedback |

## Blockers (Ishant action, doesn't block all work)

- **Slack bot token** — `docs/handover/slack-import-setup.md`. Slack history import is parked.
- **GCP OAuth client + Pub/Sub topic** — `backend/src/email/oauth.js` header has the full setup steps. Email integration runtime is parked.

## Stubs to know about (toast on click)

These render in the UI but no real flow:
- Send ▾ → Schedule send
- Send ▾ → Send WhatsApp template
- Send ▾ → Send when guest is awake
- `+ Compose` (new conversation)

## Anti-goals (preserved from prior sessions)

- Don't touch `friday-gms/src/routes/consult.ts` for Phase 3 tool calling until `gms-v6.33.0-sprint9-final` ships (locked decision §1).
- Don't build per-channel send paths anywhere new — go through the unified `/api/outbound/send` abstraction.
- Don't touch `main` branch — direct push to `fad-design-os-v01-frontend`.
- Don't reuse the `pending_actions` panel in Inbox UI.
- Don't autonomous-send anything in TeamInbox — team chat is operator-assist only.
- Don't enable autonomous mode anywhere yet — shadow mode first.
- Don't classify any email without first checking the classification cache.
- **NEW:** Don't render duplicate compose surfaces in the guest inbox — the unified inbox-compose at the bottom is the single typing surface. FridayConsult is just a chat thread + inline drafts, no internal compose. Asking Friday routes through the Send ▾ dropdown.
- **NEW:** Don't fight the operator on Friday Consult auto-open. It auto-opens once per new activeDraft id (tracked in `autoOpenedDraftRef`); after that the operator can close and it stays closed until the next revision.
- **NEW:** Don't add new code that compares `currentUserId` (from `usePermissions()`) against DB UUIDs. Use `useJwtUserId()` for matching against backend data. The fixture id is only for the role-switcher view.

## Locked decisions (carry forward — full list in 2026-05-18-session-handover.md)

From 2026-05-17 (8 originals, all still apply):
- Sprint 9 sequencing: wait for `gms-v6.33.0-sprint9-final` before Phase 3 tool calling.
- Multi-audience outbound: BUILD UNIFIED — DONE 2026-05-17 (`/api/outbound/send`).
- Email: Gmail-only v1, schema generic for Outlook.
- Email sync: Gmail push (Pub/Sub) + 4h pull safety net.
- Email OAuth: per-user, `@friday.mu` domain allowlist by default.
- Email classification: hybrid (heuristics → LLM fallback, cached per sender).
- Email threading: Message-ID/References + Gmail thread_id.
- Email storage: full (headers + bodies + attachments), local disk + nginx static.

Added 2026-05-18:
- admin.friday.mu = FAD's primary URL (cutover complete).
- FAD usage analytics → /api/analytics → GMS legacy events table.
- Force-change-password modal is the only password-change path until a Settings entry ships.
- RBAC by email mapping in `usePermissions.ts` (PermissionsProvider reads JWT).
- Finance + time-off approval + hr_permissions = director-only.
- Team attachments = public nginx static serve under `/uploads/team/...`.
- Friday Consult collapsed by default, auto-opens on draft; unified compose at bottom; no internal consult input.
- DMs auto-populate for every team member; virtual rows lazy-create on click.

## Smoke-test plan (run if anything seems off after redeploy)

1. `curl -s https://admin.friday.mu/version.json` → expect current HEAD.
2. Log in as Ishant (`2027isouryear!`) → land on /fad → no modal.
3. Inbox module → All filter shows 150 conversations (proxied from GMS).
4. Click a conversation with active draft → Friday Consult auto-opens with draft inline.
5. Click X on Friday Consult → closes; inbox-compose textarea remains visible (no "Write a reply" flicker).
6. Click ▾ next to Send → menu opens; click "Post as internal note" → switches to note compose.
7. Click X on internal note compose → back to reply mode + Friday Consult re-opens.
8. Team chip → TeamInbox loads with 9 public channels, 4 private (Ishant only), 5 DM rows auto-populated.
9. Click a DM → opens (lazy-creates real DM if first time).
10. Send a message in #gm → renders with author "Ishant" + IS avatar.
11. Log out, log in as Mary (`Friday2026!`) → force-change-password modal blocks the shell.
12. As Mary, set new password → modal closes. Verify Mary's sidebar does NOT show Finance, Properties, Owners, CRM, HR Permissions.

## Style + conventions (unchanged)

- Terse. Infer context. Don't over-explain.
- Push back with reasoning when Ishant is wrong.
- Visual thinker — diagrams + tables for architecture.
- Direct push to `fad-design-os-v01-frontend`. No PRs.
- Commits authored "Judith Friday" with `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` trailer.
- Always `git fetch origin` before assessing repo state.
- Verify before declaring done — playwright the inbox + log in as a non-admin role to confirm RBAC.
- Pre-commit hook runs full repo tsc — fix any pre-existing errors that block as side-effect cleanup.

## Deploy flow (unchanged)

```bash
# Frontend
cd frontend && npm run deploy

# Backend (touched src/ files)
rsync -avz -e "ssh -i $HOME/.ssh/do_friday_admin" \
  backend/src/ root@gms.friday.mu:/var/www/fad-backend/src/
rsync -avz -e "ssh -i $HOME/.ssh/do_friday_admin" \
  backend/server.js root@gms.friday.mu:/var/www/fad-backend/
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu 'pm2 restart fad-backend'

# Migrations
scp -i ~/.ssh/do_friday_admin backend/migrations/<NNN>.sql root@gms.friday.mu:/tmp/
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  "set -a && . /var/www/fad-backend/.env && set +a && \
   psql \"\$DATABASE_URL\" -f /tmp/<NNN>.sql && \
   psql \"\$DATABASE_URL\" -c \"INSERT INTO fad_schema_migrations (filename) VALUES ('<NNN>.sql') ON CONFLICT DO NOTHING\""
```

**IMPORTANT:** `npm run deploy` AFTER the git commit lands — the build embeds `version.json` from current HEAD at build time.

**Password reset gotcha:** never inline a bcrypt hash in a bash heredoc/SQL command — bash expands `$2` and `$10` from the hash prefix and silently mangles it. Always use a `.sql` file scp'd over, OR escape with single-quoted bash variable.

Also at this path so the next session can re-read on disk:
`docs/handover/2026-05-19-NEXT-SESSION-PROMPT.md`
