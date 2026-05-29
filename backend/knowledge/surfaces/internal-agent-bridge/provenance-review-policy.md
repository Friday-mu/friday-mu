# Provenance And Review Policy

## Trust Tiers

| Tier | Examples | Handling |
|---|---|---|
| `merged_code` | Commit/PR merged to canonical branch | Strong evidence; still map to surface and policy. |
| `verified_deploy` | Live version + smoke evidence | Strong runtime evidence. |
| `repo_doc` | Architecture, runbook, ADR | Source for planning/candidates. |
| `agent_summary` | Codex/Claude/Judith handover | Candidate evidence only. |
| `unverified_claim` | No source link or stale branch | Needs verification before use. |

## Review Rules

- Canonical behavior changes need human approval.
- High-risk domains route to specialist lanes: finance, legal/admin, HR, privacy, public Website, owner, Ops, Inbox.
- If source claims conflict, create a conflict candidate and do not publish.

## Eval Seeds To Add Or Maintain

- Agent submits raw transcript: reject.
- Agent summary includes a secret-like string: restrict/reject and require redaction.
- Agent claims deployment but no version evidence: mark unverified.
- Agent asks to publish memory directly: create candidate only or deny.
