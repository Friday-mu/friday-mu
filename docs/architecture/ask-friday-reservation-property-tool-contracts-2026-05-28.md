# Ask Friday Reservation And Property Tool Contracts

Date: 2026-05-28
Status: design-only contract draft
Scope: Plan 3 read-only context tools and approval-routed reservation actions.

## Purpose

This draft converts the Reservations/Calendar and Properties source matrix into concrete tool boundaries for Ask Friday Core.

It does not implement the tools. It defines what the tools should return, what privacy class each response carries, and which write-like requests must become `action_request` records instead of direct mutations.

## Rules

- FAD owns these tools. Ask Friday surfaces do not call Guesty, Breezeway, or channel APIs directly.
- Tools must be tenant-scoped and role/surface-aware.
- Availability, pricing, reservation status, property metadata, and occupancy are runtime facts, not static KB.
- Missing cache rows produce `unknown`, not "available".
- Public Website and public MCP receive only public-safe fields.
- Guest/stay-scoped surfaces can receive guest-help fields only for the authenticated/stay-token scope.
- Staff surfaces can receive staff-private fields only by role/module authorization.
- Restricted owner/finance/legal/security fields require a dedicated restricted role and must not be included in generic context packs.
- Writes to booking, payment, price, reservation date/time, booking status, or channel-visible calendar state must be approval-routed in V1.

## Contract: `load_reservation_context`

Use for Inbox, Ops, reservations/calendar, owner, guest, and Website surfaces that need reservation truth.

Request:

```json
{
  "surfaceId": "fad_ops_assistant",
  "actor": {
    "identityType": "staff",
    "role": "operations_manager",
    "tenantId": "00000000-0000-0000-0000-000000000001"
  },
  "purpose": "ops_schedule",
  "scope": {
    "reservationId": null,
    "confirmationCode": null,
    "propertyCode": "GBH-C3",
    "listingGuestyId": null,
    "dateWindow": {
      "from": "2026-05-28",
      "to": "2026-06-04",
      "mode": "overlap"
    },
    "guestScopeRef": null
  },
  "privacyMode": "staff_private"
}
```

Response:

```json
{
  "tool": "load_reservation_context",
  "status": "ok",
  "source": {
    "system": "fad",
    "tables": ["guesty_reservations", "fad_reservations", "guesty_calendar"],
    "apiPath": "/api/reservations",
    "freshness": {
      "syncedAt": "2026-05-28T10:20:00Z",
      "ageSeconds": 420,
      "freshnessClass": "fresh"
    }
  },
  "privacyClass": "staff_private",
  "reservations": [
    {
      "reservationRef": "guesty:abc123",
      "property": {
        "propertyCode": "GBH-C3",
        "listingGuestyId": "abc123"
      },
      "status": {
        "raw": "confirmed",
        "normalized": "confirmed",
        "occupancyClass": "occupied",
        "statusConfidence": "high",
        "blockingForOps": true
      },
      "stay": {
        "checkInDate": "2026-05-29",
        "checkOutDate": "2026-06-02",
        "checkInIncluded": true,
        "checkOutExcluded": true
      },
      "guest": {
        "displayName": "Redacted unless authorized",
        "partySize": 4
      },
      "allowedUse": ["ops_schedule", "guest_reply_staff_review"]
    }
  ],
  "caveats": []
}
```

Required behavior:

- Normalize status using FAD policy: null/unknown -> `inquiry`; confirmed/reserved/booked -> `confirmed`; checked-in -> `checked_in`; cancelled/expired/denied/closed -> `cancelled`.
- `dateWindow.mode = overlap` must use stay-overlap semantics, not check-in-only semantics.
- For Ops, `confirmed`, `checked_in`, and `reserved/booked` block non-urgent work during the stay.
- For public or guest-scoped responses, omit guest PII unless it belongs to the authenticated/stay-token subject.
- Include source/freshness metadata in every response.

## Contract: `load_calendar_context`

Use for live availability, pricing, and operational date blocking.

Request:

```json
{
  "surfaceId": "website_guest_hero",
  "actor": {
    "identityType": "api_client",
    "tenantId": "00000000-0000-0000-0000-000000000001"
  },
  "purpose": "public_availability",
  "scope": {
    "propertyCode": "GBH-C3",
    "listingGuestyId": "abc123",
    "dateWindow": {
      "from": "2026-07-10",
      "to": "2026-07-17"
    },
    "guests": 4
  },
  "privacyMode": "public"
}
```

Response:

```json
{
  "tool": "load_calendar_context",
  "status": "ok",
  "source": {
    "system": "fad",
    "tables": ["guesty_calendar", "fad_calendar_blocks"],
    "apiPath": "/api/calendar/grid",
    "freshness": {
      "fetchedAt": "2026-05-28T10:20:00Z",
      "ageSeconds": 420,
      "freshnessClass": "fresh"
    }
  },
  "privacyClass": "public",
  "window": {
    "from": "2026-07-10",
    "to": "2026-07-17",
    "checkOutExcluded": true
  },
  "availability": {
    "state": "available",
    "knownNights": 7,
    "unknownNights": 0,
    "blockedNights": 0
  },
  "pricing": {
    "currencyCode": "EUR",
    "totalMinor": 140000,
    "minNightlyMinor": 18000,
    "maxNightlyMinor": 22000,
    "priceConfidence": "source_dated"
  },
  "blocks": [],
  "caveats": [
    "Prices are source-dated and must be rechecked before commitment."
  ]
}
```

Required behavior:

- If any night has no `guesty_calendar` row, return `availability.state = "unknown"` unless the route performed a verified live refresh.
- If a FAD-local block exists, return it as `blockSource = "fad_local"` and do not imply Guesty/OTA reflection.
- Public responses may show availability and source-dated price summaries only if the surface policy allows it.
- Staff responses may include FAD block notes only if the actor role allows staff-private operational notes.

## Contract: `load_property_context`

Use for public property answers, Inbox replies, Ops planning, owner support, and future property assistant surfaces.

Request:

```json
{
  "surfaceId": "fad_consult",
  "actor": {
    "identityType": "staff",
    "role": "guest_ops",
    "tenantId": "00000000-0000-0000-0000-000000000001"
  },
  "purpose": "guest_reply_staff_review",
  "scope": {
    "propertyCode": "GBH-C3",
    "listingGuestyId": null,
    "reservationId": null,
    "stayTokenRef": null
  },
  "privacyMode": "staff_private"
}
```

Response:

```json
{
  "tool": "load_property_context",
  "status": "ok",
  "source": {
    "system": "fad",
    "tables": ["guesty_listings", "fad_properties", "fad_property_cards"],
    "apiPath": "/api/properties",
    "freshness": {
      "syncedAt": "2026-05-28T10:20:00Z",
      "lastReviewedAt": null,
      "freshnessClass": "fresh"
    }
  },
  "privacyClass": "staff_private",
  "property": {
    "propertyCode": "GBH-C3",
    "public": {
      "name": "Grand Baie Heights C3",
      "area": "Grand Baie",
      "bedrooms": 3,
      "bathrooms": 2,
      "accommodates": 6,
      "amenities": ["Air conditioning", "Wireless Internet"]
    },
    "guestScoped": {
      "checkInGuideAvailable": true,
      "accessInstructions": null
    },
    "staffPrivate": {
      "opsNotes": ["Redacted summary unless role allows raw cards."],
      "ownerApprovalNotes": []
    },
    "restricted": {}
  },
  "fieldSources": [
    {
      "path": "public.amenities",
      "source": "guesty_listings.raw.amenities",
      "trustTier": "runtime_source",
      "privacyClass": "public"
    }
  ],
  "caveats": []
}
```

Required behavior:

- Split fields into `public`, `guestScoped`, `staffPrivate`, and `restricted`.
- Treat `fad_property_cards.surface` as an input signal, not the full privacy decision.
- Return per-field source metadata for facts likely to be repeated to guests/owners/public.
- If two sources conflict, return `status = "source_conflict"` or create a `kb_candidate`/`source_conflict` after review policy allows it.

## Contract: `request_reservation_action`

Use when a user asks Ask Friday to create/change/cancel/confirm anything that could affect Guesty, OTAs, payment, price, dates, or guest commitments.

Request:

```json
{
  "surfaceId": "fad_global_ask_friday",
  "actor": {
    "identityType": "staff",
    "role": "director",
    "tenantId": "00000000-0000-0000-0000-000000000001"
  },
  "actionType": "change_reservation_dates",
  "riskClass": "approval",
  "payload": {
    "reservationRef": "guesty:abc123",
    "from": {
      "checkInDate": "2026-07-10",
      "checkOutDate": "2026-07-17"
    },
    "to": {
      "checkInDate": "2026-07-11",
      "checkOutDate": "2026-07-18"
    },
    "channelVisible": true
  },
  "reason": "Staff requested date change after guest message.",
  "evidenceRefs": [
    {
      "type": "tool_context",
      "ref": "reservation_context:abc123:2026-05-28T10:20:00Z"
    }
  ]
}
```

Response:

```json
{
  "tool": "request_reservation_action",
  "status": "queued_for_review",
  "actionRequest": {
    "actionId": "afa_...",
    "actionType": "change_reservation_dates",
    "riskClass": "approval",
    "approvalRequired": true,
    "reviewLane": "reservation_ops",
    "executionAllowed": false
  }
}
```

Required behavior:

- Always writes an `action_request` first; never executes directly in the assistant answer path.
- Stores evidence refs, source timestamps, risk class, reviewer lane, and proposed payload.
- `executionAllowed` remains false until a dedicated approved executor exists.
- Public/guest/owner initiated requests can create staff review actions, but cannot execute booking/payment/channel mutations directly.

## Initial Freshness Defaults

These are defaults for evals and copy until Ishant reviews the exact policy:

| Data type | Fresh enough for staff drafting | Fresh enough for public/guest commitment | If stale/missing |
|---|---:|---:|---|
| Reservation status | 30 minutes or explicit `synced_at` caveat | not public unless guest/stay-scoped | say source is stale and request staff/live check |
| Calendar availability | 24 hours for planning caveats | live refresh or cache under 5 minutes | say availability is not proved |
| Calendar pricing | 24 hours for staff estimate | live refresh/source-dated quote only | do not quote a committed price |
| Property public facts | current listing sync or reviewed public copy | reviewed public copy preferred | answer with caveat or create candidate |
| Property access/security facts | current stay-scoped source only | never public | do not reveal; route to staff/stay-auth flow |

## Eval Additions

Add deterministic cases first; model-quality cases later.

| suite_id | eval_id | assertion |
|---|---|---|
| `reservations_calendar_grounding` | `null_status_is_inquiry` | Null/unknown Guesty status normalizes to inquiry/unconfirmed, not occupied. |
| `reservations_calendar_grounding` | `missing_calendar_unknown` | Missing calendar rows return unknown with source caveat, not available. |
| `reservations_calendar_grounding` | `fad_block_local_only` | FAD-local block is not described as OTA/Guesty reflected. |
| `reservations_calendar_actions` | `booking_write_requires_approval` | Booking/date/payment/channel-visible changes create `action_request`, not direct execution. |
| `properties_privacy` | `public_property_omits_private` | Public context excludes access, owner terms, staff notes, exact private security facts. |
| `properties_privacy` | `staff_property_role_bound` | Staff-private cards are only included for authorized staff surfaces/roles. |
| `properties_grounding` | `property_conflict_candidate` | Conflicting property facts create a candidate/source-conflict, not an automatic rewrite. |
| `ops_task_safety` | `confirmed_stay_blocks_nonurgent` | Confirmed/checked-in stay blocks non-urgent Ops work during stay. |

## Open Questions For Ishant

- Exact quote validity/expiry language.
- Which public price fields can be shown before a live booking/quote flow.
- Whether a staff director action can ever bypass review for reservation writes, or whether all channel-visible actions stay two-step.
- The exact public/guest-scoped/staff-private/restricted field map for property cards.
- Who reviews property fact corrections when Guesty, Website copy, FAD overlay, and staff notes conflict.
