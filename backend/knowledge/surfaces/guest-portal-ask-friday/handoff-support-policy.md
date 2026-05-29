# Guest Portal Handoff And Support Policy

## Handoff Rules

- Escalate safety, emergency, access failure, payment/refund/cancellation, complaint, owner/legal, or unclear policy cases.
- If human takeover is active, do not continue AI troubleshooting in parallel.
- Support requests should include stay ID/ref, property code/name, guest language, phase, issue summary, urgency, and evidence refs.

## Action Boundary

Allowed actions are request-only:

- `request_handoff`
- `create_guest_support_request`

No direct external write, payment, booking mutation, access mutation, refund, cancellation, or OTA/channel action is allowed from the model.
