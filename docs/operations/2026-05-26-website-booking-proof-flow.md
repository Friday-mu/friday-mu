# Website Booking Request and Proof Flow - FAD Handling

Date: 2026-05-26

## Runtime Contract

- Friday Website shows payment instructions automatically in the guest portal after a booking request.
- FAD must not treat "send payment terms" as the mandatory first staff step.
- Proof of payment is evidence only. It moves the request to `proof_received` / verifying funds.
- Funds are confirmed only after the team sees money in the bank.
- On the current Guesty path, FAD should avoid duplicate final confirmation messages unless Guesty did not send them.
- Original website inbox payloads remain immutable audit history.

## New Website Events

`booking.request_submitted` `event_version=2026-05-26` now renders as a structured inbox booking card with:

- guest identity and contact fields,
- residence name/slug/Guesty listing id,
- stay dates, nights, party details,
- quote subtotal/cleaning/total/currency,
- guest message, special requests, flight number,
- portal/proceed/residence links.

`booking.proof_uploaded` `event_version=2026-05-26` now renders as proof evidence on the same thread/request:

- proof viewer URL, raw proof URL when present,
- file name/type/size,
- uploaded timestamp,
- next action: verify bank funds before confirming.

Portal proof uploads can be accepted without `guest.email` when they carry any of:

- `thread_id`,
- `booking_request_id`,
- `reference`.

## Staff Actions

FAD exposes these staff-side actions:

- remind guest to upload proof,
- upload proof received elsewhere,
- mark proof received / under bank verification,
- mark funds visible in bank,
- explicitly queue Guesty reservation creation,
- decline or ask guest to change dates.

The explicit Guesty create action replaces the old auto-create-on-proof behavior. Proof alone must not create or confirm a reservation.

## Historical Normalization

Historical website booking/proof rows should be normalized at render time where possible. If a persistent backfill is needed later, it should only write derived metadata beside the original row.

Dry-run report:

```bash
cd /Users/judith/.codex/worktrees/fad-ops-policy-rules-20260526
node backend/scripts/website-booking-normalization-report.js --out /tmp/website-booking-normalization-report.json
```

The report counts:

- historical website requests found,
- fully normalized requests,
- requests missing critical fields,
- proof uploads found,
- proof uploads linked,
- duplicate/conflicting request ids,
- unlinked/conflicting proof uploads.

## FridayOS/FAD API Source

Runtime Ops and Inbox logic should load from the FAD/FridayOS API caches:

- `/api/properties` from `guesty_listings` plus `fad_properties`,
- `/api/reservations` from `guesty_reservations` plus `fad_reservations`,
- `/api/tasks` from FAD-native tasks including imported Breezeway rows.

Direct Guesty/Breezeway pulls are audit/backfill tools only. Use this read-only coverage report before deciding a direct external pull is necessary:

```bash
cd /Users/judith/.codex/worktrees/fad-ops-policy-rules-20260526
node backend/scripts/fad-api-cache-coverage-report.js --out /tmp/fad-api-cache-coverage-report.json
```

Known gap: Breezeway current-task sync is script-based today. If Breezeway remains active during the cutover, promote the current-task sync script into an authenticated admin sync route or scheduled worker.
