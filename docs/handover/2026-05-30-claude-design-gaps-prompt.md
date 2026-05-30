# Claude Design — Gaps Prompt (what to deepen after the FAD V2 package)

Date: 2026-05-30
Context: We received the FAD V2 design package (`api.anthropic.com/v1/design/h/wA2EUb7kp8KN5w2Y5jXRvQ`,
107 MB bundle: 57 HTML screens desktop+mobile for ~20 modules, 31 JSX prototypes, the
`fad-desktop.css` token system, and the `fad-states.jsx` AI trust/failure vocabulary).
We are now implementing from it. This is the prompt to send Claude Design to **close the
remaining gaps** — modules it did not design, surfaces it excluded, and shallow areas.

## Coverage assessment (package vs. what FAD needs)

- **Designed (high-fidelity):** Inbox, Operations + Daily Brief, Schedule, Tasks + drawer,
  Approvals, Roster, Supplies, Live Map, Calendar, Properties + record, Reservations +
  detail, Owners + statement, Finance, Analytics, Guests, HR, Reviews, Training (7 tabs),
  Notifications, Settings, Ask Friday, + the AI trust-state vocabulary.
- **Missing from the package entirely:** **Design module (17-stage — only a markdown brief,
  zero screens)**, Legal & Admin, Marketing, Leads/CRM-lite, Syndic, Agency, Tenant Settings,
  Billing, Admin Analytics, **Field-staff PWA**, **tablet breakpoints**.
- **Designed but shallow → needs deepening:** Finance (period-close/reconciliation/provenance),
  Owners (statement waterfall states), Properties-as-spine, Reviews/HR real-vs-empty states,
  Settings-as-integration-control-plane, per-field source/provenance component.

## Paste-ready prompt

```text
Continue the FAD V2 redesign. You already delivered the V2 package — desktop+mobile
screens for ~20 modules, the fad-desktop.css token system, and the fad-states.jsx AI
trust/failure vocabulary. We're implementing from it now. Close these GAPS at the same
fidelity (HTML/CSS prototypes + handoff notes), keeping the dark-theme tokens and density:

1) MODULES NOT YET DESIGNED — full desktop + mobile + detail record + the complete state
   matrix (empty/loading/partial/error/stale/permission) for each:
   • DESIGN (interiors) — TOP PRIORITY. The full 17-stage pipeline as a state machine +
     stage workbench: exception-dashboard overview; projects table (stage/owner/property/
     tier/budget/funding/next-action/blocker/owner-approval/updated); project-detail split
     (stage rail + summary + attention panel + financial snapshot + related property/owner);
     per-stage workbench (required inputs, decisions, evidence, owner-visible output,
     complete/hold/escalate); budget workspace (itemized + historical comparables +
     confidence/margin + owner-facing version); procurement workspace (vendors/quotes/POs/
     delivery/variance/receipts); owner review (comments/revision rounds/approval history/
     shared-package state); reconciliation (budget-vs-actual/owner balance/Friday margin/
     handover checklist); vendors directory; design analytics; design settings (stage
     templates, fee+VAT defaults, doc requirements, approval rules). Owner-portal share/print
     states: not-generated / draft / shared / viewed / approved / expired. Mobile triage queue
     (waiting-on-me / blocked / owner-replied / vendor-delay / approval-needed / payment-needed).
   • Legal & Admin, Marketing, Leads/CRM-lite, Syndic, Agency, Tenant Settings, Billing,
     Admin Analytics — for each: the user's job, primary entities + source systems, main
     list/table/card view, detail drawer, key actions, full state matrix, and what to
     redesign vs keep familiar.

2) NEW SURFACE — Field-staff PWA (mobile-first): task queue, job detail, evidence capture,
   offline/sync states, escalation/handover into Inbox. (Currently out of scope.)

3) RESPONSIVE — add a TABLET layer (package is desktop+mobile only): collapse secondary
   panels to tabs; keep summary + active controls visible.

4) DEEPEN SHALLOW AREAS (extend existing V2 screens):
   • Finance: period-close flow + reconciliation workspace + per-amount provenance
     (Guesty accounting truth / FAD ledger / pending approval / modeled forecast).
   • Owners: full statement workflow + waterfall + statement states (draft/review/sent/
     viewed); clarify Owners-vs-Finance ownership.
   • Properties: make the Property record the SPINE — converge Guesty commercial + Breezeway
     ops/condition + finance + reviews + guest history + Ask Friday context, provenance per field.
   • Reviews & HR: explicit "no synced data yet" vs real-data states; HR leave-request workflow.
   • Settings: integration control plane — per connector show last sync, direction, owner,
     failure state, data domains, source-system link.

5) CROSS-CUTTING (deliver as reusable component specs, not just per-screen):
   • Source/provenance model: concrete visual per-field treatment for Guesty-truth /
     Breezeway-truth / Friday-owned / modeled-forecast / stale / failed-sync.
   • The five AI states applied to EVERY AI surface beyond Inbox & Ask Friday: Operations
     Daily Brief, Training/Learnings, TeamInbox, and per-module Ask Friday.
   • Per-module Ask Friday behavior: what it grounds in, draft-vs-approval boundary, citations.

Deliver implementation-ready specs (layout, token reuse, component structure, copy,
interaction + state matrices) a coding agent can build from directly.
```
