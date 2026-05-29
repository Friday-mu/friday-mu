# Ask Friday Plan 2 KB Gap Tracker

Date: 2026-05-29
Status: planning tracker

## Purpose

This tracker separates surfaces with real KB/harness coverage from surfaces that only have registry/eval placeholders.

It exists to prevent the earlier failure mode: treating scoped/planned Ask Friday agents as built agents.

## Current Coverage Matrix

| Surface | KB Files | Context Pack Template | Eval Seeds | Runtime Wiring | Current Status |
|---|---:|---:|---:|---:|---|
| FAD global Ask Friday | reused module/global refs | yes | yes | active | Core-routed, no dedicated KB folder |
| Inbox / Friday Consult | yes | yes | yes | active | strongest staff harness |
| Ops / Friday Consult | yes | yes | yes | active | strongest Ops KB; needs staff-use proof |
| Reservations/Calendar | shell | yes | yes | active Core shell | no dedicated UI agent |
| Properties | shell | yes | yes | active Core shell | public/private field policy still needs approval |
| Website guest hero/FAB | public context packs, no FAD KB folder | yes | yes | FAD packs, Website wiring separate | public packs published; richer packs blocked by property-field approval |
| Owners | shell | FAD owners planned shell | yes | Website public active, FAD owners planned | owner-private rules not locked |
| Feedback | no dedicated KB folder | no | yes | public action policy/scope | evidence retention/redaction not locked |
| Guest Portal | no | no | no dedicated coverage | registry planned | not built |
| Finance | no | no | minimal privacy seed | registry planned | not built |
| Legal/Admin | no | no | no | registry planned | not built |
| HR/Training | no | no | no | registry planned | not built |
| Analytics/Intelligence | no | no | no | registry planned | not built |
| Public MCP | no | no | basic safety/property seeds | registry planned | not built |
| Internal Agent Bridge | no dedicated KB folder | no | yes | generic Core candidate/event paths only | summary contract missing |

## Missing Work By Surface

### Reservations/Calendar

Needed before full agent build:

- Guesty/channel write-through policy for reservation changes, date blocks, check-in/out changes, and quote actions.
- Quote validity and expiry rules.
- Public price-field policy: what can be shown publicly, guest-scoped, or staff-only.
- Freshness rules for calendar/pricing cache versus live Guesty refresh.
- Eval cases for stale quote, channel-visible block, and reservation mutation approval.

Current safe slice:

- Backend/docs only: expand read/action contracts and eval cases. Do not build a dedicated UI agent yet.

### Properties

Needed before public context-pack expansion:

- Final approval of public/guest/owner/staff/restricted field classification.
- Source-conflict precedence between Guesty listing, FAD property cards, Website copy, Breezeway operational data, and staff notes.
- Public property context-pack contract after field approval.
- Eval cases for private notes, access codes, owner-private terms, stale amenities, and public copy conflicts.

Current safe slice:

- Backend/docs only: tighten classification/evals; do not expose richer public packs until Ishant approves field classes.

### Owners

Needed before FAD owners assistant runtime:

- Owner terms visibility policy.
- Owner statement and owner-private data isolation.
- Owner package wording and competitor/market positioning review.
- Consent/retention policy for owner leads and owner memory.
- Source matrix for owner statements, onboarding status, commission/fee terms, and legal commitments.

Current safe slice:

- Docs/KB only: staff-private source matrix and owner lead capsule evals. Keep FAD owners assistant planned.

### Feedback

Needed before learning from screenshots/raw diagnostics:

- Evidence retention/redaction ADR.
- Access policy for raw screenshots, console logs, DOM metadata, route/device metadata, and user/session identifiers.
- Candidate-lane taxonomy: bug pattern, UX confusion, missing context, policy gap, feature request.
- Eval cases for restricted evidence rejection and redacted summary quality.

Current safe slice:

- Write retention/redaction policy first. Do not mine raw feedback evidence into KB until this is approved.

### Guest Portal

Needed before build:

- Stay-token source matrix and consent/session policy.
- Property guidebook public versus stay-scoped fields.
- Access-window rules and checked-in/checked-out state boundaries.
- Guest memory policy for authenticated personalization.
- Escalation/handoff contract into FAD Inbox.

Current safe slice:

- Docs/source matrix only. Coordinate with Website/guest portal session before wiring.

### Finance

Needed before build:

- Finance source owner: FAD finance tables, workpapers, bank upload, owner statements, expenses, payouts, tourist tax, VAT/MRA.
- Owner-statement privacy isolation.
- Legal/accounting disclaimer and human approval boundary.
- Retention/redaction for financial evidence.
- Eval cases for cross-owner leakage, unsupported tax/legal advice, and payment/expense mutation safety.

Current safe slice:

- Design-only KB/source matrix. No runtime agent until access policy and finance data ownership are approved.

### Legal/Admin

Needed before build:

- Contract/template inventory.
- License/compliance calendar.
- Tourism Authority, MRA, Data Protection Act, employment/HR legal source list.
- Human legal-review boundary.
- Eval cases for unsupported legal commitments and stale law/regulation answers.

Current safe slice:

- Source-mapped research only. No legal advice runtime.

### HR/Training

Needed before build:

- SOP catalog by role.
- Training progress sources and skill matrix ownership.
- HR/private performance boundary.
- Roster/leave interaction with Ops.
- Eval cases for private staff data leakage and unsafe HR conclusions.

Current safe slice:

- KB skeleton and privacy boundary doc. No performance-memory runtime.

### Analytics/Intelligence

Needed before build:

- Metric catalog and source owner per metric.
- Aggregation privacy policy.
- Drill-down permission model.
- Event-volume thresholds before trend claims.
- Eval cases for misleading aggregates and private-data exposure.

Current safe slice:

- Docs-only metric/source matrix.

### Public MCP

Needed before build:

- Public read/action schema.
- OAuth/scopes and audit trail.
- Dependency on published public context packs only.
- Approval-routed request actions; no direct booking/payment/irreversible write tools.
- Eval cases for public/private boundary and action safety.

Current safe slice:

- Contract doc only. Coordinate with Website MCP branch before implementation.

### Internal Agent Bridge

Needed before build:

- Sanitized summary contract.
- Trusted-agent/source allowlist.
- Provenance schema for agent-submitted candidates.
- No raw transcript ingestion.
- Eval cases for fabricated provenance, privacy leakage, and direct canonical-write attempts.

Current safe slice:

- Contract/eval design only. Keep canonicalization human-reviewed.

## Execution Order

1. Keep Plan 1 staff-use proof first: Inbox and Ops must be team-useful.
2. Finish Feedback retention/redaction before evidence mining.
3. Finish Properties field classification before richer public Website/MCP context packs.
4. Tighten Reservations/Calendar contracts before write-through actions.
5. Keep Finance, Legal/Admin, HR, Analytics, Guest Portal, Public MCP, and Internal Agent Bridge as scoped/planned until their source matrices and privacy rules exist.
