# FAD Smart-Compact Anchor — 2026-05-23 (~21:30Z)

> Written **before** a planned conversation compaction to preserve in-flight context
> that the auto-summary would lose. Read this first after compaction, then
> [`docs/FAD_BACKLOG.md`](../FAD_BACKLOG.md) for the persistent backlog.

## Where we are right now

- **Branch:** `fad-rebuild` (clean, all pushed)
- **Tree tip:** `a70182bb` (frontend + backend last touched here)
- **Live frontend:** `fab440ed` (one commit behind tip — backend-only commit on top)
- **Live backend:** `a70182bb` (last deploy 2026-05-23T21:15:59Z)
- **PM2:** `fad-backend` online, port 3002, restart count 253
- **VPS disk:** 90% (2.5G free) — prune `/var/backups/fad-{frontend,backend}-pre-*` older than 5 snapshots when free space matters
- **SSH:** `~/.ssh/do_friday_admin`

`curl https://admin.friday.mu/version.json` → `fab440ed`. `curl https://admin.friday.mu/api/version` → `a70182bb`. Both expected.

## What I just finished (full list since the late-evening session started)

In commit order, all live unless noted:

```
a70182bb  fix(ai): Gemini-first hierarchy fix across chat_proxy + feedback + gemini_first.callKimi temp clamp
e4b2d475  docs(backlog): refresh
fab440ed  feat(finance): T4.22 — receipt display flow (signed URL + inline base64 + modal)
69e2caca  feat(ask-friday): T4.1 — scheduled analyzer worker (Core Slice 4)
1518ac61  docs(backlog): 5 bug reports closed
41a4f1f3  fix(ai): restored Gemini-first routing for inbox drafts (de14cf58)
a86fd59c  fix(mcp): tasks.create status whitelist drift (77ff359b part 2)
17207c64  fix(ai): title cap + Kimi K2.6 temperature compliance
c5c19061  fix: two prod bug fixes — bug-modal buttons + Path B drawer hydrate
d352f63d  fix(inbox): "Reply" → "AI draft" rename
e5e3c6b1  fix(pwa): touch targets in Ops + Inbox card internals
a06528c2  feat(inbox): T2.1 — reservation context drawer for narrow viewports
4b4bc12d  docs(handover): late-evening session
40e58010  docs(backlog)
d6f283d5  feat(ask-friday): T3.1 — context pack admin UI (Slice 3)
3f754a63  feat(ask-friday): T2.7 — KB candidate review queue UI (Slice 2)
deb49bd6  ← was live this morning before tonight's batch
```

**Tonight's net effect for the team:**
- All 5 most-recent Friday Consult bug reports closed (Ishant + Franny × 4)
- Ask Friday Core slices 2+3+4 wired end-to-end (review queue UI + context-pack admin + scheduled analyzer)
- AI routing hierarchy aligned everywhere (Gemini primary / Kimi fallback / Sonnet third)
- VAPID push notifications now functional (was misconfigured for 5+ weeks)
- Expense capture closed the loop (receipt display modal)

## AI hierarchy audit summary (just completed)

| Surface | Routing | Status |
|---|---|---|
| `fad/friday.js` (Ask Friday in FAD) | Gemini-3.5-flash via chat_proxy | ✓ |
| `chat_proxy providerOrder('auto')` | Gemini → Kimi → Sonnet (fixed in `a70182bb`) | ✓ |
| `feedback.js` chat reply | Via runTextCompletion (fixed in `a70182bb`) | ✓ |
| `feedback.js` vision reply | Gemini vision direct | ✓ |
| All `inbox/*` draft generators | Via kimi_draft.generateDraftReply (fixed in `41a4f1f3`) | ✓ |
| All `design/ai_*` text completions | Via runTextCompletion | ✓ |
| `intent/task_parser.js` (smart drafter) | Via runTextCompletion | ✓ |
| `ai/promptbuilder.js` (moodboard prompt) | Via runTextCompletion | ✓ |
| `ai/translate.js` | Via runTextCompletion | ✓ |
| **Image gen** — only in 2 surfaces | `gemini-3-pro-image-preview` in `design/ai_images.js` + `design/floor_plan_renderer.js` | ✓ |

**Remaining noise (logged as T4.35 in backlog, not urgent):** `design/ai_{rough_budget,ask,annex_b_edit}.js` + `ai/translate.js` log every completion as `provider: 'kimi'` even when Gemini answered. Cost reports will under-attribute Gemini. Pure telemetry; routing is correct.

## Open items waiting on Ishant (won't grind on solo)

Promoted to a single list so you can scan in 30s:

1. **Hand-test prod with me** — Bryan field-only login → Operations My tasks; capture expense → OCR auto-fill → view receipt thumbnail; planner snap; Ask Friday review module renders; push opt-in fires a test notification; bug-report modal buttons now render properly + Friday Consult inside it actually replies.
2. **Calendar real bugs** — prod-data screenshot needed. Local layout is correct; the user-visible bugs need a real-data repro.
3. **Floor-plan studio QA spec** — direction on what scenarios to drive.
4. **Bug #5 Mary inbox fluctuation** (`434b9435`) — needs Mary screen recording.
5. **GEMINI_API_KEY rotation** — walk-through only. Don't paste in chat. Use 1Password Shared Vault or Bitwarden Send.
6. **First `fad_consult` context pack content** — open product call. UI is in place at `/fad?m=ask-friday-review&sub=packs`; just need the pack content.
7. **T3.6 — Booking-triggered Ops task automation** — needs scope: which event types, which task templates, timing (relative to check-in/out), assignment (round-robin? property-zone routing?), idempotency strategy.
8. **VPS disk cleanup** — 90% full, 2.5G free. Prune `/var/backups/fad-{frontend,backend}-pre-*` older than 5 snapshots.
9. **T4.26-29 product calls** — Franny 10:47 separate-guest handoff / translation parity / inline Consult / guest-language memory.

## What I queued for the next solo session (Tier 3+ leftovers)

Already in `FAD_BACKLOG.md` but listing here as a quick check:

- **T3.2** Multi-tenant safety sweep (L)
- **T3.4** Website event emitters (separate Friday Website session)
- **T4.2** Slice 5 FAD reads Core as policy source (M-L)
- **T4.3** Slice 7 model-backed eval grading (M)
- **T4.4** Slice 8 public MCP V1 design (XL)
- **T4.5** Slice 9 retention/redaction worker (M-L)
- **T4.12-21** Ops per-screen real-data audit
- **T4.23-25** Expense slice 3d polish (vendor autocomplete needs Mary CSV; drawer mode toggle; FX conversion)
- **T4.34** Optimistic update layer
- **T4.35** AI telemetry mislabel cleanup (NEW today)

## Strategic constraints (locked, do NOT re-litigate post-compact)

- **`fad-rebuild` canonical.** Never use `fad-design-os-v01-*` branches.
- **No deploy without explicit Ishant ack.** Ishant gave blanket ack for tonight's session — that ack DOES NOT carry into the next session by default.
- **Git author** must be `Judith Friday <judith@friday.mu>` (PreToolUse hook enforces).
- **AI hierarchy** — Gemini 3.5 Flash primary / Kimi 2.6 fallback / Sonnet 4.6 third. Image gen ONLY in 2 design surfaces on `gemini-3-pro-image-preview`. **Do not flip Kimi back to primary anywhere — three independent bugs were doing exactly that today.**
- **Don't edit FAD and Friday Website in the same checkout/session.**
- **Mary handover NOT in scope** — Ishant owns directly.
- **Director is the V1 reviewer** for Ask Friday Core (KB candidates + context packs).
- **Protected migrations:** `050_tasks.sql` through `054_*.sql`, `071_tasks_ops_lifecycle_reconcile.sql` — coordinate before touching.

## Quick reference — env vars added/changed this session

On VPS `.env`:
- `VAPID_PUBLIC_KEY` — added 2026-05-23 (derived from existing VAPID_PRIVATE_KEY via P-256 ECDH)
- `VAPID_SUBJECT=mailto:ops@friday.mu` — added 2026-05-23

DO Spaces (optional — receipts fall back to inline base64 until set):
- `DO_SPACES_ENDPOINT`, `DO_SPACES_REGION`, `DO_SPACES_BUCKET`, `DO_SPACES_KEY`, `DO_SPACES_SECRET`, `DO_SPACES_PREFIX`

Ask Friday analyzer scheduler (defaults are fine, all overridable):
- `ASK_FRIDAY_ANALYZER_INTERVAL_MS=1800000` (30 min)
- `ASK_FRIDAY_ANALYZER_FIRST_DELAY_MS=90000` (90s)
- `ASK_FRIDAY_ANALYZER_LOOKBACK_HOURS=24`
- `ASK_FRIDAY_ANALYZER_TENANT_ID=<FR UUID>`
- `ASK_FRIDAY_ANALYZER_DISABLED=1` to disable

## In-flight context (the stuff that's only in my head)

- **AI usage cost reports** will look like Gemini = 0 and Kimi = 100% until T4.35 telemetry fix lands. Don't panic if you check `ai_usage` — actual routing is correct.
- **Analyzer queue** will stay empty in prod until website learning events start landing (Slice 6). The scheduler is firing every 30 min; logs show `inspected=0, clusters=0` — that's expected absence of input data, not a bug.
- **The 4 April push_subscriptions** will silently 410 on first send and auto-delete. Operators need to re-opt-in via UI.
- **Bug-report modal** rendering is fixed end-to-end now: buttons styled, scroll-trap fixed (earlier session), Friday Consult actually replies. If you submit a bug right now you'll get a proper interactive chat.

## Canonical deploy sequence (paste-ready)

```bash
cd frontend && npm run build
SHA=$(git rev-parse HEAD); SHORT=$(git rev-parse --short HEAD); NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
cat > frontend/out/version.json <<EOF
{"version":"$SHORT","branch":"fad-rebuild","commit":"$SHA","deployedAt":"$NOW"}
EOF
STAMP=$(date -u +"%Y%m%d-%H%M%S")
ssh -i ~/.ssh/do_friday_admin root@admin.friday.mu \
  "cp -a /var/www/fad /var/backups/fad-frontend-pre-${SHORT}-${STAMP} && \
   cp -a /var/www/fad-backend /var/backups/fad-backend-pre-${SHORT}-${STAMP}"
rsync -az --delete -e "ssh -i ~/.ssh/do_friday_admin" \
  frontend/out/ root@admin.friday.mu:/var/www/fad/
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
curl -fsS "https://admin.friday.mu/version.json?_=$(date +%s)"
curl -fsS "https://admin.friday.mu/api/version?_=$(date +%s)"
```

`docs/deploy.md` has the full canonical sequence + authed smoke pattern + rollback.

## Post-compact pickup prompt (paste back to me after `/compact`)

```text
Smart-compact recovery. Read these in order:
1. docs/handover/2026-05-23-smart-compact-anchor.md (the doc I just wrote)
2. docs/FAD_BACKLOG.md (persistent pending-tasks list)

Verify state:
- git status (should be clean on fad-rebuild)
- git log --oneline -5 (tip a70182bb)
- curl https://admin.friday.mu/version.json (fab440ed)
- curl https://admin.friday.mu/api/version (a70182bb)

Then wait for my pick from the "Open items waiting on Ishant"
section OR the "Queued for next solo session" list. Do NOT
auto-pick — ask first.

Guardrails for this session: no deploy without explicit ack;
Gemini 3.5 Flash primary / Kimi 2.6 fallback / Sonnet 4.6 third;
image gen ONLY in 2 design surfaces on gemini-3-pro-image-preview;
git author Judith Friday <judith@friday.mu>; never paste secrets in chat.
```

That's the smart-compact contract: a snapshot doc + a pickup prompt that points at it.
