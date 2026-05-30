# FAD End-of-Session Handover — 2026-05-23 (late)

Pre-compaction snapshot for the next Claude Code session.

## Where we are right now

- **Repo:** `/Users/judith/repos/friday-admin-dashboard`
- **Branch:** `fad-rebuild` (clean, all work pushed)
- **Live commit:** `beb545e4e6bf702be81fcc6eed4e7dd176313877` (short: `beb545e`)
- **Live URL:** `https://admin.friday.mu`
- **Backend:** PM2 `fad-backend` on port 3002, online
- **Frontend root:** `/var/www/fad`
- **Backend root:** `/var/www/fad-backend`
- **SSH identity:** `~/.ssh/do_friday_admin`
- **nginx:** `/etc/nginx/sites-enabled/default` (active config — NOT `admin.friday.mu` in sites-available, that's a stale `.backup`). `/api/` block has `proxy_read_timeout 1800s` + `proxy_send_timeout 1800s`.

## What shipped this session (8 deploys)

| Order | Commit | What it does |
|---|---|---|
| 1 | `c760516` | FAB always-on-top — `createPortal` to body + z-index 100000 |
| 2 | `2b54fdf` | Nanobanana image-gen timeouts 60s → 25 min |
| 3 | `b9cc19b` | Bug #2 fix — notification routing (`?team=channel:UUID` parsed) |
| 4 | `b7c6f1b` | 3 Gemini 2.5→3.5 bumps + Franny's "Report option missing" fix (gated on `canEdit` → just `onReportIssue`) |
| 5 | `8590bc7` | Kimi defaults 8k→k2.6, Anthropic 4-5→4-6, rate-table entries, Franny's property-selector fix (CreateTaskDrawer now triggers `useHydratePropertiesFromGuesty()`) |
| 6 | `beb545e` | 6 Kimi-only paths migrated to Gemini-primary / Kimi-2.6-fallback via new shared `backend/src/ai/gemini_first.js` helper |

Plus prod env updates (NOT in code):
- `GEMINI_API_KEY` set to `AIzaSy...57nw` (39 chars, suffix `57nw`)
- `NANOBANANA_API_KEY` = same value (Google AI Studio same key serves text + image gen)
- `NANOBANANA_MODEL=gemini-3-pro-image-preview`
- nginx `/api/` proxy_read_timeout 60s default → 1800s

## AI model state across FAD (post-session)

| Surface | Model |
|---|---|
| Text/chat default (chat_proxy, kimi_draft, fad/friday, public/chat) | Gemini 3.5 Flash primary / Kimi 2.6 fallback / Claude Sonnet 4.6 third |
| Feedback FAB vision chat | Gemini 3.5 Flash (vision) primary / Kimi 2.6 fallback |
| Inbox AI (drafts, consult, follow-up, action detector, auto-resolve, classify, extract) | Same — all via `kimi_draft.js` callWithRetry + `gemini_first.js` |
| Inbox translation (inbound `ai/translate.js`, outbound `drafts_send.js` + `outbound/index.js`) | Migrated to `runTextCompletion()` |
| Design AI (`ai_ask`, `ai_rough_budget`, `ai_annex_b_edit`, `promptbuilder`) | Migrated to `runTextCompletion()` |
| Audio transcription | Gemini 3.5 Flash |
| Floor-plan text reasoning | Gemini 3.5 Flash |
| Image gen (Design moodboards/packs + floor-plan rendering — exactly 2 user-facing surfaces) | `gemini-3-pro-image-preview` (Nanobanana Pro) |
| App timeouts | 8 min text / 25 min image / 90s interactive chat |
| nginx ceiling | 1800s (30 min) on `/api/` |

## Open bugs (genuinely still broken)

Pulled from the feedback inbox as of 2026-05-23 EOD:

1. **Bug #1 — Ask Friday Inbox context scoping** (Franny 2026-05-23 08:09, `af69b17d`).
   - When invoked from Inbox, Ask Friday pulls the whole Inbox slice instead of scoping to the active thread + cited message.
   - **NEXT-SESSION PRIMARY TASK.** Likely fix: scope `buildAskFridayContext` in `backend/src/fad/friday.js` to the active thread id (read from request payload or URL), and include the specific message id + (when available) the screenshot reference.

2. **Bug — Smart AI task creation drawer** (Ishant, this session — NEW).
   - The `parseNl` function in `frontend/src/app/fad/_components/modules/operations/CreateTaskDrawer.tsx` (line 270) is regex-based, not an LLM. Tagged as `// @demo:logic — Tag: PROD-LOGIC-4 — Phase 2 swaps to real LLM`.
   - Ishant wants: small conversation box where you type a message, AI creates the task, you can correct via follow-up. Should ask for more detail if needed. Should set title/description/property/assignee/due-date/priority intelligently.
   - Should mirror the draft-conversation UX (write → AI does → write again).
   - Likely overlaps with Franny's still-open 2026-05-23 11:08 bug: "task title is the full message instead of a shortened AI summary" (was parked pending repro — Ishant's note suggests this IS the same path, just the AI quality complaint).
   - **Implementation sketch:** new backend route like `POST /api/intent/parse-task` that takes a free-text input + optional history of prior turns, returns `{ title, description, propertyCode, department, subdepartment, assigneeIds, priority, dueDate, dueTime, estimatedMinutes, clarifyingQuestion? }`. Frontend drawer wraps it in a chat UI similar to FAB feedback chat. Backend uses `runTextCompletion()` from `ai/gemini_first.js` with JSON response_format.

3. **Bug #5 — Mary "Inbox lower section fluctuates"** (`434b9435`, 2026-05-22).
   - Render-loop suspected. Mary couldn't say browser/device.
   - **Needs repro from Mary** before it can be diagnosed.

4. **Bug #3 — Ops schedule width** (Ishant 2026-05-22 19:42, `7f3f16b3`).
   - Commit `62c1542` shipped a fix on 2026-05-22 23:08 — AFTER your report. Likely already resolved.
   - **Action: re-verify on current live** before fresh work. URL: `https://admin.friday.mu/fad?m=operations&sub=schedule` on a 13" laptop.

5. **Bug — Ishant 2026-05-21 "draft is not reading the conversation context"** (`91a86c77`).
   - `332297d fix(inbox): restore Consult context and reply states` shipped 2026-05-22, post-dating this report.
   - **Action: re-verify on current live.**

6. **Suggestion — Franny 2026-05-23 10:47 "separate guest messages and AI handoff"**.
   - UX/product design call, not a bug. Inbox visually mixes guest messages with AI handoff entries; Franny wants visual separation.
   - Defer for Ishant product call.

## Parked / not-in-flight

- **Ask Friday Core operationalization Slices 2-9** (handover doc `2026-05-23-fad-essential-systems-claude-code-handover.md`). Per Ishant: park to the end after team-blocking bugs are clean.
- **Calendar UX/data audit** — duplicate reservations, clipped date-line UI, cross-link verification. Per the convergence-pending-tasks doc.
- **Stale deploy scripts cleanup** (`deploy.sh`, `deploy-production.sh`, `docs/deploy.md` all reference old Docker setup + `/var/www/friday-dashboard`).
- **11 `agent-be-*` parked branches** (May 13 design backend work, 146-202 unique commits each — likely already folded into the May-22 `572f694 fix(fad): restore live module surfaces` mega-restore, but needs separate triage).
- **`docs/research/breezeway-screenshots/`** dir has untracked PNGs from a previous session's screenshot capture; benign.
- **Push notifications backend** (proposed but not built) — backend has zero `/api/push/*` routes per `2026-05-18-push-notifications-proposal.md`.
- **WhatsApp burner bridge** — prototype branch parked, blocked on QR/pairing.

## Outstanding security action

- **GEMINI_API_KEY rotation.** Ishant pasted the current key (`AIzaSy...57nw`) into chat 3+ times this session. Conversation logs persist. Rotate via Google AI Studio when convenient, update `backend/.env` on prod, `pm2 restart fad-backend --update-env`. Old key suffix `...p4TDA` is already replaced. For future key handoffs use 1Password Shared Vault or Bitwarden Send — never paste in chat.

## Open product decisions (Ishant calls)

- **Translation parity** — manual translate route currently translates outbound rows too; old GMS was inbound-only. Decide alignment.
- **Guest-level preferred-language memory** — proposed in handover, not implemented.
- **Inline Consult proposals** for actions/learnings/finance captures — net-new feature from handover doc.

## Critical guardrails (don't break)

- **`fad-rebuild` is canonical.** Don't use `fad-design-os-v01-frontend` as truth.
- **No deploy without explicit Ishant ack.** Push freely; deploy only on go.
- **No frontend-only deploy when backend changed.** Coordinate.
- **Git author must be `Judith Friday <judith@friday.mu>`** (PreToolUse hook enforces this).
- **Protected backend migrations — don't touch without coordination:** `050_tasks.sql` through `054_*.sql`, `071_tasks_ops_lifecycle_reconcile.sql`. Plus task lifecycle semantics, Breezeway import tooling, Ops/My Tasks field execution surfaces.
- **No bulk conversion of old `pending_actions`.**
- **Mary's leave deadline (2026-05-25)** — Ishant has the knowledge dump in scoping docs; do NOT add Mary-handover scope to the code backlog.

## Verification gates (before declaring done)

- Backend changes → `node --check` on each changed file + `npm test src/<path>.test.js` for any test that touches the path.
- Frontend changes → `cd frontend && npx tsc --noEmit` + `npm run build`.
- UI changes → mobile 375×812 + desktop screenshot via `preview_screenshot`, click changed elements.
- Live changes (post-deploy) → curl `/version.json` + `/api/version` with cache-bust, authed smoke via JWT-on-VPS pattern (see deploy steps below).

## Deploy steps (canonical, ignore the stale `deploy.sh`)

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

# 4. Rsync frontend
rsync -avz --delete -e "ssh -i ~/.ssh/do_friday_admin" \
  frontend/out/ root@admin.friday.mu:/var/www/fad/

# 5. Rsync backend (preserve .env / node_modules / caches / uploads)
rsync -avz --delete \
  --exclude '.env' --exclude '.env.*' --exclude 'node_modules' \
  --exclude '.git' --exclude 'logs/' --exclude 'uploads/' \
  --exclude '.*-cache.json' --exclude 'coverage/' --exclude 'test-results/' \
  --exclude 'dist/' --exclude 'build/' \
  -e "ssh -i ~/.ssh/do_friday_admin" \
  backend/ root@admin.friday.mu:/var/www/fad-backend/

# 6. Syntax check + PM2 restart with new env
ssh -i ~/.ssh/do_friday_admin root@admin.friday.mu \
  "cd /var/www/fad-backend && \
   node --check src/<changed-files>.js && \
   GIT_COMMIT=${SHA} APP_VERSION=${SHORT} BUILD_TIME=${NOW} \
   pm2 restart fad-backend --update-env"

# 7. Verify
curl -fsS "https://admin.friday.mu/version.json?_=$(date +%s)"
curl -fsS "https://admin.friday.mu/api/version?_=$(date +%s)"

# 8. Authed smoke (5-min staff token, loopback only)
ssh -i ~/.ssh/do_friday_admin root@admin.friday.mu 'bash -s' <<'REMOTE'
cd /var/www/fad-backend
TOKEN=$(node -e 'require("dotenv").config(); const jwt=require("jsonwebtoken"); process.stdout.write(jwt.sign({user_id:"deploy-smoke",role:"admin",username:"deploy-smoke",display_name:"Deploy Smoke",tenant_id:"00000000-0000-0000-0000-000000000001"}, process.env.JWT_SECRET, {expiresIn:"5m"}))')
curl -fsS -H "Authorization: Bearer $TOKEN" https://admin.friday.mu/api/ask-friday/core/surfaces | python3 -c 'import sys,json; print(len(json.load(sys.stdin).get("surfaces",[])), "surfaces")'
REMOTE
```

## Key files to read first in the next session

1. **This file** — `docs/handover/2026-05-23-end-of-session-handover.md`
2. `CLAUDE.md` + `AGENTS.md` (repo root + workspace)
3. `frontend/src/app/fad/_components/modules/operations/CreateTaskDrawer.tsx` (line 270 = `parseNl`, the regex-based intent parsing to replace)
4. `backend/src/ai/gemini_first.js` (the shared Gemini-primary helper — use this for the new task-creation LLM)
5. `backend/src/fad/friday.js` (Ask Friday Core context builder — Bug #1 lives here)
6. `frontend/src/app/fad/_components/BugReport.tsx` (FAB pattern for chat-style UI — the new task creation drawer should mirror this shape)

## Reference docs in the repo

- `docs/handover/2026-05-23-fad-essential-systems-claude-code-handover.md` (1168 lines — Ask Friday Core canonical handover, mostly already addressed)
- `docs/handover/2026-05-22-fad-auth-inbox-consult-handover.md` (Inbox/Consult repair — most items now shipped per this handover's "What shipped this session" section)
- `docs/handover/2026-05-23-fad-convergence-pending-tasks.md` (11 numbered pending categories — most addressed)
- `docs/handover/2026-05-23-ops-convergence-handover.md` (Ops module backlog — schedule width fixed, mobile pass + AI task creation still open)
- `docs/research/2026-05-21-operations-breezeway-cutover-plan.md` (52k strategic Operations cutover plan — locked)
- `docs/roadmap/2026-05-18-consolidated.md` (850 lines — full FAD/GMS roadmap, Phases 1-N)
- `frontend/DEMO_CRUFT.md` (~86 `@demo:*` tags, master registry for backend wiring)

## My next-session action plan

In order:

1. **Read this file.** Confirm `beb545e` is still live tip on `origin/fad-rebuild`. `git fetch origin --prune`.
2. **Re-verify Bug #3 (Ops schedule) and Ishant's 2026-05-21 "draft not reading context"** on current live with Ishant — both have post-report fix commits, likely resolved.
3. **Fix Bug #1 — Ask Friday Inbox context scoping.** Backend `src/fad/friday.js` context builder. ~30-45 min.
4. **Implement smart AI task creation drawer.** Backend route `POST /api/intent/parse-task` using `runTextCompletion()` from `gemini_first.js`. Frontend CreateTaskDrawer wraps it in a chat UI. Replaces the regex `parseNl`. Connects to Franny's "task title not summarized" bug. ~2-3 hours.
5. **If Mary provides repro** for Bug #5 (Inbox fluctuation), diagnose + fix.
6. **Then** Ask Friday Core operationalization Slices 2-9 from the handover doc (Tier B from this session's backlog).
