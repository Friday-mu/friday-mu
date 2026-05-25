# Ops Friday Consult Knowledge Base - 2026-05-26

This document mirrors the first Operations-specific Friday Consult KB shipped in FAD. Runtime source files live under `backend/knowledge/surfaces/ops-consult/`.

## Runtime Surface

- Surface key: `ops-consult`
- Backend route: `POST /api/operations/consult`
- UI surface: Operations > Schedule > Friday Consult panel
- User-facing module name: Friday Consult
- Mutation rule: draft first, apply only after staff action, keep undo for reversible schedule operations.

## Included Knowledge Packs

- `SKILL.md`: identity, action protocol, planning ladder, output style.
- `staff-roster-rules.md`: staff names, bases, transport, skills, night/weekend rules, fairness controls.
- `task-duration-skill-matrix.md`: property size rules, combo properties, task durations, booking triggers, skill ownership.
- `scheduling-methodology.md`: monthly -> weekly -> daily -> live replan method, travel rules, exact-time visual behavior.
- `owner-terms-approval-rules.md`: owner approval thresholds, urgent override, owner stay cleaning defaults, records.
- `turnover-maintenance-quality.md`: STR cleaning, post-clean, arrival inspection, preventative maintenance, maintenance triage.
- `srl-supplies-rules.md`: welcome pack and SRL quantity rules.
- `learning-and-controls.md`: what the agent may learn, what requires human review, confidence gates, audit controls.

## Terms Page Read

Live source checked on 2026-05-26:
https://www.friday.mu/fr-terms-and-conditions

Ops-critical policy extracted:

- Cleaning Fee funds housekeeping, turnover logistics, welcome packs, and essential restocking. It is distinct from Owner Revenue.
- Core services include booking/payment management, guest communication, housekeeping oversight, maintenance scheduling/supervision, and monthly owner reporting.
- Direct repair labour/material costs are owner-chargeable Other Expenses.
- Owner/owner-guest stays require a self-clean vs professional-clean decision at least 48 hours before checkout. If no answer, default to professional clean and charge owner.
- Routine incident spend without prior owner approval is up to the greater of MUR 2,500 or 10% of Total Guest Paid, capped at MUR 20,000.
- Above routine limit and up to MUR 20,000: request owner approval; no response after 24 hours is deemed approved for the specified amount.
- Urgent override can act up to MUR 20,000 when owner is unreachable/non-responsive and delay risks guest cancellation, platform dispute, low review, reputational harm, health/safety/hygiene, or financial/reputational damage.
- Above MUR 20,000 always requires explicit owner approval.
- Major repairs/upgrades above MUR 20,000 require owner approval; coordination fee up to 10% plus VAT may apply.
- Lockbox/key-safe supply, maintenance, and code changes are authorized operationally.

## External Research Summaries

- Workforce scheduling should model demand, skills, days off, requests/preferences, and fairness together. This supports the Ops agent's monthly -> weekly -> daily method.
- Field-service scheduling should combine service duration plus travel time, skill match, working hours, and route grouping.
- STR turnover quality depends on detailed room-by-room checklists, restocking before/while cleaning, photo/inspection evidence, and immediate escalation of maintenance gaps.
- Preventative maintenance should cover HVAC/AC, plumbing/water, electrical/lighting, exterior/access, safety, and visible guest-risk areas.

References:

- https://www.sciencedirect.com/science/article/pii/S037722170300095X
- https://link.springer.com/article/10.1007/s12351-025-00903-7
- https://trackroad.com/knowledge-center/route-planning-field-service/
- https://resources.tellusapp.com/passive-income/short-term-rentals/cleaning-and-turnover-guide
- https://www.unitedffs.com/preventive-maintenance-guide/
- https://www.guesty.com/blog/5-tips-to-effectively-stock-and-manage-your-airbnb-inventory/

## Known Non-Blocking Gaps

- Property-specific signed agreement exceptions are not in the KB yet.
- Vendor live prices and preferred vendor lead times are not in the KB yet.
- Exact staff addresses are approximated by area only.
- Google travel-time integration is referenced as desired, not wired in this slice.
- The current apply path supports schedule draft application, clear, and undo. Full roster mutation/application remains future work.
