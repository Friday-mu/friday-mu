# Launch prompt — next FAD session

> Copy the block below into a fresh Claude Code session as the first
> message. It's self-contained — assume cold start, no prior context.

---

## Copy-paste this

# ACP Brief: FAD next session

You're picking up the **FAD / FridayOS Design** codebase after a
monster 14+ hour session on 2026-05-16. Everything below the line is
your context.

## Read these first (in this order)

1. `docs/handover/2026-05-16-MEGA-HANDOVER.md` — the canonical handover. Read it end-to-end before doing anything.
2. `memory/fridayos_design_saas.md` (`~/.claude/projects/-Users-judith-repos-friday-admin-dashboard/memory/fridayos_design_saas.md`)
3. Repo `CLAUDE.md` at root + the global `CLAUDE.md` at `~/.claude/CLAUDE.md`

## Working directory

```
cd /Users/judith/repos/friday-admin-dashboard/.claude/worktrees/fad-design-os
git fetch origin && git status   # confirm branch fad-design-os-v01-frontend, clean
```

Last commit should be `3e7b51d` or newer. If the working tree has
uncommitted changes from yesterday's in-flight subagents (D5 Stripe,
possibly others), inspect first via `git status` and `git diff`.
Don't assume anything — read.

## State at handover

- **Multi-tenant SaaS is live on prod** at `gms.friday.mu/signup` since 2026-05-16
- **NOTHING from 2026-05-16's work has been clicked through in a browser** — that's the gating thing before more is built
- 14 new migrations (034–047, possibly 048) staged in repo; some applied to prod, some NOT — check `fad_schema_migrations` table to confirm
- Backend deployed up to commit `e282a89`; newer commits **NOT YET deployed**
- Frontend version on prod is `e282a89`; newer commits **NOT YET deployed**

## Today's priorities (in order, per Ishant)

### Priority 0 — verify yesterday's work

**Before building anything new**, walk through these prod surfaces and
confirm they don't crash. If they do, fix before moving on:

- [ ] Sign up a test tenant at `https://gms.friday.mu/signup` → land on onboarding wizard → complete or skip → reach Design module
- [ ] Sidebar should show only Design / Billing / Settings for the test tenant
- [ ] Open Billing → see invoices (probably empty)
- [ ] Open Settings → General / Brand / Vendor defaults / Payment instructions / Users tabs all render
- [ ] Open Floor Plan stage in any project → click Open studio → tracing editor mounts → upload an image
- [ ] Trace some walls → save → land in chat panel
- [ ] Send a chat message → see Gemini response + ops applied
- [ ] As FR admin, open Admin Analytics → numbers render

Cleanup smoke tenants when done.

### Priority 1 — deploy what's staged

Migrations 038–047 (and 048 if Stripe landed) are in the repo but
**not yet applied to prod**. New backend code references columns/tables
that don't yet exist. Deploy sequence in
`docs/handover/2026-05-16-MEGA-HANDOVER.md` § "Deploy sequence."

After deploy, run the smoke tests in that doc.

### Priority 2 — wire Guesty integration

Two related modules need to be wired to Guesty (per Ishant's stated
plan for this session):

**A. Reservations module backend → Guesty Reservations API**
- Frontend: `frontend/src/app/fad/_components/modules/ReservationsModule.tsx`
- Backend: build out under `backend/src/reservations/` (may or may not exist)
- Hit Guesty's `/reservations` endpoint. Auth via `GUESTY_API_KEY` (check `.env` on prod — probably set since the existing GMS uses it).
- Sync into a local `reservations` table (may exist already from GMS; reuse). Tenant-scope it.
- Polling cadence: every 5 minutes for upcoming + recent.
- On webhook: hook into Guesty's reservation webhook if available; otherwise polling only.

**B. Properties module backend → Guesty Listings API**
- Same pattern. Sync listings into `design_properties` or a sibling `properties` table.
- The 26 listings already mapped in `backend/src/website_inbox/property-map.json` are the FR catalog.
- Keep `guesty_listing_id` as the linkage column (already on `design_properties`).

Both probably ~4-6 hours each with subagent parallelism. Read the
existing `friday.mu/.../guesty.js` patterns + GMS-side `backend/src/`
to learn the Guesty API conventions before writing new code.

### Priority 3 — wire tasks module backend

Make tasks a real, usable feature for the team. Today the design
module has `design_tasks` (mig 007) but the operations-level tasks
module in the FAD shell may be unimplemented.

- Find the Operations / Tasks module frontend: `frontend/src/app/fad/_components/modules/OperationsModule.tsx` (and any tasks sub-page)
- Schema: extend or use `design_tasks` if it covers the use case; otherwise create a `tasks` table with: id, tenant_id, project_id (nullable), title, description, status (todo/in_progress/done/cancelled), assignee_user_id, due_date, priority, category, created_at, updated_at
- CRUD + assignment + status transitions
- Frontend: list view with filter by status / assignee / project; create / edit modal
- Notifications when assigned (use the existing Resend integration)

### Priority 4 — deferred from yesterday

Pick from the "What still needs to be built" list in the mega-handover:
- Stripe live integration (needs Ishant's Stripe account)
- Real landing page copy (needs marketing input from Ishant/Mathias)
- Tenant-scope non-design modules (1 week per module)
- Auto-invoice generation cron
- Per-tenant logo upload

## Ishant's style (assume)

- Terse. Don't over-explain.
- Visual thinker — use diagrams + tables for architecture.
- Push back with reasoning when you think he's wrong.
- Direct push to `fad-design-os-v01-frontend`. No PRs.
- Commits authored "Judith Friday".
- Verify before declaring done. Don't claim a feature works without
  testing it.
- One task per session ideally — but he's been driving multi-task
  pushes hard lately. Surface tradeoffs, then follow his lead.

## Deploy flow

```bash
# Backend
rsync -avz -e "ssh -i $HOME/.ssh/do_friday_admin" \
  backend/src/ root@gms.friday.mu:/var/www/fad-backend/src/
rsync -avz -e "ssh -i $HOME/.ssh/do_friday_admin" \
  backend/server.js backend/package.json backend/package-lock.json \
  root@gms.friday.mu:/var/www/fad-backend/
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu 'pm2 restart fad-backend'

# Frontend
cd frontend && npm run deploy
```

## Migrations on prod

```bash
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  "set -a && . /var/www/fad-backend/.env && set +a && \
   psql \"\$DATABASE_URL\" -f -" \
  < backend/migrations/NNN.sql

# Then register so the in-app migrator knows:
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  "set -a && . /var/www/fad-backend/.env && set +a && \
   psql \"\$DATABASE_URL\" -c \"INSERT INTO fad_schema_migrations (filename) VALUES ('NNN.sql') ON CONFLICT (filename) DO NOTHING;\""
```

## How to spot if yesterday's work is broken

After deploying yesterday's pending commits + migrations:

```bash
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu 'pm2 logs fad-backend --lines 50 --nostream'
```

Look for ERR lines. The new tables / columns are additive so a clean
boot means most things are in place. The actual feature regressions
will show up when Ishant or Mathias clicks through.

## Files you should NOT touch unless explicitly asked

- `friday-admin-dashboard/main` branch
- Anything under `/var/www/friday-dashboard/` on prod (legacy GMS)
- The shared `JWT_SECRET` — must match GMS

## Open coordination items

- friday.mu Guesty DLQ job `7fa99bac` from 2026-05-14 still in `dead` state. Manual cleanup or retry.
- `RESEND_API_KEY` not set on prod. Email templates stub out gracefully but no emails actually send.
- Stripe scaffolding is plumbing-only. Live integration needs Ishant's Stripe account.

## Anti-goals for this session

- Don't start new features before Priority 0 (verification) is done.
- Don't deploy migrations out of order.
- Don't touch `main` branch.
- Don't refactor things the user didn't ask about.
- Don't add tests unless explicitly asked.

## Final note

Yesterday's session optimised for breadth (~35 commits, 14 migrations,
6 new modules). Verification is now table stakes. If you find
something broken, fix it before piling on.

---

That's the full brief. When you've read the mega-handover + the
memory files, you have the full picture.
