# Ask Friday Reservations, Calendar, And Properties Source Matrix

Date: 2026-05-28
Status: Plan 3 research/source-truth packet
Scope: Reservations/calendar and properties surfaces for Ask Friday Core.

## Purpose

This packet turns the Plan 3 Reservations/Calendar and Properties subplans into a source-of-truth map before any dedicated agent wiring.

The immediate goal is to make Ops, Inbox, Website guest surfaces, owner surfaces, and future reservation/property agents safer by defining which facts come from live runtime data, which facts can become KB, and which actions must stay approval-gated.

## Current Runtime Truth

FAD already has the correct integration boundary: shared Guesty/Breezeway data should flow through FAD wrappers, cached tables, and FAD APIs, not module-local external clients.

Key runtime paths:

| Runtime need | Current source | Repo path | Current rule |
|---|---|---|---|
| Reservation list/detail | Guesty reservation cache plus `fad_reservations` overlay | `backend/src/reservations/index.js` | Guesty remains commercial reservation source; FAD overlay owns Friday-specific fields like cleaning, special requests, notes, driver assignment, arrival/departure, cancellation overlay, folio/payment facts. |
| Reservation sync | Guesty pull into `guesty_reservations` | `backend/src/reservations/sync.js` | Listings sync before reservations; cache covers the configured time window. |
| Reservation status semantics | `normalizeReservationStatus` + tests | `backend/src/reservations/index.js`, `backend/src/reservations/scheduleOverlap.test.js` | Null/unknown Guesty status maps to `inquiry`, not confirmed/occupied. Passive `guesty_pull` overlay status cannot override newer/empty Guesty truth unless intentionally cancelled/manual. |
| Calendar availability/pricing | `guesty_calendar` | `backend/migrations/061_guesty_calendar.sql`, `backend/src/properties/calendar_grid.js` | One row per stay night; check-in included, check-out excluded. Missing cache rows mean unknown, not available. |
| Calendar grid | `/api/calendar/grid` | `backend/src/properties/calendar_grid.js` | Reads `guesty_calendar`; FAD block overlay flips availability to false. |
| Calendar staff blocks | `fad_calendar_blocks` overlay | `backend/migrations/090_calendar_blocks.sql`, `backend/src/properties/calendar_grid.js` | FAD-local only today. It does not write through to Guesty or OTAs yet. |
| Availability search | `/api/availability/search` | `backend/src/availability/search.js` | Uses active Guesty listings plus calendar cache for staff-side matching. `cache_missing` is a first-class unavailable/unknown state. |
| Website public availability | `/api/public/availability` | `backend/src/public/availability.js` | Website calls FAD with scoped public API JWT; FAD owns Guesty credentials and refreshes/falls back internally. |
| Property list/detail | Guesty listing cache plus `fad_properties` overlay | `backend/src/properties/index.js` | Guesty listing cache supplies commercial/listing facts; FAD overlay supplies lifecycle, code, zone, tier, onboarding, owner caps, cards, photos, translations, and reviewed corrections. |
| Property AI cards | `fad_property_cards` | `backend/migrations/077_properties_fad_native.sql` | Intended AI knowledge surface; `surface` is only a coarse guest/internal/both flag and still needs Ask Friday privacy enforcement before public use. |
| Breezeway operations evidence | `tasks` rows and enrichment payloads | `backend/src/tasks/*`, `backend/migrations/054_breezeway_task_import.sql` | Use as operational/task provenance, not as listing/reservation commercial truth. |

## Source Matrix

| fact_or_rule | source | source_url_or_path | source_date | source_type | trust_tier | owner | privacy_class | allowed_surfaces | freshness_rule | candidate_action | ishant_review |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Reservation occupancy/status must distinguish inquiry/unconfirmed from confirmed/checked-in for Ops scheduling and guest communication. | FAD reservation status normalization | `backend/src/reservations/index.js` | 2026-05-28 | runtime_data | runtime_source | FAD | staff_private/guest_scoped | Inbox, Ops, reservations/calendar | on reservation API/status code change | eval rule | no |
| Null Guesty status is inquiry/unconfirmed, not confirmed. | FAD tests and status normalizer | `backend/src/reservations/scheduleOverlap.test.js`, `backend/src/reservations/index.js` | 2026-05-28 | friday_truth | canonical | FAD | staff_private | Ops, Inbox, reservations/calendar | static until status policy changes | keep eval | no |
| Confirmed/reserved/booked reservations block normal property work during the stay unless the work is urgent, guest-requested, or cannot wait until checkout. | Friday ops policy plus Guesty status model | `backend/knowledge/surfaces/ops-consult/scheduling-methodology.md`, Guesty reservation docs | 2026-05-28 | friday_truth | canonical | Ops | staff_private | Ops | review on ops policy change | harness rule | no |
| Check-in date is included and check-out date is excluded for FAD stay-night calculations. | FAD calendar migration | `backend/migrations/061_guesty_calendar.sql` | 2026-05-28 | runtime_data | runtime_source | FAD | public/staff split | Ops, Inbox, Website if public-safe, reservations/calendar | static unless calendar convention changes | eval rule | no |
| Availability/rates must be live lookup or source-dated context, never memorized static KB. | FAD calendar cache plus Guesty availability docs | `backend/src/properties/calendar_grid.js`; `https://open-api-docs.guesty.com/docs/calendar-block-types` | 2026-05-28 | runtime_data | runtime_source | FAD/Guesty | public/staff split | all property-aware surfaces by class | include fetched/synced timestamp; unknown if cache missing | tool contract | no |
| Missing calendar cache rows mean unknown, not available. | FAD calendar grid and availability search | `backend/src/properties/calendar_grid.js`, `backend/src/availability/search.js` | 2026-05-28 | runtime_data | runtime_source | FAD | public/staff split | Ops, Website, reservations/calendar | live lookup or explicit cache-missing caveat | eval rule | no |
| FAD calendar blocks override FAD calendar-grid availability but do not currently flow to Guesty or OTAs. | FAD calendar block route/migration | `backend/src/properties/calendar_grid.js`, `backend/migrations/090_calendar_blocks.sql` | 2026-05-28 | runtime_data | runtime_source | FAD | staff_private | FAD Calendar, Ops | review when Guesty/channel-manager write-through lands | ADR/action policy | no |
| Booking, payment, price override, reservation date change, and Guesty/OTA-impacting block actions must be approval/tool-gated in V1. | Ask Friday action policy plus Guesty reservation update docs | `docs/architecture/ask-friday-core-v1-2026-05-23.md`; `https://open-api-docs.guesty.com/docs/reservations-v3-booking-flow` | 2026-05-28 | policy | canonical | Ask Friday Core/FAD | varies | all write-capable surfaces | static until action ADR changes | action contract | no |
| Guesty supports reservation quote/inquiry/instant booking flows, but Friday should not expose direct autonomous booking writes until a verified FAD tool contract exists. | Guesty Booking Engine/Open API docs | `https://booking-api-docs.guesty.com/docs/new-reservation-creation-flow`, `https://open-api-docs.guesty.com/docs/create-a-reservation` | 2026-05-28 | external_api | official_source | Guesty/FAD | staff_private/public-safe subset | reservations/calendar, Website after review | review when integration implemented | ADR/tool contract | yes |
| Guesty reservation updates should be queued/delayed, not rapid-fire, when implemented. | Guesty reservation V3 docs | `https://open-api-docs.guesty.com/docs/reservations-v3-booking-flow` | 2026-05-28 | external_api | official_source | Guesty/FAD | staff_private | reservation tools only | re-check before implementation | implementation note | no |
| Inquiry status can exist without calendar blocking; confirmed/reserved visibility/blocking differs. | Guesty Help Center sync article | `https://help-lite.guesty.com/hc/en-gb/articles/24924815894429-Which-reservations-are-synced-to-Guesty` | 2026-05-28 | external_api | official_source | Guesty/FAD | staff_private/public-safe subset | Ops, Inbox, reservations/calendar | re-check if Guesty semantics change | eval case | no |
| Public property facts are name, area, public amenities, bedrooms/bathrooms, accommodates, public photos/descriptions, and public policies. | Guesty listing fields plus reviewed FAD/Website copy | `backend/src/properties/index.js`; `https://open-api-docs.guesty.com/docs/searching-for-available-listings-and-all-listings` | 2026-05-28 | runtime_data | runtime_source | FAD/Website | public | Website guest, public MCP after review, staff | on listing/public copy update | property context pack | yes |
| Guesty listing facts are not enough for staff operations; FAD overlays own Friday-specific lifecycle, code, zone, tier, owner caps, cards, translations, and reviewed corrections. | FAD property overlay | `backend/migrations/077_properties_fad_native.sql`, `backend/src/properties/index.js` | 2026-05-28 | runtime_data | runtime_source | FAD | staff_private/restricted split | staff surfaces by role | on property overlay update | context-pack split | no |
| Property cards are a promising AI KB surface, but their `surface` flag is not sufficient by itself for public/private/guest/staff/restricted enforcement. | FAD property cards schema | `backend/migrations/077_properties_fad_native.sql` | 2026-05-28 | runtime_data | runtime_source | FAD | varies | properties, Inbox, Ops, Website after policy | require classification before public publish | policy/eval gap | yes |
| Access codes, Wi-Fi passwords, lockbox/key-safe/gate details, staff notes, exact private coordinates, owner terms, vendor notes, and issue history are not public facts. | Ask Friday privacy policy plus Ops property KB | `backend/knowledge/surfaces/ops-consult/property-data-sources.md`, `backend/knowledge/global/critical-rules/SKILL.md` | 2026-05-28 | friday_truth | canonical | FAD/Ops | staff_private/restricted/guest_scoped | authorized staff/stay-scoped only | static until privacy ADR changes | privacy eval | no |
| Breezeway is operational evidence and task history, not commercial listing/reservation authority. | FAD ops KB and task import paths | `backend/knowledge/surfaces/ops-consult/property-data-sources.md`, `backend/migrations/054_breezeway_task_import.sql` | 2026-05-28 | runtime_data | runtime_source | FAD/Ops | staff_private | Ops, Properties, Analytics | on Breezeway integration change | provenance rule | no |

## Harness Implications

- Reservations/calendar should start as a context/tool provider, not a public persona.
- Ops and Inbox can consume reservation/property context now through existing FAD APIs, but answers must carry freshness caveats for availability, pricing, and unknown cache states.
- Ask Friday should not call `/api/calendar/block` directly as a free-form autonomous action. In V1 it should create an approval-routed action request unless the staff UI deliberately invokes an authorized FAD Calendar tool.
- Public Website and public MCP should consume public-safe context packs/API responses only. They must not load raw `fad_property_cards` without classification.
- Property fact conflicts should create `kb_candidate` or `source_conflict` records; they should not rewrite canonical facts.
- Reservation write-through to Guesty, quote creation, price override, booking creation, date changes, and OTA-reflecting blocks need a separate tool contract, queueing strategy, eval suite, and staff approval path.
- For Ops planning, occupancy context must be date-overlap based and must treat confirmed/reserved/checked-in as blocking normal non-urgent work. Inquiry/null/unconfirmed should not be treated as occupied.

## First Tool Contracts To Design Later

These are not implemented by this packet. The design-only contract draft is now in `docs/architecture/ask-friday-reservation-property-tool-contracts-2026-05-28.md`.

1. `load_reservation_context`
   - Inputs: date window, property/listing id/code, reservation id/confirmation code, guest scope, purpose.
   - Outputs: compact status, dates, occupancy/blocking semantics, guest-safe or staff-private fields by scope, source timestamp.
   - Must include: `status_confidence`, `source`, `synced_at`, `privacy_class`.

2. `load_calendar_context`
   - Inputs: listing/property id/code, date range, guests, purpose.
   - Outputs: per-night availability/pricing summary, cache coverage, block reasons by visibility class, source timestamp.
   - Must include: explicit `unknown` state when rows are missing.

3. `load_property_context`
   - Inputs: property id/code/listing id, surface id, user role, stay/owner scope if present.
   - Outputs: public, guest-scoped, staff-private, or restricted context pack.
   - Must include: per-field source and freshness.

4. `request_reservation_action`
   - Inputs: proposed action, reservation/listing ids, rationale, risk, source evidence.
   - Outputs: action request id, required reviewer, no direct mutation until approved.
   - Must cover: create booking/inquiry, date change, status change, price/discount, payment-sensitive action, channel-visible block.

## Eval Cases To Add

1. Null Guesty status maps to inquiry/unconfirmed and does not block Ops like a confirmed stay.
2. Confirmed reservation blocks non-urgent maintenance during stay.
3. Urgent guest-requested issue during occupancy is allowed with explanation and staff assignment.
4. Missing calendar cache rows cause a source/freshness caveat instead of an availability claim.
5. FAD-local block is described as local unless Guesty write-through evidence exists.
6. Public property answer omits access/security/owner/staff facts.
7. Staff property answer can use internal cards only when role/surface allows it.
8. Booking/payment/date-change request creates an approval-routed action, not a direct write.
9. Guesty quote/booking flow cannot be used until the dedicated tool contract is enabled and eval-gated.

## Open Gaps

- Exact Guesty write-through path for manual blocks, booking creation, reservation date/time changes, quote creation, and OTA reflection must be verified before implementation.
- Quote validity/expiry and public price wording need Ishant review.
- Public versus guest-scoped versus staff-private property-field classification needs Ishant review before property context packs are published.
- `fad_property_cards.surface` needs a richer privacy/access layer before public use.
- Browser/team workflow QA remains pending for real Inbox and Ops staff scenarios; API/model smoke alone is not team-useful proof.
- Notion mirrors should be refreshed after this packet is accepted so the recovery path does not point at stale deployment status.

## Sources

- Guesty Open API - calendar block types: https://open-api-docs.guesty.com/docs/calendar-block-types
- Guesty Open API - reservation V3 booking flow and updates: https://open-api-docs.guesty.com/docs/reservations-v3-booking-flow
- Guesty Booking Engine API - reservation quote flow: https://booking-api-docs.guesty.com/docs/new-reservation-creation-flow
- Guesty Open API - create a reservation: https://open-api-docs.guesty.com/docs/create-a-reservation
- Guesty Help Center - which reservations sync to Guesty: https://help-lite.guesty.com/hc/en-gb/articles/24924815894429-Which-reservations-are-synced-to-Guesty
- Guesty Open API - searching for available listings and all listings: https://open-api-docs.guesty.com/docs/searching-for-available-listings-and-all-listings
- Guesty Help Center - availability tools: https://help.guesty.com/hc/en-gb/articles/24372252863261-Utilizing-availability-tools-to-control-when-a-listing-can-be-booked
