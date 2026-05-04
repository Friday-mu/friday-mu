# Friday Design OS module — v0.1 frontend

> **Continuation status (cont-1 → cont-20, last touched 2026-05-04):** Module
> is well past v0.1 — see commit log on `fad-design-os-v01-frontend` for the
> full per-commit narrative. Headline state:
>
> **IA & navigation**
> - Project drill-down restructured (cont-10) from a 17-pill StageTracker +
>   14-tab strip into 6 phase tabs (Brief / Discovery / Design / Procurement /
>   Execution / Closeout / Documents) with accordion sub-sections per phase.
>   The 17-stage state machine in `design.ts` is intact — only the UI
>   collapsed via the `PHASES` constant.
> - Overview cleaned up (cont-9): pipeline-by-stage chart + AI summary +
>   bottom Blockers panel removed; current shape is metrics → summary line →
>   All Projects + Needs Attention + My Today.
>
> **Owner portal — async-first wedge for non-resident owners**
> - Real Next.js route at `/portal/projects/[slug]` with its own chrome (no
>   FAD shell). Same six tabs render in `OwnerPortalPreview` modal AND the
>   standalone route via `portal/PortalContent.tsx`.
> - Magic-link auth (cont-5) — `/portal/auth?token=<jwt>` validates a mock
>   HS256-shaped token, persists `portal:session:<slug>` to localStorage,
>   bounces to the project route. v0.2 swaps to a real signing key + backend
>   revocation list. **Locked**: links are permanent; no owner-visible
>   expiry. Delivered via both WhatsApp Business API and email.
> - Approve / Request changes wired in OverviewTab AND ApprovalsTab queue.
>   `designClient.approvals.respond()` records a full audit event.
>
> **Audit roadmap items shipped (cont-11 → cont-19)**
> - **A5 — Leads kanban** (cont-12). Flat table → 5-column kanban with stale
>   flag.
> - **A6 — Selections as first-class object** (cont-15 + cont-16, end-to-end).
>   `DesignSelection` + `SelectionOption` types, owner picker in portal
>   ApprovalsTab, full admin authoring UI under DesignPackStage. State:
>   `draft → sent → picked / changes_requested`.
> - **A7 — Change orders linked to live budget** (cont-17). `ChangeOrder` +
>   `ChangeOrderLineItem` (signed deltas — positive adds, negative removes),
>   admin authoring in FinalBudgetStage with live "+Rs X pending owner /
>   approved · Projected: Rs Y" delta chip above the budget table, owner
>   approve/reject flow in portal ApprovalsTab.
> - **A8 — Procurement chain drawer** (cont-13). Click any kanban card →
>   side drawer with B3.1 strip + 6-step chain timeline (Sourcing → Quote →
>   PO → Delivery → Install → QA) + linked tasks.
> - **B6 — Closeout binder as structured deliverable** (cont-18). One binder
>   per project; warranties indexed per item with vendor + duration + computed
>   expiry, maintenance schedule with frequency + step-by-step instructions,
>   snag list with per-item owner accept + umbrella sign-off. Replaces the
>   stub HandoverTab with a full owner-facing handover view.
>
> **Moats from audit Section 4 — first instances**
> - **#3 Multi-property portfolio layer** (cont-19). Vendor register became a
>   cross-project performance table (per-vendor projects / items / total
>   spend / variance / on-time %, drill-in to per-project breakdown). Rough
>   Budget catalog picker grew a "where used" expander showing every prior
>   project that bought the matched item with per-unit price. Cross-project
>   historical seed expansion (12 lines on Albion + LB-2) so aggregators have
>   real data.
> - **#4 AI on brief and budget** (cont-11 was the wedge). Portfolio item
>   catalog: approved historical BudgetItems aggregated by normalised name
>   into per-unit min / median / mean / max. Powers the Rough Budget
>   estimator with "what Friday actually paid" instead of gut-feel.
>
> **Cross-module hooks**
> - Design Leads view sources from `FAD_LEADS` filtered to interior pipeline
>   (cont-14) — first concrete CRM-lite ↔ Design wiring.
>
> **Hygiene**
> - Vitest harness: 72 tests (cont-20 added 30 mutator tests for selections /
>   change orders / binder / portfolio aggregators).
> - `tsconfig.tsbuildinfo` gitignored to stop dev↔build path churn.
>
> **Locked decisions (don't re-litigate without explicit Ishant direction)**
>
> - **`metrics().activeProjects`** filters out paused/cancelled projects.
>   Matches the metric card label.
> - **Portal hosting** — v0.2 routes the owner portal at `portal.friday.mu`
>   (separate subdomain, same static-export bundle CNAMEd).
> - **Magic links are permanent** — no time-based expiry shown to owners.
>   v0.1 mock TTL bumped to 10 years; v0.2 replaces with backend revocation
>   list + admin "Re-issue link" CTA.
> - **Magic-link delivery**: both WhatsApp Business API AND email. Owner
>   email collected on the counterparty record.
> - **Quote comparison** — design the side-by-side quote table BEFORE backend
>   work begins. Director gets a one-click "approve cheapest reasonable"
>   affordance.
> - **Legacy closeout import** — bulk-import wizard under ReconciliationStage.
>   Reused for LB-1 / LB-4 in 2027.
> - **Single approver = director (Ishant)** — no conditional permission logic
>   on agreement send / mark received in v0.1 (B3.11).
> - **17-stage state machine** in `design.ts` is load-bearing for the
>   workflow — DON'T flatten it. The IA collapse (5 phases) only restructured
>   the UI via the `PHASES` constant.
>
> **`designClient` is the v0.2 swap target.** Every accessor's shape is the
> future API endpoint's shape. PRESERVE THE SHAPES — don't rename or
> restructure unless backend explicitly says so.


## Status

v0.1 ships as a **frontend-only** demo. No real backend; no real auth; no real
AI; no real eversign. Everything backed by `_data/design.ts` + the `designClient`
mock accessor.

## File tree

```
modules/
├── DesignModule.tsx              entry point — sub-tab routing, project drill-
│                                 down (?pid=<id>&phase=<id>), dispatches to
│                                 stage screens via phase accordions, plus
│                                 the cross-project Vendors performance view
├── design/
│   ├── ProjectContextBar.tsx     name + chips + counterparty/property/lead
│   ├── StageTracker.tsx          17-stage horizontal stepper (still backs the
│   │                             URL `?stage=` param for backward compat)
│   ├── LifecycleMenu.tsx         pause / cancel / resume project (cont-2)
│   ├── ProjectIntake.tsx         + New project form
│   ├── OwnerPortalPreview.tsx    full-screen modal — what the owner sees
│   ├── OverviewExtras.tsx        Needs Attention queue + summary line
│   ├── AIPlaceholder.tsx         disabled v0.1 button with data-ai-feature attr
│   ├── stages/
│   │   ├── SiteVisitStage.tsx
│   │   ├── PreferencesStage.tsx       16 + 1 areas
│   │   ├── RoughBudgetStage.tsx       tier + fee auto-calc, catalog estimator
│   │   │                              with "where used" expander (cont-19)
│   │   ├── AgreementStage.tsx         Annex B form + verbatim Sep 2025 preview
│   │   ├── PaymentsStage.tsx          escrow + fee-invoice ledgers (cont-3a)
│   │   ├── MoodboardStage.tsx         versioned, revision counter
│   │   ├── DesignPackStage.tsx        versioned + Selections admin sub-section
│   │   │                              (cont-15/16, audit A6)
│   │   ├── FinalBudgetStage.tsx       16-col table, owner-view stripping,
│   │   │                              Change orders sub-section + live delta
│   │   │                              chip (cont-17, audit A7)
│   │   ├── ProcurementStage.tsx       7-column kanban
│   │   ├── ProcurementChainDrawer.tsx click-card drawer with B3.1 + 6-step
│   │   │                              chain (cont-13, audit A8)
│   │   ├── ExecutionStage.tsx         tasks per item, expense capture modal
│   │   ├── ReconciliationStage.tsx    category drilldown + closeout binder
│   │   │                              admin section (cont-18, audit B6) +
│   │   │                              admin profitability
│   │   ├── HandoverStage.tsx          bundle builder, balance summary
│   │   └── DocumentsStage.tsx         master-detail of all 14 doc types
│   └── portal/
│       ├── PortalContent.tsx          tabbed shell, mutator state mirror,
│       │                              modal orchestration
│       ├── OverviewTab.tsx            owner Hi + action cards
│       ├── ApprovalsTab.tsx           approvals + selections + change orders
│       │                              queue (cont-15/16/17 added)
│       ├── BudgetTab.tsx              owner Budget — B3.1 disclosure
│       ├── DocsTab.tsx                downloadable docs list
│       ├── ProgressTab.tsx            owner-visible photos + stage progress
│       ├── HandoverTab.tsx            closeout binder render + sign-off
│       │                              (rewritten cont-18)
│       ├── RequestChangesModal.tsx    comment-required reject modal (reused
│       │                              for selection request + CO reject)
│       └── types.ts                   PORTAL_TABS list + PortalTab type
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
| `/fad?m=design&sub=leads` | Leads kanban (cont-12) |
| `/fad?m=design&sub=vendors` | Vendor register — cross-project performance (cont-19) |
| `/fad?m=design&sub=settings` | Annex A pricing config |
| `/fad?m=design&sub=overview&pid=p-ohana&phase=design` | Project drill-down at the Design phase |
| `/fad?m=design&sub=overview&pid=p-ohana&stage=site-visit` | Backward-compat — `?stage=` still works, mapped to its containing phase |
| `/fad?m=design&pid=__new` | + New project intake form |
| `/portal/auth?token=<jwt>` | Owner magic-link landing — validates + bounces |
| `/portal/projects/<slug>` | Owner-facing portal (no FAD chrome) |

Pid + phase are an **overlay** on the current sub-page — they don't change
the sub-tab. Sub-tab change clears them. URL is rehydrated on reload via
lazy useState init.

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
- **Vitest**: `npm run test` — 72 tests across 5 files. Mutator coverage for
  cont-15 → cont-19 lives in `_data/design.mutators.test.ts`; pure-function
  + JWT coverage in `_data/design.test.ts`; component sentinels in
  `design/StageTracker.test.tsx`, `design/AIPlaceholder.test.ts`,
  `portal/BudgetTab.test.tsx`.
- **Manual happy path**: dashboard → click Ohana → walk every phase tab.
  Mobile sweep at 375 (CLAUDE.md UI-verification rule — FAD is mobile-first).

## v0.2 punch list (out of scope for this build)

- Real backend wiring (replace `designClient` with fetch client)
- AI features (wire 11 buttons by `data-ai-feature` selector)
- Real owner login + portal (the preview becomes a real route)
- Eversign integration for agreement send
- WhatsApp approval capture (mocked as channel option in Send modal)
- Native FAD design-pack assembly (currently external upload only)
- Standards Book
- Per-tenant Annex A config (multi-tenant)
