# Friday Design OS module — v0.1 frontend

> **Continuation status (cont-1 .. cont-6, 2026-05-04):** The post-v0.1
> continuation extends this module without leaving the frontend. Highlights:
>
> - **Per-tier stage matrix** (B3.9) — `ANNEX_A_DEFAULT.tierStageRules` drives
>   StageTracker's optional-stage rendering.
> - **Project lifecycle** — `lifecycleStatus` on every project; Pause / Cancel /
>   Resume via `LifecycleMenu`. In-memory mutators in `_data/design.ts`.
> - **EPC ledgers** — PaymentsStage now stacks two read-only views (Project
>   Fund escrow / Fee Invoice) per B3.8.
> - **Single-approver simplification** (B3.11) — Agreement state machine
>   collapsed to `draft → sent → viewed → signed → completed`; Mark Received
>   gated to admin only.
> - **B3.1 supplier disclosure** — owner Budget tab now shows Retail /
>   Friday-negotiated / Saved per item, plus a "Saved by Friday" callout.
> - **Owner-portal route** — `/portal/projects/[slug]` is a real Next.js route
>   with its own layout (no FAD chrome). The same six tab modules render in
>   `OwnerPortalPreview` (modal, internal) and the standalone route. See
>   `portal/PortalContent.tsx`.
> - **Magic-link auth** — `/portal/auth?token=<jwt>` validates a mock
>   JWT-shaped token and persists `portal:session:<slug>` to localStorage,
>   then bounces to the project route. `signMockToken` / `validateMockToken`
>   match a real HS256 JWT shape so the v0.2 wire is mechanical.
> - **Approve / Request changes** — wired in OverviewTab action cards AND the
>   ApprovalsTab queue. `designClient.approvals.respond()` records a full
>   audit event (decision, comment, IP, UA, portalSession) and flips state.
> - **Past decisions** — approvals decided > 14 days ago collapse into a
>   `<details>` group in the queue.
> - **Internal service rate sheet** — Settings renders the 13-row demo seed
>   with cleaning hard-stop callout.
> - **Vitest harness** — `npm run test` runs pure-function and component
>   sentinel tests (tier/fee/strip/variance/JWT, StageTracker render, owner
>   Budget forbidden columns, AI feature attribute presence).
> - **Dashboard metric cleanup** — `metrics().activeProjects` now respects
>   `lifecycleStatus`, and `pendingOwnerApprovals` reads through
>   `designClient.approvals.allPending()` so the v0.2 wire is one accessor
>   swap. *Note:* the 'active' definition was tightened to exclude
>   paused/cancelled projects — flag if the original semantics is desired.
> - **DEMO_CRUFT extensions** — see `frontend/DEMO_CRUFT.md` for new
>   `PROD-DESIGN-*` rows: portal auth, respond audit, lifecycle, EPC ledgers,
>   tier rules, internal rates, role-aware Needs Attention, and the
>   `designClient` swap target itself (`PROD-DESIGN-5`).


## Status

v0.1 ships as a **frontend-only** demo. No real backend; no real auth; no real
AI; no real eversign. Everything backed by `_data/design.ts` + the `designClient`
mock accessor.

## File tree

```
modules/
├── DesignModule.tsx              entry point — sub-tab routing, project drill-
│                                 down (?pid=<id>&stage=<screen>), dispatches to
│                                 stage screens
├── design/
│   ├── ProjectContextBar.tsx     name + chips + counterparty/property/lead
│   ├── StageTracker.tsx          17-stage horizontal stepper
│   ├── ProjectIntake.tsx         + New project form
│   ├── OwnerPortalPreview.tsx    full-screen modal — what the owner sees
│   ├── AIPlaceholder.tsx         disabled v0.1 button with data-ai-feature attr
│   └── stages/
│       ├── SiteVisitStage.tsx
│       ├── PreferencesStage.tsx       16 + 1 areas
│       ├── RoughBudgetStage.tsx       tier auto-calc, fee auto-calc
│       ├── AgreementStage.tsx         Annex B form + verbatim Sep 2025 preview
│       ├── PaymentsStage.tsx          7-row gate table + Mark received modal
│       ├── MoodboardStage.tsx         versioned, revision counter
│       ├── DesignPackStage.tsx        versioned, per-room layouts
│       ├── FinalBudgetStage.tsx       16-col table, owner-view stripping
│       ├── ProcurementStage.tsx       7-column kanban
│       ├── ExecutionStage.tsx         tasks per item, expense capture modal
│       ├── ReconciliationStage.tsx    category drilldown + admin profitability
│       ├── HandoverStage.tsx          bundle builder, balance summary
│       └── DocumentsStage.tsx         master-detail of all 14 doc types
```

## Data + mock client

`_data/design.ts` holds:
1. **All TypeScript types** (StageId, DesignProject, BudgetItem, etc.)
2. **Seed fixtures** for 4 pilot projects (Albion, Ohana, Duval, RC-15)
3. **Pure helpers**: `tierForEpc()`, `designFeeForTier()`, `procurementFeeForTier()`, `stripForOwner()`, `formatMUR()`
4. **`designClient`** — the mock API accessor

### Real-API swap

When v0.2 backend lands, replace `designClient` with a fetch-backed client of
the same interface. Single-file change. Components import only from
`designClient`; nothing reads the raw fixture arrays directly.

```ts
// today (v0.1)
import { designClient } from '../../../_data/design';
const projects = designClient.projects.list();

// tomorrow (v0.2) — same call site
const projects = await designClient.projects.list();    // promise-ified
```

The interface shape is in `_data/design.ts` near `export const designClient`.
Every accessor returns the same shape today as the real API will return.

## Routing

Static export precludes nested Next routes per project. We use FAD's existing
query-param + module-internal state pattern:

| URL | Renders |
|---|---|
| `/fad?m=design&sub=overview` | Dashboard (ATC view) |
| `/fad?m=design&sub=projects` | Projects list |
| `/fad?m=design&sub=leads` | Leads pipeline |
| `/fad?m=design&sub=vendors` | Vendor register |
| `/fad?m=design&sub=settings` | Annex A pricing config |
| `/fad?m=design&sub=overview&pid=p-ohana&stage=site-visit` | Project drill-down at site-visit screen |
| `/fad?m=design&pid=__new` | + New project intake form |

Pid + stage are an **overlay** on the current sub-page — they don't change the
sub-tab. Sub-tab change clears them. URL is rehydrated on reload via lazy
useState init.

## Key rules

- **`entity_id = 'FD'`** on every record (read-only client-side).
- **Money is integer minor units (cents)**. Format on render only via `formatMUR`.
- **Owners NEVER see** `retail_cost`, `negotiated_cost`, `internal_work`, internal margin.
  v0.1 enforces via `stripForOwner()` + the FinalBudget owner-view toggle. v0.2
  enforces server-side per source §10 risk control.
- **Demo cruft tagged**: every fixture / mock / disabled-AI carries `// @demo:*`
  with a row in `frontend/DEMO_CRUFT.md` (PROD-DESIGN-1..4 + PROD-DESIGN-AI).

## AI integration points (11)

All disabled in v0.1. Each carries `data-ai-feature="<name>"` for v0.2 selector
wire-up. Prompt anchors are in build doc §5.2.

| Feature | Location |
|---|---|
| `site-visit-audit` | SiteVisitStage |
| `preference-brief` | PreferencesStage |
| `rough-budget-estimate` | RoughBudgetStage |
| `agreement-autofill` | AgreementStage |
| `moodboard-narrative` | MoodboardStage |
| `design-pack-copy` | DesignPackStage |
| `final-budget-suggest` | FinalBudgetStage |
| `receipt-scan` | ExecutionStage (expense capture modal) |
| `reconciliation-variance` | ReconciliationStage |
| `owner-update` | DesignModule project Overview |
| `handover-report` | HandoverStage |

## Cross-module touchpoints (8)

All mocked behind interfaces matching the real APIs:

- Counterparty (§7.ZZ) — `designClient.counterparties`
- Property — `designClient.properties`
- Vendor (§7.YY) — `designClient.vendors`
- Expense capture (§7.II) — embedded modal in ExecutionStage
- Approvals (§7.PP) — `designClient.approvals`
- Tasks (§7.SS) — `designClient.tasks`
- Eversign (§7.QQ) — Agreement screen send flow
- Escrow (§7.XX) — Project funds gate in PaymentsStage

## Testing

- **Type check**: `npx tsc --noEmit` from `frontend/` — clean.
- **Build**: `npm run build` from `frontend/` — clean.
- **Manual happy path**: dashboard → click Ohana → stage tracker → walk through
  each tab — all renders.

## v0.2 punch list (out of scope for this build)

- Real backend wiring (replace `designClient` with fetch client)
- AI features (wire 11 buttons by `data-ai-feature` selector)
- Real owner login + portal (the preview becomes a real route)
- Eversign integration for agreement send
- WhatsApp approval capture (mocked as channel option in Send modal)
- Native FAD design-pack assembly (currently external upload only)
- Standards Book
- Per-tenant Annex A config (multi-tenant)
