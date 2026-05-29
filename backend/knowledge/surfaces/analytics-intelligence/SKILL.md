---
name: analytics-intelligence
description: Planned Ask Friday analytics/intelligence KB shell for metric source ownership, aggregation privacy, trend confidence, and eval-mining governance.
when_used: Planned for fad_analytics_intelligence, global Ask Friday summaries, learning analyzer reports, and operational intelligence reviews.
version: draft-v1
references:
  - metric-source-policy.md
  - trend-confidence.md
---

# Ask Friday - Analytics Intelligence

This is a planned KB shell. It defines how Ask Friday may summarize metrics and learning signals without inventing trends or exposing private operational data.

## Mission

Help Friday understand operational, guest, owner, revenue, feedback, and AI-quality patterns from governed source data while keeping metric ownership, privacy, freshness, and confidence explicit.

## Source Truth

1. FAD source tables and typed wrappers for reservations, properties, tasks, inbox, feedback, finance, owners, reviews, and events.
2. Ask Friday learning events, eval cases, eval runs, context-pack status, KB candidates, action requests, and evidence refs.
3. Published reports or reviewed analysis snapshots when a trend becomes business-facing.
4. Source-specific caveats: Guesty/Breezeway/cache freshness, missing rows, incomplete sync windows, sample size, and changed definitions.

## Non-Goals

- Do not turn dashboards into canonical memory automatically.
- Do not rank individual staff performance or workload without an approved HR/privacy policy.
- Do not expose guest, owner, finance, or staff-private data in broad/global summaries.
- Do not claim statistically meaningful trends from small, stale, or mixed-definition samples.

## Answer Rules

- Every metric needs an owner, source table/API, freshness rule, allowed audience, and definition version.
- Separate observed facts, inferred trends, hypotheses, and recommended actions.
- Include sample size, time window, missing-source caveats, and confidence for trend claims.
- Aggregates should use minimum cohort thresholds before broad sharing.
- When a metric mixes private domains, answer at the lowest privilege/audience allowed by the inputs.
- Eval mining should create candidates and test cases, not direct behavior changes.

## Review Required

- Minimum cohort sizes for owner, staff, guest, and property analytics.
- Which metrics Ishant wants global Ask Friday to answer directly versus route to module owners.
- Whether staff productivity metrics are allowed at individual level, team level only, or not at all.
- Which analytics snapshots can become approved context packs.

## Source Links

- OpenAI Agents SDK tracing: https://openai.github.io/openai-agents-python/tracing/
- OpenAI agent evals: https://platform.openai.com/docs/guides/agent-evals
- OpenTelemetry AI agent observability: https://opentelemetry.io/blog/2025/ai-agent-observability/
- OWASP Top 10 for LLM Applications 2025: https://owasp.org/www-project-top-10-for-large-language-model-applications/
- Model Context Protocol authorization specification: https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization
