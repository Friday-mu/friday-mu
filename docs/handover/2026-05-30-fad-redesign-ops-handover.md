# FAD Redesign + Operations Wiring — Handover

**From:** the FAD frontend/redesign session (Claude Code, Opus)
**To:** the Ask Friday Core session (or whoever continues the FAD V2 redesign + Ops)
**Date:** 2026-05-30 · **Live + branch SHA:** `88c0681f` (FE + BE aligned, deployed to admin.friday.mu)

> Read this cold and you can continue without me. It covers what shipped, the
> backend I added (so you don't collide + know the contracts), the open redesign
> queue, coordination boundaries, deploy mechanics, and verification gaps.

---

## 0. TL;DR

This session did two threads on `fad-rebuild`, all **live at `88c0681f`**:

1. **FAD V2 redesign — Pass 1 + Pass 2 done.** GM Schedule behaviour port (4 quadrants, 15-min snap, movable lunch, drop-guards); All-tasks + My-tasks reskinned to the V2 GM shell. The task-detail **drawer was already built** (`operations/TaskDetail.tsx`) — left as-is.
2. **Operations "fully wired + usable" — all audit BLOCKERs closed.** Wired the inert GM-Overview "New task" CTA; built **task evidence/photo upload** (new backend); built **editable Operations Settings** (new backend); made Overview occupancy + Roster stats read live data.

**Two new backend migrations I added (both applied in prod): `113_task_attachments`, `114_operations_settings`.** Details in §3 — please don't collide.

**Next:** redesign **Pass 3** (deepen modules) — Reservations/Calendar are fully-owned + ready; **Inbox is blocked on a coordination decision with you** (§5).

---

## 1. Current state

- `origin/fad-rebuild` = **`88c0681f`**; prod `version.json` + `/api/version` both `88c0681f`.
- The whole session's frontend work is **deployed**. Migrations 113 + 114 applied (verified in `fad_schema_migrations`).
- **Verification gap (important):** I cannot log into prod (no password) and dev points at prod with same-origin `/api` (404 in dev → empty data). So I verified everything via tsc + `node --check` + production build + structural/interaction smoke (with a VPS-minted token for read-only API checks) + cache-bust. **Two flows still need a real logged-in smoke** (§8): Settings *save* (PUT) and evidence *upload* (POST). GET sides + route-mounting + migrations are confirmed.

---

## 2. What shipped this session (key commits on top of `af513255`)

Redesign:
- `45c92547` — **GM Schedule** behaviour port: axis(staff|property) × range(day|week) = 4 quadrants; 15-min drag snap + live tick; movable per-staff lunch (localStorage `fad.schedule.lunchByStaff.v1`, PROD-STATE-7 / PROD-CONFIG-12); drop-guards (occupancy via reservations, cross-property reject, lunch soft-warn, reported→scheduled). No-flash optimistic cache path retained.
- `6151385c` — **All-tasks → V2**: `GM_SUBS += 'all'`, GmShell + `.tbl` skin + `.vseg` quick filter (All/Open/Overdue/Done) + V2 dropdowns; all filters/sort/pagination preserved; rows open the existing TaskDetail drawer.
- `28c7794c` — **My-tasks → V2** (manager path only): `GM_SUBS += 'my'`, GmShell frame; **field path + the shared `MyTaskCard` deliberately untouched** (field role routes to the separate FieldApp shell).

Ops wiring (from a full audit — see §4):
- `f7835124` — wire GM-Overview "New task" CTA (was inert) + remove 2 inert Roster buttons that shadowed Save/Publish.
- `44ee498f` — **task evidence/photo upload** (migration 113 + routes + `taskAttachmentsClient` + TaskDetail EvidencePanel rewrite).
- `b33a408c` — **editable Operations Settings** (migration 114 + routes + `operationsSettingsClient` + SettingsPage rewrite).
- `bd5dfacf` — Overview occupancy (from reservations) + Roster Assignable/No-login stats (from staff directory).

(The interleaved `feat(ask-friday)` / `docs(ask-friday)` commits are **yours**, merged in cleanly — no overlap with my files at any point.)

---

## 3. Backend I added — contracts you should know (so we don't collide)

All under my ownership (task attachments + ops settings are Ops surfaces, not Ask-Friday). Both mounted, idempotent migrations, live.

### Migration `113_task_attachments` + `POST/GET /api/tasks/:id/attachments`, `GET /api/tasks/attachments/:id/content`
- `src/tasks/index.js` (appended at the end; added `const crypto = require('crypto')` near the top).
- `task_attachments` table: inline-base64 storage, hash-dedup per task, `kind` (evidence/before/after/document/other), `enabled`-less. Mirrors `expense_receipts` (076).
- 7MB/file cap (base64 stays under the global 10mb `express.json` limit). Upload is **one file per request** from the FE. `GREATEST`-bumps `tasks.attachment_count`. Logs `attachment_added` activity.
- FE client: `frontend/src/app/fad/_data/taskAttachmentsClient.ts`. UI: TaskDetail `EvidencePanel` (lazy image thumbnails, uploading state, source-count note).

### Migration `114_operations_settings` + `GET/PUT /api/operations/settings`
- `src/operations/settings.js`, mounted at `/api/operations` in `server.js` (alongside consult + travel_time).
- One JSONB `config` blob per tenant: `{ templates[], bookingPolicies[], recurringRules[] }`, each item has `id` + `enabled` (live/paused). GET returns stored config or seeded defaults (`is_default`); PUT validates/normalizes + upserts.
- FE client: `frontend/src/app/fad/_data/operationsSettingsClient.ts`. UI: editable `SettingsPage` in `OperationsModule.tsx`.
- **Caveat (stated in the UI):** the automation **job** that auto-creates tasks from booking-trigger/recurring config is a **later slice** — config is editable + persisted + live/paused, not yet auto-executing.

No changes to Ask-Friday Core registry/tool/action contracts. (Acked your note: those are coordinate-before-change because your generated context-pack templates validate against the allowlists.)

---

## 4. Ops wiring audit — what's done vs left

A subagent audited the whole Ops surface. Headline: **Ops was already far more wired than it looked** (tasks CRUD/status/comments/costs/assign/schedule, reported-issue triage, roster save/publish, both schedule planners, create-task incl. AI parse — all hit real endpoints).

**Closed (all 3 BLOCKERs + 2 DEGRADED):** New-task CTA · evidence/photo upload · editable Settings · Overview occupancy · Roster stats.

**Remaining (non-blockers):**
- **DEGRADED — AI-suggestion "Accept" doesn't apply** (`operations/TaskDetail.tsx` `AISuggestionRow`): Accept records telemetry but doesn't apply the suggested mutation. Deferred because the fix needs the suggestion's **action payload** (which assignee? what priority?) — likely a small backend/contract addition on the `task.ai_suggestions` shape. Good candidate for you since it touches the AI layer.
- **COSMETIC — GM Ask-panel / FridayBar action buttons** (`gm/kit.tsx` AskPanel, "Apply plan/draft", roster "Publish week", approvals triage/draft copy): `@demo:ui` placeholders, tagged `PROD-GM-ASKPANEL-1` etc. **These are yours to wire** with real Ask-Friday Core actions + the failure-state UI in §7.
- **Dead code I left (harmless):** `OperationsModule.tsx` in-module `ApprovalsPage`/`ApprovalDetail` (never render — router uses `GmApprovals`), the now-unused `Workflow` + `EvidenceItem`. Safe to delete in a cleanup pass.
- **Stale DEMO_CRUFT rows:** `PROD-GM-SCHED-WEEK-1` (week view IS built now) and `PROD-LOGIC-4` (offline parse removed). PROD-CONFIG-10 I already marked resolved.

---

## 5. Inbox — pending coordination decision (yours)

Pass 3's queue starts with Inbox, but Inbox overlaps your territory (Inbox-Consult UI, Ask-Friday panel/composer, TeamInbox). I sent a relay proposal and it's **awaiting your reply**:

> Proposed split: **I/whoever-does-redesign takes the guest Inbox shell** (3-pane layout / thread list / conversation V2 skin only); **you keep Inbox-Consult UI + Ask-Friday panel/composer + TeamInbox.** Confirm or adjust, and say what your next area is so we don't collide.

Until that's settled, **do Pass 3 on a non-contested module** (Reservations or Calendar).

---

## 6. Open redesign queue (Pass 3+)

Order (from the design chat): **Reservations / Calendar → Properties → Reviews / Owners / Guests / HR → Notifications / Settings polish / Learnings / Training → Inbox (after §5)**.

- **Reservations** — has a rich 72KB `ReservationDetail` (folio/payments/accounting). **Restyle to V2, do NOT rewrite** (same principle that saved the TaskDetail drawer).
- Pattern for each module: clickable rows → detail, V2 GM shell (`GmShell`/`.tbl`/`.dwrap` skin), working filters, realistic data + explicit empty/loading/error states.
- **Design bundle:** I extracted it locally at `/tmp/dsNew/fad-v2/` (won't exist on your machine; the Claude share-links expire). The V2 skin already lives in `frontend/src/app/fad/gm-desktop.css` + the built GM screens (`gm/screens/*`) — use those as the reference. For new screens, ask Ishant for a fresh design link.

---

## 7. Design guardrails for AI surfaces (from the skill-review thread)

A separate review flagged 5 FAD failure patterns → one design rule for Pass 3, **especially the AI surfaces you own** (Ask Friday, Inbox consult, Operations Ask, Training/Learnings, TeamInbox):

> **Don't treat AI as magic. Make contracts, source provenance, sync state, AI confidence, fallback behaviour, stale data, and error ownership visible — and design explicit first-class states: loaded / stale / partial-context / missing-source / fallback-answer / failed-tool / draft-only / pending-approval / committed.**

This dovetails with what you shipped: your **readiness + context-pack-expectation + provenance backend is exactly the data these surfaces should render** (confidence chips, "draft only — needs approval" vs "committed", "partial context / source X unavailable" banners from the readiness signals, truthful failed-tool states). Already partially modelled: evidence-upload states, schedule Breezeway/Guesty source chips.

---

## 8. Pending smoke (needs a real login — I can't)

- **Settings save:** Operations → Settings → edit a template / flip Live↔Paused / add a row → **Save changes** → reload → persists. (GET + seeded defaults confirmed live; PUT untested interactively.)
- **Evidence upload:** any task → drawer → Evidence → **Add photo/file** → uploads → thumbnail → reload persists. (Routes + table confirmed; POST untested interactively.)
- **Occupancy / Roster stats:** show real numbers only with reservations/staff data (a login).
- If a flow misbehaves, check `~/.pm2/logs/fad-backend-error.log` on the VPS.

**Optional follow-up:** flip `SHOW_TASK_REQUIREMENTS` (currently `false` in `operations/TaskDetail.tsx`) to enforce photo-gated completion now that evidence upload persists — the gate already reads real attachment signals. It's a completion-UX change, so decide deliberately.

---

## 9. Deploy + coordination mechanics (what worked)

- **Canonical deploy:** `docs/deploy.md`. TL;DR: `cd frontend && npm run build`; stamp `out/version.json` with the SHA; `rsync -az --delete out/ → /var/www/fad/`; rsync `backend/ → /var/www/fad-backend/` (exclude `.env`/`node_modules`/`uploads`/`logs`); `node --check` changed files; `GIT_COMMIT=$SHA APP_VERSION=$SHORT BUILD_TIME=$NOW pm2 restart fad-backend --update-env`. SSH `~/.ssh/do_friday_admin root@admin.friday.mu`, pm2 `fad-backend` :3002. **Migrations auto-apply on boot** via `src/database/migrate.js` (globs `migrations/*.sql`, tracks `fad_schema_migrations`). Backend boots ~9s → curl with `--retry` through the transient 502.
- **No frontend-only deploy when backend changed** (SHAs drift). Always paired FE+BE from latest.
- **Verify after deploy:** `version.json` == `/api/version`; migration in `fad_schema_migrations`; route mounted (no-auth → 401, not 404); authed smoke via a VPS-minted token (see `docs/deploy.md` "Authenticated smoke"); cache-bust (live `/fad/index.html` chunk hashes == local `out/`).
- **Cross-session merge discipline (critical):** `git fetch origin` + **merge `origin/fad-rebuild` before EVERY push** — you pushed ~20 commits across this session and every merge was clean because our file domains never overlapped. Keep `origin/fad-rebuild` and the working branch aligned. Git author must be `Judith Friday <judith@friday.mu>`.
- **Naming:** Ask Friday / Ask Friday Core / FridayOS (never "OS Friday").
- **Disk on the VPS is ~92% (2 G free)** — frontend backups are tiny (~6 MB); skip full backend `cp -a` backups (node_modules bloat) and rely on git for backend rollback.

---

## 10. Where things live

- **Branch:** `fad-rebuild` (canonical). My worktree was `claude/fad-perf-20260529` (== `origin/fad-rebuild`).
- **Redesign surface:** `frontend/src/app/fad/_components/gm/screens/{ops,schedule,roster,approvals,map}.tsx` + `gm/kit.tsx` + `gm-desktop.css` (`.dwrap`-scoped V2 skin).
- **Classic shell + sub-pages:** `_components/modules/OperationsModule.tsx` (5400+ lines; `GM_SUBS` gates GM vs classic-`ModuleHeader` chrome — now `['overview','schedule','approvals','roster','all','my']`).
- **Task drawer:** `_components/modules/operations/TaskDetail.tsx` (wired; restyle later if desired).
- **Data clients:** `_data/{useApiTasks,tasksClient,operationsStaffClient,propertiesClient,reservationsClient,rosterClient,expensesClient,taskAttachmentsClient,operationsSettingsClient}.ts`.
- **Demo-cruft ledger:** `frontend/DEMO_CRUFT.md` (keep it accurate — I added PROD-STATE-7, PROD-CONFIG-12; resolved PROD-CONFIG-10).
- **This session's prior handover (pre-compaction context):** `~/.openclaw/workspace/tmp/claude-code-compaction-handover-20260529-evening-fad.md` (Ishant's machine).

---

## 11. First moves for whoever continues

```bash
git fetch origin && git checkout fad-rebuild && git pull   # or merge into your working branch
curl -fsS https://admin.friday.mu/version.json              # expect 88c0681f (or newer)
```
1. Reply to the **Inbox split** (§5) so the redesign can sequence Inbox.
2. Start Pass 3 on **Reservations** (restyle the detail, don't rewrite) applying §7's guardrails.
3. When ready, smoke the two pending flows (§8) with a real login.
4. Optionally wire the AI-suggestion "Accept" (§4) + the GM Ask-panel actions (§4) — both in your AI lane.

— End of handover.
