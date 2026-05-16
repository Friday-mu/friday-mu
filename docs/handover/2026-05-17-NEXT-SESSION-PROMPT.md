# Launch prompt — next FAD session (2026-05-17)

> Copy the block below into a fresh Claude Code session as the
> first message. It's self-contained — assume cold start, no prior
> context.

---

## Copy-paste this

# ACP Brief: FAD next session — Inbox parity + Guesty unblock

You're picking up the **FAD / FridayOS Design** codebase after the
2026-05-16 marathon (13 commits, full Operations module backend,
tenant scrubs, Guesty integration scaffolding, deep rate-limit
investigation).

## Read these first (in order)

1. `docs/handover/2026-05-16-priority-zero-verification.md` —
   full running log of the prior session, every commit explained.
2. `docs/handover/2026-05-16-guesty-rate-limit-investigation.md` —
   the deep dive on Guesty 429s. Critical context for Priority 1.
3. Repo `CLAUDE.md` + global `~/.claude/CLAUDE.md`.
4. `memory/fad_gms_dependency_map.md` — how the FAD Inbox proxies
   to the OLD GMS today.

## Working directory

```
cd /Users/judith/repos/friday-admin-dashboard/.claude/worktrees/fad-design-os
git fetch origin && git status
git log --oneline -5    # should start with 031835e
```

Branch `fad-design-os-v01-frontend`. 51 migrations on prod. Backend
+ frontend both deployed at the HEAD commit.

## Priority 0 — Inbox parity with GMS + fold website-submodule in

> Ishant's exact words: **"website submodule should be folded into
> inbox somehow, and we need to fix the inbox and ensure all
> features there are working before we continue work on other
> modules. it should do everything the gms does, friday consult
> should work like ask friday worked for drafts etc, ai drafts must
> work etc."**

The Inbox today proxies to the OLD GMS at `admin.friday.mu` for
conversations + messages, while the website-form / payment-proof
flow runs as a sibling under `/api/inbox/website/*`. They should be
one surface.

Sub-tasks:

1. **Audit GMS Inbox features** — what the team uses today.
   - `~/repos/friday-gms/src/services/guesty.ts` for the
     conversation + post fetch logic.
   - GMS web frontend (look for the inbox page) for the UX:
     conversation list, thread view, draft generation, draft
     approval, send, schedule, label/tag, assign, snooze, archive.
   - Document the gap vs FAD's current `InboxModule`.
2. **AI drafts in FAD Inbox.** GMS has working draft generation.
   FAD doesn't (proxies for the list but no real draft pipeline).
   Either wire FAD to GMS's draft endpoint or lift the draft
   generation into fad-backend (probably the latter since GMS will
   be deprecated).
3. **Friday Consult = "Ask Friday for drafts."** Replicate
   whatever the GMS "Ask Friday" did for the inbox. Find the
   prompt + model wiring in friday-gms, port to fad-backend.
4. **Fold website-inbox into the main inbox.** Today
   `/api/inbox/website` is its own sub-router with
   `inbox_threads`, `inbox_events`, `inbox_guesty_jobs` tables.
   These were stood up for the friday.mu booking-form + payment-
   proof flow. They should appear as conversations inside the
   unified inbox, not a separate module. Path:
   - Backend: keep the HMAC-signed webhook receiver, but write
     incoming website-form events into the main conversations
     table (whichever table that is post-merge).
   - Frontend: drop the standalone "website" surface (if any
     entry in the sidebar) and let `InboxModule` render them with
     a "source: website" filter chip.

Budget 4-6 hours. **Do not start Priority 1 until this is
meaningfully done.**

## Priority 1 — Three Guesty unblock items (do in order)

Full context: `docs/handover/2026-05-16-guesty-rate-limit-investigation.md`.

### (a) Investigate friday-gms crash cause

3,197 restarts since 2026-05-14, ~25/day. Each cold start re-mints
an OAuth token. Stop the restart loop → token mints drop from
36/day to ~1/day → 429 cooldown clears within 24h.

```bash
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  'pm2 logs friday-gms --err --lines 200 --nostream'
```

Look for the recurring uncaught error. Likely an unhandled promise
rejection, OOM, or one of the `Cannot read properties of undefined`
draft-generation crashes. Estimated ~30 min.

### (b) Shared-token-file fix in fad-backend

Have fad-backend read friday-gms's
`/var/www/friday-gms/.guesty-token.json` instead of running its own
OAuth flow.

Code path: `backend/src/website_inbox/guesty.js`,
`getAccessToken()`. Replace internals with:
```js
const TOKEN_FILE = '/var/www/friday-gms/.guesty-token.json';
async function getAccessToken() {
  const raw = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
  if (raw.access_token && Date.now() < raw.expires_at - 60_000) {
    return raw.access_token;
  }
  // Fallback: if friday-gms hasn't refreshed, we shouldn't either
  // (we'd burn the quota). Throw + let the caller skip the cycle.
  throw new Error('Guesty token cache stale; waiting for friday-gms to refresh');
}
```

Drop the in-process token cache. Estimated ~30 min.

### (c) Draft email to Guesty support

Use the cheat-sheet from
`docs/handover/2026-05-16-guesty-rate-limit-investigation.md`
section "What to ask Guesty support".

Key asks:
- Current `ratelimit-remaining` + `ratelimit-reset` for our `clientId`
- **Provision a SECOND `clientId`** for fad-backend so the two
  services don't share a 5/day budget ← most important
- Lift the current 429 cooldown
- Marketplace partner path
- Whether webhook subscriptions count against any quota

Draft the email, then hand to Ishant. He has the Guesty CSM contact.

## Priority 2 — Pickup-the-pieces (after P0 + P1)

In order:

1. **Frontend re-wire for Reservations + Properties modules** —
   they still render from fixtures. Once Guesty data flows, swap
   to `/api/reservations` + `/api/properties` calls. Use the
   adapter pattern from `tasksClient.ts`. The
   `useApiTasks` + `useTenantUsers` hooks demonstrate it.
2. **TASK_USER_BY_ID sweep (17 remaining files)** —
   CalendarModule, InboxModule (will be touched in P0 anyway),
   NotificationsModule, FinanceModule, ScheduleCallDrawer,
   ReservationDetail, TeamInbox, PropertyTasksTab, hr/* drawers,
   StaffPerformancePage, FridayDrawer. Each gets the
   `useTenantUsers` swap. The hook is already in place
   (`_data/useTenantUsers.ts`).
3. **Full RosterPage backend** — mig 052
   (`roster_weeks` + `roster_days`), backend `roster/` module,
   `useRosterWeek` hook, 928-line RosterPage rewire. 4-6 hours.
   HR-adjacent.
4. **Signup default `annex_a.currency_code` per `tenant.country`**
   — US→USD, EU→EUR, MU→MUR. Backend signup tweak; currently
   every tenant defaults to MUR.
5. **Webhook migration** — replace friday-gms's 120 polls/day with
   Guesty webhooks. Slashes API consumption.

## State at handover

- **HEAD:** `031835e fix(modules): register Properties in the module catalog…`
- **Migrations applied:** 51/51 (mig 049 guesty_sync, 050 tasks v1,
  051 tasks full)
- **Backend on prod:** online, mounts /api/properties,
  /api/reservations, /api/tasks, /api/integrations/guesty/webhook
- **Guesty status:** 429 cooldown ongoing. `guesty_listings` and
  `guesty_reservations` tables empty. Will fill after Priority 1.
- **Properties module:** back in FR's sidebar
  (`031835e` registered the module + FR tenant_modules row)
- **friday-gms:** 3,197 restarts, ~25/day. **The crash loop is
  driving the Guesty 429.**
- **RESEND_API_KEY:** still unset on prod. Emails stub gracefully.

## Open coordination items

- Guesty CSM contact — Ishant has it; needed for Priority 1 (c).
- Mathias's morning click-through of yesterday's work hasn't
  happened yet (he was offline). May surface additional bugs to
  triage before Priority 0.
- Stripe scaffolding still inert — needs Ishant's Stripe account
  before going live.

## Anti-goals

- Don't start any Priority 2 work before P0 (Inbox parity) is
  meaningfully complete.
- Don't deploy migrations out of order.
- Don't touch `main` branch.
- Don't refactor things the user didn't ask about.
- **Don't burn fad-backend through fresh OAuth tokens** — until
  Priority 1 (b) ships, every fad-backend restart in dev attempts
  to mint a token. Minimise restarts; if you must rebuild, hold
  the restart until your changes settle.

## Style + conventions

- Terse. Infer context. Don't over-explain.
- Push back with reasoning when you think Ishant is wrong.
- Visual thinker — diagrams + tables for architecture.
- Direct push to `fad-design-os-v01-frontend`. No PRs.
- Commits authored "Judith Friday".
- Always `git fetch origin` before assessing repo state.
- Cleanup smoke tenants as you go
  (`DELETE FROM tenants WHERE slug LIKE '<prefix>%'`).
- Verify before declaring done.

## Deploy flow

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

Migrations:
```bash
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  "set -a && . /var/www/fad-backend/.env && set +a && \
   psql \"\$DATABASE_URL\" -f -" \
  < backend/migrations/NNN.sql
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  "set -a && . /var/www/fad-backend/.env && set +a && \
   psql \"\$DATABASE_URL\" -c \"INSERT INTO fad_schema_migrations
   (filename) VALUES ('NNN.sql') ON CONFLICT (filename) DO NOTHING;\""
```

Also lives at this path so the next session can re-read on disk:
`docs/handover/2026-05-17-NEXT-SESSION-PROMPT.md`
