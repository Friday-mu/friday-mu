# Field-staff map + usage telemetry — scoping pack v0.1 (DRAFT)

> Status: DRAFT for Ishant review. Promote to Notion (FAD Scoping zone) when ready to lock.
> Authored: 2026-05-24 (Ishant + Claude).
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
| 1 | **Opt-in model** — per-user toggle, mandatory during shift, or always-on? | Per-user toggle with shift-time auto-on. Field staff opt-in once, location active during scheduled shift hours only |
| 2 | **Accuracy** — IP geolocation (low), browser geolocation API (medium, GPS-when-available), native PWA GPS (high, requires PWA install) | PWA-install required for field staff. They get the FAD PWA + grant always-on location during shifts. Other users see no location request |
| 3 | **Update frequency** — continuous (battery cost), every N minutes, on-demand only | Every 5 minutes during shift hours. Coarse polling balances battery + freshness. On-demand "refresh location" button for urgent ops |
| 4 | **Storage** — current location only, or location history? Retention? | Current + 24h history. Beyond 24h, only daily summary (last known per hour) for 30 days. Then purged |
| 5 | **Display** — Ops module map sub-page, Roster live overlay, or both? | Both. Roster gets a "live now" toggle to see current positions overlaid on the schedule. Ops gets a dedicated "field map" sub-page for live ops |
| 6 | **Geographic scope** — full map of Mauritius, just Friday property cluster zones, or both? | Full Mauritius with property markers + field-staff markers overlaid. Clustering when zoomed out |
| 7 | **Privacy & consent** — written policy, audit log of who viewed location, blackout zones (home address)? | Written policy required before launch. Audit log of admin views. Blackout: location auto-pauses outside shift hours (covered by opt-in model) |
| 8 | **Use cases priority** — view-only first, or auto-suggest closest staff for new tasks too? | View-only V1. Auto-suggest in V2 (after Roster Phase 2 ships) |
| 9 | **Field staff side UX** — do they see their own location? Do they see other staff? | Yes both. Builds trust ("I see the same info as Mathias") + supports peer coordination ("Sarah is already at LB-2, I'll head to PT-3") |
| 10 | **Offline behavior** — what if field staff loses signal in a property without wifi? | Cache last position client-side, mark "last known: 12 min ago" on the map. Re-sync on reconnect |
| 11 | **Map provider** — Mapbox (paid, polished), OpenStreetMap + Leaflet (free, less polished), Google Maps (paid, polished)? | Mapbox. Already in use by Friday Website for property locations; reuse setup |
| 12 | **Integration with task assignment** — when assigning a task, show distance-to-property next to each candidate assignee? | V2. V1 = map view only |

### Architecture sketch (not locked)

```
[Field staff PWA on phone]
       ↓ geolocation API on 5min interval (in PWA service worker)
   FAD /api/location/heartbeat
       ↓
   analytics_events (event_type='location_heartbeat', payload={lat,lng,accuracy,ts})
       ↓ SSE LISTEN/NOTIFY
   FAD Ops Field Map UI (live view)
       +
       ↓
   user_location_current materialized view (last heartbeat per user_id, refreshed on each heartbeat)
```

Reuses:
- `analytics_events` table (mig 068)
- VAPID push notifications (working as of 2026-05-23) for "your shift is starting — please open the app" reminder
- Existing PWA infrastructure (manifest, service worker)
- SSE LISTEN/NOTIFY for live updates (already powers other FAD live surfaces)

New:
- `user_location_current` table or view
- Heartbeat endpoint with rate-limit + tenant guard
- Map UI on Ops module (Mapbox)
- Privacy policy doc + consent capture UI
- Shift-aware activation logic (only collect during scheduled shifts per HR roster)

### Effort estimate (rough)

- Backend: heartbeat endpoint + storage + view: **S** (1 day)
- Frontend: Ops map sub-page with Mapbox: **M** (2-3 days)
- Frontend: Roster live overlay: **S** (1 day)
- PWA: geolocation collection in service worker: **M** (2-3 days — service workers are fiddly)
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
