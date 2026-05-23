# FAD Backlog — Living Document

> **When Ishant says "look at our pending tasks for FAD, let's continue", this is the file to read.**
>
> Last reviewed: **2026-05-23** (Judith — after the slice 3 batch).
> Live on prod: frontend `deb49bd` · backend `bf166c9`.
> Tree tip on `fad-rebuild`: `e9db5df` (5 frontend-only + 1 backend-only commits ahead of live).

## How to use this doc

1. **Quick wins (Tier 1) first.** Small effort, real team impact. Sweep these aggressively.
2. **Then team-blocking (Tier 2).** Park any sub-item flagged "hard — needs scoping" instead of grinding on it.
3. **Then dependency-blocking (Tier 3).** Things that unblock website / multi-tenant / stay portal launch.
4. **Then re-read the scoping docs** before attacking Tier 4. Strategic context may have shifted.
5. **Tier 4 is the rest.** Don't pick from here without re-scoping unless explicitly asked.

Each item has:
- **Effort**: XS (<1h) · S (1-3h) · M (half-day) · L (1-2 days) · XL (multi-day, needs scoping)
- **Blocks**: who/what is held up if we don't ship this
- **Status**: open · in-progress · parked-hard · waiting-on-ishant · needs-repro

Strike through completed items, move to "Recently shipped" log at the bottom.

---

## Tier 1 — Quick wins (sweep first)

### T1.1 — Hand-test today's prod deploy with Ishant
- Effort: S · Blocks: confidence in 5 unverified live commits · Status: open
- Bryan field-only login → My tasks default landing
- Open a task → "Capture expense" → upload receipt → Gemini OCR auto-fill
- Schedule planner: drag a task → "Drop at HH:MM" tick lands precisely
- Tier preview chip in expense drawer fires on amount change
- Sidebar nav items reachable (44px) on mobile

### T1.2 — Booking automation audit (Guesty → Ops task) ✓ audited 2026-05-23
- **Answer: NO.** Guesty bookings do not auto-create Ops tasks.
- Webhook at `backend/src/reservations/webhook.js` upserts the reservation row + refreshes calendar cache. That's it. No PubSub, no DB trigger, no async hook.
- Only auto-task creators in the system:
  - `tasks/breezewayImport.js` — bulk Breezeway sync (not Guesty)
  - `design/jobs/auto_tasks.js` — design-module scanner (blockers / overdue / payment blocked / budget variance / task overdue)
- **Follow-up scope (new item, promoted to Tier 3): T3.6 — Booking-triggered task automation.** See below.

### T1.3 — Calendar cleanup (Ishant explicitly bumped)
- Effort: M · Blocks: **calendar module unusable** · Status: open
- Duplicate reservations — dedup logic missing or broken
- Bad/clipped date-line UI
- Cross-links to Operations, Reservations, Properties, Inbox
- Recover prior Calendar work if regressed
- *Note*: per `ops-convergence-handover.md`, Calendar was parked for a future slice. That slice is now.

### T1.4 — Old CaptureDrawer mock removal ✓ shipped 2026-05-23
- Removed in commit (this batch). 338 lines deleted: `CaptureDrawer` + `ReceiptExtraction` + `CaptureProps` interface + orphaned `captureMode` state + orphaned `ApprovalTier` import.

### T1.5 — Update banner stale-asset detection verification ✓ verified 2026-05-23
- Code review of `UpdateBanner.tsx` confirms polling is correctly wired:
  - `setInterval(check, 5*60_000)` — 5-min cadence ✓
  - Plus `focus` + `visibilitychange` triggers when tab activates ✓
  - 60s throttle prevents duplicate checks
  - Cache-busted `/version.json?t=<ts>` fetch
  - Compares to in-memory `knownVersionRef`; sets `updateAvailable=true` on mismatch
- No bugs. Live functional smoke deferred — would require leaving a tab open + waiting through a real deploy.

### T1.6 — Stale deploy docs cleanup ✓ shipped 2026-05-23
- Rewrote `docs/deploy.md` with canonical rsync flow (frontend → `/var/www/fad/`, backend → `/var/www/fad-backend/`, pm2 restart `fad-backend`, version stamp, backup, migration one-liner, authed smoke).
- Fixed 3 stale `/var/www/friday-dashboard` references in `CLAUDE.md`.
- Replaced the dead `./deploy.sh production` line in `README.md` with a pointer to docs/deploy.md.
- Deleted `deploy.sh` + `deploy-production.sh` (both referenced Docker setup that no longer exists).

### T1.7 — Floor-plan studio testing
- Effort: S-M · Blocks: knowing if Design SaaS W2-W5 work actually works · Status: open
- Per memory `fridayos_design_saas.md`: shipped 2026-05-16 but UNTESTED.
- QA pass through the floor-plan studio surface; file bugs as found.

### T1.8 — Dead-code regex `parseNl` removal
- Effort: XS · Blocks: nothing · Status: open
- Already reclassified to offline-fallback (PROD-LOGIC-4) but never deleted.
- Smart drafter (slice 2 of the AI task creation) is the replacement.

---

## Tier 2 — Blocking the team

### T2.1 — Inbox: reservation side panel restoration
- Effort: M · Blocks: Mary, Bryan, Franny daily inbox context · Status: open
- Restore guest count, financial details, payment / status, reservation status, stay context
- Live API wiring; not fake.

### T2.2 — Inbox: awaiting-reply behavior + placement
- Effort: S-M · Blocks: triage flow · Status: open
- Behavior and placement of the "awaiting reply" indicator.

### T2.3 — Push notifications + VAPID env check
- Effort: M · Blocks: field staff getting real-time task pings · Status: open
- Verify VAPID public/private in prod env
- Browser permission flow + service worker registration
- In-app feed wiring
- Email fallback / backoff verified

### T2.4 — Bug #5 Mary inbox fluctuation (`434b9435`)
- Effort: ? · Status: **needs-repro** (waiting on Mary's browser recording)
- Can't act without repro. Ping when Mary supplies.

### T2.5 — Missed auto-drafts investigation
- Effort: M-L · Blocks: Franny / Mary trust in auto-draft system · Status: **parked-hard**
- Open-ended root-cause hunt. Park until a specific repro lands.

### T2.6 — Draft quality + stale-draft safety
- Effort: L · Blocks: outbound message quality · Status: **parked-hard**
- Open-ended. Needs scoping doc + concrete failure cases first.

### T2.7 — Ask Friday Core Slice 2: KB review queue UI
- Effort: L · Blocks: **entire learning loop** (no events → canonical knowledge yet) · Status: open
- Staff list / filter `ask_friday_kb_candidates`; approve / reject / needs-info.
- Reviewer + audit fields; no auto-publish.
- This is strategic, not day-to-day-blocking. But it unblocks every future Slice 3+.

### T2.8 — Touch target follow-up on Ops + Inbox internals
- Effort: S-M · Blocks: continued PWA usability complaints · Status: open
- PWA pass today covered shell + sidebar. Card-internal buttons (filter chips, action icons) likely still <44px.

---

## Tier 3 — Blocking other things (dependency)

### T3.1 — Ask Friday Core Slice 3: Context pack publishing flow
- Effort: M · Blocks: Slice 5 (FAD consuming Core) + Slice 6 (Website consuming Core) · Status: open
- DB has 0 published packs.
- Seed/create first draft pack for `fad_consult`; publish via staff action; record version + approver.

### T3.2 — Multi-tenant safety sweep
- Effort: L · Blocks: rolling FAD out to non-FR tenants · Status: open
- Audit Ask Friday, Inbox, Ops, Website handoff, Notifications, module clients for tenant safety.
- No cross-tenant data in global context loaders.

### T3.3 — Stay portal coordination
- Effort: M · Blocks: Stay Portal launch · Status: open
- Read `/Users/judith/Friday Website/docs/FAD-STAY-TOKEN-API-CONTRACT-2026-05-21.md`
- Confirm FAD backend contract + Inbox/Ops handoff paths.

### T3.4 — Website event emitters (separate session)
- Effort: L · Blocks: Ask Friday learning loop · Status: open
- Friday Website surfaces emit redacted `learning_event` to FAD's `/api/ask-friday/core/learning-events`.
- Must be done in a separate Friday Website session, not FAD.

### T3.6 — Booking-triggered Ops task automation (NEW, promoted from T1.2 audit)
- Effort: L · Blocks: cleaner-arrival readiness, departure-day flow, guest-arrival prep · Status: open, needs scoping
- Per audit T1.2: Guesty reservations do not trigger task creation. Field team currently has to manually queue cleanings / arrivals / departures.
- Scope decisions needed (Ishant call):
  - Which event types create tasks? `reservation.confirmed` only? Or also `.updated`?
  - Which task templates fire? Pre-arrival inspection? Cleaning? Welcome-message? Departure inspection? Reset?
  - Timing: when before check-in? when after check-out?
  - Assignment: round-robin field team? Property-zone routing?
  - Avoid duplicates: idempotency via reservation_id + template_id
- Possible implementation: extend `backend/src/reservations/webhook.js` post-upsert hook → call a new `taskAutomation.fromReservation(reservation, eventType)` that consults a tenant-level rules table.

### T3.5 — GEMINI_API_KEY rotation
- Effort: XS · Blocks: security debt (key pasted in chat) · Status: **waiting-on-ishant**
- Walk-through: Google AI Studio → SSH → `pm2 restart fad-backend --update-env`.
- Don't accept new key in chat — use 1Password Shared Vault.

---

## Tier 4 — Other backlog (re-scope before attacking)

> Re-read `docs/handover/2026-05-23-fad-essential-systems-claude-code-handover.md` + Notion scoping pages before picking from here.

### Ask Friday Core remaining slices
- **T4.1 — Slice 4**: Scheduled analyzer worker (effort: M)
- **T4.2 — Slice 5**: FAD frontend reads Core as policy source (effort: M-L)
- **T4.3 — Slice 7**: Model-backed eval grading (effort: M)
- **T4.4 — Slice 8**: Public MCP V1 design + later implementation (effort: XL — design first)
- **T4.5 — Slice 9**: Retention / redaction worker (effort: M-L)

### Module real-data audits
- **T4.6 — Reviews**: confirm live API data, no fake (effort: S)
- **T4.7 — HR**: confirm editable backend-wired version present (effort: S)
- **T4.8 — Design**: confirm recovered Design module + projects (effort: S)
- **T4.9 — Training**: confirm teachings are real + editable (effort: S)
- **T4.10 — Notifications**: confirm no demo-backed data (effort: S)
- **T4.11 — Manage section recovery** (effort: M — needs discovery)

### Operations real-data audit (screen-by-screen)
- **T4.12 — Overview** (effort: S)
- **T4.13 — All Tasks** (effort: S)
- **T4.14 — Reported Issues** (effort: S)
- **T4.15 — History** (effort: S)
- **T4.16 — Roster** (effort: M — AI affordances lost during data-wire refactor; restore only if backed by real data)
- **T4.17 — Insights** (effort: M — thin/empty; needs real-data audit, no fake cards)
- **T4.18 — Settings** (effort: S)
- **T4.19 — Schedule Planner** functional audit (effort: M)
- **T4.20 — Comment mention UI cleanup** — TeamInbox-style `@` autocomplete (effort: M)
- **T4.21 — Field access + HR permissions regression** pass (effort: S — partially done today)

### Slice 3d expense polish
- **T4.22 — Vendor autocomplete from `vendors` table** (depends: Mary CSV — parked) (effort: S)
- **T4.23 — Signed-URL display flow** — `GET /api/expenses/receipts/:id` so receipts can be re-viewed (effort: M)
- **T4.24 — Path B drawer mode toggle** in header (operator switches A↔B mid-flow) (effort: S)
- **T4.25 — Live FX conversion** for EUR/USD tier preview (effort: S — but needs live FX feed plumbed to drawer)

### Product calls (need Ishant decision before scoping)
- **T4.26 — Franny 10:47 separate guest / AI handoff** — UX product call
- **T4.27 — Translation parity** — manual translate currently translates outbound; old GMS was inbound-only
- **T4.28 — Inline Consult proposals** for actions / learnings / finance captures
- **T4.29 — Guest-level preferred-language memory**

### Audits (deferred per Ishant)
- **T4.30 — Speed audit** — Lighthouse + Chrome perf trace, half-day
- **T4.31 — Security audit** — env / auth / RLS / deps / secret scan, half-day

### Parked / repository hygiene
- **T4.32 — 11 `agent-be-*` branches** — May-13 design backend work, never reconciled (effort: variable)
- **T4.33 — WhatsApp burner bridge** — parked; blocked on QR/pairing
- **T4.34 — Optimistic update layer** — mutations still wait round-trip; today's SWR fix only covered reads

---

## Strategic constraints (locked, not re-litigable)

From `CLAUDE.md` + Notion running decisions log `34f43ca88492819f8284ea6a89e8624e`:

- **fad-rebuild is canonical** — never use `fad-design-os-v01-*` branches as truth
- **No deploy without explicit Ishant ack**
- **Git author**: `Judith Friday <judith@friday.mu>` (hook-enforced)
- **AI models**: Gemini 3.5 Flash primary / Kimi 2.6 fallback / Sonnet 4.6 third — image gen ONLY in 2 design surfaces on `gemini-3-pro-image-preview`
- **Mary handover NOT in scope** (Ishant owns it directly)
- **Protected migrations**: `050_tasks.sql` through `054_*.sql`, `071_tasks_ops_lifecycle_reconcile.sql` — coordinate before touching
- **User-facing global AI surface**: **Ask Friday** (no alternate product names in UI/docs/public copy)
- **No direct self-updating production truth** — human approval gate on canonical learning
- **Don't edit Friday Website and FAD in the same checkout/session**

---

## Recently shipped (rolling log — newest first)

### 2026-05-23 (today, this session)
- **Slice 3c — DO Spaces opt-in receipt storage** (`e9db5df`) — backend only, env-var-gated
- **Slice 3b — Path B admin-direct drawer** (`520d314`) — refactor + Finance wire-up
- **Slice 3a — Approval-tier live preview** (`d2e1b17`) — color-coded chip in Capture drawer
- **PWA mobile touch targets** (`deb49bd`) — sidebar nav 44px, drawer header buttons 40px
- **PWA infrastructure** (`5c1734d`) — `100dvh`, safe-area-inset-top, touch-action, FAB hit target, drawer width
- **Field-staff default route** (`e129401`) — lands on Operations → My tasks instead of Ask Friday
- **FAB scroll-trap + drawer overflow** (`0b289ca`) — bug-report submit reachable on mobile PWA
- **Stale-while-revalidate sweep** (`a919ffb`) — 13 hooks no longer blink on refetch
- **End-of-day handover doc** (`4eebb1e`)
- **Schedule planner 15-min snap** (`50ecdf4`)
- **Expense capture slice 2 — Path A drawer from TaskDetail** (`bf166c9`)
- **Expense capture slice 1 — schema + backend MVP** (`10ee65f`)
- **Real per-user FAD roles + CreateTask + Task Detail simplify** (`3847d4b`)
- **Smart AI task creation drawer** (`099f386`)
- **Bug #1 — Ask Friday inbox context scoping** (`ebceb26`)

### 2026-05-23 (earlier, via PR #4 merged 07:00:50Z)
- Ask Friday Core schema + scaffold (`074_ask_friday_core.sql`)
- Ask Friday FAB / composer polish (Stop, queue, dictation, action cards)
- Live-data truth gates (Finance sidebar, Notifications, Calendar overlap query)
- Ask Friday Gemini routing
- Update banner 5-min `/version.json` poll
- Merged at `1fec8633a36ea1c282441924e0c63c5da1fa0371`

---

## Maintenance notes for future-Judith

- This file replaces ad-hoc end-of-day handovers as the **persistent source of truth** for pending FAD work.
- End-of-day handovers can still capture session-specific context (what was thinking, why), but the backlog lives here.
- Strike or move shipped items into "Recently shipped" with date + commit SHA.
- When a Tier-2 or Tier-3 item gets a repro / new scope, promote it to a higher tier.
- When effort estimate changes after investigation, update the effort tag.
- Don't let Tier 4 leak into Tier 1 without explicit Ishant ack — the tiering is intentional.
