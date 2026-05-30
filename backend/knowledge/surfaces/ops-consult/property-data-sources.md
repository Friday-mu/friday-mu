# Property Data Sources For Operations

## Source Roles

Use the FAD property layer as the unified read model. When explaining data provenance:

- Guesty is the commercial/listing/reservation source for listing identity, bedrooms, bathrooms, accommodates/max guests, property type, amenities, booking dates, owner blocks, and guest-facing listing fields.
- Breezeway is the operational/property-task source for historical task property identity, Breezeway home IDs, operational property grouping, coordinates, and historical task/service evidence.
- FAD-owned overlays are authoritative for Friday-specific operations policy: property code, region/zone, size override, combo parent-child mapping, staff-facing notes, owner caps/financial overrides, and any manually reviewed corrections.
- Runtime Ops agent context should come through FAD/FridayOS API/cache surfaces (`/api/properties`, `/api/reservations`, `/api/tasks`) rather than direct external API calls.
- Direct Guesty/Breezeway API pulls are allowed for diagnostics, preview-only metadata audits, one-time backfills, and cache-coverage checks. They should not become the normal scheduling/planning path.
- Reservation overlays are the runtime source for occupancy. Calendar-pricing/cache fields are the runtime source for availability and price grounding when present.
- Missing `calendarPricing` does not mean a property is available or unpriced. It means the agent must say that pricing/availability is not currently proved by the cache.

## Latest Metadata Preview

Preview-only pull run from FAD tooling on 2026-05-26:

- Guesty listings summarized: 60.
- Breezeway properties summarized: 50.
- Merged property rows: 61.
- Matched in both Guesty and Breezeway: 48.
- Guesty-only rows: 11.
- Breezeway-only rows: 2.
- Unmapped Breezeway rows: `Grand Baie Heights` and `Office / Store / Admin`; treat these as non-unit/admin-style rows for Ops scheduling.
- Report mirror: `docs/operations/2026-05-26-ops-property-metadata-preview.json`.
- Tool: `backend/scripts/ops-property-metadata-preview.js`.
- Refreshed with keychain credentials on 2026-05-26T00:36:00Z; counts and sanitized merged data were unchanged except for the generated timestamp.

## FAD API Cache Coverage

Use `backend/scripts/fad-api-cache-coverage-report.js` to check whether the FAD/FridayOS cached runtime path exposes enough data for planning.

The script is read-only and checks:

- `guesty_listings` cache field coverage;
- `fad_properties` overlay field coverage;
- `guesty_reservations` freshness and field coverage;
- `source=breezeway` task enrichment, comments, costs, supplies, dates, assignees, and weak placeholder titles.

If `DATABASE_URL` is unavailable in the local environment, do not fake the result. Report that the runtime-cache coverage check is blocked and keep using the committed metadata preview only as source-API coverage evidence.

## Field Availability

Guesty listing payloads expose useful scheduling fields:

- bedrooms, bathrooms, beds, accommodates;
- property type and active/listed status;
- amenities and amenity exclusions;
- default check-in/check-out time;
- prices/currency and financial fields;
- full raw key shape in the FAD cache for later schema extension.
- reservation date/status overlays and cached calendar pricing where synced into FAD.

Breezeway property payloads expose useful operations fields:

- Breezeway property/home ID;
- reference property IDs;
- latitude and longitude;
- building/group fields;
- photos and notes presence;
- operational raw key shape.

## Safety Rules

- Never expose access details, Wi-Fi passwords, lockbox codes, key-safe details, gate codes, or raw owner/guest-sensitive property metadata in staff-facing or guest-facing agent output unless the user has permission and the UI route is designed for secrets.
- Coordinates can be used internally for travel-time planning. Do not show exact staff home coordinates in normal task instructions.
- Property size inference is draft guidance until confidence is high or a human override exists.
- Low-confidence property sizes should be reviewed before the agent relies on them for automated duration planning.
- Combo parent bookings should create child-unit tasks using Friday's combo map, even if Guesty/Breezeway expose the booking/property as a parent listing.
