# Field-staff map + usage telemetry — scoping pack v0.1 (DRAFT)

> Status: DRAFT for Ishant review.
> Authored: 2026-05-24 (Ishant + Claude).
> 2026-05-26 update: narrowed to dispatch-first, foreground/on-duty collection for web/PWA V1. Do not rely on service-worker geolocation or app-closed background tracking without a native wrapper decision.
> Canonical on Notion: [`36943ca884928170897edda4660ee133`](https://www.notion.so/36943ca884928170897edda4660ee133) (FAD Scoping zone).
> This file is the runtime mirror — sync on edit.
> Tracked as: **T4.37** in [`docs/FAD_BACKLOG.md`](../FAD_BACKLOG.md).

## 1. Framing

Two related-but-distinct ideas, tracked together because the substrate is shared but the maturity differs:

**Idea A — Field-staff geolocation map** (HIGH-CONFIDENCE WIN):
Surface a live map in Operations showing where field staff are right now. "Where's Bryan?", "fastest cleaner to Property X?", "is Ravi at the airport already?" Solves real operational questions Mathias asks every day verbally over WhatsApp. Build this.

**Idea B — Generic FAD usage analytics** (LOWER ROI, NEEDS A REAL QUESTION):
Capture who's on FAD, when, what they're doing, for how long. Useful in the abstract; valuable when you have a specific question to answer (which features are dead? who's not using FAD? where does the team get stuck?). Without a specific question, this is surveillance overhead with consent friction and unclear gain. Defer until a question crystallises.

## 2. Idea A — Field-staff map (load-bearing)

### What it solves

- "Where's Bryan right now?" — currently solved via WhatsApp ping
- "Who's closest to LB-2 for this urgent maintenance request?" — currently solved by Mathias mentally
- "Did Ravi pick up the airport guest?" — currently solved by waiting for him to say so
- "Auto-assign closest available cleaner" — currently impossible
- Post-shift: heat map of where field staff actually spent their day (audit + planning)

### Open scoping questions

| # | Question | Default lean |
|---|---|---|
| 1 | **Opt-in model** — per-user toggle, mandatory during shift, or always-on? | Explicit consent plus visible sharing state. V1 starts sharing only while on duty or while a field task is active/open. |
| 2 | **Accuracy** — IP geolocation (low), browser geolocation API (medium, GPS-when-available), native PWA GPS (high, requires PWA install) | Browser/PWA geolocation in foreground for V1. Native wrapper/background-location permission is a separate V2 decision. |
| 3 | **Update frequency** — continuous (battery cost), every N minutes, on-demand only | Every 3-5 minutes while foreground/on-duty/active-task, plus on-demand refresh for urgent dispatch. |
| 4 | **Storage** — current location only, or location history? Retention? | Current + short task-linked pings. Precise trails should purge after operational need unless a written policy approves longer retention. |
| 5 | **Display** — Ops module map sub-page, Roster live overlay, or both? | Both. Roster gets a "live now" toggle to see current positions overlaid on the schedule. Ops gets a dedicated "field map" sub-page for live ops |
| 6 | **Geographic scope** — full map of Mauritius, just Friday property cluster zones, or both? | Full Mauritius with property markers + field-staff markers overlaid. Clustering when zoomed out |
| 7 | **Privacy & consent** — written policy, audit log of who viewed location, blackout zones (home address)? | Written policy required before launch. Audit log of admin views. No exact staff home pins in normal UI. Location auto-pauses outside on-duty/active-task windows. |
| 8 | **Use cases priority** — view-only first, or auto-suggest closest staff for new tasks too? | View-only V1. Auto-suggest in V2 (after Roster Phase 2 ships) |
| 9 | **Field staff side UX** — do they see their own location? Do they see other staff? | V1: own sharing status and last point only. Peer location visibility needs a separate policy decision. |
| 10 | **Offline behavior** — what if field staff loses signal in a property without wifi? | Cache last position client-side, mark "last known: 12 min ago" on the map. Re-sync on reconnect |
| 11 | **Map provider** — Mapbox (paid, polished), OpenStreetMap + Leaflet (free, less polished), Google Maps (paid, polished)? | Mapbox. Already in use by Friday Website for property locations; reuse setup |
| 12 | **Integration with task assignment** — when assigning a task, show distance-to-property next to each candidate assignee? | V2. V1 = map view only |

### Architecture sketch (not locked)

```
[Field staff FAD/PWA foreground session]
       ↓ geolocation API on 3-5min interval while on duty / active task
   FAD /api/location/heartbeat
       ↓
   staff_location_pings (short-retention precise pings)
       ↓ SSE LISTEN/NOTIFY
   FAD Ops Field Map UI (live view)
       +
       ↓
   staff_presence_status (last live/last-known point per user_id)
```

Reuses:
- `analytics_events` table (mig 068)
- VAPID push notifications (working as of 2026-05-23) for "your shift is starting — please open the app" reminder
- Existing PWA infrastructure (manifest, service worker)
- SSE LISTEN/NOTIFY for live updates (already powers other FAD live surfaces)
- Google Routes travel-time endpoint for ETA from current/last-known point to urgent property

New:
- `staff_location_pings` short-retention table
- `staff_presence_status` table or view
- `staff_location_view_audit` table
- Heartbeat endpoint with rate-limit + tenant guard
- Map UI on Ops module (Mapbox)
- Privacy policy doc + consent capture UI
- Shift-aware activation logic (only collect during scheduled shifts per HR roster)

Important correction: service workers can help with sync/push/offline behavior, but V1 must not assume they can reliably read GPS in the background or after the app is closed.

### Effort estimate (rough)

- Backend: heartbeat endpoint + storage + view: **S** (1 day)
- Frontend: Ops map sub-page with Mapbox: **M** (2-3 days)
- Frontend: Roster live overlay: **S** (1 day)
- PWA/web: foreground geolocation sharing loop + offline retry: **S/M** (1-2 days)
- Native/background location wrapper, if later approved: **M/L** (separate project; requires platform permissions and stronger policy)
- Privacy policy + consent UI + shift-aware activation: **M** (2-3 days)
- Testing on actual field staff phones: **S** (1 day)

**Total: 1-2 weeks**

### Cross-cutting locks impacted

- Multi-tenant: location data tenant-scoped from day 1 (mirrors all other FAD multi-tenant patterns)
- Privacy: required policy doc — handled in same wave
- No GDPR equivalent in Mauritius but EU visitors/staff make consent good practice

## 3. Idea B — Generic FAD usage analytics (defer until you have a question)

### Why defer

Building generic "track everything" analytics infra is real work (events pipeline, retention policy, query layer, dashboard). Tools like PostHog do this off-the-shelf for cheap. We already have `analytics_events` table — it's a thin substrate, not a full product.

Real ROI comes from answering specific questions:
- "Which Ops sub-page is unused?"
- "How long does Mary spend in Finance vs Inbox?"
- "What's the median time from check-in webhook to access-info-sent task completion?"

Each of these is answerable with a targeted query against the existing `analytics_events` + `tasks` + `inbox_threads` tables. **No new infrastructure needed for V1.**

### What's already there

`analytics_events` (mig 068) — schema TBD but exists. Used for: Ask Friday Core learning events, some inbox events.

### What to add only if a real question lands

- Page-view tracking (Next.js router events → POST /api/analytics/page-view)
- Session-duration tracking (start/end ping)
- Click-through funnels
- Dashboard UI in FAD with cohort analysis

### Recommendation

**Park Idea B**. When you have a specific question to answer, write a targeted query against existing tables. If 3+ questions accumulate without good data, revisit and build proper analytics.

## 4. Out of scope (Phase 1)

- Generic web analytics for product (above — deferred)
- Heat-map replay of staff movement (privacy concerns + low ROI)
- Cross-tenant analytics (tenant data isolation per multi-tenant lock)
- AI-driven anomaly detection on staff behaviour
- Customer-side location tracking (we should never track guests)

## 5. Cross-cutting locks impacted

- Multi-tenant: location data tenant-scoped from day 1
- ADR-004 (data freshness via SSE push) — fits naturally
- Privacy: written policy required, audit log of admin views
- ADR-008 (internal team comms in FAD Inbox) — location surfaces are a separate concern; chat about location stays in Inbox

## 6. Dependencies + ordering

Hard dependencies (must land first):
- HR roster with shift schedules (T4.7 in backlog) — needed for shift-aware activation
- PWA infrastructure — **shipped** ✓
- VAPID push notifications — **shipped 2026-05-23** ✓

Soft dependencies:
- Operations module v0.2 — current state OK for V1 surface

## 7. Open product decisions

- Map provider: Mapbox subscription cost ($/month)?
- Privacy policy: who drafts? Legal review needed?
- Field-staff onboarding: do we explain WHY they should opt-in, or just default-on with opt-out?
- Should non-field staff (Mathias, Mary, Ishant) also share location during work hours? (My recommendation: no — only roles where location is operationally useful)

## 8. 2026-05-26 Web/PWA Research Notes

- Browser geolocation requires HTTPS/secure context and user permission. The API supports current-position and watch-position flows while the page context is alive.
- The W3C geolocation spec treats location as sensitive and says recipients should request it only when necessary, use it only for the task it was provided for, dispose of it after that task unless retention is expressly permitted, and disclose collection purpose/retention/security clearly.
- Service workers can run for sync/push/offline events, but their lifecycle is browser-controlled and they can be terminated. They are not a reliable place to promise continuous GPS collection.
- Google Routes API supports `computeRoutes` / `computeRouteMatrix`; route duration can account for traffic when traffic-aware routing is requested.

References:

- https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API
- https://www.w3.org/TR/geolocation/
- https://web.dev/learn/pwa/service-workers
- https://learn.microsoft.com/en-gb/microsoft-edge/progressive-web-apps/how-to/background-syncs
- https://developers.google.com/maps/documentation/routes/reference/rest
