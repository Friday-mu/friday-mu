# Field Location And Live Dispatch

## Purpose

Use field-staff location only to answer operational dispatch questions:

- who is closest to an urgent property issue;
- whether an active task can be paused or re-ordered;
- estimated arrival time after current task and travel;
- which next task is impacted by a live escalation.

Do not use location tracking for generic productivity surveillance, guest-facing claims, owner-facing claims, or staff ranking.

## V1 Collection Model

Use the conservative web/PWA model first:

- Ask explicit consent before sharing location.
- Collect from the foreground FAD/PWA session using browser geolocation.
- Start collection only when the user is on duty or has an active field task open.
- Stop collection when the user goes off duty, completes/pauses the active task, disables sharing, or closes the app.
- Show a visible sharing indicator and a stop-sharing control to the staff member.

Background or app-closed tracking is not a V1 web promise. Browser geolocation is a document/page capability with user permission; reliable always-on background tracking likely needs a native wrapper or mobile app with platform background-location permissions and a written staff policy.

## Access Control

- Director and Ops Manager can view live field locations for dispatch.
- Field staff can see their own sharing status and last submitted point.
- Field staff should not see everyone else's location by default until a peer-coordination policy is approved.
- Owners, guests, vendors, and non-ops roles never see staff location.
- Every admin view of live staff location should be audit logged.

## Data Minimization

- Store current/last-known location and recent task-linked pings only.
- Prefer short retention: current point plus active-shift/task history; purge precise trails after operational need ends unless a policy explicitly allows longer retention.
- Do not show exact staff home pins in normal UI or prompts.
- Mark stale points clearly: e.g. `last known 18 min ago`, not `live`.
- Encrypt/guard precise latitude/longitude at the database/API boundary like other sensitive operational data.

## Dispatch Logic

When asked who should respond to an urgent issue, Friday Consult should combine:

1. current or last-known staff location;
2. active task status, remaining estimated minutes, and whether the task can be paused;
3. staff skills and transport;
4. Google Routes travel time from current point to target property;
5. next scheduled task impact;
6. guest/owner urgency and approval/cost constraints.

Output shape:

- candidate responder;
- confidence and missing data;
- ETA now vs ETA after current task;
- what must be moved or paused;
- whether vendor escalation is safer.

Example reasoning: Bryan is 10 minutes from the target but is mid-maintenance; Catherine is 25 minutes away and cannot do plumbing; Ishant is 8 minutes away and can do a quick west reset, so use Ishant for a reset and keep Bryan on his current task unless the issue escalates.

## Pausing And Replanning

- Field staff may pause a task when the task cannot continue, an urgent dispatch interrupts it, supplies are missing, or manager approval is needed.
- Pausing must record reason, location/time context where available, and the next action.
- Live replan should move the smallest number of tasks needed, preserve guest-critical work first, and surface which tasks become at risk.
- Friday Consult can draft the replan, but applying it remains a staff-approved action.

## Suggested Future Schema

- `staff_location_pings`: tenant_id, user_id, task_id, lat, lng, accuracy_m, source, sharing_mode, collected_at, expires_at.
- `staff_presence_status`: tenant_id, user_id, on_duty, active_task_id, sharing_enabled, last_seen_at, last_location_ping_id.
- `staff_location_view_audit`: tenant_id, viewer_user_id, viewed_user_id, reason, viewed_at.

Use tenant-scoped route guards from day one.

## Google Routes Integration

- Use `POST /api/operations/travel-time/estimate` for current-location to property and property-to-property ETAs.
- Request only duration/distance fields needed for dispatch; avoid broad route payloads.
- Use traffic-aware routing when configured and useful for same-day dispatch.
- Fallbacks, in order: live point, last-known point with stale label, current task property, staff base area, manual estimate.

## Guardrails For The Agent

- Never imply always-on tracking is live unless the product has implemented it and the staff member has granted permission.
- Never infer exact home address from area-level bases like Cap Malheureux, Roche Terre, Sodnac, or Le Datier.
- Never expose precise staff coordinates in normal natural-language output; use ETA and proximity labels.
- If live location is missing, say it is missing and fall back to schedule/property/base data.
