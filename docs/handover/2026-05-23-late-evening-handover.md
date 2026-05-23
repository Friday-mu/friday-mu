# FAD Session Handover — 2026-05-23 (late evening)

> Successor pickup doc for the late-evening session that followed the morning's
> "essential systems" deploy (`1fec863` → `50ecdf4`) and the day's Tier-1 sweep
> (`deb49bd`). Canonical pending-tasks list is `docs/FAD_BACKLOG.md` — read it
> after this file.

## Live state

- **Repo**: `/Users/judith/repos/friday-admin-dashboard`
- **Branch**: `fad-rebuild` (clean, all pushed)
- **Live commit**: `d6f283d52f4beea814dc332e88a7869a9234747b` (short: `d6f283d5`) — frontend + backend
- **Live URL**: `https://admin.friday.mu`
- **PM2 process**: `fad-backend` online, port 3002 (restart count 247 today)
- **SSH identity**: `~/.ssh/do_friday_admin`
- **DB migrations applied through**: `076_expenses_path_a.sql`

VPS disk is at 90% — `2.5G free`. Backups eat the space. Worth a `du -sh /var/backups/*` audit before the next sprint to prune older snapshots.

## What shipped today (rolled-up)

This session covered most of Tier 1 + Tier 2 + Tier 3 strategic unlocks. Backlog has the per-item line items; here's the rolled-up commit list since the morning deploy:

```
40e58010  docs(backlog): refresh after strategic batch
d6f283d5  feat(ask-friday): T3.1 — context pack admin UI (Core Slice 3)
3f754a63  feat(ask-friday): T2.7 — KB candidate review queue UI (Core Slice 2)
d352f63d  fix(inbox): T2.2 — "Reply" → "AI draft"
e5e3c6b1  fix(pwa): T2.8 — touch targets in Ops + Inbox card internals
a06528c2  feat(inbox): T2.1 — reservation context drawer for narrow viewports
db635c20  docs(backlog): refresh Recently Shipped log
0dbf21a2  fix(calendar): T1.3 partial — bump month-day font + document gaps
e41343a9  docs: T1.6 — stale deploy artifact + path cleanup (-504 / +144)
5872dda1  docs(backlog): T1.2 audit — Guesty bookings do NOT auto-create Ops tasks
ef0fd30f  chore(finance): T1.4 — remove dead CaptureDrawer mock (-346)
4d9f6543  docs: living FAD backlog — call-on-demand pending-tasks doc
e9db5dfe  feat(finance): expense capture slice 3c — DO Spaces opt-in storage
520d314f  feat(finance): expense capture slice 3b — Path B admin-direct drawer
d2e1b170  feat(finance): expense capture slice 3a — live approval-tier preview
```

Plus the earlier morning batch (`deb49bd`, `5c1734d`, `e129401`, `0b289ca`, `a919ffb` + handover docs).

Two prod deploys this session:
- **`d352f63d`** at ~20:05Z — caught up the Tier-1 sweep + slice 3a/3b/3c + T2.1 + T2.2 + T2.8. Added 47 npm packages on VPS (DO Spaces SDK).
- **`d6f283d5`** at ~20:18Z — added T2.7 + T3.1 (Ask Friday review module + Context packs admin).

## Major user-visible changes since this morning

| Surface | Change |
|---|---|
| **Sidebar (director)** | New "Ask Friday review" entry in the System group. Mode toggle inside: KB candidates ↔ Context packs. |
| **Inbox (mobile + tablet)** | "Reservation" button in thread header opens a slide-in drawer with full reservation context — financials, payment status, special requests, guest contact, AI handoff state. Was completely hidden below 1180px before. |
| **Inbox** | "Reply" chip + thread-row badge renamed to "AI draft" (the chip filters AI-drafted replies awaiting operator approval, not threads where guests are awaiting our reply — the label was misleading). |
| **Operations (mobile)** | Status filter chips (Open / Reported / Scheduled / Ready / Active / Blocked / Done / All) bumped from 28px → 38px hit height. Sub-page tabs (My tasks / All tasks / Schedule / Roster / Insights) bumped from 26px → 40px. |
| **Inbox (mobile)** | Filter chips 24px → 38px hit height. Collapse-toggle button 28×28 → 40×40. |
| **Expense capture drawer** | Live approval-tier preview chip below Amount — green/amber/red routine/medium/major. Path B (admin direct, no task) mode with property picker. DO Spaces storage opt-in once VAPID-style env vars land (currently inline base64 fallback). |
| **Capture Expense entry from Finance** | Old mock CaptureDrawer is gone; the real OCR-powered drawer opens. |
| **Calendar** | Month-view day numbers 11px → 13px (less cramped). Real bugs (dups, date-line) still need prod pairing — local layout is correct. |
| **Push notifications** | VAPID key was misconfigured (private only, public missing) for 5+ weeks. Public key derived from the existing private via P-256 ECDH, added to .env, pm2 restarted. `/api/push/vapid-key` now returns the correct public; full subscribe→send loop functional. |

## What's parked + needs you

These items I deliberately did NOT grind on because they need your input. Listed in suggested next-pair-session order:

1. **T1.1 — Hand-test the prod deploy with me.** Bryan field-only login → Operations My tasks landing; open a task → "Capture expense" → upload a receipt → confirm OCR auto-fills; drag a task in the schedule planner → "Drop at HH:MM" tick; tap "Reservation" in a thread header (on phone) → context drawer slides in; visit Ask Friday review module → confirm it renders; opt into push notifications and confirm a test push fires.

2. **T1.3 — Calendar real bugs.** Local layout is correct with no data. Open the calendar with real reservations and screenshot the actual "dups" + "bad date-line" you see — 10-min pair, 30-min fix.

3. **T1.7 — Floor-plan studio QA.** Memory says it shipped 2026-05-16 UNTESTED. I need your direction on what scenarios to drive (a specific project? a fresh upload? generate full pack?). Pair-test or hand it to me with a spec.

4. **T2.4 — Bug #5 Mary inbox fluctuation** (`434b9435`) — needs Mary to share a screen recording. Without repro I can't act.

5. **T3.5 — GEMINI_API_KEY rotation** — security debt (key was pasted in chat several times). Walk-through pattern: Google AI Studio → 1Password Shared Vault → SSH + `vi /var/www/fad-backend/.env` → `pm2 restart fad-backend --update-env`. Don't paste the new key in chat.

6. **First context pack content for `fad_consult`.** Open product decision per the Core handover: manual-authored first vs. generated-from-approved-KB-candidates first. UI is in place (T3.1) — needs your call on what goes IN the first pack.

7. **VPS disk cleanup** — 90% full, 2.5G free. Prune old `/var/backups/fad-{frontend,backend}-pre-*` snapshots, keep last 5.

8. **T4.26–T4.29 product calls** — Franny 10:47 separate-guest handoff, translation parity, inline Consult proposals, guest-language memory.

## What's queued for the next solo session (Tier 3+ leftovers)

These I can do solo when given the go but didn't tackle in this session — they're either large or strategic-but-not-blocking:

- **T3.2 — Multi-tenant safety sweep** (L, audit across Ask Friday / Inbox / Ops / Notifications / module clients)
- **T3.4 — Website event emitters** (L, needs a separate Friday Website session — strict boundary)
- **T3.6 — Booking-triggered Ops task automation** (L, scope first: which event types, which templates, timing, assignment, idempotency)
- **T4.1 — Slice 4 scheduled analyzer worker** (M)
- **T4.2 — Slice 5 FAD frontend reads Core as policy source** (M-L)
- **T4.3 — Slice 7 model-backed eval grading** (M)
- **T4.4 — Slice 8 public MCP V1 design** (XL — design first)
- **T4.5 — Slice 9 retention/redaction worker** (M-L)
- **T4.12-T4.21** — Operations per-screen real-data audit
- **T4.22-T4.25** — Expense slice 3d polish (signed-URL display, vendor autocomplete, FX, drawer mode toggle)
- **T4.34** — Optimistic update layer (mutations still wait round-trip; today's SWR fix only covered reads)

## Strategic constraints (still hold, don't re-litigate)

- `fad-rebuild` canonical
- No deploy without explicit Ishant ack (Ishant gave blanket ack for this session)
- Git author: `Judith Friday <judith@friday.mu>`
- Don't edit FAD and Friday Website in the same checkout
- AI: Gemini 3.5 Flash primary / Kimi 2.6 fallback / Sonnet 4.6 third
- Image gen ONLY in 2 design surfaces on `gemini-3-pro-image-preview`
- Mary handover NOT in scope (Ishant owns)
- Director is the V1 reviewer for Ask Friday Core

## Quick-reference deploy commands

For the next session that needs to ship code:

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
   node --check src/<changed-file>.js && \
   GIT_COMMIT=${SHA} APP_VERSION=${SHORT} BUILD_TIME=${NOW} \
   pm2 restart fad-backend --update-env"
curl -fsS "https://admin.friday.mu/version.json?_=$(date +%s)"
curl -fsS "https://admin.friday.mu/api/version?_=$(date +%s)"
```

Full canonical sequence + authed smoke + rollback in `docs/deploy.md`.

## Open Slack-able items (so Ishant can ping Mary / others)

- **Mary** — Bug #5 inbox fluctuation needs a screen recording / repro steps.
- **Mary** — Vendor CSV for the expense capture autocomplete (T4.22) before 2026-05-25.
- **Mathias** — first Path B expense capture as a smoke test of the new admin drawer in Finance.
- **Bryan / Catherine / Mary** — push notifications now work. After they re-login + opt-in, the next system push will reach them.
- **Franny** — the AI-draft chip rename (Reply → AI draft) addresses her usability question about the chip label.
