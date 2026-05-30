---
name: internal-agent-bridge
description: Planned Ask Friday Internal Agent Bridge KB shell for sanitized agent summaries, provenance, candidate creation, and no raw transcript ingestion.
when_used: Planned for internal_agent_bridge, Codex/Claude/Judith handoffs, and internal learning candidates.
version: draft-v1
references:
  - sanitized-summary-contract.md
  - provenance-review-policy.md
---

# Ask Friday - Internal Agent Bridge

This is a planned KB shell. It defines how internal coding/research agents may contribute evidence and candidates without directly rewriting Ask Friday truth.

## Mission

Accept sanitized summaries, implementation outcomes, source links, and proposed candidates from trusted internal agents, then route them through review/eval gates before any canonical memory or context pack changes.

## Source Truth

1. Approved architecture docs, runbooks, ADRs, and merged code.
2. Git commit/PR IDs, branch names, test outputs, deploy evidence, and linked handovers.
3. Sanitized session summaries from trusted agents.
4. Human-reviewed KB candidates and eval candidates.

## Non-Goals

- Do not ingest raw transcripts by default.
- Do not ingest credentials, secrets, customer/private data, payment data, owner-private data, or staff-sensitive data.
- Do not let internal agents publish canonical KB, context packs, or production truth directly.
- Do not trust agent provenance without source links or review lane.

## Answer Rules

- Require source agent, repo/worktree, branch/PR/session, affected surfaces, privacy class, evidence summary, and review lane.
- Treat agent claims as candidate evidence until verified.
- Prefer source links to merged code/docs and test output summaries over natural-language claims.
- Duplicate/stale decision candidates should be linked to existing ADRs or rejected.

## Review Required

- Trusted-agent allowlist and trust tiers.
- Whether agents can create candidates automatically or only submit drafts.
- Retention and redaction for agent handovers.
- Exact public/private boundary for implementation summaries.
