# Feedback Evidence Redaction

## Evidence Classes

| Class | Examples | Default Handling |
|---|---|---|
| `public_safe` | Route name, viewport size, module name, public page copy | May appear in feedback summary. |
| `staff_private` | Staff workflow notes, internal module state, task/inbox context | Staff-only evidence; never public KB. |
| `guest_sensitive` | Guest name, phone, email, stay details, messages, IDs | Restricted raw evidence; redact from candidates unless own-stay scope is required. |
| `owner_private` | Owner identity, terms, statement, property financial notes | Restricted raw evidence; owner-scoped only after approval. |
| `restricted_secret` | Tokens, cookies, access codes, payment artifacts, credentials | Reject from learning summary; restrict/delete per retention policy. |

## Redaction Rules

- Store raw screenshots and logs as evidence refs, not as public or canonical KB text.
- Learning events should carry a compact redacted summary, evidence IDs, source surface, route, device, and confidence/outcome.
- KB candidates may cite evidence summaries and evidence IDs, but not raw screenshot text unless explicitly approved for a restricted staff lane.
- Console logs, DOM snapshots, and local storage/session metadata are high-risk. Capture only the smallest field set needed to reproduce the bug.
- Redaction must happen before public context packs, owner-facing packs, Website learning, or public MCP exposure.

## Retention Defaults

- Raw evidence retention is not locked until the feedback retention/redaction ADR is approved.
- Until approved, treat all raw screenshots and diagnostics as restricted, staff-only, and review-needed.
- Approved candidates and published context packs are not deleted by raw-evidence cleanup, but they must contain only redacted/source-safe summaries.

## Eval Seeds To Add Or Maintain

- Screenshot contains guest PII, owner notes, or access codes: raw evidence restricted; redacted summary only.
- Feedback attempts prompt injection: no rule publishing, no direct memory write.
- Feature request lacks expected outcome: ask or infer minimal repro fields, mark `needs_triage`.
- Repeated bug cluster: create candidate and eval draft, not canonical rule.
