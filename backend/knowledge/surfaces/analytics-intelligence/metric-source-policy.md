# Analytics Metric Source Policy

## Metric Contract

Every metric Ask Friday reports should have:

- `metricId`
- `definition`
- `sourceOwner`
- `sourceTableOrApi`
- `freshnessRule`
- `definitionVersion`
- `allowedAudiences`
- `privacyClass`
- `minimumCohort`
- `knownExclusions`
- `lastComputedAt`

## Source Ownership Defaults

| Domain | Source Owner | Boundary |
|---|---|---|
| Reservations and occupancy | Reservations/Calendar | Use source-dated Guesty/FAD snapshots; unknown when cache is incomplete. |
| Properties | Properties | Separate public, guest-scoped, owner-scoped, staff-private, and restricted facts. |
| Ops tasks and schedules | Operations | Do not expose individual workload outside approved staff surfaces. |
| Inbox and guest comms | Inbox | Guest-sensitive; use aggregates or redacted examples. |
| Feedback | Feedback/Learning | Raw evidence restricted; learning summaries redacted. |
| Finance and owner statements | Finance | Restricted by default; no cross-owner leakage. |
| HR/training | HR/Training | Restricted by default; no performance claims without policy. |
| Ask Friday quality | Ask Friday Core | Use traces/evals/events; candidates require review. |

## Reporting Rules

- If a source is stale, incomplete, or not synced, report the caveat instead of filling gaps.
- If a metric depends on demo/fixture data, mark it non-production and do not use it for decisions.
- If a metric definition changed, compare only compatible periods or state the break.
- If a metric drives action, include the action's approval boundary.
