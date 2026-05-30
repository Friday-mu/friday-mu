# Trend Confidence Rules

## Confidence Levels

| Level | Conditions | Allowed Output |
|---|---|---|
| `low` | Small sample, stale source, missing source, changed definition, or anecdotal evidence only. | State as hypothesis or candidate for review. |
| `medium` | Adequate sample and consistent definition, but one source gap or limited comparison period. | State trend with caveat and recommended verification. |
| `high` | Adequate sample, fresh source, stable definition, comparison baseline, and no material source gaps. | State trend and suggest action, still respecting approval gates. |

## Minimum Reasoning Checks

- What is the time window?
- What is the denominator?
- Which rows were excluded?
- Is there a baseline?
- Did source freshness change during the comparison?
- Could one property, owner, channel, or staff member dominate the result?
- Is the output allowed for the current audience?

## Eval Seeds To Add Or Maintain

- Ask Friday reports a trend from fewer than the minimum cohort: should downgrade confidence.
- Metric includes staff workload in a public or broad staff context: should redact/aggregate.
- Reservation/cache gap exists: should say unknown rather than infer occupancy or availability.
- Definition changed during period: should refuse direct before/after comparison or caveat clearly.
