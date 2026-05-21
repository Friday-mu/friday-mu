# Test feedback for the friday.mu Claude session — 2026-05-14

> Paste the block below into the friday.mu Claude session. It contains
> the failure modes observed on the FAD side during your 13:33 UTC
> test round on 2026-05-14, with enough detail to fix without another
> round-trip.

---

## Copy-paste this

FAD side observed your webhook test traffic at ~13:33 UTC on
2026-05-14 against `POST https://gms.friday.mu/api/inbox/website/friday-website`.
None of the test events landed in the FAD inbox. Three distinct
failure modes, in chronological order:

### 1. Unparseable header timestamp (4 events, 13:33:11–12 UTC)

```
[website_inbox/webhook] rejecting: unparseable timestamp
```

`X-Friday-Inbox-Timestamp` must be **unix-milliseconds as a decimal
string** (e.g. `"1747234391000"`), parseable by
`Number.parseInt(header, 10)`. Anything that fails that parse or
returns `NaN` is rejected before signature verification.

**Likely cause on your side:** sending `new Date().toISOString()` or a
formatted string instead of `Date.now().toString()`. The signing
example in the integration prompt uses `Date.now().toString()` — that
is the contract, not a suggestion.

### 2. Body-level timestamp serialised as NaN (3 events, 13:33:43 UTC)

```
[website_inbox/webhook] persist error: invalid input syntax for type
timestamp with time zone: "0NaN-NaN-NaNTNaN:NaN:NaN.NaN+NaN:NaN"
```

Header parsed fine, signature verified (good — secret is correct at
least for these three), but the payload contained a body-level
timestamp field that serialised as `"0NaN-NaN-NaNTNaN:NaN:NaN.NaN+NaN:NaN"`.
Postgres rejected the insert (the column is `timestamp with time zone`).

That exact NaN string is the signature of a date library being handed
`undefined` and asked to `format(...)` — `dayjs(undefined).format(...)`
returns `"Invalid Date"` in some versions, but a custom template like
`` `${y}-${m}-${d}T${h}:${m}:${s}.${ms}${tz}` `` where each component
came from a NaN Date produces exactly that pattern.

**To find it:** grep your emitter for any of `dayjs(`, `moment(`,
`format(`, or manual date-string construction against fields like
`occurred_at`, `submitted_at`, `proof_uploaded_at`, etc. The offending
field is whatever the form / route handler is reading from an
`undefined` source. Most likely: a `payload.occurred_at` that's
falling back to a property that doesn't exist on the form object.

If a body-level timestamp is genuinely optional for a given event
type, **omit the field entirely** rather than emitting an invalid
date string. The FAD side treats absent timestamps as "use server
now()".

### 3. Signature mismatch (1 event, 13:33:44 UTC)

```
[website_inbox/webhook] rejecting: signature mismatch
```

Single event, last of the batch. The other 3 events from 13:33:43
passed signature verification, so the secret on your prod env IS
correct in general. Possibilities for this one:

- Different secret was in use at 13:33:44 (mid-deploy / hot-reload?)
- Body was mutated between sign-time and send-time (e.g. middleware
  injecting fields, or you `JSON.stringify`'d twice with different
  key ordering)
- Timestamp drift > 5 minutes (anti-replay window) — unlikely if the
  earlier 3 passed seconds before, but worth checking your server's
  NTP

If it's reproducible, dump the **exact bytes** you signed and the
**exact bytes** you sent and diff them. The HMAC must be over
`${timestamp}.${rawBody}` where `rawBody` is byte-identical to what
arrives on the wire.

### What's now ready FAD-side that wasn't at 13:33 UTC

- `property-map.json` has been populated with all 26 active residences
  (slugs from your `_seed/properties.json`, Guesty listing IDs
  resolved). Deployed at 14:11 UTC. So `booking.proof_uploaded`
  events will now auto-create Guesty reservations end-to-end — no
  more "unmapped slug" DLQ errors for the current catalogue.

### Suggested next test

Once the timestamp issues are fixed, fire the `contact.form_submitted`
smoke test exactly as documented in
`docs/website-inbox/prompt-for-friday-mu-session.md` § Smoke test —
that's the simplest payload (no body-level timestamps required) and
proves the header + signature path end-to-end before you re-try the
booking flow.

Report back with the resulting HTTP status + response body. I'll
confirm visibility in the FAD inbox.
