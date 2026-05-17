# Launch prompt — next FAD session (2026-05-18)

> Copy the block below into a fresh Claude Code session as the first
> message. Self-contained — assume cold start, no prior context.

---

## Copy-paste this

# ACP Brief: FAD next session — Threading + admin UIs + Slack import + (when ready) email integration

You're picking up the FAD / Friday-Inbox codebase after the 2026-05-17 overnight session. That session shipped: Friday Consult v2 as the default reply surface, AI Draft review with send preflight + 5s undo, TeamInbox MVP (13 channels, DMs, @mentions, search, reactions), and Slack import scaffolding. 16+ FAD commits, 5 friday-gms commits, 4 architecture docs.

## Read these first (in order)

1. `docs/handover/2026-05-17-session-handover.md` — full breakdown of what shipped, what's parked, what to test, the 8 open architecture questions, autonomous decisions to confirm/flip
2. `docs/handover/2026-05-17-friday-as-nervous-system.md` — architecture v0.1 (7-layer, multi-audience, autonomous mode, prompt injection, FridayContext seam, phased plan)
3. `docs/handover/slack-import-setup.md` — Slack app creation walkthrough (10 min) — needed when Ishant shares the bot token
4. Repo `CLAUDE.md` + global `~/.claude/CLAUDE.md`
5. `memory/fad_gms_dependency_map.md` — how FAD ↔ GMS are coupled
6. [Notion: TeamInbox Sprint — Scoping + Decisions](https://www.notion.so/36343ca884928180a38bcd2a433661df) — channel set + parked items + decisions

## Working directory

```bash
cd /Users/judith/repos/friday-admin-dashboard/.claude/worktrees/fad-design-os
git fetch origin && git status
git log --oneline -8    # should start with ba4052e or whatever's HEAD by then
```

Branch `fad-design-os-v01-frontend`. Migrations 052, 053, 054 applied on prod.

## Priority 0 — answer Ishant's open architecture questions (5 min)

Before coding, get answers on the 6+2 open questions in §10 of the architecture doc. They unblock the build queue:

**Architecture (2):**
1. Sprint 9 sequencing for Phase 3 tool calling — wait for ship vs design on top?
2. Multi-audience outbound abstraction in fad-backend — unified or per-channel?

**Email integration (6, all block starting the build):**
3. Provider strategy — Gmail-only vs Gmail+Outlook/M365
4. Sync model — Gmail API push / polling / IMAP IDLE
5. OAuth flow — per-user vs service account
6. Audience classification — heuristics / LLM / hybrid
7. Threading strategy — Message-ID headers / Gmail thread_id / both
8. Storage scope — headers+bodies / +attachments

Recommendations from prior session: wait for Sprint 9; build unified outbound; Gmail-only first; polling; per-user OAuth; heuristics first then LLM later; both threading strategies; headers+bodies only for v1.

## Priority 1 — Slack import (when Ishant gives the bot token)

Per `docs/handover/slack-import-setup.md`. Once Ishant creates the Slack app and shares `xoxb-...`:

```bash
curl -X POST https://gms.friday.mu/api/team/slack-import/start \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"botToken": "xoxb-..."}'
```

Default settings: 180 days back, only channels matching FAD's 13 (auto-mapped + renames `frgm` → `gm`, `general` → `random`, `guest-services` → `ops`). Watch progress via `GET /api/team/slack-import/runs`. After verified successful, Ishant cancels Slack.

If Ishant hasn't shared the token yet, skip and continue with Priority 2.

## Priority 2 — build threading UI for TeamInbox (~2-3h)

`parent_message_id` column already exists on `team_channel_messages` + `team_dm_messages`. Backend's POST message endpoint accepts `parentMessageId` in body. Just frontend UI work.

Files to touch:
- `frontend/src/app/fad/_components/modules/inbox/TeamInbox.tsx` — add thread-side-panel (or inline-expand) + thread reply composer
- `frontend/src/app/fad/_data/teamInboxClient.ts` — extend `loadChannelMessages` / `loadDmMessages` with thread-fetch helper

UX pattern: hover a message → "Reply in thread" button alongside reactions picker. Click → opens an inline expandable thread (right below the parent message) with replies + a mini compose. No side panel — keeps scroll position. Or use OLD-GMS-style side panel — operator preference. Either is acceptable; faster ship is inline.

## Priority 3 — TeamInbox admin UI (~2h)

Replace the curl commands for adding/removing private channel members with a UI. New surface (probably a drawer or panel) listing current members of the active channel + an "Add user" picker. Wire to `POST /api/team/channels/:id/members` + `DELETE /api/team/channels/:id/members/:userId` (both already live).

## Priority 4 — file uploads for TeamInbox (~3-4h, decision needed first)

Needs a storage decision before code:
- **Option A: local disk + nginx static serve** — fast, free, breaks on multi-server. Fine for v1 (single-server FR tenant).
- **Option B: S3 or DigitalOcean Spaces** — scalable, costs $, needs creds.

Default to A unless Ishant says otherwise. Use `sharp` for image compression. Skip compression for the `photoshoot` channel (it has `preserve_upload_quality=true`).

## Priority 5 — email integration (once questions answered)

After Ishant answers Q3-Q8, design the schema + scaffold backend + frontend. Migration `055_email_integration.sql` adds `email_accounts`, `email_threads`, `email_messages`, `email_classifications`. Backend `src/email/` module with the pull worker. Frontend new `Unclassified` audience chip in inbox filter.

OAuth setup blocking sub-task: Ishant creates Google OAuth client in GCP console. Until then, IMAP test path with App Password is acceptable for getting the pipeline working end-to-end.

## Priority 6 — backlog pick (any one of these, lowest-friction first)

| # | What | Effort |
|---|---|---|
| Per-message read-receipt popover UI | 1h | Endpoints live |
| Sent-draft attribution shows reviewer name | 30 min | Transformer needs to capture `reviewed_by` from GMS draft row |
| Pending teachables count in send preflight modal | 30 min | Callback from FridayConsult up to InboxModule |
| Confirm-channel-mapping UI for Slack import | 2h | Lets Ishant review auto-suggestions before run |
| Reservations + Properties wire to live Guesty | 2-3h | When Guesty 429 clears (should be by morning) |
| Website-inbox fold into unified inbox | 2-3h | Render as `source: website` filter chip |

## State at handover

- **HEAD:** `ba4052e feat(slack-import): default 180-day floor per Ishant 2026-05-17`
- **Live prod version:** `gms.friday.mu/version.json` should show `ba4052e` or later
- **Migrations applied:** 052, 053, 054 (verify with `SELECT * FROM fad_schema_migrations ORDER BY applied_at DESC LIMIT 5`)
- **Backend on prod:** online, mounts `/api/team/*` + 15+ new `/api/inbox/*` routes
- **friday-gms:** online, additional guesty.ts hardening landed after my session (daily-quota persistence, `__dirname` cache path, `GuestyDailyLimitError` class). Verify state with `git log --oneline -5` in friday-gms.
- **Guesty:** 429 cooldown should have cleared by morning. First mint attempt happens automatically on next poll cycle. If still 429, another 6h cooldown.

## Anti-goals

- Don't start any priority below until the one above is done OR explicitly parked (avoid context-switch churn).
- Don't touch `friday-gms/src/routes/consult.ts` for tool calling until Sprint 9 ships — risk of tangling verification stages.
- Don't touch `main` branch.
- Don't reuse the `pending_actions` panel in Inbox UI — it was explicitly stripped per FAD Backend Wiring v1 §1. Actions flow to Operations' Reported Issues.
- Don't autonomous-send anything in TeamInbox — team chat is operator-assist only per architecture doc.
- Don't enable autonomous mode anywhere yet — shadow mode first per Phase 5 plan.

## Style + conventions (unchanged from prior sessions)

- Terse. Infer context. Don't over-explain.
- Push back with reasoning when Ishant is wrong.
- Visual thinker — diagrams + tables for architecture.
- Direct push to `fad-design-os-v01-frontend`. No PRs.
- Commits authored "Judith Friday".
- Always `git fetch origin` before assessing repo state.
- Verify before declaring done.
- Pre-commit hook runs full repo tsc — fix any pre-existing errors that block as side-effect cleanup.

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

friday-gms (separate repo, separate deploy):
```bash
# Cherry-pick approach (when prod is on a different commit line than master)
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  'cd /var/www/friday-gms && git fetch origin master && git cherry-pick <SHA> && npm run build && pm2 restart friday-gms'
```

## Open coordination items

- Slack bot token — Ishant creates the app (steps in `docs/handover/slack-import-setup.md`)
- Architecture decisions — 8 open questions above
- Storage decision for TeamInbox file uploads — local vs S3
- Email OAuth client — GCP console setup blocking the Gmail API path
- Mathias's morning click-through of the new surfaces — surface any bugs early

Also at this path so the next session can re-read on disk:
`docs/handover/2026-05-18-NEXT-SESSION-PROMPT.md`
