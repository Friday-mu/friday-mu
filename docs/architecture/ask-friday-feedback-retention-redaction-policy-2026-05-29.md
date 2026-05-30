# Ask Friday Feedback Evidence Retention And Redaction Policy

Date: 2026-05-29
Status: proposed ADR; needs Ishant review before raw feedback evidence mining

## Purpose

Ask Friday can learn from bug reports, feedback FAB conversations, screenshots, diagnostics, and staff follow-up, but those inputs can contain guest-sensitive, owner-private, staff-private, payment-like, access-code, or secret data.

This policy defines the V1 retention and redaction defaults for feedback evidence before any screenshot or raw diagnostic evidence is mined into KB candidates.

## External Basis

- Mauritius Data Protection Office: the Data Protection Act 2017 was proclaimed on 15 January 2018 and aligns with GDPR-style principles. Source: https://dataprotection.govmu.org/Pages/About%20Us/About-the-Office.aspx
- Mauritius Data Protection Act text: personal data covers identifiable individuals; processing includes collection, storage, disclosure, alignment, blocking, erasure, or destruction. Source: https://mauritiuslii.org/akn/mu/act/2004/13/eng%402017-06-30
- NIST AI RMF 1.0: use risk-management governance for AI systems rather than treating model outputs as automatically trustworthy. Source: https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10
- NIST Privacy Framework: privacy risk management should include data governance and management practices. Source: https://www.nist.gov/privacy-framework/privacy-framework
- OWASP Top 10 for LLM Applications: sensitive information disclosure is a core LLM application risk; LLM systems need controls around prompt/tool/log data exposure. Source: https://owasp.org/www-project-top-10-for-large-language-model-applications

## Scope

In scope:

- Feedback FAB screenshots.
- Feedback FAB chat transcripts.
- Route, device, browser, viewport, version, and module metadata.
- Console/network diagnostics if captured later.
- Staff bug triage notes.
- Ask Friday learning events and evidence refs created from feedback.

Out of scope:

- Normal guest Inbox conversations, except when attached to a feedback report.
- Owner statements and finance documents.
- HR/performance records.
- Production access logs outside Ask Friday Core.

## Evidence Classes

| Class | Examples | Default Storage | Default Retention | KB Eligibility |
|---|---|---|---:|---|
| `feedback_summary_public_safe` | Redacted bug summary, route, broad device type, affected module | `ask_friday_learning_events` / candidate summary | 24 months | yes, after review |
| `feedback_screenshot_restricted` | Raw or partially redacted screenshot | restricted evidence storage via `ask_friday_evidence_refs.storage_ref` | 90 days | no raw KB use |
| `feedback_diagnostics_restricted` | Console/network/device diagnostics | restricted evidence storage | 90 days | redacted aggregate only |
| `feedback_staff_note` | Internal triage note or staff reproduction note | staff-private evidence/candidate | 12 months | yes, staff-private only after review |
| `feedback_security_sensitive` | token, secret, access code, payment-like data, private owner/guest data | quarantine/delete path | 0-7 days | no |
| `approved_bug_pattern` | Reviewed product bug pattern without private evidence | KB candidate/context pack after approval | until superseded | yes |

Retention windows are proposed defaults, not final legal policy. Ishant should approve or adjust them before the retention worker deletes production evidence automatically.

## Redaction Rules

Always remove or mask before any evidence becomes a KB candidate, context pack, public issue summary, or model prompt outside the restricted review lane:

- access codes, lockbox codes, passwords, API keys, JWTs, session tokens, cookies, reset links;
- payment card data, bank details, payout details, owner statement numbers where identifiable;
- guest phone, email, passport/ID, exact travel party identity, health/safety personal details;
- owner-private terms, owner financials, owner account details;
- private staff workload, HR/performance notes, leave/medical data;
- raw screenshots that show any of the above.

Use summaries like:

- `guest contact shown in screenshot [redacted]`;
- `owner-private statement area visible [restricted evidence only]`;
- `access-code-like value detected [purged from candidate]`.

## Ingestion Policy

1. Store raw screenshot/diagnostic evidence only as restricted evidence refs.
2. Set `privacy_class` to at least `high` when a screenshot includes guest, owner, access, payment, HR, or staff-private data.
3. Set `redaction_status` to `partially_redacted` until a human or trusted scrubber verifies it.
4. Set `expires_at` on raw evidence refs at creation time.
5. Learning events should contain compact summaries, not raw screenshot text.
6. KB candidates may reference evidence IDs, but must not contain raw private evidence.
7. Published context packs must contain only approved redacted patterns, rules, or product decisions.

## Proposed Retention Defaults

| Artifact | Default |
|---|---:|
| Raw feedback screenshots with no sensitive data visible | 90 days |
| Raw feedback screenshots with guest/owner/staff-private data | 30 days |
| Raw feedback screenshots with secrets/access/payment data | purge immediately after restricted incident note, max 7 days |
| Console/network diagnostics | 30 days if sensitive, 90 days otherwise |
| Rejected KB candidates | 180 days, matching current worker default |
| Expired KB candidates | 30 days, matching current worker default |
| Approved KB candidates | retain until superseded or manually retired |
| Published context packs | retain as versioned release artifacts |
| Redacted learning events | 24 months by default, pending legal/privacy review |

## Current Code Alignment

Current backend support:

- `ask_friday_evidence_refs.expires_at` exists.
- `backend/src/ask_friday/retention.js` already deletes expired evidence refs when `dryRun:false`.
- The retention worker defaults to dry-run and currently deletes old rejected/expired candidates only when explicitly enabled.
- The worker deliberately does not delete learning events yet.

Gap before enforcement:

- feedback evidence writers need to assign `expires_at` by evidence class;
- feedback evidence writers need a deterministic sensitive-field classifier or conservative manual route;
- retention worker needs approved windows before deleting production evidence automatically;
- admin/review UI needs to show restricted evidence expiry and redaction status.

## Candidate And Eval Rules

New KB candidates created from feedback evidence should use one of these candidate types:

- `bug_pattern`;
- `ux_confusion`;
- `missing_context`;
- `policy_gap`;
- `feature_request`;
- `security_sensitive_evidence`.

Eval cases should cover:

- screenshot contains guest phone/email and only redacted summary reaches candidate;
- screenshot contains access code and raw evidence is quarantined/purged;
- feature request includes private staff workload and cannot become public KB;
- model cannot publish a feedback-derived rule without human approval;
- expired evidence ref is deleted while approved redacted candidate remains.

## Decision

Until Ishant approves different windows:

- raw screenshots and diagnostics are evidence refs only;
- no raw feedback screenshot enters a KB, context pack, or public issue summary;
- default raw evidence retention is 90 days maximum, shorter for sensitive evidence;
- learning events stay compact and redacted;
- canonical learning requires human approval and eval gate.

## Open Questions For Ishant

1. Should raw screenshots with no visible sensitive data stay 90 days, 180 days, or only 30 days?
2. Should sensitive screenshots be purged immediately after a restricted note, or kept for 7 days for debugging?
3. Who besides Ishant can view restricted feedback screenshots?
4. Should staff be able to manually extend evidence retention for active bugs?
5. Should approved redacted bug patterns expire, or remain until superseded?
