# Scheduling Methodology

## Objective Function

Optimize in this order:

1. Guest safety, access, comfort, check-in readiness, and review risk.
2. Correct skill match.
3. Feasible date and time windows.
4. Travel-time minimization and property clustering.
5. Staff fairness and sustainable workload.
6. Recurring non-urgent work completion.
7. Nice-to-have aesthetic or improvement work.

## Schedule Inputs

- Confirmed checkouts, arrivals, and reservation changes from Guesty.
- Tasks imported from Breezeway, including moved date/assignee updates, not only missing tasks.
- Reported issues, including unscheduled/unassigned pending state.
- Inbox/guest escalations and task comments.
- Recurring monthly/quarterly/semiannual tasks.
- Staff availability, leave, sick days, standby/off days, location, skills, and transport.
- Property occupancy, owner blocks, and late check-in/check-out where available.

## Drafting A Schedule

1. Normalize task list: dedupe imports, update moved dates/assignees, preserve comments, and avoid duplicate tasks.
2. Split combo bookings into child unit tasks with a parent property tag.
3. Estimate task duration from the matrix; if unknown, classify the task and overestimate slightly.
4. Group tasks by property/region before exact time assignment.
5. Assign skills before assigning people. Example: maintenance -> Bryan; cleaning -> Catherine/Bryan; owner/admin -> Franny/Mathias.
6. Add travel buffers between properties. Use Google travel times when available; otherwise use known constraints.
7. Place exact times in 15-minute increments and keep the visual schedule aligned to exact start time.
8. Keep all-day tasks when time is not known. Do not force fake times.
9. Flag unresolved constraints rather than hiding them.

## Travel Rules

- Bryan north-west-north by bus is expensive: about 2 hours each way. If west work is required, start early and leave west by 15:00.
- Once Bryan is in west he can use scooter locally. In north he can use scooter locally.
- North base for Mathias, Franny, Bryan: Cap Malheureux.
- Catherine base: Roche Terre.
- Ishant base: Le Datier Complex, Flic-en-Flac.
- Mary placeholder: Sodnac/Centre.
- When Google travel estimates are wired, use origin -> property -> property -> home/next duty, not straight-line distance.
- FAD endpoint shape for route estimates: `POST /api/operations/travel-time/estimate` with `{ origin: { lat, lng }, destination: { lat, lng }, departureTime }` or property-code fields `{ originPropertyCode, destinationPropertyCode, departureTime }`.
- If Google Routes is not configured, keep the schedule draft conservative and surface that exact blocker instead of pretending route data exists.

## Daily Replanning

When a new urgent issue comes in:

1. Decide urgency from guest impact, safety/hygiene, arrival timing, reputation risk, and owner terms.
2. Identify whether it requires maintenance, cleaning, inspection, owner approval, or guest communication.
3. Move the smallest number of tasks necessary.
4. Prefer pausing/rescheduling recurring non-urgent work over breaking guest-critical tasks.
5. Preserve audit trail: what moved, why, who approved, and whether the owner was notified.

## Visual Schedule Behavior

- Dropping a task at 09:00 should visually start at 09:00, not at the start of the 08:00-10:00 block.
- Readable view may render tasks as larger blocks so labels remain visible.
- Actual view should render width from estimated duration so Franny can see the real day shape, overlaps, and travel gaps.
- Undo must be available after bulk/apply actions.
- Clear schedule times means keep tasks on their day but remove exact times.
- Clear times and assignees is a stronger reset and should be reversible.

References:
- Field service route planning: https://trackroad.com/knowledge-center/route-planning-field-service/
- Schedule optimization overview: https://www.fieldservicely.com/blog/how-to-optimize-field-service-scheduling
