# FAD session handover — 2026-05-14

> Read this first. Then `~/.claude/projects/-Users-judith-repos-friday-admin-dashboard/memory/MEMORY.md`
> (and the files it links). Then `CLAUDE.md` at repo root.

## TL;DR for the next session

You're picking up the **FAD Design OS sprint** on the
`fad-design-os-v01-frontend` branch. Pushed to GitHub (org renamed
to `Friday-mu/friday-mu` — the redirect from
`judith-friday/friday-admin-dashboard` still works). Latest commit:
`d6a2e86 feat(website-inbox): friday.mu webhook receiver + Guesty
auto-reservation`.

**Production is live at https://gms.friday.mu/fad.** The team is
actively using it. There's an `UpdateBanner` mechanism (see below)
that prompts users to hard-refresh after every deploy — so your
deploys reach the team within ~60 seconds of focus.

## Conventions (non-negotiable)

1. **Deploy paths** — `/var/www/fad/` is FAD (gms.friday.mu).
   `/var/www/friday-dashboard/` is the **legacy GMS** at
   admin.friday.mu. Mixing them up wipes the team's inbox. Use
   `npm run deploy` from `frontend/` — it runs `build:prod`
   (overrides `.env.local` dev URLs) + rsyncs to the correct path.
   Full path map in `memory/fad_deploy_paths.md`.

2. **Git discipline** — push working branch after meaningful
   commits. Never touch `main`, `fad-rebuild`, `demo-removed-preview`,
   etc. without explicit say-so. Never `--force` without permission.
   See `memory/git_push_discipline.md`.

3. **FAD ↔ GMS coupling** — FAD is NOT standalone. Login proxies
   to `admin.friday.mu/api/auth/*`, JWTs are GMS-issued, Postgres
   DB is shared. The design module is FAD-owned end-to-end but
   inbox / reviews / analytics tabs proxy to GMS. See
   `memory/fad_gms_dependency_map.md` for the full failure-mode
   matrix.

4. **JWT_SECRET sync** — shared between FAD and GMS via env. If
   either side rotates without the other, every user session 401s.

## What's shipped recently (commits in reverse chrono)

```
d6a2e86  website-inbox webhook + Guesty auto-reservation (full feature, see below)
8914d06  Moodboard auto-fire 3 Gemini gens + inbox turn-count chip
0726d12  Close 5 of Mathias's bugs (line items in budget inspect, render image tags, etc.)
1e6291f  UpdateBanner — detect new deploys, prompt force-refresh
90e6635  Correct CLAUDE.md to point at /var/www/fad/ (was /var/www/friday-dashboard/)
3c7c93e  Smart field hints (Must Keep/Remove) + floor-plan editor W1 (data shape)
c90031e  Bug-report FAB on /design-docs/* print previews
a2daa20  Scoping doc: conversational floor-plan editor
e12ca5c  FAB above the 9999-tier modals (floor plan generator)
f2892a5  FAB z-index above all standard modals
a95c34f  Close 6 of Mathias's bugs (P0 site-visit data loss, etc.)
9d91aba  Chat-based bug-report capture with Friday (Kimi multi-turn)
6ed6ad7  Swap screenshot lib to html-to-image (more reliable than html2canvas)
0b222e7  Optional Kimi follow-up questions on bug reports
015d40f  Make rephrase mandatory + persist structured spec (REVERTED in 0b222e7)
28c0827  Per-section accordion + harden screenshot capture
77aaa85  Modal scrolls + bullet-proof button types
e1b0835  Remove rooms added by mistake (Site Visit stage)
ad85969  Visible chevron + keyboard a11y on accordion rows
58dd734  First-click screenshot dark fix (backgroundColor)
d2eab9c  npm run build:prod + deploy scripts (lock down env handling)
bbc7588  Capture screenshot BEFORE modal opens
9752a6e  /design-docs/[doc]?pid=<id> route — live data instead of fixture
```

## Major in-flight initiatives

### 1. Conversational Floor-Plan Editor — SPRINT APPROVED, W1 done

Mathias's feedback (`5e24ad51-...`) flagged the single-shot Nanobanana
floor-plan generation as a dead-end for his workflow. He wants a
chat-based editor where he can iteratively refine via "move the sofa
left", "change wall to navy", save when satisfied.

**Decisions locked** (`docs/scoping/conversational-floor-plan-editor.md`):
- Greenlight 4–6 week sprint, W1–W6
- No placebo (Option A Gemini edit-mode)
- Manual trace for vectorisation (CV parked as v2)
- Hardcoded ~50-shape furniture catalog
- **Photorealistic (Option C)** — vector layout + Gemini texture pass
- Replace `FloorPlanGenerator` entirely

**Done (W1):**
- Migration 032 — `design_floor_plans` (versioned, partial-unique
  enforcing ≤1 final per project) + `design_floor_plan_chats`
- `frontend/src/app/fad/_data/floorPlanTypes.ts` — canonical
  `FloorPlanModel` (walls, doors, windows, furniture, rooms,
  surfaces, all in metres, schema-versioned) + `FloorPlanOperation`
  discriminated union (add/move/remove/rotate furniture, recolor/
  retexture surfaces, add/remove walls, set style notes)

**Next (W2):**
- Tracing editor route at `/fad?m=design&sub=floor-plan-editor`
  (or wherever fits the design module's existing nav)
- Backend CRUD for `/api/design/floor-plans` and `/api/design/floor-plans/:id/chats`
- SVG-based wall/door/window drawing tool over the uploaded raster

**Anti-goals (already in the scoping doc):**
- No CV-based auto-vectorisation in v1
- No 3D rendering
- No editing the raster output directly (edits flow through ops → renderer → raster)
- No placebo single-shot generator alongside the new chat

### 2. friday.mu → FAD website inbox (just shipped)

Live in production, smoke-tested end-to-end. Coordinate with the
friday.mu Claude session (prompt at
`docs/website-inbox/prompt-for-friday-mu-session.md`).

**Backend:**
- 3 tables: `inbox_threads`, `inbox_events`, `inbox_guesty_jobs` (DLQ)
- HMAC-SHA256 webhook at `POST /api/inbox/website/friday-website`
- Idempotent on `(reference, event_type)` — retries are safe
- Auto-creates 48h-expiring Guesty `reserved` reservation on
  `booking.proof_uploaded`
- DLQ worker, 15s poll, exponential backoff, 6 attempts before `dead`
- Mark-paid endpoint flips Guesty to confirmed + queues Resend email

**Frontend:** new "Website" module at `/fad?m=website-inbox` with
list + detail (events timeline, DLQ panel, ops notes editor, status select, Mark paid button).

**Pending coordination with Ishant:**
- Same `FRIDAY_WEBSITE_INBOX_SECRET` value on both sides (already
  set on FAD VPS, value is in `/var/www/fad-backend/.env`)
- Populate `backend/src/website_inbox/property-map.json` with
  `residence_slug → guesty_listing_id` pairs before first real
  `booking.proof_uploaded`

**Status:** waiting on friday.mu side to wire emitters.

### 3. Bug-report chat flow + Update banner

The team's bug-report FAB now opens a chat-based modal. Kimi acts as
the triage assistant (1–2 questions per turn, max ~3 turns). Submit
unlocks after at least one full exchange. Full transcript persisted
in `feedback.description` as markdown (`**You:** ... / **Friday:** ...`).
Inbox shows a turn-count chip (`💬 6`) per row.

Bug-report screenshots use **`html-to-image`** (primary) with
**`html2canvas`** as a fallback. The screenshot is captured BEFORE
the modal opens, with explicit `backgroundColor` (so JPEG doesn't fill
transparent pixels black) and font/image/`rAF` waits for paint
stability. Both libs pre-warmed via `requestIdleCallback` on FAB mount
to eliminate "first-click dark" failures.

UpdateBanner mounts at the top of `.fad-app` (z-index 12000) and on
`/design-docs/*` layout. Polls `/version.json` (written by
`prebuild:prod` from `git rev-parse --short HEAD`) on focus + tab
visibility change (throttled to 1 check / 60s). On click: unregisters
service workers, clears `caches.*`, hard-reloads. Solves the
stale-cache class of bugs.

## What's parked (and why)

Saved in `docs/scoping/`:

### `uploads-and-ai-context.md` — PARKED 2026-05-14

PDF/DOCX → markdown conversion pipeline for AI consumption, plus
widening upload allowlist + per-family size caps. Status: PARKED.

**Revisit triggers** (any of these):
1. AI features start needing structured doc context (Ask Friday,
   Annex B edit, rough-budget AI degrade because we're tokenizing
   whole PDFs)
2. Volume threshold: ≥50 active projects with ≥10 attached docs each
3. Direct user demand for "search inside my uploads"

Decision items #1 (draft-only delete on selections/change-orders/
vendors/site-visits) and #2 (widen allowlist + per-family size caps)
are NOT parked — those are quick wins that can ship any time.

### `conversational-floor-plan-editor.md` — ACTIVE, W1 done

See Major Initiative #1 above.

### `field-hint-pattern.md` — ROLLING

Reusable `<Hint body examples>` component for clarifying input
fields. Applied to Must-Keep/Must-Remove (Mathias's feedback
`bdab7c35` — duplicate field across Preferences page + per-room
Site Visit). 11 high-value fields queued for the same treatment:
- Preferences → Functional priorities, Target guest profile,
  Revision expectations, Scent/acoustic/allergens
- Site Visit → Design opportunity, Access/logistics, Electrical/plumbing
- Rough Budget → Assumptions, Exclusions, Risk items, Next steps
- Plus medium-value fields in Project intake / Annex B

**Anti-pattern called out in the doc:** don't call Kimi to generate
hints per render. Hints are hand-written and static.

## Open feedback rows (as of session end)

Run this to get the current open list:

```bash
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  "set -a && . /var/www/fad-backend/.env && set +a && psql \"\$DATABASE_URL\" -c \
  \"SELECT id, type, status, user_display_name, LEFT(title, 80), created_at \
    FROM feedback WHERE status IN ('new','triaged','in_progress') ORDER BY created_at DESC;\""
```

At session end:
- `5e24ad51` (Mathias, triaged) — Conversational floor-plan editor.
  Scope in `docs/scoping/conversational-floor-plan-editor.md`, sprint
  approved.
- `bdab7c35` (Mathias, triaged) — Must Keep/Remove duplicate fields.
  Triaged with the answer (project-level vs room-level intent).
  Hint added to both surfaces in commit `3c7c93e`.

Plus: the inbox shows a turn-count chip per row (commit `8914d06`)
so you can spot rich-context bugs at a glance.

## Open bugs not yet in feedback

Two I caught from prod logs but didn't fix in this session:

1. **`[design/rooms] patch error: numeric field overflow`** — FIXED
   in this session. Frontend now clamps per-field sanity caps
   (length/width ≤ 200m, height ≤ 20m, windows/doors ≤ 99) with
   inline `FieldHint` errors. Backend now catches PG `22003` and
   returns 400 instead of 500.

2. **(none other observed at session end)**

## Important environment / setup

### Backend env vars added this session

- `FRIDAY_WEBSITE_INBOX_SECRET` — set on prod
  (`/var/www/fad-backend/.env`). Same value must land in
  friday.mu's prod env. Generated 2026-05-14 with `openssl rand
  -hex 32`.
- `RESEND_API_KEY` — NOT yet set on prod. The mark-paid Resend email
  no-ops + logs at warn level when this is unset, so the Guesty
  confirm flow still works without it. Set when ready.
- `RESEND_FROM_EMAIL` — defaults to `Friday Retreats <hello@friday.mu>`.

### Database migrations through 033

Migration registry on prod is in the `migrations` table. Latest
applied:
- `031_room_details.sql` — added length_m/width_m/height_m (NUMERIC(8,2))
  + windows/doors + 7 TEXT fields to design_rooms
- `032_floor_plans.sql` — design_floor_plans + design_floor_plan_chats
- `033_website_inbox.sql` — inbox_threads / inbox_events /
  inbox_guesty_jobs

To run a new migration on prod:

```bash
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  "set -a && . /var/www/fad-backend/.env && set +a && \
   psql \"\$DATABASE_URL\" -f -" < backend/migrations/NNN_name.sql
```

## Common operations cheat sheet

### Deploy frontend

```bash
cd frontend && npm run deploy   # build:prod + rsync to /var/www/fad/
```

### Deploy backend (specific files)

```bash
rsync -avz -e "ssh -i $HOME/.ssh/do_friday_admin" \
  backend/src/some-file.js \
  root@gms.friday.mu:/var/www/fad-backend/src/some-file.js
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu 'pm2 restart fad-backend'
```

### Check pm2 status

```bash
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu 'pm2 list'
```

### Tail fad-backend logs

```bash
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  'pm2 logs fad-backend --lines 100 --nostream'
```

### Query feedback inbox

```bash
ssh -i ~/.ssh/do_friday_admin root@gms.friday.mu \
  "set -a && . /var/www/fad-backend/.env && set +a && \
   psql \"\$DATABASE_URL\" -c 'SELECT status, count(*) FROM feedback GROUP BY status;'"
```

## Gotchas

1. **`.env.local` baked into prod build.** Lost ~10 min on this
   2026-05-14. `frontend/.env.local` has dev URLs
   (`NEXT_PUBLIC_API_URL=http://localhost:3001`) that bake into the
   static export if you run a plain `npm run build`. Use
   `npm run deploy` (or `npm run build:prod`) which overrides them.
   See `memory/fad_deploy_paths.md`.

2. **Service worker stale cache.** Service worker pre-caches
   `_next/static/chunks/*`. If a deploy goes out and the SW serves
   old chunks, users see broken state. UpdateBanner solves this
   ON next focus; SW version is bumped (`friday-admin-v6` currently)
   so activate hook deletes the old cache.

3. **The 9999-tier modals.** `FloorPlanGenerator`,
   `FurnishedFloorPlanGenerator`, `MoodboardImageGenerator` set
   `zIndex: 9999` inline. The bug-report FAB sits at 10000 to clear
   them; toaster at 11000 to sit above the FAB; bug-report modal
   overlay at 10000.

4. **GMS frontend lives at `/var/www/friday-dashboard/`.** Do NOT
   touch it. To rebuild the GMS frontend (separate codebase):
   `/var/www/friday-dashboard-repo/deploy-frontend.sh` — that
   handles its own build + copy.

5. **The pg `version_id` strip.** `shapeRoughBudget` originally
   stripped `version_id` from the API response, causing the
   VersionInspectModal to be unable to filter line items per
   version. Fixed 2026-05-14 in commit `0726d12`. Watch out for
   adapter functions silently dropping fields the frontend needs.

6. **GMS host key rotated 2026-05-14.** New ed25519 fingerprint:
   `SHA256:6JRqY+HXZRbIhCEqQeRfZRxTo9oxRh591K3VjJ5kHus`. Updated
   in `~/.ssh/known_hosts` already; if you see a host-key warning,
   double-check before blindly accepting.

## Things to clean up when convenient

- Memory: clarify in `memory/fad_deploy_paths.md` that the host
  key was rotated — already done.
- The legacy `/var/www/friday-dashboard-WRONG-FAD-OVERWRITE-20260514`
  directory is forensic evidence from the 05:46 incident. Delete it
  after a week if nothing else points there.
- A snapshot of the Apr 10 GMS frontend lives at
  `/var/www/friday-dashboard-apr10-snapshot` as a 30-second rollback
  net. Keep it for now.

## Where the truth lives

- **System Atlas** (Notion `34c43ca8849281b9a10de9f264141c37`) —
  infrastructure topology, agent topology, ADRs.
- **Code Index** (Notion `35143ca88492810d9a73d46b0101c436`) —
  routing index for module-specific deep-dive pages.
- **Memory** — `~/.claude/projects/-Users-judith-repos-friday-admin-dashboard/memory/`
- **Repo CLAUDE.md** — `friday-admin-dashboard/CLAUDE.md`.
- **Scoping docs** — `docs/scoping/*.md`
- **Handover docs** — `docs/handover/*.md`

## How Ishant works

- Terse. Push back with reasoning when you think he's wrong.
- No filler openings.
- Visual thinker — diagrams and tables for architecture decisions.
- Direct push to master. No PRs. Direct push on this branch is
  fine.
- Web-search before product-specific advice.
- Surface tradeoffs explicitly. Don't silently pick the easy path.
