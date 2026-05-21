# Prompt to give the friday.mu Claude session

> Paste the section below into the friday.mu repo's Claude session.
> It tells them exactly what FAD is now expecting and what they need
> to build on their side.

---

## Prompt (copy-paste this)

The FAD side of the website-inbox integration is done and live on
`https://gms.friday.mu/api/inbox/website/*`. Your job is to wire the
emitter end on friday.mu so the 5 customer-event API routes POST
HMAC-signed webhooks to that endpoint.

### What's ready FAD-side

- Endpoint: `POST https://gms.friday.mu/api/inbox/website/friday-website`
- HMAC-SHA256 auth (same pattern you already use on the Bokun webhook
  at `app/api/webhooks/bokun/route.ts` — symmetric secret, hex
  signature, timestamp anti-replay window of ±5 minutes)
- Idempotency on `(reference, event_type)` — your retries are safe
- Auto-creates a 48h-expiring Guesty `reserved` reservation when a
  `booking.proof_uploaded` event lands
- DLQ for Guesty failures so we never lose a proof-uploaded event
- Inbox UI lives at `/fad?m=website-inbox` for ops triage

### What you need to do

1. **Coordinate the shared HMAC secret with Ishant.** FAD has it set
   in env as `FRIDAY_WEBSITE_INBOX_SECRET`. You need the same value
   in friday.mu's env. **Don't generate your own — ask Ishant for
   the existing FAD value.** Otherwise signatures will mismatch and
   every webhook 401s.

2. **Populate the residence slug → Guesty listing ID map.** FAD has
   `backend/src/website_inbox/property-map.json`. v1 starts empty.
   Before the first real `booking.proof_uploaded` lands in
   production, this needs entries for every residence slug your booking
   form can produce. Source of truth:
   - Slugs: your `_seed/properties.json`
   - Guesty listing IDs: the Guesty dashboard (or via the existing
     Guesty Open API listings sync)

   Unmapped slugs are still accepted (we record the event, return
   200) but the Guesty reservation job lands in our DLQ marked
   `dead` with a clear "Unmapped residence slug: X" error — visible
   in the FAD inbox detail panel. Ops can re-trigger manually after
   you add the missing slug. So mapping isn't a hard gate, but it's
   the difference between an automatic flow and a manual one.

3. **Wire a webhook emitter to each of the 5 API routes** that
   currently terminate at form-submission storage. The events:

   | Event type | Triggered by | Reference format |
   |---|---|---|
   | `booking.request_submitted` | residence booking form submit | `FBR-XXXX-XXXX` |
   | `booking.proof_uploaded` | payment proof upload | `FBR-XXXX-XXXX` (same as above) |
   | `experience.enquiry_submitted` | experience form submit (post Bokun-modal-open) | `FE-XXXX-XXXX` |
   | `contact.form_submitted` | generic contact form | none |
   | `owner.enquiry_submitted` | `/owners` enquiry | none |

   **Use the same reference value** for `booking.request_submitted`
   and the subsequent `booking.proof_uploaded` so FAD links them to
   one thread. The reference IS the idempotency key — if your code
   accidentally regenerates it on retry, idempotency breaks.

4. **Sign each request** with HMAC-SHA256 over `${timestamp}.${rawBody}`
   using the shared secret. Headers:
   - `Content-Type: application/json`
   - `X-Friday-Inbox-Timestamp: <unix-ms>`
   - `X-Friday-Inbox-Signature: <hex>`

   Node implementation:

   ```ts
   import { createHmac } from 'node:crypto';

   const timestamp = Date.now().toString();
   const body = JSON.stringify(payload);

   const signature = createHmac('sha256', process.env.FRIDAY_WEBSITE_INBOX_SECRET!)
     .update(`${timestamp}.${body}`, 'utf8')
     .digest('hex');

   const res = await fetch('https://gms.friday.mu/api/inbox/website/friday-website', {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'X-Friday-Inbox-Timestamp': timestamp,
       'X-Friday-Inbox-Signature': signature,
     },
     body,
   });
   ```

5. **Retry policy:**
   - `200` → done, don't retry (covers both `accepted` and `duplicate`).
   - `400` → don't retry — fix the payload.
   - `401` → don't retry — fix the signature / secret.
   - `500` → retry with backoff (5s, 30s, 2min, 10min, then give up
     and alert).

   Idempotency is on FAD's side via the unique index on
   `(reference, event_type)`. Naïve retry-on-5xx is safe and won't
   double-create reservations as long as you use the same reference.

### Payload examples

Authoritative spec with all 5 event shapes:
`docs/website-inbox/webhook-contract.md` on the FAD side (commit
`d6a2e86` on `fad-design-os-v01-frontend`). Each event uses an
envelope:

```jsonc
{
  "event_type": "booking.proof_uploaded",
  "source": "website",          // optional, defaults to "website"
  "data": { /* event-specific fields */ }
}
```

### Smoke test

Once your emitter is wired, fire one `contact.form_submitted` test
through the production endpoint. Expected: HTTP 200, JSON
`{ status: 'accepted', thread_id: '...', event_id: '...' }`, visible
in the FAD inbox seconds later.

```bash
TIMESTAMP=$(node -e 'process.stdout.write(String(Date.now()))')
BODY='{"event_type":"contact.form_submitted","data":{"guest":{"name":"Test","email":"test@example.com"},"message":"smoke test"}}'
SIG=$(printf '%s.%s' "$TIMESTAMP" "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

curl -i -X POST https://gms.friday.mu/api/inbox/website/friday-website \
  -H "Content-Type: application/json" \
  -H "X-Friday-Inbox-Timestamp: $TIMESTAMP" \
  -H "X-Friday-Inbox-Signature: $SIG" \
  -d "$BODY"
```

### Out of scope (don't implement)

- WhatsApp inbound — deferred.
- FAD → guest auto-replies — manual ops responses only.
- Two-way Guesty sync — Guesty stays a write target only; your
  existing Guesty Open API calendar poll into friday.mu is unchanged.

### When you're done

Reply to Ishant with:
1. Which routes have been wired (paste a list).
2. Confirmation that the shared secret is set on friday.mu's prod env.
3. Confirmation that the smoke test landed in the FAD inbox.

I'll mark this integration done from the FAD side when those three
land.
