# FAD Smart-Compact Anchor — 2026-05-24 (late evening)

> Written before context exhaustion to preserve in-flight state. Read this first after compaction, then [`docs/FAD_BACKLOG.md`](../FAD_BACKLOG.md) for the persistent backlog.

## Where we are right now

- **Branch:** `fad-rebuild` (clean, all pushed)
- **Tree tip:** `587687ce` (chore: PROD-DATA-41 dead code removal)
- **Live frontend:** `587687ce` (deployed 2026-05-23T23:48Z)
- **Live backend:** `87b608c8` (pm2 restart count 256, deployed 2026-05-23T23:24Z)
- **PM2:** `fad-backend` online, port 3002
- **VPS disk:** ~87% (3.2G free at deploy time)
- **SSH:** `~/.ssh/do_friday_admin`

`curl https://admin.friday.mu/version.json` → `587687ce`. `curl https://admin.friday.mu/api/version` → `87b608c8`. Both expected (backend hasn't changed since T4.35).

## What I shipped this session (newest first)

```
587687ce  chore(fad): remove dead INQUIRIES + Inquiry exports (PROD-DATA-41)
f1920ee3  docs(security): T3.2 multi-tenant safety sweep — audit report + T3.7
07e23e0e  feat(fad): T4.34 — optimistic UI for W1 create + cancel paths
b94b47e1  docs(backlog): T4.35 shipped + T4.36/37 scope drafts logged
b58a7fb9  docs(scoping): cross-link T4.36 + T4.37 to Notion canonicals
87b608c8  fix(ai): T4.35 — report real provider+model in usage telemetry
e23ba92c  docs(scoping): T4.36 guest portal chat + T4.37 field-staff map v0.1
120e6e74  fix(db): prefix W1 overlay tables fad_* to avoid legacy collision
a5038a83  feat(properties+reservations): W1 backbone — FAD-native overlay
```

**Net effect tonight:**
- Properties + Reservations W1 backbone shipped (9 new `fad_*` tables, full backend routes, frontend wired with optimistic UI)
- T4.36 + T4.37 scope drafts (guest portal chat + field-staff map) on Notion + repo
- T4.35 AI telemetry mislabel fixed (cost reports now reflect Gemini-primary)
- T3.2 multi-tenant audit complete (partial — surfaced T3.7 website_inbox blocker)
- Dead PROD-DATA-41 removed

## Key live state highlights

- Frontend optimistic UI deployed — drawer closes immediately on Create/Cancel, background reconcile
- 60 Guesty listings + 257 reservations sync continues via existing poller
- `fad_properties` + `fad_reservations` overlay tables: empty (auto-create-on-demand as designed)
- AI usage logs now correctly attribute Gemini vs Kimi (was reporting 100% Kimi for design/translate)
- Migration runner picked up 077+078 cleanly at boot

## Open items waiting on Ishant (won't grind on solo)

1. **Hand-test W1 + tonight's deploys** (Properties create/cancel, Reservation create/cancel, optimistic UX feel, no regressions on existing surfaces).
2. **T4.36 guest portal chat scope decisions** — 15 open questions in [Notion](https://www.notion.so/36943ca8849281939417fad24d881f94). Defaults documented; need lock-in.
3. **T4.37 field-staff map scope decisions** — 12 open questions in [Notion](https://www.notion.so/36943ca884928170897edda4660ee133). Part A buildable once locked.
4. **Mathias schema review** of `fad_*` overlay tables (good practice; not blocking).
5. **T3.5 GEMINI_API_KEY rotation** — walk-through only, don't paste in chat.
6. **T3.6 booking-triggered Ops automation** — needs scope.
7. **Calendar bugs prod-data screenshot.**
8. **Bug #5 Mary inbox fluctuation** — needs screen recording.
9. **VPS disk cleanup** — prune `/var/backups/fad-{frontend,backend}-pre-*` older than 5 snapshots.

## Queued for next solo session (from backlog)

- **T3.7 — website_inbox tenant_id migration** (NEW today, M-L, surfaced by T3.2 audit) — blocker for non-FR rollout. Migration adds tenant_id to inbox_threads/events/jobs + backfills FR + updates ~30 SQL sites + adds attachIdentity middleware to GET/PATCH /threads. Requires careful regression of website handoff flow.
- **T4.2** Slice 5 FAD reads Core as policy source (M-L)
- **T4.3** Slice 7 model-backed eval grading (M)
- **T4.4** Slice 8 public MCP V1 design (XL — design first)
- **T4.5** Slice 9 retention/redaction worker (M-L)
- **T4.12-21** Ops per-screen real-data audit (sub-pages, ~S each)
- **W2 of Properties/Reservations** — onboarding artifact UI, photo gallery curation, owner-report PDF, Insights AI, Saved Replies import. Each is multi-day; sequence after Mathias review.
- Deeper multi-tenant audit (ask_friday_*, design_*, hr_*, push_subscriptions, learning_events, kb_candidates, context_packs).

## Strategic constraints (locked, do NOT re-litigate post-compact)

- **`fad-rebuild` canonical.** Never use `fad-design-os-v01-*` branches.
- **No deploy without explicit Ishant ack** — autonomous mode acks DO NOT carry into the next session by default. Tonight Ishant explicitly granted "attack them one by one, don't wait for testing".
- **Git author** must be `Judith Friday <judith@friday.mu>` (PreToolUse hook enforces).
- **AI hierarchy** — Gemini 3.5 Flash primary / Kimi 2.6 fallback / Sonnet 4.6 third. Image gen ONLY in 2 design surfaces on `gemini-3-pro-image-preview`. **Telemetry fix tonight (T4.35) corrected the labels; routing was already right.**
- **Don't edit FAD and Friday Website in the same checkout/session.** Portal-chat T4.36 work specifically needs a separate Friday Website session for the guest-facing UI.
- **Director is the V1 reviewer** for Ask Friday Core (KB candidates + context packs).
- **Protected migrations:** `050_tasks.sql` through `054_*.sql`, `071_tasks_ops_lifecycle_reconcile.sql` — coordinate before touching.
- **New `fad_*` table naming convention** for W1 overlay — keep it. Legacy `properties` + `reservations` tables exist with pre-rebuild schemas; don't disturb.

## In-flight context (only-in-my-head stuff)

- **`fad_*` overlay rows = 0 today.** That's expected. They auto-create on first hit of the per-id child routes (cards, owners, photos, etc.). LIST endpoints LEFT-JOIN gracefully.
- **Optimistic UI rollback paths** — if backend rejects a Create, the optimistic row pops from PROPERTIES/RESERVATIONS + draft is restored. Visual indicator is a toast (no spinner / loading state in drawer anymore — drawer just closes).
- **Hydrate pattern for properties** — after createProperty success, `hydratePropertiesFromGuesty()` wipes + repopulates the whole PROPERTIES array. That's how the optimistic gets replaced with the canonical row.
- **Hydrate pattern for reservations** — `useLiveReservations()` is the hook; its refetch fires on next render. The optimistic row carries user-typed fields (propertyCode, guestName) the backend doesn't model yet; refetch will merge canonical overlay state on top.
- **website_inbox tables (T3.7)** — `inbox_threads`, `inbox_events`, `inbox_guesty_jobs` (and possibly `inbox_drafts`) lack tenant_id column entirely. Not a "code bug" — a "schema needs migrating" situation. Required for non-FR rollout.
- **T4.35 fix exposes Gemini in cost reports starting NOW.** Existing rows in `ai_usage` are still mislabeled; only new ones are correct. Future cost analysis should filter by `created_at >= '2026-05-23T23:24'` for accuracy.

## Quick reference — env vars added/changed this session

None.

## Canonical deploy sequence (paste-ready)

```bash
cd frontend && npm run build
SHA=$(git rev-parse HEAD); SHORT=$(git rev-parse --short HEAD); NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
printf '{"version":"%s","branch":"fad-rebuild","commit":"%s","deployedAt":"%s"}\n' \
  "$SHORT" "$SHA" "$NOW" > frontend/out/version.json

# Optional snapshot (skip on small diffs to save VPS disk)
STAMP=$(date -u +"%Y%m%d-%H%M%S")
ssh -i ~/.ssh/do_friday_admin root@admin.friday.mu \
  "cp -a /var/www/fad /var/backups/fad-frontend-pre-${SHORT}-${STAMP} && \
   cp -a /var/www/fad-backend /var/backups/fad-backend-pre-${SHORT}-${STAMP}"

# Frontend
rsync -az --delete -e "ssh -i ~/.ssh/do_friday_admin" \
  frontend/out/ root@admin.friday.mu:/var/www/fad/

# Backend (if changed)
rsync -az --delete \
  --exclude '.env' --exclude '.env.*' --exclude 'node_modules' \
  --exclude '.git' --exclude 'logs/' --exclude 'uploads/' \
  -e "ssh -i ~/.ssh/do_friday_admin" \
  backend/ root@admin.friday.mu:/var/www/fad-backend/
ssh -i ~/.ssh/do_friday_admin root@admin.friday.mu \
  "cd /var/www/fad-backend && \
   npm install --omit=dev --no-audit --no-fund && \
   node --check src/<changed-files>.js && \
   GIT_COMMIT=${SHA} APP_VERSION=${SHORT} BUILD_TIME=${NOW} \
   pm2 restart fad-backend --update-env"

# Migrations (if any)
ssh -i ~/.ssh/do_friday_admin root@admin.friday.mu \
  "cd /var/www/fad-backend && node -e \"
    require('dotenv').config();
    const { Pool } = require('pg');
    const fs = require('fs');
    const sql = fs.readFileSync('migrations/0NN_FOO.sql', 'utf8');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    pool.query(sql).then(() => { console.log('OK'); pool.end(); })
      .catch(e => { console.error(e); process.exit(1); });
  \""

# Verify
curl -fsS "https://admin.friday.mu/version.json?_=$(date +%s)"
curl -fsS "https://admin.friday.mu/api/version?_=$(date +%s)"
```

## Post-compact pickup prompt (paste back after `/compact`)

```text
Smart-compact recovery. Read these in order:
1. docs/handover/2026-05-24-smart-compact-anchor.md (this doc)
2. docs/FAD_BACKLOG.md (persistent pending-tasks list)
3. docs/SECURITY_AUDIT_2026-05-24.md (multi-tenant audit findings)

Verify state:
- git status (should be clean on fad-rebuild)
- git log --oneline -5 (tip 587687ce or newer)
- curl https://admin.friday.mu/version.json (587687ce)
- curl https://admin.friday.mu/api/version (87b608c8)

Then wait for my pick from the "Open items waiting on Ishant"
section OR the "Queued for next solo session" list. Do NOT
auto-pick — ask first.

Guardrails for this session: no deploy without explicit ack;
Gemini 3.5 Flash primary / Kimi 2.6 fallback / Sonnet 4.6 third;
image gen ONLY in 2 design surfaces on gemini-3-pro-image-preview;
git author Judith Friday <judith@friday.mu>; never paste secrets in chat;
don't edit FAD + Friday Website in the same session.
```
