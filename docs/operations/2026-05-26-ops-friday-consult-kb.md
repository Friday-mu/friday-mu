# Ops Friday Consult Knowledge Base - 2026-05-26

This document mirrors the first Operations-specific Friday Consult KB shipped in FAD. Runtime source files live under `backend/knowledge/surfaces/ops-consult/`.

## Runtime Surface

- Surface key: `ops-consult`
- Backend route: `POST /api/operations/consult`
- UI surface: Operations > Schedule > Friday Consult panel
- User-facing module name: Friday Consult
- Mutation rule: draft first, apply only after staff action, keep undo for reversible schedule operations.

## Included Knowledge Packs

- `SKILL.md`: identity, action protocol, planning ladder, output style.
- `staff-roster-rules.md`: staff names, bases, transport, skills, night/weekend rules, fairness controls.
- `task-duration-skill-matrix.md`: property size rules, combo properties, task durations, booking triggers, skill ownership.
- `property-data-sources.md`: Guesty vs Breezeway vs FAD source roles, latest metadata-preview counts, and secret/coordinate safety rules.
- `property-ops-metadata.md`: compact Guesty/Breezeway property size, capacity, source coverage, and coordinate-coverage map for scheduling context.
- `scheduling-methodology.md`: monthly -> weekly -> daily -> live replan method, travel rules, exact-time visual behavior.
- `owner-terms-approval-rules.md`: owner approval thresholds, urgent override, owner stay cleaning defaults, records.
- `vendors-maintenance-pricing.md`: standardized agreement assumption, preferred vendors, lead times, maintenance escalation, internal pricing matrix direction.
- `turnover-maintenance-quality.md`: STR cleaning, post-clean, arrival inspection, preventative maintenance, maintenance triage.
- `srl-supplies-rules.md`: welcome pack and SRL quantity rules.
- `learning-and-controls.md`: what the agent may learn, what requires human review, confidence gates, audit controls.

## Terms Page Read

Live source checked on 2026-05-26:
https://www.friday.mu/fr-terms-and-conditions

Ops-critical policy extracted:

- Cleaning Fee funds housekeeping, turnover logistics, welcome packs, and essential restocking. It is distinct from Owner Revenue.
- Core services include booking/payment management, guest communication, housekeeping oversight, maintenance scheduling/supervision, and monthly owner reporting.
- Direct repair labour/material costs are owner-chargeable Other Expenses.
- Owner/owner-guest stays require a self-clean vs professional-clean decision at least 48 hours before checkout. If no answer, default to professional clean and charge owner.
- Routine incident spend without prior owner approval is up to the greater of MUR 2,500 or 10% of Total Guest Paid, capped at MUR 20,000.
- Above routine limit and up to MUR 20,000: request owner approval; no response after 24 hours is deemed approved for the specified amount.
- Urgent override can act up to MUR 20,000 when owner is unreachable/non-responsive and delay risks guest cancellation, platform dispute, low review, reputational harm, health/safety/hygiene, or financial/reputational damage.
- Above MUR 20,000 always requires explicit owner approval.
- Major repairs/upgrades above MUR 20,000 require owner approval; coordination fee up to 10% plus VAT may apply.
- Lockbox/key-safe supply, maintenance, and code changes are authorized operationally.

## Vendor And Maintenance Update

Captured from Ishant on 2026-05-26:

- No known property-specific operational agreement exceptions. Treat operating rules as standardized unless a financial/property override is explicitly stored.
- Financial agreement details remain property-specific where present: commission, payment/cost treatment, owner caps, and charge rules.
- Bryan Henri is the first-line internal maintenance owner. He covers north by scooter and west by bus plus west scooter. West work should normally fit roughly 08:00-15:00.
- Ishant Ayadassen can cover simple west reset tasks when Bryan cannot get there quickly.
- Rodney is a west vendor for AC, plumbing, and some limited electrical work. Use when Bryan cannot handle or cannot be there in time. Assume at least 4 hours lead time and average pricing.
- Joe is a new west general maintenance vendor to validate. Assume at least 4 hours lead time and average pricing.
- Faiz handles complex electrical work across north and west. Assume 1 day lead time and higher pricing.
- Adrien / Multi-Maintenance Limited handles larger complex work across north and west. Assume 2 days lead time and higher pricing.
- Internal work by Bryan needs a maintenance charge matrix before owner-visible charges can be automated.

## Property Metadata Preview

Added preview-only tooling:

```bash
cd backend
node scripts/ops-property-metadata-preview.js \
  --source all \
  --guesty-keychain \
  --breezeway-keychain \
  --out ../docs/operations/2026-05-26-ops-property-metadata-preview.json
```

The script pulls available Guesty listing metadata and Breezeway property metadata, summarizes operational fields, infers draft Ops size, and preserves raw key shape without storing raw external payloads or credentials. It does not mutate FAD tables.

Latest preview output:

- Report: `docs/operations/2026-05-26-ops-property-metadata-preview.json`
- Guesty listings summarized: 60
- Breezeway properties summarized: 50
- Merged property rows: 61
- Matched in both Guesty and Breezeway: 48
- Guesty-only rows: 11
- Breezeway-only rows: 2
- Unmapped Breezeway rows: 2 (`Grand Baie Heights`, `Office / Store / Admin`) and both are non-unit/admin-style rows for Ops scheduling.
- Breezeway coordinate coverage: 48 properties. Use exact pins later for Google travel-time routing; current prompt context only carries source coverage, not raw access fields.

## Travel-Time Scaffold

Added a server-side Google Routes adapter for Ops scheduling:

- Endpoint: `POST /api/operations/travel-time/estimate`
- Request: `{ "origin": { "lat": -20.1, "lng": 57.5 }, "destination": { "lat": -20.2, "lng": 57.6 }, "departureTime": "2026-05-26T09:00:00+04:00" }` or `{ "originPropertyCode": "GBH-C8", "destinationPropertyCode": "VA-1", "departureTime": "2026-05-26T09:00:00+04:00" }`
- Response: provider, normalized origin/destination, origin/destination source, optional resolved property labels, duration seconds/minutes, static duration seconds, and distance meters.
- Config: `GOOGLE_ROUTES_API_KEY` with optional `GOOGLE_ROUTES_URL` override. If the key is missing, the endpoint returns `google_routes_not_configured` with `configured:false`.
- Scope: server-only scaffold. It does not expose a browser key and it does not schedule tasks by itself.

## External Research Summaries

- Workforce scheduling should model demand, skills, days off, requests/preferences, and fairness together. This supports the Ops agent's monthly -> weekly -> daily method.
- Field-service scheduling should combine service duration plus travel time, skill match, working hours, and route grouping.
- STR turnover quality depends on detailed room-by-room checklists, restocking before/while cleaning, photo/inspection evidence, and immediate escalation of maintenance gaps.
- Preventative maintenance should cover HVAC/AC, plumbing/water, electrical/lighting, exterior/access, safety, and visible guest-risk areas.

References:

- https://www.sciencedirect.com/science/article/pii/S037722170300095X
- https://link.springer.com/article/10.1007/s12351-025-00903-7
- https://trackroad.com/knowledge-center/route-planning-field-service/
- https://resources.tellusapp.com/passive-income/short-term-rentals/cleaning-and-turnover-guide
- https://www.unitedffs.com/preventive-maintenance-guide/
- https://www.guesty.com/blog/5-tips-to-effectively-stock-and-manage-your-airbnb-inventory/

## Known Non-Blocking Gaps

- Property-specific financial agreement fields still need to be read from the relevant property/finance records when automating owner charges.
- Vendor live availability and exact prices are still not available. Lead times are planning assumptions.
- Exact staff addresses are approximated by area only.
- Google travel-time API scaffold is wired at `POST /api/operations/travel-time/estimate`, but live estimates require `GOOGLE_ROUTES_API_KEY` and exact staff/property pins.
- The current apply path supports schedule draft application, clear, and undo. Full roster mutation/application remains future work.
