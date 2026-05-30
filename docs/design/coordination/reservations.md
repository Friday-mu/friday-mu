# Reservations — Design Brief for Claude Design

> Sits on top of the **Reservations scoping pack v0.2 (LOCKED 2026-04-27)**
> ([Notion 34f43ca884928188a83ad290b1a13b1b](https://www.notion.so/34f43ca884928188a83ad290b1a13b1b)) — source of
> truth for data model, sub-tabs, and workflows. Read `00-README` + `ask-friday.md` first. **Reservations is the
> primary cross-link key everything else points back to (ADR-006).**

## 1. The brief in one line
Design Reservations as the **unified read-and-understand anchor** for a booking — a supporting surface (the real
work happens in Calendar / Operations / Inbox / Finance), whose detail page **composes panels owned by source
modules**, and whose every row is the primary key the rest of FAD cross-links to. Phase 1 **reads from Guesty** with
a FAD overlay; the honest **cache-vs-overlay provenance** and **pending-write** states are the headline trust problem
(none are wired today).

## 2. Source of truth and grounding (three-way reconcile)
- **Vision** = pack v0.2 LOCKED. Reservations is explicitly a *supporting* surface, not a primary work
  destination (§1). Phase 1 read-from-Guesty; Phase 2 write-through; Calendar owns the **create-flow entry**.
- **Reality** = `_components/modules/ReservationsModule.tsx` (tabs Overview / All / Inquiries / **Insights**) +
  `reservations/{OverviewPage, AllReservationsPage, InquiriesPage, ReservationDetail, CreateReservationDrawer}.tsx`.
  Backend `/api/reservations` (`backend/src/reservations/index.js`): `GET /` (Guesty cache **merged with FAD
  overlay** + dedupe), inquiries + `/inquiries/:id/convert`, `POST /` (manual Draft→Confirm create), `GET/:id`,
  `PATCH /:id` (overlay), `POST /:id/cancel` (+ auto "Update Guesty" task), `/:id/folio`, `/:id/activity`, payments.
  Client `_data/reservationsClient.ts` (`useLiveReservations`). **CORE** (real Postgres caches+overlay; write-through
  Phase 2). Folio financials are **derived** (Guesty money breakdown mig 085 + a 70/30 owner-split heuristic) → read
  as *partial/heuristic*. **`_data/reservations.ts` is `@demo:data` fallback** used only when not `liveOnlyMode()`.
- **Drawn** = `fad-reservation.jsx` (`ScreenReservation`): left context rail (confirmation code, status badges
  Confirmed / Partially-paid, guest, check-in→out, "Open in inbox") + right tabbed workspace (Overview / Booking
  details / Guests / Operations / Guest folio & invoice / Accounting / Payments / Activity log). Overview = 4 stat
  cards (Payout / Owner's revenue / Your commission / Balance due) + Ask Friday + Modify. List =
  `fad-desktop-screens.jsx` `ScreenReservations` (tabs All / Arrivals / In-house / Departures / Inquiries, stat
  strip, an Ask Friday panel with inline **new-booking quick-create** + an **inquiries gate**: "3 open inquiries —
  Friday drafted replies & can convert"). A `guesty` source-chip is already drawn.
- **Full-vision rule:** design the complete reservation record + inquiry funnel even though write-through is Phase 2;
  the **pending-write / draft / stale** states are not "future" — they're the core honesty of a read-from system.

## 3. Who uses it (roles — `permissions.ts` + `financialAccessFor()`)
`reservations: FULL_ACCESS` for director **and both manager roles**; finance is gated *inside* the detail:
| Role | Module | Financial detail (`financialAccessFor`) |
|---|---|---|
| **Director** | full | `full` — Folio + Accounting + Payments, owner split, commission %, margin |
| **Manager** (ops_manager ≡ commercial_marketing) | full | `guest_facing` — **Folio guest-facing lines only; Accounting + Payments hidden; no owner split / commission / margin** |
| **Field** | none (`reservations: {}`) | none — Reservations is desktop; field lives in the task PWA |

## 4. Design principles and system
- **Compose, don't duplicate.** The detail page assembles panels whose data is owned by source modules
  (Guests→Guests, Operations→Ops, Folio/Accounting→Finance, Property→Properties) — Reservations is the anchor +
  cross-link spine. Show provenance with `SourceTag` (guesty / friday).
- **The trust gap is the deliverable.** Reservations imports **zero** trust components today. Bind the §7 states to
  the real overlay/cache + sync signals — this is the single most valuable thing the V2 design adds here.
- **Use the built kit + Ask Friday focus envelope** (`ask-friday.md` §4). Confidence is a band, not a %.

## 5. Information architecture
- **Overview** — today / 7d / 30d + urgent flags (no-access-info-sent, no-driver, payment-incomplete, balance-due).
- **All Reservations** — filterable list, default scope active + 90d future + 12mo past; the reusable quick-view
  side panel (StayPopover) on cross-links.
- **Inquiries** — a first-class funnel (Friday-drafted replies → convert to booking).
- **Reservation detail** — composed sub-tabs: Overview · Booking details · Guests · Operations · **Folio** ·
  Accounting · Payments · Activity log (+ the code's **Insights**). Channel taxonomy airbnb / booking / vrbo /
  direct / **owner**; source shown in Activity log only. Owner reservations carry a `cleaning_arrangement` enum
  (Friday-cleans vs owner-cleans) that drives task templates + billing.

## 6. Surfaces to design (full vision) — P0 first
| # | Surface | Purpose | Reality | Priority |
|---|---|---|---|---|
| A | **Reservation detail (composed)** | left context rail + the 8-tab composed workspace; `SourceTag` provenance; Ask Friday focused on this reservation. | CORE | **P0** |
| B | **All Reservations list + quick-view** | filter/sort, urgent flags, the shared side-panel preview-before-open. | LIVE | **P0** |
| C | **Trust/provenance placement** | cache-only vs overlay-enriched chip, sync-freshness, pending-write ("Update Guesty") — the wiring that's missing. | BUILT kit, unwired | **P0** |
| D | **Inquiries funnel** | inquiry list → Friday-drafted reply → convert to booking (+ owner reservation). | LIVE (convert) / SPEC (AI draft) | **P1** |
| E | **Create reservation (Draft→Confirm)** | manual create gated by the Guesty ~1hr owner SMS/email step; the two-step safety gate. | LIVE | **P1** |
| F | **Folio / Accounting / Payments** | role-gated money tabs; derived-financials honesty; refund → Finance approval (€200/30% cap → escalation); Airbnb resolution-center deep-link. | CORE (derived) | **P1** |
| G | **Insights tab** | per-reservation / portfolio reads from `/api/analytics/portfolio`. | SPEC | **P2** |

## 7. Critical states the UI must make legible
- **Provenance: cache-only vs overlay-enriched.** A row may be Guesty-cache-only or FAD-overlay-enriched — design a
  visible **partial-provenance** distinction (SourceTag guesty vs guesty+friday). This is real and unbuilt.
- **Sync freshness** → `SyncChip` stale when the Guesty cache ages; name the source.
- **Pending-write** → after `cancel` / `PATCH`, FAD emits an "Update Guesty" task → show a **"change pending sync to
  Guesty"** state (the honest face of a Phase-1 read-from system). This is first-class, not an afterthought.
- **Draft → Confirm** → a created/modified reservation is **Draft** until the Guesty ~1hr owner-notification step
  clears → **Confirmed**. Render the gate explicitly (don't let a draft look live).
- **Derived financials** → the folio's owner split is a **heuristic** (mig 085 breakdown vs 70/30 fallback) → read
  as *partial / estimated*, never as authoritative until the breakdown exists.
- **Finance gating** → managers never see owner split / commission / margin (§3); the Overview stat cards must
  role-gate (the prototype currently shows Payout/Owner-revenue/Commission to everyone — clash).
- The five trust-states otherwise map as in `ask-friday.md` §7.

## 8. Key flows to storyboard
1. **Read a reservation:** list → detail; SourceTags show Guesty vs overlay; Ask Friday answers grounded in it.
2. **Create:** Calendar/Reservations → manual create → **Draft** → owner-notify clears → **Confirmed**.
3. **Convert inquiry:** inquiries funnel → Friday draft → approve → convert to booking.
4. **Cancel:** cancel → FAD-side cancelled + **"Update Guesty" pending-write** task surfaces.
5. **Refund:** request → over €200/30% → **Finance approval escalation chain** (not done inline).

## 9. Reference artifacts
Prototype `fad-reservation.jsx` + `ScreenReservations`; built `ReservationsModule` + `reservations/*` + `/api/
reservations` + `reservationsClient.ts`; the `ai/` kit; data shapes — the overlay schema, `cleaning_arrangement`
enum, the hybrid `special_requests` (enum + freetext), folio (mig 085).

## 10. Recommended design priority
1. **A–C:** the composed detail, the list + quick-view, and the **provenance/pending-write trust placement**.
2. **D–F:** inquiries, Draft→Confirm create, the role-gated money tabs.
3. **G:** Insights.

## 11. Out of scope (Phase 1 — §14)
Bulk operations · saved filters · internal-notes thread (Phase 2) · reservation-level analytics (→ Analytics, Jun) ·
payment-processor integration (records manual bank transfers only, no card processing) · SRL / supplies / inventory.
Design surfaces that *reflect* these read-only where needed, not the editors.

## 12. Open decisions (propose options, don't guess)
1. **Folio tab label** — "Folio" (vision/code) vs "Guest folio & invoice" (prototype). Pick one.
2. **Manager Overview cards** — do managers see the Overview stat cards at all, or a guest-facing subset (no owner
   revenue / commission)? *(Clash — prototype shows them to everyone.)*
3. **Provenance chip** — how to render cache-only vs overlay-enriched, and the pending-write-to-Guesty state.
4. **Draft→Confirm gate UI** — the owner-notification safety step is drawn nowhere; design it.
5. **Airbnb resolution-center** — where the deep-link lives (Folio header?) in V2.

## 13. What we want back
The composed **reservation detail** + the **list/quick-view**, with the **provenance + pending-write + Draft→Confirm**
states visibly bound to the real overlay/cache signals (the missing trust layer), desktop + manager-mobile, built on
the live `reservationsClient` + `ai/` kit. Then inquiries, create, and the role-gated money tabs. Flag clashes per
`00-README` §7.
