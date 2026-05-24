# FAD Backlog — Living Document

> **When Ishant says "look at our pending tasks for FAD, let's continue", this is the file to read.**
>
> Last reviewed: **2026-05-24** (Judith — after Calendar Month-view refactor + T1.10 array-safety sweep).
> Live on prod: frontend `a1a77988` · backend `0306bbba`.
> Tree tip on `fad-rebuild`: `a1a77988` (live).

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

### T1.3 — Calendar cleanup (Ishant explicitly bumped) — partial, needs prod pairing
- Effort: M · Status: **partial-shipped; rest blocked on prod data**
- ✓ Local investigation findings:
  - Layout / CSS render correctly in Agenda / Day / Week / Month views with mocked empty data.
  - `dedupeRawReservations()` in `reservationsClient.ts` is sound (semantic stay-identity → confirmation-code → guesty_id fallback, completeness-scored on collision).
  - Cross-links ARE wired: clicking a stay navigates to `?m=reservations&sub=overview&rsv=<id>` (CalendarModule.tsx:1255, 1771).
  - The "calendar unusable" feel is mostly **no backend data** (every cell says "Nothing scheduled") + minor density issues.
- ✓ Micro-improvement shipped: month-view day numbers bumped from 11px → 13px (mobile 10→12) to match Week-view consistency and reduce the cramped "clipped-looking" effect against dark grid lines.
- ✗ **Still need prod pairing to reproduce**:
  - "Duplicate reservations" — only repros with real Guesty data feeding dedup edge cases.
  - User-visible "bad/clipped date-line" — no clipping found in local repro; if Ishant has a specific screenshot/repro this should be quick.
  - "Recover prior Calendar work if regressed" — requires git history vs current-behavior diff with Ishant in the loop.
- **Recommendation**: when next paired on prod, open the Calendar with real data and screenshot the actual visible bugs. 10-minute pair → 30-min fix.

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

### T1.9 — Hardcoded TODAY constants (gate behind liveOnlyMode)
- Effort: S-M · Blocks: real-time correctness in demo + future-proofing prod · Status: open (re-scoped 2026-05-24)
- Actual current state (verified 2026-05-24): only 3 files still pin `'2026-04-27'` (DEMO_CRUFT entry was stale):
  - `_data/reviews.ts:216` `const TODAY_ISO = '2026-04-27';`
  - `_data/pendingCounts.ts:27-30` `const TODAY = '2026-04-27';` + 3 derivatives (TODAY_MS / TODAY_DAY / TODAY_MONTH)
  - `_components/modules/hr/StaffPage.tsx:22` `const TODAY = '2026-04-27';`
- CalendarModule, OverviewPage, AllReservationsPage, RosterPage already use `new Date()`. InquiriesPage + notifications.ts have no current TODAY pin.
- Fix is NOT a simple swap to `new Date()` — the fixtures themselves are anchored to 2026-04-27, so live TODAY against fixture dates would surface "due 27 days ago" everywhere. Real fix: gate the constant behind `liveOnlyMode()` (use fixture anchor in demo, real now in prod), AND audit each cascaded "in N days" / "M days ago" use site for sanity.
- Production risk today is LOW because `liveOnlyMode()` already suppresses fixture-derived urgency. Keep on backlog but not urgent.

### ~~T1.10 — Brittle `array[0]` crash safety~~ ✓ shipped 2026-05-24 (`f9d375d6`)
- Audit found 7 real sites in FinanceModule (Owner Statements, Tourist-tax summary, Float Ledger, Bank Recon, Bank Upload Drawer). All fixed with lazy `useState` initializers (`() => FIN_X[0]?.id ?? ''`) and empty-state JSX in the two sub-pages that depend on a selected record.
- InboxModule, TeamInbox, FridayDrawer were ALREADY safe (`if (visibleChannels[0])` guards + `?.name.split() ?? 'there'`). Documented in commit message so future audits know to skip those.

---

## Tier 2 — Blocking the team

### T2.1 — Inbox: reservation side panel restoration ✓ shipped 2026-05-23
- Investigation finding: the `ReservationRightPanel` component IS comprehensive (Reservation / Financials / Guest / AI handoff / Actions sections, all wired to `thread.reservation`). The bug was that **`@media (max-width: 1180px) { .inbox-right { display: none; } }`** hid the entire panel on tablet + mobile + small laptops.
- Fix: added a slide-in **"Reservation context" drawer** for narrow viewports (≤1180px). Same `ReservationRightPanel` content. Triggered by a new "Reservation" button in the thread header (only visible when narrow). Desktop ≥1180 keeps the existing inline sidebar.
- Drawer uses the standard `.fad-drawer` slide-in — full-width on mobile (via the 2026-05-23 PWA fix), capped at 420px on tablet. Safe-area-inset-bottom respected.

### T2.2 — Inbox: awaiting-reply behavior + placement — partial, name-clarified
- Effort: S · Status: partial-shipped
- Investigation: the "Reply" chip + thread-row badge previously labelled "Reply" actually filter on `latestDraftState ∈ {draft_ready, under_review}` — i.e. AI drafts awaiting operator approval, NOT threads where the guest is awaiting our reply. Confusing read.
- Shipped: renamed both surfaces "Reply" → "AI draft" + switched IconClock → IconSparkle to match the AI semantics. Tooltip clarified ("Friday AI draft awaiting your approval before send"). The chip badge in thread rows likewise switched.
- ✗ Still open (parked-hard until backend support): a true "guest awaiting our reply" filter would need backend to expose `last_message_direction` on the list response (or a derived `awaiting_response_from` flag). Today's list-only data doesn't include message direction. Promotable to Tier 3 when backend slices land.

### T2.3 — Push notifications + VAPID env check ✓ shipped 2026-05-23
- Discovery: prod .env had `VAPID_PRIVATE_KEY` only — `VAPID_PUBLIC_KEY` was missing. Backend `setVapidDetails()` was silently failing → no pushes ever fired despite 4 stale subscriptions from April.
- Fix: derived the public key from the existing private (P-256 ECDH via Node crypto), wrote it + `VAPID_SUBJECT=mailto:ops@friday.mu` to `/var/www/fad-backend/.env`, `pm2 restart fad-backend --update-env`. `/api/push/vapid-key` now returns the correct public key.
- Frontend was already wired: `frontend/public/sw.js`, registered in `layout.tsx:52`, `usePushNotifications.ts` fetches the VAPID key + subscribes via pushManager.
- Backend send path verified: `sendPushToUsers()` exists, handles 404/410 auto-cleanup of stale subs.
- 4 April subscriptions will silently 410 on next send (they couldn't authenticate without a matching VAPID public anyway); operators just need to re-trigger Push opt-in.

### T2.9 — Recent Friday Consult bug reports (2026-05-23 batch)
- Effort: M total · Status: 2 fixed in this session, 3 still need investigation.
- Triaged from prod `feedback` table:

| ID | Reporter | Time | Status | Notes |
|---|---|---|---|---|
| `77ff359b` | Ishant | 20:28Z | **BOTH PARTS FIXED + LIVE** | Part 1 (modal buttons): `.btn` CSS now scoped to portalled overlays. Part 2 (action_failed): `tasks.create` MCP whitelist was using `'todo'` / `'awaiting_approval'` which migration 071 removed from `tasks_status_check`. Default flipped 'todo' → 'scheduled' + schema enum updated to match the live DB constraint. Ask Friday → Ops task creation works now. |
| `de14cf58` | Franny | 12:57Z | **FIXED + LIVE** | Root cause was a logic bug: `generateDraftReply` pre-filled `model = model \|\| DRAFT_MODEL` so the `wantsExplicitKimi` check tripped on every default-routed call, permanently bypassing Gemini-first. Inbox was doing 100% of guest drafts on Kimi K2.6 with 60-150s latencies. Fixed by tracking `explicitKimiPin` as a separate flag from the model param. Expected p50 latency drops ~60s → ~10-15s once Gemini takes over. |
| `12728dbe` | Franny | 11:08Z | **FIXED + LIVE** | task_parser.js `shapeProposed` was passing the AI's title through `cleanString(_, 180)` so Gemini's occasional over-72-char title leaked into the task field. Fixed by enforcing a 72-char cap with word-boundary truncation + ellipsis. 2 new tests cover the over-length and short-input paths. |
| `77914bf2` | Franny | 11:00Z | **FIXED this session** | Path B drawer property dropdown only showed OFFICE because PROPERTIES wasn't hydrated. Fixed by calling `useHydratePropertiesFromGuesty()` inside `CaptureExpenseDrawer` + memoising on `propertiesRev`. |
| `f6b7791b` | Franny | 10:52Z | **Already fixed** (live in `d6f283d5`) | "Report option not showing on tasks" — commit `b7c6f1b6` removed the `canEdit` gate on the Report-related-issue button. Fix landed ~30 min AFTER Franny's report. She needs a page refresh. |

### T2.5 — Missed auto-drafts investigation
- Effort: M-L · Blocks: Franny / Mary trust in auto-draft system · Status: **parked-hard**
- Open-ended root-cause hunt. Park until a specific repro lands.

### T2.6 — Draft quality + stale-draft safety
- Effort: L · Blocks: outbound message quality · Status: **parked-hard**
- Open-ended. Needs scoping doc + concrete failure cases first.

### T2.7 — Ask Friday Core Slice 2: KB review queue UI ✓ shipped 2026-05-23 (`3f754a6`)
- New "Ask Friday review" module under the System sidebar group. Director-only via `MODULE_RESOURCE['ask-friday-review']`.
- List/detail split layout: tabs (Pending / Needs info / Approved / Rejected / All), color-coded risk + trust chips, evidence summary card, click → detail pane with proposed-change JSON + source event IDs + Approve / Needs info / Reject actions.
- Backend routes were already in place at /api/ask-friday/core/kb-candidates — frontend-only commit + new typed client in `_data/askFridayCoreClient.ts`.
- Followup: scheduled analyzer worker (T4.1) is what *produces* candidates; without it the queue stays empty in normal operation. Manual `POST /analyzer/run` is the workaround.

### T2.8 — Touch target follow-up on Ops + Inbox internals ✓ shipped 2026-05-23
- Mobile audit on 375×812:
  - Ops: 12 small targets → 1 (avatar only). Fixed: 8x `.ops-status-chip` (28px→38px), 3x `.fad-tab` sub-pages (26px→40px) + min-height: 40px on `.fad-tab` mobile.
  - Inbox: 3 small targets → 1 (avatar only). Fixed: `.inbox-chip` (24px→38px), `.inbox-collapse-btn` (28x28→40x40).
- Net: 15 → 2 in two modules.

---

## Tier 3 — Blocking other things (dependency)

### T3.1 — Ask Friday Core Slice 3: Context pack publishing flow ✓ shipped 2026-05-23 (`d6f283d`)
- "Context packs" sub-section added to the Ask Friday review module. Mode toggle "KB candidates ↔ Context packs", URL-backed via subPage.
- New backend route `GET /api/ask-friday/core/context-packs` (staff list, filterable by status + surfaceId). Pre-existing `POST /context-packs` + `POST /context-packs/publish` reused — no change.
- UI grouped by surfaceId, version-desc, status pills (draft / approved / published / retired). "New draft" prompts for surface + version, creates an empty draft. "Publish" warns first then atomically flips to published + auto-approves referenced KB candidates (via the existing publisher.js code path).
- DB still has 0 packs — first concrete pack content remains a product call (open question per the Core handover: manual-first vs. KB-candidate-driven). UI is ready for Ishant to author once the first pack content is decided.

### T3.2 — Multi-tenant safety sweep — partial-shipped 2026-05-24
- Effort: L · Blocks: rolling FAD out to non-FR tenants · Status: **partial-shipped + new blocker logged**
- ✓ Audit complete for: `tasks/`, `inbox/conversations_read`, `inbox/consult`, `mcp/`, `fad/friday`, `expenses/`, `properties/` + `reservations/` (W1 today), `ai_usage`. All tenant-safe.
- ✗ **HIGH-severity known limitation surfaced**: `website_inbox/*` (~30 SQL sites on `inbox_threads` + `inbox_events` + `inbox_guesty_jobs`) — these tables have no `tenant_id` column (mig 033 is pre-multi-tenant). Acceptable today (FR-only) but a **blocker for non-FR rollout**. Server.js:1024 has the matching TODO.
- ✗ **Deferred audit**: `ask_friday_*`, `design_*`, `hr_*`, `push_subscriptions`, `learning_events`, `kb_candidates`, `context_packs`. Spot-checks during W1 work showed tenant_id usage; no exhaustive pass.
- **Full audit report**: [`docs/SECURITY_AUDIT_2026-05-24.md`](SECURITY_AUDIT_2026-05-24.md)
- **Promoted to new item**: **T3.7 — website_inbox tenant_id migration** (M-L, blocker for non-FR rollout). Schema migration + backfill + 30+ SQL updates + flow regression.

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

### T3.8 — Email integration completion (Gmail watcher + classifier dependencies)
- Effort: L · Blocks: inbound-email → Inbox-thread pipeline · Status: open (surfaced 2026-05-24 from backend TODO scan)
- Backend has stub paths waiting for Google Cloud Platform credentials + missing tables:
  - `backend/src/email/pull_worker.js:37` — "implement once gmail_client is reachable"
  - `backend/src/email/watcher.js:58` — "actual sync. Steps once GCP is wired"
  - `backend/src/email/classifier.js:85,91` — owners + vendors tables don't exist yet (Owners module Sep-2026 timeline)
  - `backend/src/team_inbox/index.js:978` — frontend should map roster IDs → real DB UUIDs before send (mentions)
- Probably should wait until Owners module backend lands (Sep-26) so classifier has its dependency tables. Capture here so it's not forgotten.

### T3.7 — website_inbox tenant_id migration (NEW, promoted from T3.2 audit)
- Effort: M-L · Blocks: non-FR tenant rollout (T3.2 closure) · Status: open
- `inbox_threads` + `inbox_events` + `inbox_guesty_jobs` + `inbox_drafts(?)` lack `tenant_id` columns (mig 033 era).
- ~30 SQL sites in `backend/src/website_inbox/*` operate without tenant filters; 2 routes (GET /threads, PATCH /threads/:id) don't even use `attachIdentity`.
- Fix: migration to add tenant_id + backfill FR + 30+ SQL updates + middleware additions + flow regression test (AI handoff, manual reply, mark-paid, draft approval, Guesty confirm worker).
- See [`docs/SECURITY_AUDIT_2026-05-24.md`](SECURITY_AUDIT_2026-05-24.md) §HIGH for the full inventory.

### T3.5 — GEMINI_API_KEY rotation
- Effort: XS · Blocks: security debt (key pasted in chat) · Status: **waiting-on-ishant**
- Walk-through: Google AI Studio → SSH → `pm2 restart fad-backend --update-env`.
- Don't accept new key in chat — use 1Password Shared Vault.

---

## Tier 4 — Other backlog (re-scope before attacking)

> Re-read `docs/handover/2026-05-23-fad-essential-systems-claude-code-handover.md` + Notion scoping pages before picking from here.

### Ask Friday Core remaining slices
- **T4.1 — Slice 4**: Scheduled analyzer worker ✓ shipped 2026-05-23 (`69e2caca`) — `backend/src/ask_friday/scheduler.js` runs every 30 min, looks back 24h, idempotent via candidate UPSERT. First-tick delay 90s after boot. Env-overridable; disable with `ASK_FRIDAY_ANALYZER_DISABLED=1`.
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
- **T4.23 — Signed-URL display flow** ✓ shipped 2026-05-23 (`fab440ed`) — `GET /api/expenses/:expenseId/receipts` + `GET /api/expenses/receipts/:id/content` (signed URL for DO Spaces / inline base64 fallback). TaskDetail expense rows now show clickable receipt count → opens a modal with thumbnails (images) + Open-in-tab links (PDFs / others). Added `@aws-sdk/s3-request-presigner` dep.
- **T4.24 — Path B drawer mode toggle** in header (operator switches A↔B mid-flow) (effort: S)
- **T4.25 — Live FX conversion** for EUR/USD tier preview (effort: S — but needs live FX feed plumbed to drawer)

### Product calls (need Ishant decision before scoping)
- **T4.26 — Franny 10:47 separate guest / AI handoff** — UX product call
- **T4.27 — Translation parity** — manual translate currently translates outbound; old GMS was inbound-only
- **T4.28 — Inline Consult proposals** for actions / learnings / finance captures
- **T4.29 — Guest-level preferred-language memory**

### Audits (deferred per Ishant)
- ~~**T4.35 — AI telemetry mislabel cleanup**~~ ✓ **shipped 2026-05-24 (`87b608c8`)** — local `callKimi` wrappers in `backend/src/design/ai_{rough_budget,ask,annex_b_edit}.js` + `backend/src/ai/translate.js` now expose `provider`, `model`, `promptTokens`, `completionTokens` from `runTextCompletion`. `recordUsage()` + JSON response shapes use the real values. Bonus fix: prompt/completion tokens are now populated correctly in the 3 design endpoints (`parseKimiUsage(result.data)` was reading an undefined field, so tokens were always null). Cost reports finally reflect Gemini-primary routing accurately.
- **T4.30 — Speed audit** — Lighthouse + Chrome perf trace, half-day
- **T4.31 — Security audit** — env / auth / RLS / deps / secret scan, half-day

### Parked / repository hygiene
- **T4.32 — 11 `agent-be-*` branches** — May-13 design backend work, never reconciled (effort: variable)
- **T4.33 — WhatsApp burner bridge** — parked; blocked on QR/pairing

### Calendar v0.2 follow-up (post-2026-05-24 banded refactor)
- **T4.38 — Calendar v0.2 enhancements** — effort: M-L · open
- Today's commit `bbb48408` shipped: true continuous bands per week (no per-cell segments), channel colors, status overlays, today badge, channel legend, mobile-safe sizing. **Open follow-ups**:
  - **Property × Date PMS view** (Guesty / Hospitable / Booking-extranet pattern): rows = properties, cols = days, stays = horizontal pills per property row. Eliminates "guest X across 3 calendars" perception by anchoring each stay to one property row. Add as new tab between Week and Month.
  - **Today vertical line** in Week/Day views — clearer "now" marker than column-shading.
  - **Occupancy heatmap** colour overlay (Month view): cells darken by % occupancy.
  - **Drag-to-reschedule** stay bands in Week/Day — calls `PATCH /reservations/:id` to nudge check-in/out times.
  - **Performance audit** with 100+ properties × 365-day window (real-data load test).
  - **Filter by property** chips above the grid (matches Reservations module filter UX).

### New initiatives (v0.1 scope drafts ready, await Ishant decisions)
- **T4.36 — Guest portal chat** (effort: 2-3 weeks once scope locks) — replace WhatsApp dependency for direct-booking + on-property guest messaging with a chat surface inside the guest portal. AI-augmented with full reservation + Property Cards context. Honest framing: complement to WhatsApp, not replacement (discovery friction kills pure-portal strategies). **Scope**: Notion [`36943ca8849281939417fad24d881f94`](https://www.notion.so/36943ca8849281939417fad24d881f94) (canonical) · repo mirror [`docs/scoping/2026-05-24-guest-portal-chat-v0.1.md`](scoping/2026-05-24-guest-portal-chat-v0.1.md). 15 open questions (channels, identity, notification, AI surfaces, OTA scope, auth, integration, etc.). Cross-cuts: Friday Website (separate session per AGENTS.md), Guests module v0.2, Inbox channel taxonomy.
- **T4.37 — Field-staff map + opt-in telemetry** (effort: 1-2 weeks) — TWO parts. **Part A (build)**: live Ops map showing where field staff are during shifts. Solves "where's Bryan?", "fastest cleaner to LB-2?", "Ravi at airport yet?" Builds on existing `analytics_events` (mig 068) + VAPID push + PWA infra. **Part B (defer)**: generic FAD usage analytics — needs a real question first; current `analytics_events` substrate enough for targeted queries. **Scope**: Notion [`36943ca884928170897edda4660ee133`](https://www.notion.so/36943ca884928170897edda4660ee133) (canonical) · repo mirror [`docs/scoping/2026-05-24-field-staff-map-v0.1.md`](scoping/2026-05-24-field-staff-map-v0.1.md). 12 open questions (opt-in model, accuracy/PWA-install requirement, update frequency, storage, retention, display, scope, privacy).

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

### 2026-05-24 (today, this session)
- **Properties Overview restructure + module-wide audit pass** (`a1a77988`) — Ishant flagged "MV-1 not pulling from Guesty" (it WAS pulling, just invisible because Overview's "Needs attention" listed 33 paused properties before "Recently active"). Restructured Overview: Recently active moved above alerts, filtered to live + onboarding (the working portfolio), capped at 12 cards. Alerts filtered to truly urgent items only (paused-no-return / onboarding-stalled / live-no-photos). Full module audit found Properties + Reservations + Ops all healthy and backend-wired: 60 properties, 210 reservations, 100+ tasks, 7 staff, 18 website inquiries — all rendering with real data. Three small follow-ups logged: T1.11 (occupancy/ADR computation), T1.12 (owner name "o-guesty-unknown"), T1.13 (slow initial render on Insights/Inquiries).
- **Calendar v3 + Properties 500 hotfix** (`105af798` `0306bbba` `a7e0df89`) — Ishant prod check surfaced 3 real bugs after Calendar v2: (a) `/api/properties` 500ing since 2026-05-23T23:57 — `ORDER BY 2->>'code'` was being parsed as `integer ->> text` (invalid Postgres). Fix: expose `sort_code` / `sort_nickname` as proper columns in the UNION branches, wrap in subquery, ORDER BY by name. (b) my v2 `mapStatus` defaulted null status to 'inquiry' — 202 of 210 prod reservations have null status so the calendar filtered out 96% of bookings. Reverted: null/empty → 'confirmed'. (c) MAX_LANES=3 was hiding 1098 stays behind "+more" — too tight for a 60-property portfolio. Bumped to 12 (same for WeekView stays-lane). Visible labeled stays went from 3 → 24. Peak-occupancy days still hit the cap (max ~51 hidden); proper fix is Property × Date PMS view (T4.38). Properties module now shows 27 live + 33 paused.
- **Calendar v2 — real duplicate fix + Week all-day overflow + channel chips + status filter** (`069cd35d`) — Re-investigated prod via Chrome MCP after Ishant's pushback ("you didn't fix the duplicates"). Real cause: multi-week stays render as one band per week → labelled N×. Fixes shipped: (1) continuation segments (clip-left) no longer render the label — colored band is the continuation cue so a 3-week stay reads as ONE entity. (2) Calendar now filters to active stays only (confirmed / checked_in / checked_out) — inquiries / holds / cancellations no longer leak in. (3) `mapStatus` bug fixed: `inquiry` was being mapped to `checked_in` (silently inflated active count) — now maps to a real `inquiry` status, and unknown statuses default to `inquiry` instead of `confirmed`. (4) Week all-day row no longer scrolls horizontally — `grid-template-columns: 64px repeat(7, minmax(0, 1fr))` instead of `1fr` (nowrap content was overriding 1fr). (5) 3-letter channel chip (AIR / BDC / DIR / OWN / VRB / EML) inside every stay band — Ishant: "some are red, some are green, I don't understand why". (6) WeekView stays-lane capped at 6 lanes with "+ Show N more" toggle (was producing 846px wall of bars with 60+ properties packed).
- **T1.10 — Brittle `array[0]` crash safety** (`f9d375d6`) — 7 useState initializers + inline accesses in FinanceModule (Owner Statements, Tourist Tax summary, Float Ledger, Bank Recon, Bank Upload Drawer) now use lazy `() => FIN_X[0]?.id ?? ''` initializers; OwnerStatements + FloatLedger return small empty-state instead of crashing on null `selected`. InboxModule + TeamInbox + FridayDrawer already had appropriate guards — no changes there.
- **Calendar Month view refactor — true continuous bands + channel colors + status overlays** (`bbb48408`) — Refactored MonthView from per-cell stay segments (which read as "blank duplicate bars" because the label only rendered on the start cell) to a per-week CSS grid where each stay spans grid-columns directly. The label sits inside the visible band the entire span. Channel colors now distinguish booking sources across Week + Month + +more popover (Airbnb red, Booking blue, VRBO bright-blue, Direct green, Owner amber, Email info-blue). Status overlays compose on top — checked_in inset border, checked_out 55% opacity, cancelled strike-through italic, hold diagonal-stripe. New channel-legend strip + today blue date badge. Mobile QA passed (stay popover + +more day-expansion both functional at 375×812). Live at frontend `bbb48408`. Backlog T4.38 created for v0.2 follow-ups (Property×Date PMS view, today vertical line, occupancy heatmap, drag-to-reschedule). T2.4 (Mary inbox fluctuation) removed per Ishant.
- **T3.2 — Multi-tenant safety sweep, partial** (`f1920ee3`) — audited 9 high-traffic surfaces (all tenant-safe); surfaced `website_inbox/*` as a known blocker for non-FR rollout (~30 SQL sites without tenant_id; the underlying tables don't have the column). Full report at `docs/SECURITY_AUDIT_2026-05-24.md`. Promoted to T3.7 in Tier 3.
- **T4.34 — Optimistic UI for W1 write paths** (`07e23e0e`) — CreatePropertyDrawer + CreateReservationDrawer + ReservationDetail cancel now feel instant. Drawer closes immediately, optimistic row in list, background reconcile + rollback on error.
- **T4.35 — AI telemetry mislabel fixed** (`87b608c8`) — design/ai_{rough_budget,ask,annex_b_edit} + ai/translate now report the real provider+model+tokens from `runTextCompletion`. Cost reports finally reflect Gemini-primary routing. Bonus: token counts in 3 design endpoints were always null due to `parseKimiUsage(result.data)` reading an undefined field — now populated. Backend re-deployed; pm2 restart 256.
- **T4.36 + T4.37 scope docs landed** (`e23ba92c`) — guest portal chat + field-staff map v0.1 drafts at `docs/scoping/2026-05-24-*.md`, both linked from backlog Tier 4. Await Ishant decisions on the 15 + 12 open questions.
- **Properties + Reservations W1 backbone shipped + DEPLOYED** — full FAD-native overlay layer per v0.2 LOCKED scopes. Live at frontend+backend `a5038a83` (with a follow-up table-rename commit). Migrations applied to prod DB via SSH + boot-time runner (idempotent).
  - **Naming note**: parent + child tables prefixed `fad_*` (e.g. `fad_properties`, `fad_property_owners`, `fad_reservations`, `fad_inquiries`) because legacy `properties` + `reservations` tables exist with pre-rebuild schemas (12 + 28 columns respectively) — not safe to clobber via CREATE TABLE IF NOT EXISTS. Phase-3 displacement will reconcile.
  - `mig 077_properties_fad_native.sql` — `properties` (FAD overlay joined to guesty_listings via guesty_id), `property_owners` (N:M with %), `property_cards` (AI-knowledge surface replacing Breezeway FAQs per §8), `property_photos` (schema), `property_onboarding_artifacts` (schema), `property_activity_log`. Multi-tenant from day one. Lifecycle/onboarding-checklist/multi-unit/contract/tags/amenities all surfaced.
  - `mig 078_reservations_fad_native.sql` — `reservations` (FAD overlay joined to guesty_reservations) with `cleaning_arrangement` + structured `special_requests` (categories enum + freeform notes) + `internal_notes` + driver/planned-arrival/refund/cancellation tracking, `inquiries` (first-class Mathias quote workflow per §9), `reservation_activity_log`.
  - **Backend routes extended** ([backend/src/properties/index.js](backend/src/properties/index.js), [backend/src/reservations/index.js](backend/src/reservations/index.js)): `/api/properties` now LEFT-JOINs overlay + Guesty cache (merged shape). New `POST /api/properties` for manual create. New nested resources: `/cards` (GET/POST/PATCH/DELETE), `/owners` (GET/POST/DELETE), `/photos` (GET/POST/DELETE), `/onboarding-artifacts` (GET/UPSERT), `/activity` (GET). Same merge pattern on `/api/reservations` + `POST /` (Draft→Confirm two-step gate per §10), `POST /:id/cancel` (FAD-side Phase 1 per handover v6), `PATCH /:id` (cleaning_arrangement, special_requests, driver, planned arrivals), `/inquiries` GET/POST/PATCH + `POST /inquiries/:id/convert`, `/activity` GET.
  - **Frontend client wired** ([propertiesClient.ts](frontend/src/app/fad/_data/propertiesClient.ts), [reservationsClient.ts](frontend/src/app/fad/_data/reservationsClient.ts)): merged shape transform now populates v0.2 fields (lifecycle, onboarding, owner contract, tags, amenities, cleaning_arrangement, special_requests, internal_notes) from real backend instead of safe defaults. Write helpers added — `createProperty`, `createReservation`, `cancelReservation`, `patchReservation`, plus cards / owners / photos / onboarding / activity / inquiries fetchers. Channel-aware `resolutionCenterUrl` helper.
  - **Write paths wired**: `CreatePropertyDrawer` (PROD-LOGIC-1), `CreateReservationDrawer` (PROD-LOGIC-2), `ReservationDetail` cancel (PROD-LOGIC-3) all now hit real APIs with loading states + error toasts. `handleAirbnbResolution` now picks the right host dashboard per channel (PROD-CONFIG-8).
  - **DEMO_CRUFT updated** — PROD-DATA-4 / -6 / -41 marked "largely replaced", PROD-LOGIC-1 / -2 / -3 + PROD-CONFIG-8 struck.
  - **Deferred to W2 of these modules**: onboarding artifact UI workflow (forms + auto-tasks), photo gallery curation UX, owner-facing Onboarding Report PDF generator, Insights AI prompts (listing-quality recommendations), Saved Replies import stub, per-channel listing IDs, role-based visibility deep audit, Phase 2 write-through to Guesty on cancel/create.

### 2026-05-23 (previous session)
- **T4.22 — Receipt display flow** (`fab440ed`) — backend list + signed-URL/inline content routes + frontend modal. Closes the expense capture loop.
- **T4.1 — Analyzer scheduler** (`69e2caca`) — Slice 4 of Ask Friday Core. KB candidates auto-flow into the review queue every 30 min.
- **T2.9 — All 5 most-recent Friday Consult bug reports fixed + live** (`a86fd59c` `17207c64` `41a4f1f3`) — modal buttons + Path B drawer + MCP status drift + AI title cap + Kimi temperature + Gemini-first routing restoration. Backend deployed 4 times. 4 bugs fully closed; 1 (Ishant action_failed) needed both a frontend + backend fix.
- **T2.3 — Push notifications + VAPID** (env config only, no commit) — derived public key from existing private, wrote VAPID_PUBLIC_KEY + VAPID_SUBJECT to prod .env, pm2 restart. `/api/push/vapid-key` now returns the public key; full subscribe → send loop is functional. 4 April subs will silently 410 on next send.
- **T3.1 — Context pack admin UI** (`d6f283d`) — Slice 3 of Ask Friday Core operationalization. New `GET /context-packs` list route + "Context packs" tab in the Ask Friday review module with grouped list + New Draft + Publish actions.
- **T2.7 — KB candidate review queue** (`3f754a6`) — Slice 2 of Ask Friday Core. New "Ask Friday review" module, director-only, with full Approve / Needs info / Reject workflow.
- **Prod deploy at `d352f63d`** — frontend + backend, all the T1.2 / T1.3 partial / T1.4 / T1.5 / T1.6 / T2.1 / T2.2 / T2.8 + slice 3a/3b/3c work landed live.
- **T2.2 — Inbox "Reply" → "AI draft"** (`d352f63`) — chip + thread-row badge renamed + IconClock→IconSparkle. The "Reply" label misled operators into thinking it surfaced threads where guests were awaiting our reply. Real "guest awaiting" filter parked for a backend slice.
- **T2.8 — Touch targets in Ops + Inbox** (`e5e3c6b`) — `.fad-tab` 26→40px, `.ops-status-chip` 28→38px, `.inbox-chip` 24→38px, `.inbox-collapse-btn` 28×28→40×40. Net 15 small targets → 2.
- **T2.1 — Inbox reservation context drawer for narrow viewports** (`a06528c`) — added slide-in drawer triggered by a new "Reservation" button in thread header, since CSS hid the inline panel below 1180px. Restores reservation context for tablet + mobile + small-laptop operators.
- **T1.3 partial — Calendar font consistency** (`0dbf21a`) — month-day 11→13px + investigation notes
- **T1.6 — Stale deploy docs cleanup** (`e41343a`) — rewrote `docs/deploy.md`, deleted dead `deploy.sh` + `deploy-production.sh`, fixed `CLAUDE.md` paths
- **T1.2 audit — Guesty bookings DO NOT auto-create Ops tasks** (`5872dda`) — promoted to new T3.6 scope item
- **T1.4 — Dead CaptureDrawer mock removed** (`ef0fd30`) — 346 lines of dead code
- **FAD_BACKLOG.md created** (`4d9f654`) — call-on-demand pending-tasks doc
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
