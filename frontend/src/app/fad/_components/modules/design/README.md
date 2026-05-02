# Friday Design OS module — v0.1 frontend

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
