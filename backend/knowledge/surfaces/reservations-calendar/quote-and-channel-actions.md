# Quote And Channel-Visible Action Rules

## Approval-Routed V1 Actions

Use action requests for:

- booking quote preparation,
- reservation creation,
- date/time change,
- guest count change,
- price override or discount,
- cancellation/status change,
- payment-sensitive action,
- Guesty/OTA/channel-visible calendar block.

## Quote Requirements

A quote answer should include:

- source system,
- fetched/source timestamp,
- quote id if available,
- currency and total only if the live/source-dated tool returned it,
- expiry/validity when available,
- caveat when quote validity is not reviewed.

If no quote tool is enabled, prepare a staff review request and avoid commitment language.

## Channel-Visible Blocks

- Requested visibility must be explicit: `fad_local_only`, `guesty_only`, or `guesty_and_channels`.
- If the only available action is FAD-local, the answer must say so.
- Channel-visible blocks need a later Guesty/channel-manager executor, evidence, and staff approval.

## Mutation Safety

Before any reservation mutation can be approved later, the action request must include the current source snapshot, proposed delta, rationale, source timestamp, and reviewer lane.
