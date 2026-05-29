# Feedback Candidate Taxonomy

## Candidate Types

| Candidate Type | Meaning | Reviewer Lane |
|---|---|---|
| `bug_pattern` | Repeated or verified product defect. | product/engineering |
| `ux_confusion` | User could complete the action but the interface caused confusion. | product/design |
| `missing_context` | Ask Friday lacked required page/source/context. | Ask Friday Core |
| `policy_gap` | A business rule, privacy rule, or approval boundary is missing. | product/ops |
| `feature_request` | New capability or workflow requested. | product |
| `regression` | Previously working flow broke after a deploy. | engineering |
| `data_quality` | Source data is stale, missing, duplicated, or contradictory. | owning module |

## Minimum Candidate Fields

- `surfaceId`
- `route/module`
- `role/audience`
- `expectedBehavior`
- `actualBehavior`
- `evidenceRefs`
- `redactedEvidenceSummary`
- `affectedVersion`
- `candidateType`
- `riskClass`
- `reviewLane`
- `acceptanceCriteria`
- `testIdeas`

## Promotion Rules

- A candidate can become canonical only after human review.
- Feedback clusters can raise priority, but clustering alone does not make truth.
- If a candidate changes public behavior, Website context packs, owner wording, reservation policy, property facts, finance/legal/HR policy, or MCP tools, it needs the owning domain reviewer before publish.
