---
name: feedback-learning
description: Planned Ask Friday feedback-learning KB shell for bug/feature evidence capture, screenshot redaction, candidate taxonomy, and review-only learning.
when_used: Planned for website_feedback_bug, website_feedback_feature, internal feedback triage, and learning analyzer evidence review.
version: draft-v1
references:
  - evidence-redaction.md
  - candidate-taxonomy.md
---

# Ask Friday - Feedback Learning

This is a planned KB shell. It defines how feedback evidence can become review candidates, not canonical product truth.

## Mission

Turn bug reports, feature requests, screenshots, device/page context, and diagnostic metadata into useful triage records and redacted learning candidates without exposing private data or auto-changing Friday behavior.

## Source Truth

1. Feedback report text, chat follow-ups, route/page metadata, device/viewport metadata, and screenshot evidence refs.
2. Current deployed frontend/backend version, Git commit, route/module, and source surface.
3. Staff triage outcome, reproduction notes, linked fixes, and acceptance criteria.
4. Approved feedback retention/redaction policy before any raw evidence is reused for learning.
5. Data-protection source baseline: Mauritius Data Protection Act 2017 and official Data Protection Office guidance.

## Non-Goals

- Do not publish a KB rule from raw feedback, screenshots, console logs, or user claims.
- Do not expose guest-sensitive, owner-private, staff-private, payment, secret, access-code, or workload data in public KBs.
- Do not treat one complaint as product truth without triage, clustering, or human review.
- Do not promise implementation or deployment from the feedback chat.

## Answer Rules

- Separate `bug`, `feature_request`, `ux_confusion`, `missing_context`, `policy_gap`, `data_quality`, and `regression` candidates.
- Preserve raw evidence only in restricted evidence refs; generate redacted summaries for learning events and KB candidates.
- Always capture expected behavior, actual behavior, route/module, device, viewport, role, screenshot count, reproduction steps, and acceptance criteria when available.
- If screenshot evidence may contain private data, mark it restricted and emit only a redacted summary.
- Learning output remains a `kb_candidate` or action request until human approval.

## Review Required

- Ishant approval of raw screenshot/diagnostic retention windows.
- Final list of who receives feedback notifications by channel.
- Final redaction standard for staff names, guest names, phone/email, owner notes, payment artifacts, access codes, console logs, and DOM snapshots.
- Whether clustered feedback can automatically create eval cases, and which reviewer lane owns each class.

## Source Links

- Mauritius Data Protection Office, Data Protection Act 2017: https://dataprotection.govmu.org/Pages/The%20Law/Data-Protection-Act-2017.aspx
- Mauritius Data Protection Office guidelines: https://dataprotection.govmu.org/Pages/Downloads/Guidelines-Data-Protection-Act-2017.aspx
- OpenAI Agents SDK guardrails: https://openai.github.io/openai-agents-js/guides/guardrails
- OpenAI agent evals and trace grading: https://platform.openai.com/docs/guides/agent-evals
- OWASP Top 10 for LLM Applications 2025: https://owasp.org/www-project-top-10-for-large-language-model-applications/
