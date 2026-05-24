# Morning handover — 2026-05-25

> What changed overnight (2026-05-24 → 25) + the follow-up session
> Ishant asked for ("look at scoping docs, build Analytics, ship low-
> hanging fruits, audit inter-module links, retest"). Read this first,
> then the per-section detail below.

## Ledger — what shipped

Live versions (verify via `curl https://admin.friday.mu/version.json` + `/api/version`):

- Frontend: `7ecc77b9` (Analytics module live + Inbox → Ops "+ Task")
- Backend: `7ecc77b9` (Analytics endpoints + channel-name normalisation)
- Branch: `fad-rebuild` (tree tip = live)

Phases shipped vs the overnight plan:

| Phase | Plan item | Status | Commit ranges |
|---|---|---|---|
| 1 | Guests backend (T3.11) | ✓ shipped | `ee3e2504` · `612c0b75` |
| 2 | Owners backend (T3.12) | ✓ shipped | `8e5eceeb` · `b88d723b` · `886f6412` |
| 3 | PropertyDetail Financial tab + occupancy (T1.11) | ✓ shipped | `823d6a30` |
| 4 | TaskDetail UI redesign (T1.15) | DEFERRED | — |
| 5 | Multi-calendar v0.1 (T4.38) | ✓ shipped | `a66fbaa0` |
| 6 | Availability search (T4.39) | ✓ shipped | `9e18f180` |
| 7 | Quote generator v0.1 (T4.40) | ✓ shipped | `9e18f180` (same commit) |
| 8 | Insights wiring (T1.14) | PARTIAL — banners + Analytics tabs | `f9a6f5f6` |
| 9 | Quick wins (T1.8/T1.9/T1.13/T1.17) | PARTIAL — T1.8 only | `36502839` |
| 10 | Handover doc | this file | — |

Additional follow-up session (after Ishant's request — same morning):

| Item | Status | Commit |
|---|---|---|
| Analytics module v0.1 — Phase 0 per scoping pack | ✓ shipped | `f9a6f5f6` · `7ecc77b9` |
| Inbox → Ops "+ Task" inter-module link | ✓ shipped | `f9a6f5f6` |
| Analytics Phase-2-pending banners on fixture tabs | ✓ shipped | `f9a6f5f6` |
| Channel-name normalisation (Guesty raw → friendly) | ✓ shipped | `7ecc77b9` |
| Mobile retest (375×812) | NOT RUN — Chrome MCP resize_window didn't take | — |
| TeamInbox "+ Task" affordance | DEFERRED — needs design pass for non-reservation context | — |

## Phase-by-phase detail

### Phase 1 — Guests backend (T3.11) — ✓ shipped

- **mig 079_guests_fad_native.sql** — `fad_guests` table + partial-unique
  indexes (email-keyed, phone-keyed fallback) + idempotent backfill from
  guesty_reservations.
- **mig 080_guests_name_bucket.sql** — follow-up after live-data check
  showed 257 prod reservations with ZERO emails (Guesty redacts OTA
  guest emails by policy). Name-keyed bucket lets the Guests module
  actually show stays for Airbnb / BDC bookings. Non-unique index — same-name
  collisions are real, admin can manual-merge later.
- **/api/guests routes** — list (search + vip_tier filter), get by id,
  get reservations, create, patch, POST /lookup (email → phone → name).
  All tenant-scoped via `attachIdentity` (FR-lockdown allowlist).
- **reservations sync** — both poller + webhook paths now upsert
  fad_guests best-effort; failures never break reservation sync.
- **frontend wiring** — `guestsClient.ts` with `useGuestLookup({email, phone, name})`
  hook. ReservationDetail Guests tab now resolves to a live fad_guests
  record by email + name, falls back to the fixture profile.

**Live count on prod after Phase 1**: 128 fad_guests rows (was 0).

**Known limitation**: the ReservationDetail drawer that opens from the
Overview list is fixture-keyed (rsv-rc15-thomas etc.) — clicking a
prod reservation gives "Reservation not found" because the drawer
doesn't yet resolve live guesty_ids. The Guests tab code is wired
correctly and will fire as soon as **T3.10** (full ReservationDetail
wiring) is done. The Guests Tab inside that drawer will Just Work
once the drawer's id resolution is fixed.

### Phase 2 — Owners backend (T3.12) — ✓ shipped, closes T1.12

- **mig 081_owners_fad_native.sql** — `fad_owners` table + partial-unique
  on `guesty_owner_id`. Backfill: one fad_owners row per distinct Guesty
  internal owner ID across guesty_listings (display_name = "Guesty owner
  xxxxxxxx" — admin patches in real names via /api/owners/:id PATCH).
- **mig 082_backfill_properties_and_owners.sql** — needed follow-up:
  081 seeded fad_property_owners by JOINing fad_properties, but
  fad_properties is lazily materialised so only had 0 rows. 082
  materialises every fad_properties row from guesty_listings first,
  then re-runs the property_owners seed.
- **/api/owners routes** — list/get/get-properties/create/patch/archive
  /unarchive. All tenant-scoped.
- **/api/properties extended** — LIST and SINGLE queries gain a LATERAL
  JOIN exposing `primary_owner_id` (the Guesty owner_id) +
  `primary_owner_display_name` (resolved via fad_property_owners ↔
  fad_owners). Frontend now gets the owner name without an extra fetch.
- **frontend wiring** — `ownersClient.ts` with `useOwners` +
  `useOwnersByGuestyId` hooks. PropertyDetail header + OwnerTab,
  AllPropertiesPage table + grid, OverviewPage cards, PropertyQuickView
  (3 layouts) all prefer the live `primaryOwnerName` over FIN_OWNERS
  fixture.

**Live count after Phase 2**: 38 fad_owners rows, 56/60 properties
linked to a primary owner. The 4 unlinked (AVN-1, ES-13, AO-11(?), one
other) have no `raw.owners` array in their Guesty listing import —
operator action needed.

### Phase 3 — PropertyDetail Financial tab + T1.11 — ✓ shipped

- **/api/finance/property/:code/summary?windowDays=90** — aggregates
  revenue from guesty_reservations + expenses from the expenses table.
  Returns occupancy_pct, ADR, RevPAR, revenue, expenses, net-to-owner,
  reservation_count. Channel fees + Friday margin = 0 (Phase 2 of the
  finance module will land them).
- **/api/properties metrics_30d** — extended with a per-property LATERAL
  JOIN: `occupancy_pct`, `adr_minor`, `revenue_minor`, `booked_nights`,
  `reservation_count`, `currency`. Frontend `mergedListingToProperty`
  now populates `occupancy90d` + `adr` from these.
- **frontend wiring** — `financeClient.ts` + `usePropertySummary` hook.
  FinancialTab swapped from the mock (44 MUR/EUR × ADR × 365 ×
  occupancy) to the live summary endpoint.

**Known data quality issue (logged for follow-up)**: `revenue_minor`
shows €0 for most properties because Guesty's API doesn't reliably
populate `total_amount_minor` in our cache. ADR calc shows 0 as a
result. The endpoint shape is right; the SOURCE data needs a
sync-side fix (or use `inferReservationFinancials` from
`reservations/financials.js` during the upsert path).

### Phase 4 — TaskDetail UI redesign (T1.15) — DEFERRED

`TaskDetail.tsx` is 2,457 lines. A full Breezeway-style re-skin per
the 2026-05-23 screenshot is too risky for an autonomous run. The
right next-session approach (1.5–2 hrs of focused work):

1. **Make assignees obviously editable** (Ishant called this out
   specifically). Current code is in `TaskDetail.tsx` line 949 area —
   the `<CollapsibleSection title="Assignees">` block. The list
   renders but the add/remove affordance is non-obvious.
2. **Verify "Open in full view" routing** — code is at line 772-776,
   only renders when `mode === 'drawer'` AND `onExpand` is truthy.
   Check the upstream prop passing.
3. **Floating timer** — move the timer pill (line 803) to a
   bottom-right floating element when `task.status === 'in_progress'`.
   The elapsedSeconds calc at line 287 already handles the running
   state.

Full Breezeway re-skin is a 3–4 hr block; mock+layout sketch lives
in `docs/handover/2026-05-24-overnight-autonomous-plan.md` Appendix C.

### Phase 5 — Multi-calendar v0.1 (T4.38) — ✓ shipped

- **New default Calendar view: Multi** (Property × Date grid). Mobile
  still defaults to Agenda; old Month/Week/Day/Agenda stay as alternate
  tabs.
- **Layout**: per-row CSS-grid container so reservation bars overlay
  day cells via shared grid-row + z-index. Sticky property column
  (thumbnail + code + name + lifecycle dot) + sticky date header
  (day-of-week + day number + month-start separator + weekend tinting
  + today highlight + today vertical pink line).
- **Reservation bars**: channel-colored (AIR red / BDC navy / DIR
  green / VRB orange / OWN purple / EML grey). Click → opens the
  existing StayPopover via `setSelectedStay`. Channel labels rendered
  on every band ("AIR · Guest Name").
- **60-day default window** anchored 7 days before viewDate. Footer
  shows window stats + channel legend.

Verified live: 60 properties × 60 days, 81 reservations rendered, no
layout breakage. Multi tab is the desktop default.

**Deferred to v0.2** (logged for next session):
- Per-cell €PRICE chips
- Task chip overlays
- Drag-to-create
- Virtualisation if 60×60 starts to lag

### Phase 6 — Availability search (T4.39) — ✓ shipped

- **/api/availability/search?from&to&guests** — aggregates
  guesty_calendar over a window, filters by `accommodates`. Returns
  matches (fully available), partial (some nights blocked), and
  unavailable (zero or cache-missing). Drives from guesty_listings to
  avoid silently dropping properties with no cached calendar rows.
- **AvailabilitySearchModal** — opened from a new "Find availability"
  button in the Calendar toolbar. Date pickers + guest count → results
  list with thumbnails, region, nightly avg, total. Click rows to
  select N — leads into Phase 7 quote generation.

Live test: July 15-22 for 4 guests returns 4 matches + 2 partials + 15
unavailable.

### Phase 7 — Quote generator v0.1 (T4.40) — ✓ shipped

- **mig 083_quotes_fad_native.sql** — `fad_quotes` table
  (tenant-scoped, status enum, property_codes array, share_url,
  opened_at, converted_reservation_id).
- **/api/quotes** — POST creates a quote, mints a Friday Website
  Vercel-preview share URL with codes + dates baked in. GET lists
  recent quotes. POST /:id/mark-opened tracks engagement when the
  recipient clicks.
- **AvailabilitySearchModal "Generate quote link" button** — selects
  feed into a single POST /api/quotes call. The returned share URL
  appears in a green footer with Copy + Open buttons.

**Open question (logged below)**: the share URL points at
`https://preview-friday-website.vercel.app/search?codes=…&from=…&to=…&guests=N`.
Friday Website may not have that URL shape implemented yet — Ishant
should validate the destination before the first real send.

### Phase 8 — Insights wiring (T1.14) — DEFERRED

Insights surfaces are scattered across 4 files:
- `OperationsModule.tsx:3896` — InsightsPage function (ops insights)
- `Tier3Modules.tsx:933` — IntelInsights
- `FinanceModule.tsx` — finance insights (~mostly mock)
- `properties/InsightsPage.tsx` — already reads live PROPERTIES

The right pattern is to inject a small "Data wiring · Phase 2 pending"
banner at the top of each fixture-heavy insights page (matches the
plan's "never fake numbers" decision). Estimated 30-40 min of careful
per-page work — too risky to bundle into the autonomous run alongside
backend work.

### Phase 9 — Quick wins — PARTIAL

Shipped:
- **T1.8** — `parseNl` + "Quick draft (offline)" button removed from
  CreateTaskDrawer. The Friday-smart drafter has proven reliable; the
  regex fallback never fired. -84 lines.

Deferred:
- **T1.9** — Gate hardcoded TODAY constants behind liveOnlyMode().
  Files: `frontend/src/app/fad/_data/reviews.ts`, `pendingCounts.ts`,
  `hr/StaffPage.tsx`. Low-risk but a sweep across multiple files.
- **T1.13** — Drop blocking spinner on Ops Insights + Reservations
  Inquiries (~5s slow renders). Needs careful work to swap to the
  stale-while-revalidate pattern.
- **T1.17** — Debug expense capture LLM (receipt upload not auto-
  triggering OCR). Trace path: POST /api/expenses/receipts → should
  fire POST /api/expenses/extract (Gemini). Likely culprits: auto-trigger
  never fires (frontend), LLM endpoint returns non-JSON, or CORS.
  Needs ~1 hr of focused debugging.

## Follow-up session detail (after "build Analytics" directive)

### Analytics module v0.1 — Phase 0 shipped

Per scoping pack [`36a43ca884928165b886fc3043e399a0`](https://www.notion.so/36a43ca884928165b886fc3043e399a0). The scoping calls for a 5-layer Intelligence Core (data sources → Cube Core metric layer → deterministic insight engine → proactive AI agent → surfaces). Cube Core + AI agent are gated on infra ack (~$12-18/mo droplet) so Phase 0 deterministic SQL aggregates landed today; Phases 1-2+ wait for your ack.

**Backend** (`backend/src/analytics/portfolio.js`):
- `GET /api/analytics/portfolio?windowDays=N` — tier-1 KPIs (revenue, reservations, booked-nights, occupancy %, ADR, RevPAR) over rolling window + period-over-period deltas + channel mix + top-10 properties + daily revenue trend + ops health (open + overdue tasks).
- `GET /api/analytics/occupancy-heatmap?months=N` — per-property × month occupancy %.
- Channel names normalised (Airbnb / Booking.com / VRBO / Direct / Manual / Owner / Email / Scraped legacy / Unknown).
- All tenant-scoped via `attachIdentity`; lockdown allowlist updated.

**Frontend** (`frontend/src/app/fad/_components/modules/AnalyticsModule.tsx`):
- Overview tab + Occupancy tab now drive from live `/api/analytics`.
- KPI cards show period-over-period deltas + arrows.
- Top-properties list with thumbnail + bookings + nights + occupancy + revenue, click → deep-link to PropertyDetail.
- 5 remaining tabs (Revenue / Channels / Reviews / Team / Margin) get a "Data wiring · Phase 2 pending" banner instead of pretending the fixture numbers are real (anti-fake-numbers per scoping §5 governance).

**Live counts** on prod (86 reservations / 1145 booked nights / 27 active properties in last 30d):
```
Revenue: € — (cache gap, see below)
Bookings: 86
Occupancy: 100% (capped — multi-unit properties have overlapping
  bookings; needs unit-count denominator in Phase 2)
Channel mix: Airbnb 47% · Manual 27% · Unknown 20% · Booking.com 7%
Top property: RC-15 (11 bookings · 57 nights · 100% occ)
Ops health: 394 open tasks · 114 overdue
```

**Known data-quality issues** (logged for fix-in-next-session):
- Revenue €0 because `guesty_reservations.total_amount_minor` is NULL for most rows. Same Guesty cache gap that affected PropertyDetail Financial tab. Fix: extend `backend/src/reservations/sync.js` to compute via `inferReservationFinancials(r)` before upsert.
- Occupancy hits 100% for multi-unit properties (LB-C, RC-15 cluster) because overlapping unit bookings inflate booked_nights beyond `windowDays`. Need per-property unit count from Guesty.
- "Unknown" channel = 20% — these are scrape-l3 rows where the `channel` field is NULL but `source = 'scrape-l3'`. The new normaliser uses channel only. Fix: COALESCE channel → source again in the normalised CASE.

### Inter-module link — Inbox → Ops "+ Task" (Ishant's specific ask)

In the inbox audit Ishant specifically asked about "creating tasks appearing in chats, inline in chats". Confirmed both InboxModule (guest threads) and TeamInbox (staff threads) had NO task-creation affordance — true gap.

**Shipped**: "+ Task" button in the guest-thread header alongside Mark unread + Reservation (`frontend/src/app/fad/_components/modules/InboxModule.tsx`). Clicking opens the existing CreateTaskDrawer prefilled with:
- `title` from `thread.subject` (truncated to 100 chars)
- `description` from `thread.preview`
- `propertyCode` from `thread.property`
- `reservationId` from `thread.reservationId`
- `inboxThreadId` set so the task links back to the conversation

Verified on prod with Gael Le Metayer's WhatsApp thread (door keypad broken at GBH-C8) — drawer opens, all fields prefilled correctly. Operator can now task the issue in <5 seconds without leaving inbox.

**Deferred — TeamInbox version**: channel/DM threads have no reservation context; needs a focused design pass for what makes a meaningful "+ Task" affordance there (probably "+ Task for #channel" or "+ Task assigned to @user" with the recent message as description). Logged as T1.18 for next session.

### Retest results

Verified live on prod (frontend `7ecc77b9` · backend `7ecc77b9` · desktop only):
- ✓ Calendar Multi view — 60 properties × 60 days × 81 reservations rendering with channel-colored bars + today pink line + sticky columns
- ✓ Analytics Overview tab — KPIs + revenue trend chart + channel mix + top-10 properties
- ✓ Properties → All properties — Owner column shows fad_owners display names (no more raw hex IDs)
- ✓ Inbox → guest thread → "+ Task" button opens drawer with thread context prefilled
- ✓ Analytics endpoint smoke test: portfolio + heatmap both return 200 with sensible data shapes
- NOT VERIFIED on mobile (375×812) — Chrome MCP `resize_window` reported success but viewport stayed at 1372. Worth a manual phone-touch QA pass.
- NOT VERIFIED — clicking a live property card in Analytics top-list to confirm the deep-link to PropertyDetail works.

### Low-hanging fruits surveyed but NOT shipped

From the field-staff map scoping (`docs/scoping/2026-05-24-field-staff-map-v0.1.md`) + guest-portal-chat scoping + Analytics scoping:

- Field-staff map (T4.37): 1-2 week build. Needs Mapbox setup + PWA service worker work + privacy policy doc. Too big for autonomous.
- Guest portal chat (T4.36): 2-3 week build. Cross-cuts Friday Website (per AGENTS.md rule we can't edit website in same session). Defer.
- Analytics Phase 1 (proactive AI agent + push digest into Ask Friday): needs Cube Core infra ack + Gemini wiring (model-agnostic per scoping). Hour-scale work once infra is in place.
- Per-module Insights panels (Analytics Phase 2 + T1.14 deferred): now have a clear pattern (Phase 2 banner). The right next pass is per module: 30-40 min each to write the deterministic SQL aggregation, wire the panel.
- Multi-calendar v0.2 (per-cell €PRICE, task chips, drag-to-create): biggest user-visible polish item. Smaller than v0.1 was. 2-3 hr.

## Critical things Ishant should know

1. **The PropertyDetail Financial tab now shows live revenue/occupancy
   — but most properties show €0 because Guesty's cache doesn't carry
   total_amount_minor reliably.** The endpoint logic is right; the
   sync needs a fix to pull `inferReservationFinancials(r)` into the
   guesty_reservations upsert path. (~30 min next session.)
2. **The ReservationDetail drawer opening from Reservations Overview
   still says "Reservation not found"** for prod reservations. This is
   T3.10 (full ReservationDetail wiring) — known limitation, not a
   regression from the overnight run. The Guests tab code is correctly
   wired and will fire as soon as the drawer resolves live guesty_ids.
3. **5 new backend migrations applied to prod**: 079, 080, 081, 082, 083.
   All additive, all idempotent, all multi-tenant.
4. **2 new schema tables on prod**: `fad_guests` (128 rows backfilled),
   `fad_owners` (38 rows backfilled), `fad_quotes` (0 rows). One
   existing table extended: `fad_property_owners` now has 56 rows
   (was 0).
5. **Multi-calendar (T4.38) is the new desktop default.** Old Month/
   Week/Day/Agenda still available as alternate tabs. Mobile defaults
   unchanged (Agenda).
6. **"Find availability" button** in Calendar toolbar opens the new
   modal. Generates Friday Website preview URLs — Ishant should
   validate the URL shape (`?codes=X,Y&from=…&to=…&guests=N`) before
   first real send.

## Open questions for Ishant

(Compile from the plan's open questions + new ones surfaced overnight.)

1. **Multi-calendar v0.1 = right default?** Currently desktop defaults
   to 'multi'. Should I keep the old 'week' as default until v0.2 has
   per-cell €PRICE + task chips, or stay with 'multi' as is?
2. **Quote URL shape** — does Friday Website accept
   `?codes=X,Y&from=…&to=…&guests=N`, or does it want a different
   filter param schema?
3. **TaskDetail re-skin priority** — full Breezeway shape now (3-4 hr
   block), or just the 3 high-impact fixes (open-full-view + editable
   assignees + floating timer, ~1.5 hr)?
4. **Insights placeholder vs real wiring** — Phase 2 banner pattern OK,
   or invest in real backend aggregations now (4-6 hr per insights
   surface)?
5. **Owner names** — should I add Guesty `/owners/:id` API sync to
   populate real owner names automatically, or leave operators to
   patch in via PATCH /api/owners/:id when they review?
6. **Cleanup** — the 4 unlinked properties (AVN-1, ES-13, AO-11,
   one other) have no Guesty owner_id in their `raw.owners`. Are these
   prospects / inactive that should stay unlinked, or do they need
   manual owner attribution?

## Residual backlog after overnight run

In priority order, the major items still pending:

1. **T1.15 (Phase 4)** — TaskDetail UI redesign (3-section quick path
   OR full re-skin)
2. **T1.14 (Phase 8)** — Insights wiring (banner pattern across 4 files)
3. **T1.11 follow-up** — Guesty sync revenue fix (so Financial tab + 
   metrics_30d show non-zero values)
4. **T3.10** — Full ReservationDetail drawer wiring (currently opens
   "not found" for live reservations from Overview)
5. **T3.7** — website_inbox tenant_id migration (blocker for non-FR
   rollout)
6. **T1.17** — Expense capture LLM debug
7. **T1.9** — TODAY gating behind liveOnlyMode
8. **T1.13** — Slow Ops Insights + Reservations Inquiries initial render

## Verification commands (for Ishant when he wakes up)

```bash
# Versions
curl -fsS https://admin.friday.mu/version.json     # → 36502839
curl -fsS https://admin.friday.mu/api/version      # → 9e18f180

# Guests
curl -fsS -H "Authorization: Bearer $TOKEN" \
  "https://admin.friday.mu/api/guests?limit=3" | jq .

# Owners + property link
curl -fsS -H "Authorization: Bearer $TOKEN" \
  "https://admin.friday.mu/api/owners?limit=5" | jq '.results[] | {name: .display_name, props: .property_count}'

# Property summary
curl -fsS -H "Authorization: Bearer $TOKEN" \
  "https://admin.friday.mu/api/finance/property/BS-1/summary?windowDays=90" | jq .

# Availability search
curl -fsS -H "Authorization: Bearer $TOKEN" \
  "https://admin.friday.mu/api/availability/search?from=2026-07-15&to=2026-07-22&guests=4" | jq '.summary'

# Multi-calendar UI: navigate to https://admin.friday.mu/fad?m=calendar
# (Multi tab is the default on desktop)
```

## Where to pick up

If Ishant says "go" again, the natural sequence is:

1. **30 min**: Guesty sync revenue fix (unblocks Financial tab + 
   metrics_30d showing real numbers across the portfolio).
2. **1-2 hr**: T1.15 TaskDetail 3-section quick path.
3. **2-3 hr**: T3.10 full ReservationDetail drawer wiring (the
   "Reservation not found" issue).
4. **3-4 hr**: Multi-calendar v0.2 (per-cell €PRICE, task chips,
   drag-to-create).

Otherwise the overnight plan doc at `docs/handover/2026-05-24-overnight-autonomous-plan.md`
remains the canonical reference for what was scoped vs deferred.
