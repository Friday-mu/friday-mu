# FAD End-of-Day Handover — 2026-05-23 (evening)

Successor session pickup doc. Today was a long session covering 6 commits, 5 deploys, and most of Ishant's 2026-05-23 review punchlist. End state is clean.

## Live state

- **Repo:** `/Users/judith/repos/friday-admin-dashboard`
- **Branch:** `fad-rebuild` (clean, all work pushed)
- **Live commit:** `50ecdf49dee19f79420c017371f9772a0e2ae0b4` (short: `50ecdf4`)
- **Live URL:** `https://admin.friday.mu`
- **Backend:** PM2 `fad-backend` on port 3002, online
- **SSH identity:** `~/.ssh/do_friday_admin`
- **DB migrations applied through:** `076_expenses_path_a.sql`

## What shipped today (5 deploys)

| Order | Commit | What it does |
|---|---|---|
| 1 | `ebceb26` | Bug #1 — Ask Friday inbox context scoping (Franny `af69b17d`). `/api/friday/ask` accepts `focus.threadId` and scopes the inbox loader to that thread instead of pulling the recent-8 slice |
| 2 | `099f386` | Smart AI task creation drawer. New `POST /api/intent/parse-task` (Gemini 3.5 Flash). Frontend chat replaces regex `parseNl`. Multi-turn refinement. Includes Franny's "task title is the full message" fix |
| 3 | `3847d4b` | Per-user FAD roles. Migration 075 adds `users.fad_role` (director / commercial_marketing / ops_manager / field / external). JWT carries it. Frontend `PermissionsProvider` seeds from JWT. Bryan → field on next login. Plus CreateTaskDrawer assignees dropdown + requester defaults. Plus TaskDetail requirements section parked behind `SHOW_TASK_REQUIREMENTS = false` |
| 4 | `bf166c9` | Expense capture slices 1 + 2. Migration 076 adds `expenses` / `vendors` / `expense_categories` (seeded 11 FR codes) / `expense_receipts`. New routes: `/api/expenses` (POST/GET), `/api/expenses/categories`, `/api/intent/parse-receipt` (Gemini 3.5 Flash multimodal OCR). TaskDetail gets a new "Expenses" section + "Capture expense" button + drawer with receipt-first UX |
| 5 | `50ecdf4` | Schedule planner — live 15-min snap. Dragging a task across the user_day planner now shows `Drop at 08:15` at the cursor's x-position. Snaps to 15-min boundaries inside the 2-hour buckets, 60-min on the edge buckets |

## Role mapping live on prod (migration 075)

| User | DB role | fad_role |
|---|---|---|
| ishant@friday.mu | admin | director |
| judith@friday.mu | admin | director |
| mathias@friday.mu | admin | commercial_marketing |
| franny@friday.mu | agent | ops_manager |
| bryan@friday.mu | agent | field |
| catherine@friday.mu | agent | field |
| mary@friday.mu | agent | field |
| acme@example.com | admin | NULL (falls back to 'director' via coarse-role resolver) |

Existing JWTs minted before deploy 3847d4b don't carry `fad_role` — those users keep their default view until next login, then get the correct role. Fresh logins immediately get the right role.

## AI model state across FAD

Unchanged from this morning's handover except for the new endpoints:

| Surface | Model |
|---|---|
| Text/chat default (chat_proxy, kimi_draft, fad/friday, public/chat) | Gemini 3.5 Flash primary / Kimi 2.6 fallback / Claude Sonnet 4.6 third |
| Smart task drafter (`POST /api/intent/parse-task`) | Gemini 3.5 Flash primary / Kimi 2.6 fallback |
| Receipt OCR (`POST /api/intent/parse-receipt`) — NEW | Gemini 3.5 Flash multimodal (image + text) |
| Feedback FAB vision chat | Gemini 3.5 Flash (vision) primary / Kimi 2.6 fallback |
| Inbox AI / drafts / consult / translation | All on the shared `gemini_first.js` helper |
| Audio transcription / Floor-plan text reasoning | Gemini 3.5 Flash |
| Image gen (2 design surfaces only: moodboards/packs + floor-plan rendering) | `gemini-3-pro-image-preview` (Nanobanana Pro) |
| App timeouts | 8 min text / 25 min image / 90s interactive chat |
| nginx ceiling | 1800s (30 min) on `/api/` |

## Pending work (by priority)

### Tier A — open from today's session
- **Expense capture slice 3+** (parked task #10):
  - DO Spaces receipt storage (currently inline base64 in DB — fine for ≤12MB per file but adds bloat)
  - Vendor autocomplete from `vendors` table — needs Mary's CSV import before 2026-05-25
  - Live approval-tier preview as user types amount (per locked design Notion `34e43ca8849281fa8085f120b211c689`)
  - Path B (admin direct entry) drawer + recurring expenses
  - Internal-labour rate-card (`labour_rates`, Phase 1.5)

- **GEMINI_API_KEY rotation** (task #7, security):
  - Current key (`AIzaSy...57nw`) was pasted in chat 3+ times across the 2026-05-23 sessions
  - Rotate via Google AI Studio → SSH `vi /var/www/fad-backend/.env` → `pm2 restart fad-backend --update-env`
  - Don't paste the new value in chat — use 1Password Shared Vault or Bitwarden Send

### Tier B — open from earlier sessions (deferred)
- **Mary's vendor CSV ask** — short message draft to send before 2026-05-25 so the autocomplete has real data
- **Flicker / blink fix on data loads** — cross-cutting state-mgmt audit (Ishant flagged this; "Wherever we're loading stuff, the screen goes out and then comes in again")
- **Speed audit** — Lighthouse + Chrome perf trace across every module; ~half-day; report + immediate fixes
- **Security audit** — env-var hygiene, auth boundary, RLS, dep audit, secret scan; ~half-day
- **Bug #5 Mary inbox fluctuation** (`434b9435`) — needs browser repro from Mary
- **Franny 10:47 separate guest / AI handoff** — UX product call

### Tier C — parked
- **Ask Friday Core operationalization Slices 2-9** (per `2026-05-23-fad-essential-systems-claude-code-handover.md`)
- **Calendar UX/data audit**
- **Stale deploy scripts cleanup** (`deploy.sh`, `deploy-production.sh`, `docs/deploy.md`)
- **11 `agent-be-*` parked branches** (May-13 design backend work)
- **Push notifications backend** (no `/api/push/*` routes; design in `2026-05-18-push-notifications-proposal.md`)
- **WhatsApp burner bridge**

## Outstanding product decisions (Ishant calls)

- **Translation parity** — manual translate route currently translates outbound rows too; old GMS was inbound-only
- **Guest-level preferred-language memory** — proposed in handover, not implemented
- **Inline Consult proposals** for actions / learnings / finance captures
- **Vendor table seeding strategy** — Mary's CSV vs let it grow organically from `vendor_unrecognized` flags

## Critical guardrails (don't break)

- **`fad-rebuild` is canonical.** Don't use any `fad-design-os-v01-*` branches as truth.
- **No deploy without explicit Ishant ack.** Push freely; deploy only on go.
- **No frontend-only deploy when backend changed.** Coordinate.
- **Git author must be `Judith Friday <judith@friday.mu>`** (PreToolUse hook enforces this).
- **Protected backend migrations — don't touch without coordination:** `050_tasks.sql` through `054_*.sql`, `071_tasks_ops_lifecycle_reconcile.sql`. Plus task lifecycle semantics, Breezeway import tooling, Ops/My Tasks field execution surfaces.
- **No bulk conversion of old `pending_actions`.**
- **Mary's leave deadline (2026-05-25)** — Ishant has the knowledge dump in scoping docs; do NOT add Mary-handover scope to the code backlog.

## Verification gates (before declaring done)

- Backend changes → `node --check` on each changed file + `npm test src/<path>.test.js` for any test that touches the path
- Frontend changes → `cd frontend && npx tsc --noEmit` + `npm run build`
- UI changes → mobile 375×812 + desktop screenshot via `preview_screenshot`, click changed elements
- Live changes (post-deploy) → curl `/version.json` + `/api/version` with cache-bust, authed smoke via JWT-on-VPS pattern

## Deploy steps (canonical, ignore stale `deploy.sh`)

```bash
# 1. Build frontend
cd frontend && npm run build  # → frontend/out/

# 2. Stamp version.json
SHA=$(git rev-parse HEAD); SHORT=$(git rev-parse --short HEAD); NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
cat > frontend/out/version.json <<EOF
{"version":"$SHORT","branch":"fad-rebuild","commit":"$SHA","deployedAt":"$NOW"}
EOF

# 3. Backup
STAMP=$(date -u +"%Y%m%d-%H%M%S")
ssh -i ~/.ssh/do_friday_admin root@admin.friday.mu \
  "cp -a /var/www/fad /var/backups/fad-frontend-pre-${SHORT}-${STAMP} && \
   cp -a /var/www/fad-backend /var/backups/fad-backend-pre-${SHORT}-${STAMP}"

# 4. (When applicable) Apply pending migrations via the canonical
# `cd /var/www/fad-backend && node -e "...sql..."` ssh one-liner — see
# how migration 075 + 076 were applied this session.

# 5. Rsync frontend
rsync -avz --delete -e "ssh -i ~/.ssh/do_friday_admin" \
  frontend/out/ root@admin.friday.mu:/var/www/fad/

# 6. Rsync backend (preserve .env / node_modules / caches / uploads)
rsync -avz --delete \
  --exclude '.env' --exclude '.env.*' --exclude 'node_modules' \
  --exclude '.git' --exclude 'logs/' --exclude 'uploads/' \
  --exclude '.*-cache.json' --exclude 'coverage/' --exclude 'test-results/' \
  --exclude 'dist/' --exclude 'build/' \
  -e "ssh -i ~/.ssh/do_friday_admin" \
  backend/ root@admin.friday.mu:/var/www/fad-backend/

# 7. Syntax check + PM2 restart with new env
ssh -i ~/.ssh/do_friday_admin root@admin.friday.mu \
  "cd /var/www/fad-backend && \
   node --check src/<changed-files>.js && \
   GIT_COMMIT=${SHA} APP_VERSION=${SHORT} BUILD_TIME=${NOW} \
   pm2 restart fad-backend --update-env"

# 8. Verify
curl -fsS "https://admin.friday.mu/version.json?_=$(date +%s)"
curl -fsS "https://admin.friday.mu/api/version?_=$(date +%s)"

# 9. Authed smoke (5-min staff token, loopback only)
ssh -i ~/.ssh/do_friday_admin root@admin.friday.mu 'bash -s' <<'REMOTE'
cd /var/www/fad-backend
TOKEN=$(node -e 'require("dotenv").config(); const jwt=require("jsonwebtoken"); process.stdout.write(jwt.sign({user_id:"868ea47f-b482-43a1-913a-fabe981ceb81",role:"admin",fad_role:"director",username:"ishant@friday.mu",display_name:"Ishant",tenant_id:"00000000-0000-0000-0000-000000000001"}, process.env.JWT_SECRET, {expiresIn:"5m"}))')
curl -fsS -H "Authorization: Bearer $TOKEN" https://admin.friday.mu/api/auth/me | python3 -m json.tool
REMOTE
```

## Key files added today

| File | Purpose |
|---|---|
| `backend/migrations/075_users_fad_role.sql` | Add `fad_role` to `users` (applied to prod 2026-05-23) |
| `backend/migrations/076_expenses_path_a.sql` | 4 new tables: expenses + vendors + expense_categories + expense_receipts (applied to prod 2026-05-23) |
| `backend/src/finance/expenses.js` + `.test.js` | POST/GET `/api/expenses` + `/api/expenses/categories` |
| `backend/src/intent/task_parser.js` + `.test.js` | `POST /api/intent/parse-task` smart drafter |
| `backend/src/intent/receipt_parser.js` | `POST /api/intent/parse-receipt` Gemini multimodal OCR |
| `backend/src/database/client.js` | Added `getClient()` helper for transactions |
| `backend/src/auth/session.js` | `fad_role` in JWT + `resolveFadRole` fallback |
| `backend/src/fad/friday.js` | `focus.threadId` plumbing for Bug #1 |
| `frontend/src/app/fad/_data/expensesClient.ts` | Expense API wrapper + `fileToBase64` |
| `frontend/src/app/fad/_data/intentClient.ts` | `parseTaskIntent` smart drafter client |
| `frontend/src/app/fad/_components/modules/operations/CaptureExpenseDrawer.tsx` | Path A capture form with OCR auto-fill |
| `frontend/src/app/fad/_components/usePermissions.ts` | JWT `fad_role` seed (PROD-AUTH-4 partial resolve) |
| `frontend/src/app/fad/_components/modules/operations/CreateTaskDrawer.tsx` | Smart drafter chat + dropdown assignees |
| `frontend/src/app/fad/_components/modules/operations/TaskDetail.tsx` | Expenses section + drawer mount + requirements parked |
| `frontend/src/app/fad/_components/modules/OperationsModule.tsx` | 15-min snap + drop preview tick |
| `frontend/src/app/fad/fad.css` | All today's new styles (smart turns, pill row, expense rows, drop tick) |

## Reference docs in the repo

- `docs/handover/2026-05-23-end-of-session-handover.md` (this morning's handover, lists pre-today state)
- `docs/handover/2026-05-23-fad-essential-systems-claude-code-handover.md` (1168 lines — Ask Friday Core canonical handover, mostly already addressed)
- `docs/handover/2026-05-23-fad-convergence-pending-tasks.md` (11 numbered pending categories — most addressed)
- `docs/handover/2026-05-23-ops-convergence-handover.md` (Ops module backlog)
- `docs/research/2026-05-21-operations-breezeway-cutover-plan.md` (52k strategic Operations cutover plan — locked)
- `docs/roadmap/2026-05-18-consolidated.md` (850 lines — full FAD/GMS roadmap, Phases 1-N)
- `frontend/DEMO_CRUFT.md` — master registry of `@demo:*` tags. PROD-LOGIC-4 (regex `parseNl`) reclassified to offline fallback today.

## Next-session action plan

In order, when picking up:

1. **Read this file + `docs/handover/2026-05-23-end-of-session-handover.md`.** Verify `50ecdf4` is still live tip on `origin/fad-rebuild`. `git fetch origin --prune`.

2. **Hand-test today's deploys** with Ishant. Most important:
   - Bryan logs into FAD → sees field-only view (verify role plumbing landed)
   - Open a task → click "Capture expense" → upload a receipt photo → verify OCR auto-fill works
   - Drag a task in user_day schedule planner → verify the "Drop at HH:MM" tick appears + the time lands precisely

3. **GEMINI_API_KEY rotation** if Ishant ready. Don't accept new key in chat.

4. **Mary's vendor CSV ask** — short message to send before her 2026-05-25 departure.

5. **Expense capture slice 3** — pick one to start:
   - Vendor autocomplete (depends on Mary's CSV)
   - DO Spaces receipt storage (independent — can ship without Mary)
   - Approval-tier preview (UI-only, independent)

6. **Flicker / blink audit** if Ishant prioritizes UX polish over expense slice 3.

7. **Speed + security audits** as half-day blocks when ready.
