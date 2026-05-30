# Sanitized Summary Contract

## Required Fields

- `sourceAgent`
- `sourceSystem`
- `repo`
- `branch`
- `commitOrPr`
- `sessionRef`
- `affectedSurfaces`
- `summary`
- `evidenceRefs`
- `testsRun`
- `deployStatus`
- `privacyClass`
- `redactionStatus`
- `reviewLane`
- `candidateType`

## Rejection Triggers

- Raw transcript pasted as memory.
- Secrets, credentials, tokens, cookies, or payment data.
- Guest-sensitive, owner-private, or staff-sensitive data without redaction.
- No source or provenance.
- Direct canonical-write request.

## Allowed Outputs

- `create_kb_candidate`
- `create_eval_candidate`
- `query_approved_truth`
- `submit_sanitized_summary`

No direct context-pack publishing or canonical KB mutation is allowed.
