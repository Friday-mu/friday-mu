# ACP Brief: FAD next session — post 2026-05-17 night session

You're picking up after a long evening session. We rebuilt the Guesty
scraper for the new `/inbox-v2` UI, shipped it for messages +
reservations end-to-end, deployed receiver endpoints, restored 4
accidentally-deleted Design projects, wrote the FAB-screenshot
reference for the website team, and added a `source` discriminator
to feedback. We did not register the Guesty webhook — OAuth quota
still 429'd as of session end (~17:40 UTC).

## What's authoritative right now

- **Branch:** `fad-design-os-v01-frontend`
- **Worktree:** `/Users/judith/repos/friday-admin-dashboard/.claude/worktrees/fad-design-os`
- **HEAD at session end:** `~9f2703b` (verify with `git log -1`)
- **Prod versions:**
  - Frontend at `12c51f7` (`curl -s https://admin.friday.mu/version.json`)
  - Backend deployed with: scraped-reservations + scraped-listings receivers, feedback `source` column, team_inbox UUID-mention filter

## Cold-open checklist — run these first

```bash
cd /Users/judith/repos/friday-admin-dashboard/.claude/worktrees/fad-design-os
git fetch origin && git status
git log --oneline -25

# Confirm prod
curl -s https://admin.friday.mu/version.json

# Backend health
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu 'pm2 list'

# Inbound message flow (most recent should be from the scraper if
# scrape-all is running on launchd, or from today's manual scrape)
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  'set -a && . /var/www/fad-backend/.env && set +a && psql "$DATABASE_URL" \
   -c "SELECT COUNT(*), MAX(created_at) FROM messages WHERE guesty_message_id LIKE '"'"'g-scrape-%'"'"';"'

# Scraper output rows
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  'set -a && . /var/www/fad-backend/.env && set +a && psql "$DATABASE_URL" \
   -c "SELECT COUNT(*) FROM guesty_reservations WHERE guesty_id LIKE '"'"'scrape:%'"'"';"'

# Guesty OAuth quota — probe to see if it recovered
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  'set -a && . /var/www/fad-backend/.env && set +a && curl -s -o /dev/null -w "HTTP %{http_code}\n" \
   -X POST https://open-api.guesty.com/oauth2/token \
   -H "Content-Type: application/x-www-form-urlencoded" \
   -d "grant_type=client_credentials&client_id=$GUESTY_CLIENT_ID&client_secret=$GUESTY_CLIENT_SECRET&scope=open-api"'

# Mary's feedback inbox (any new bugs since 17:40 UTC?)
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  'set -a && . /var/www/fad-backend/.env && set +a && psql "$DATABASE_URL" \
   -c "SELECT created_at, title, source FROM feedback WHERE user_username='"'"'mary@friday.mu'"'"' AND created_at > '"'"'2026-05-17 17:40'"'"' ORDER BY 1 DESC LIMIT 10;"'
```

## The scraper — what shipped tonight

### What works end-to-end

| Surface | Status | Last verified |
|---|---|---|
| **Messages** (`scrape.mjs`) | ✓ Working. 162 messages, 9 conversations posted last run. | 16:17 UTC |
| **Reservations** (`scrape-reservations.mjs`) | ✓ Working. 50 reservations, Mar 2026 → Jan 2027 posted. | 16:28 UTC |
| **Listings** (`scrape-listings.mjs`) | ⚠ Scaffold only — selectors not probed. Run with `--probe` after auth refresh. | Not yet |
| **Orchestrator** (`scrape-all.mjs`) | ⚠ Code complete, untested as a unit. | Not yet |
| **launchd plist** | ⚠ Written, not installed. Run `scripts/guesty-scraper/launchd/install.sh` to enable the 15-min cadence. | Not yet |

### How to run scrape-all manually right now

```bash
cd /Users/judith/repos/friday-admin-dashboard/.claude/worktrees/fad-design-os/scripts/guesty-scraper

# Session may need a refresh first — confirm with:
node probe-login.mjs
# If it lands on /auth/login, re-auth:
rm -rf .profile && npm run auth     # opens Chromium, you sign in via Google, close window

# Then:
npm run scrape:all
```

`scrape-all` opens Chromium once and runs messages → reservations →
listings in sequence. ~3-5 minutes total.

### To turn on the 15-min cadence on Ishant's Mac

```bash
cd /Users/judith/repos/friday-admin-dashboard/.claude/worktrees/fad-design-os/scripts/guesty-scraper/launchd
./install.sh
```

This drops `com.friday.guesty-scrape-all.plist` into
`~/Library/LaunchAgents/`, loads it, and prints how to tail logs.
First run = 15 min after load. Kick immediately with:
```bash
launchctl kickstart -k gui/$(id -u)/com.friday.guesty-scrape-all
```
Tail: `tail -f ~/Library/Logs/guesty-scrape-all.log`.

Stop with `./uninstall.sh`.

### The pricing tier (still TODO)

Per-night pricing scraper — not yet written. Spec from Ishant
2026-05-17 night session: scrape `/properties/{id}/calendar` for each
listing's 365-day price curve, every 6 hours (not 15 min — too heavy).
Same `.cell-row` / datakey pattern likely; first commit = a probe to
confirm.

### The reconciler (scaffolded, not coded)

`data_drift_log` table is live on prod. Schema:
```
id | tenant_id | surface | match_key | diff (jsonb)
   | api_snapshot | scrape_snapshot | resolution
   | reviewed_at | reviewed_by | created_at
```

Rules (per Ishant 2026-05-17 night):
- Both exist + agree → no-op (API row wins implicitly)
- Both exist + disagree → keep scrape's fresher value, log diff
- Only scrape exists → keep scrape (the rate-limit fallback)
- Only API exists → keep API

The reconciler is NOT written. It should:
1. Run as a Postgres job (or backend cron) after each scrape batch + each API poller tick.
2. Find rows in `guesty_reservations` where `guesty_id LIKE 'scrape:%'` AND a sibling real-`guesty_id` row exists with the same `confirmation_code`. Compare key fields. Insert diffs into `data_drift_log`. Delete the `scrape:*` row if it agrees with the API row.
3. Same shape for `guesty_listings` matched by `nickname`.

Estimate: ~150 lines of SQL/JS. Next session task.

### Effective-view for the website

The website needs `guesty_reservations` / `guesty_listings` to merge
API-source-of-truth + scrape-fallback in a sensible way. Right now
the tables hold both with no preference. Two options for the next
session:

**A.** Create `effective_reservations` view that prefers `guesty_id NOT LIKE 'scrape:%'` when both exist for the same confirmation_code; falls back to `scrape:*` otherwise. Website queries the view.

**B.** Backend-side dedup in the existing `/api/reservations` route (filter inside JS, no view).

Recommend A — simpler from the website team's perspective.

## Guesty webhook — still blocked

- OAuth `client_credentials` endpoint returned **HTTP 429** as of 17:40 UTC.
- Angelo (Guesty support) refused the rate-limit bump in his
  2026-05-17 14:24 UTC reply.
- The rolling 24h window should clear overnight Mauritius time.
  Probe first thing — if 200, run:
  ```bash
  scp -i ~/.ssh/do_friday_admin scripts/guesty-scraper/register-webhook.mjs root@gms.friday.mu:/tmp/
  ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
    'set -a && . /var/www/fad-backend/.env && set +a && node /tmp/register-webhook.mjs && rm /tmp/register-webhook.mjs'
  ```
  This: lists existing → POST `/webhooks` create new at admin.friday.mu →
  DELETE legacy `judiths-mac-mini` and Into (`weareinto.ai`) webhooks
  in the same token session → prints Svix secret.
- After: add `GUESTY_SVIX_SECRET=whsec_…` to `/var/www/fad-backend/.env` +
  `pm2 restart fad-backend`. Real Guesty events should land within 5 min.

## What's stable in prod (don't touch)

| Commit | Why |
|---|---|
| `a9d7185` | `register-webhook.mjs` aligned with Angelo's reply (DELETE+POST) |
| `39cf8fe` | Backend defensive filter for non-UUID `mentions` in team_inbox routes (unblocked Mary's schedule-call bug) |
| `c215f2c` | TeamInbox read-receipts now persist (Mary 14:24 bug) |
| `6c7e244` | CalendarModule uses live `useLiveReservations()` |
| `12c51f7` | PropertiesModule self-hydrates via `useHydrateDesignTopLevel()` |
| `0687880` | Restored 4 design projects (Duval / Camelia / LB-2 / LB-3) + their stage progressions |
| `6099a12` | FAB + screenshot reference doc for friday.mu port (`docs/feedback-fab.md`) |
| `9f2703b` | Feedback `source` column — FAD vs website discriminator |

Plus the SQL one-shots applied tonight (NOT migrations — applied
direct via psql):
- `scripts/restore-design-projects.sql` (the 4-project restore)
- `scripts/add-feedback-source.sql` (source column + index + CHECK)
- `scripts/add-data-drift-log.sql` (reconciler audit table)

## Pending tasks (in priority order)

1. **Listings scraper probe + iteration.** Run
   `node scrape-listings.mjs --probe` after fresh auth, confirm the
   datakey mapping for `/properties`, update the named field
   extractors in `scrape-listings.mjs` (and the matching block in
   `scrape-all.mjs`).
2. **Register Guesty webhook** (depends on OAuth quota recovery) +
   wire Svix secret into `.env`. Once done, the API path becomes
   primary for messages + reservations; the scraper drops to
   verification-only cadence (every 1-2h, not 15 min).
3. **Build the reconciler.** Single SQL job or backend cron, ~150
   lines. Spec is in this doc (above).
4. **Per-night pricing scraper.** Walk each listing's Calendar tab,
   extract 365-day price curve, post to a new
   `/api/integrations/guesty/scraped-pricing` endpoint (new table:
   `guesty_listing_prices_daily`). Every 6h, not 15 min.
5. **Effective view** for `guesty_reservations` + `guesty_listings`
   (option A above). Website needs this before pointing at the new
   data.
6. **R Phase 2b** — `CreateReservationDrawer` live `POST /api/reservations`
   route. Currently fixture-push (`RESERVATIONS.push(newRsv)` at
   line 141 of the drawer).
7. **Inbox UI source filter** — small chip on the feedback inbox view
   so admins can split website vs FAD bugs.

## Anti-goals (don't do these)

- **Don't touch `friday-gms`** consult.ts / draft-generator.ts / KB
  loading until Sprint 10 lands (post 2026-05-27). Owned by the GMS
  thread.
- **Don't run sustained browser automation against Guesty.** The
  scraper IS that automation, but it's gated to every 15 min. Don't
  add per-second polling loops.
- **Don't touch `main`.** Direct push to `fad-design-os-v01-frontend`.
- **Don't burn OAuth mints** trying things. We're at the 24h ceiling
  and Angelo has refused a bump.
- **Don't override an API-sourced row** in `guesty_reservations` from
  the scraper. Insert as `scrape:*` and let the reconciler decide.
- **Don't auto-delete `scrape:*` rows without** confirming the
  matching real-id row has the same confirmation_code AND was synced
  within the last hour. Scrape is fresher than a stale API row.

## Style (unchanged)

- Terse. Push back with reasoning when Ishant is wrong.
- Direct push to `fad-design-os-v01-frontend`. No PRs.
- Commits authored "Judith Friday" with
  `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.
- `git fetch origin` before any non-trivial action.

## Deploy flow (unchanged)

```bash
# Frontend
cd frontend && npm run deploy

# Backend
rsync -avz -e "ssh -i $HOME/.ssh/do_friday_admin" backend/src/ root@gms.friday.mu:/var/www/fad-backend/src/
rsync -avz -e "ssh -i $HOME/.ssh/do_friday_admin" backend/server.js root@gms.friday.mu:/var/www/fad-backend/
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu 'pm2 restart fad-backend'
```

## Architecture references (read on demand)

- `docs/feedback-fab.md` — full reference for the FAB + screenshot
  capture + chat + backend. Hand to the friday.mu website team
  unchanged.
- `scripts/guesty-scraper/README.md` — original scraper philosophy
  (Layer-3 = backstop). Outdated on selectors (rewritten 2026-05-17)
  but the architectural intent is correct.
- `memory/fad_gms_dependency_map.md` — backend topology.
- Repo `CLAUDE.md` + global `~/.claude/CLAUDE.md` — invariants.

Re-read on disk: `docs/handover/2026-05-17-night-NEXT-SESSION-PROMPT.md`
