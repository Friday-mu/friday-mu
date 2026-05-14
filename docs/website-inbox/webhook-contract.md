# friday.mu → FAD website inbox — webhook contract

> Hand this file to the friday.mu Claude session. It's the authoritative
> spec for what the FAD endpoint expects.

## Endpoint

```
POST https://gms.friday.mu/api/inbox/website/friday-website
```

Production. The path `/api/inbox/website/*` is **distinct** from
`/api/inbox/conversations*` (which is the legacy GMS-proxied guest
messaging inbox).

## Authentication — HMAC-SHA256

Same pattern as the Bokun webhook on friday.mu (`app/api/webhooks/bokun/route.ts`).

### Shared secret

Environment variable on both sides:

```
FRIDAY_WEBSITE_INBOX_SECRET=<hex string, 64 chars>
```

Generate once with `openssl rand -hex 32`. Coordinate via Ishant on
the shared value. Never log it; never commit it.

### Request headers

```
Content-Type: application/json
X-Friday-Inbox-Timestamp: <unix milliseconds, integer>
X-Friday-Inbox-Signature: <hex>
```

### Computing the signature

```ts
import { createHmac } from 'node:crypto';

const timestamp = Date.now().toString();
const body = JSON.stringify(payload);  // exact bytes you send

const signature = createHmac('sha256', process.env.FRIDAY_WEBSITE_INBOX_SECRET!)
  .update(`${timestamp}.${body}`, 'utf8')
  .digest('hex');

await fetch('https://gms.friday.mu/api/inbox/website/friday-website', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Friday-Inbox-Timestamp': timestamp,
    'X-Friday-Inbox-Signature': signature,
  },
  body,
});
```

### Verification rules (what we check)

- Timestamp parses (unix ms or ISO 8601).
- Timestamp within ±5 minutes of server time (anti-replay).
- HMAC-SHA256(secret, `${timestamp}.${rawBody}`) === signature (constant-time compare, case-insensitive hex).

Any of these fail → **HTTP 401**, body `{ error: 'Unauthorized', reason: '<which check>' }`. friday.mu should NOT retry on 401.

## Payload envelope

```jsonc
{
  "event_type": "booking.proof_uploaded",  // one of the 5 below
  "source": "website",                      // optional, defaults to 'website'
  "data": {
    // event-specific fields — see below
  }
}
```

The `data` envelope wraps the actual payload. `event_type` is at the
top level so routing is cheap.

## Event types

### 1. `booking.request_submitted`

Guest submitted the residence booking form (before payment).

```jsonc
{
  "event_type": "booking.request_submitted",
  "data": {
    "reference": "FBR-A4F2-9KL7",
    "residence_slug": "albion-villa",
    "check_in": "2026-06-12",
    "check_out": "2026-06-19",
    "party_size": 4,
    "guest": {
      "name": "Sarah Lim",
      "email": "sarah@example.com",
      "phone": "+230 5xxx xxxx"
    },
    "message": "Anniversary trip, prefer ocean view."
  }
}
```

Effect on FAD: thread upsert + event row. No Guesty call yet.

### 2. `booking.proof_uploaded`

Guest uploaded payment proof. **This is the trigger that auto-creates the Guesty reservation.**

```jsonc
{
  "event_type": "booking.proof_uploaded",
  "data": {
    "reference": "FBR-A4F2-9KL7",                       // same as the request
    "residence_slug": "albion-villa",
    "check_in": "2026-06-12",
    "check_out": "2026-06-19",
    "party_size": 4,
    "guest": {
      "name": "Sarah Lim",
      "email": "sarah@example.com",
      "phone": "+230 5xxx xxxx"
    },
    "proof_url": "https://blob.vercel-storage.com/fbr-a4f2-9kl7-proof-xxx.jpg"
  }
}
```

Effect on FAD:
- Thread upsert + event row (idempotent on `reference + event_type`).
- Queue `create_reservation` Guesty job:
  - Resolve `residence_slug` → Guesty listing ID (via `property-map.json`).
  - POST `/reservations` with status `reserved`, `expirationDate` = now + 48h.
  - Note on reservation: "Awaiting payment verification — proof uploaded via friday.mu. Proof: <url>. Ref: <reference>".
- If the listing isn't mapped, the job lands in the DLQ marked `dead` with a clear error — visible in the FAD inbox detail panel.

### 3. `experience.enquiry_submitted`

Guest filled the experience enquiry form (after the Bokun modal opens but no Bokun checkout yet).

```jsonc
{
  "event_type": "experience.enquiry_submitted",
  "data": {
    "reference": "FE-7G2X-1MQR",
    "activity_id": "le-morne-kite",
    "guest": {
      "name": "Pierre Hugo",
      "email": "pierre@example.com",
      "phone": "+33 6 xx xx xx xx"
    },
    "preferred_date": "2026-07-04",
    "message": "Beginner, 2 people."
  }
}
```

Effect on FAD: thread upsert + event row. No Guesty.

### 4. `contact.form_submitted`

Generic contact form.

```jsonc
{
  "event_type": "contact.form_submitted",
  "data": {
    "guest": {
      "name": "Anonymous",
      "email": "hello@example.com",
      "phone": null
    },
    "message": "Free-text contact form body…"
  }
}
```

No reference (idempotency disabled for this type — each contact submission is a new event).

### 5. `owner.enquiry_submitted`

Property-owner lead from `/owners`.

```jsonc
{
  "event_type": "owner.enquiry_submitted",
  "data": {
    "guest": {
      "name": "Helene Marchand",
      "email": "helene@example.com",
      "phone": "+230 5xxx xxxx"
    },
    "business": {
      "company_name": "Villa Belle Etoile Ltd",
      "property_count": 2,
      "location": "Belle Mare"
    },
    "message": "Currently with Airbnb only, looking to add channels."
  }
}
```

No reference. New event each time.

## Response codes

| Status | When | What friday.mu should do |
|---|---|---|
| **200** `{ status: 'accepted', thread_id, event_id }` | Event accepted, written | Stop retrying |
| **200** `{ status: 'duplicate', thread_id }` | (reference, event_type) already exists | Stop retrying |
| **400** | Malformed JSON / unknown event_type / missing guest email | DO NOT retry — fix payload |
| **401** | HMAC failed / replay window | DO NOT retry — fix headers / secret |
| **500** | DB or queue error on our side | Retry with backoff |

friday.mu's existing retry semantics fit: idempotency is on us
(unique index on `reference + event_type`), so naive "retry on 5xx"
won't double-create.

## Idempotency contract

We dedup on `(reference, event_type)`. If you send the same
`booking.proof_uploaded` payload twice (e.g. browser double-submit
or a webhook-emitter retry on a network blip), the second call
returns `200 { status: 'duplicate' }` and **does not** trigger a
second Guesty reservation.

`reference` must be stable across retries of the same logical event.
If friday.mu regenerates the reference on each retry, idempotency
breaks — please use the same value.

For event types with no reference (`contact.form_submitted`,
`owner.enquiry_submitted`), every call is a new event. Don't retry
those on transient errors unless you're sure the original didn't
land — duplicates here aren't catastrophic but they're noise.

## Residence slug ↔ Guesty listing map

`backend/src/website_inbox/property-map.json` on the FAD side. v1 is
an empty object — populate it before the first `booking.proof_uploaded`
goes through. Slugs that aren't mapped fail the Guesty job (dead
status) with a clear error visible in the FAD inbox detail panel.

To populate:

```jsonc
{
  "slugs": {
    "albion-villa": "<guesty-listing-id-here>",
    "blue-bay-house": "<guesty-listing-id-here>",
    "..."
  }
}
```

Source of truth for slugs is friday.mu's `_seed/properties.json`.
Source of truth for Guesty listing IDs is the Guesty dashboard.

## Manual smoke test

```bash
TIMESTAMP=$(date +%s%3N)
SECRET="<your-shared-secret>"
BODY='{"event_type":"contact.form_submitted","data":{"guest":{"name":"Test","email":"test@example.com"},"message":"hello"}}'
SIG=$(printf '%s.%s' "$TIMESTAMP" "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

curl -i -X POST https://gms.friday.mu/api/inbox/website/friday-website \
  -H "Content-Type: application/json" \
  -H "X-Friday-Inbox-Timestamp: $TIMESTAMP" \
  -H "X-Friday-Inbox-Signature: $SIG" \
  -d "$BODY"
```

Expected: `HTTP 200`, JSON `{ status: 'accepted', thread_id: '...', event_id: '...' }`. Visible in the FAD Website inbox tab seconds later.

## Out of scope for v1 (per spec)

- WhatsApp inbound — deferred.
- FAD → guest auto-replies — manual ops responses only.
- Two-way Guesty sync — Guesty stays a write target; the existing
  Guesty calendar poller into friday.mu is unchanged.
