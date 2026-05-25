# Property Data Sources For Operations

## Source Roles

Use the FAD property layer as the unified read model. When explaining data provenance:

- Guesty is the commercial/listing/reservation source for listing identity, bedrooms, bathrooms, accommodates/max guests, property type, amenities, booking dates, owner blocks, and guest-facing listing fields.
- Breezeway is the operational/property-task source for historical task property identity, Breezeway home IDs, operational property grouping, coordinates, and historical task/service evidence.
- FAD-owned overlays are authoritative for Friday-specific operations policy: property code, region/zone, size override, combo parent-child mapping, staff-facing notes, owner caps/financial overrides, and any manually reviewed corrections.

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

## Field Availability

Guesty listing payloads expose useful scheduling fields:

- bedrooms, bathrooms, beds, accommodates;
- property type and active/listed status;
- amenities and amenity exclusions;
- default check-in/check-out time;
- prices/currency and financial fields;
- full raw key shape in the FAD cache for later schema extension.

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
