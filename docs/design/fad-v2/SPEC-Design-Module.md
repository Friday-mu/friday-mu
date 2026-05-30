# SPEC — Design (Interiors) Module · FAD V2

Implementation-ready spec for a coding agent. Reuses the existing FAD V2 system: dark tokens in `fad-desktop.css` (`--bg #0a0d12`, `--surface`, `--card`, `--line*`, `--tx/--tx-2/-3/-4`, `--indigo #4f72cf`, status `--green/--red/--amber/--violet`, `--serif Newsreader`, `--ui Hanken Grotesk`, `--mono JetBrains Mono`, `--r 13px`), the `Shell` chrome (rail + topbar + tabs + drawer host), and the `fad-states.jsx` trust vocabulary (`SyncChip`, `Provenance`, `ConfBar`, `StateBanner`, `useHealth`). Lives under the **Business units** rail section (key `design`), peer to Syndic/Agency.

## 0. Who & job
Friday's paid interior-design service. Operator (designer/PM) runs paid projects from lead → handover. Owner sees a magic-link portal (share/approve packages). Entities: **Project, Stage, BudgetLine, Vendor, Quote, PO, Delivery, Receipt, OwnerReview/RevisionRound, ReconciliationLine, Document**. Source systems: FAD ledger (Finance `entity` tag), Properties (`property_id`), Owners, Drive (docs), vendor quotes (manual/email). Money in MUR; fee + VAT defaults configurable.

## 1. The 17-stage pipeline (state machine)
Stages (ordered): `1 Lead → 2 Brief → 3 Site survey → 4 Concept → 5 Concept approval → 6 Detailed design → 7 Budget → 8 Budget approval → 9 Procurement → 10 Deposit/funding → 11 Ordering → 12 Delivery → 13 Install → 14 Styling → 15 Owner review → 16 Reconciliation → 17 Handover`.
Each stage object: `{id, key, label, status: not_started|active|blocked|on_hold|complete, owner, enteredAt, dueAt, blocker?, ownerApproval: n/a|pending|approved|changes, evidenceCount}`. Transitions: **Complete** (advance), **Hold** (pause, reason), **Escalate** (flag + notify Inbox), **Re-open**. Approval-gated stages (5, 8, 15) cannot advance until `ownerApproval==='approved'`. Render the pipeline as a horizontal **stage rail** (reuse `.wiz-steps` pattern rotated horizontal, or `.dtabs`-style) with per-stage status dot: green=complete, indigo=active, amber=on_hold, red=blocked, `--tx-4`=not_started.

## 2. Screens (desktop) — all use `Shell active="design"`
Module-level tabs (Shell `tabs`, keys `dz-*`): **Overview · Projects · Vendors · Analytics · Settings**. Project detail + per-stage workbench open as routed sub-views (`dz-project`, `dz-stage`), budget/procurement/review/reconciliation as tabs inside project detail.

### A. Overview — exception dashboard (`dz-overview`)
- `grid4` KPI cards: Active projects · Owner-approval pending · Blocked/at-risk · Margin MTD. Use count-up.
- **Friday brief** (`.fai`): "N projects need you — 2 awaiting owner approval, 1 vendor delay, 1 over budget." Actions route to filtered Projects.
- **Attention list** (`.synalert` rows): each = project + exception type (`blocked`, `owner-replied`, `vendor-delay`, `approval-needed`, `payment-needed`) + age + CTA. Color dot per type.
- Pipeline funnel: count of projects per stage bucket (Lead/Design/Procurement/Install/Closeout) as a `.synbar`-style segmented bar.

### B. Projects table (`dz-projects`)
Columns: Project · Stage (badge+dot) · Owner · Property (`pcodeD`) · Tier (Essential/Signature/Bespoke) · Budget · Funding (`bdg`: unfunded/deposit/funded) · Next action · Blocker · Owner approval (`bdg`: n/a/pending/approved/changes) · Updated. Filter segment (`.vseg`): All / Active / Blocked / Awaiting owner / Over budget. Row click → project detail. Density per `.tbl`.

### C. Project detail (`dz-project`) — split layout
- **Left: stage rail** (vertical `.wiz-steps`), click a stage → stage workbench.
- **Center: summary** — header (project, property link, owner link, tier, `SyncChip` for property/owner data), current-stage card, **attention panel** (open blockers/approvals), recent activity timeline (`.tdtimeline`).
- **Right: financial snapshot** — budget vs actual bars, owner balance, **Friday margin** (internal, gated), funding state. Use `Provenance` chips per amount (ledger-truth vs modeled).
- Tabs within detail: Summary · Budget · Procurement · Owner review · Reconciliation.

### D. Per-stage workbench (`dz-stage`) — reuse `.wiz` modal/section pattern
Four panels: **Required inputs** (checklist `.tdcheck`), **Decisions** (radio/select), **Evidence** (photo/file slots `.tdphotos`), **Owner-visible output** (preview of what owner sees + share state). Footer actions: **Complete & advance** (disabled until inputs done + approval if gated) · **Hold** · **Escalate**. Show `StateBanner` if upstream data stale/missing.

### E. Budget workspace (project tab)
Itemized table (room → line items: qty, unit, supply, install, total). **Historical comparables** panel (similar projects' line costs) with `ConfBar` confidence + margin. Toggle **Owner-facing version** (hides Friday margin, shows owner price). Actions: add line, request approval (→ owner review), lock budget.

### F. Procurement workspace (project tab)
Vendors → Quotes (compare) → POs → Delivery tracking → Variance (PO vs actual) → Receipts. Table per PO with status (`bdg`: draft/sent/confirmed/delivered/received), variance highlighted red/green. Receipt thumbnails (`.qthumb`). Tie spend to BudgetLine.

### G. Owner review (project tab)
Comment threads per shared package, **revision rounds** (R1/R2…), approval history timeline, shared-package state badge. Compose: share package → states below. Manager sees owner comments inline; can resolve/revise.

### H. Reconciliation (project tab)
Budget-vs-actual table, **owner balance** (paid vs owed), **Friday margin** (internal), **handover checklist** (`.tdcheck`). Final "Close project" action (gated on checklist + zero owner balance).

### I. Vendors directory (`dz-vendors`)
Table: vendor · category · rating · active POs · on-time % · contact. Drawer = vendor detail (history, quotes, contracts).

### J. Design analytics (`dz-analytics`)
Reuse Analytics patterns: margin by tier, stage cycle-time, on-time delivery, budget accuracy, revenue trend (date-range selector).

### K. Design settings (`dz-settings`)
Tabs: **Stage templates** (per-tier required inputs/docs per stage), **Fee + VAT defaults**, **Document requirements**, **Approval rules** (which stages gate on owner approval). Reuse Settings tab pattern + toggles.

## 3. Owner-portal share/print states (reuse `.portal` + `.doc-a4`)
Package lifecycle badge: **not-generated → draft → shared → viewed → approved → expired**. Each maps to a treatment:
| State | Operator UI | Owner portal |
|---|---|---|
| not-generated | "Generate package" button | n/a |
| draft | amber "draft" badge, editable | not visible |
| shared | green "shared · link live", copy link | package visible, Approve/Comment |
| viewed | "viewed 2d ago" + read receipt | — |
| approved | green "approved", locked | shows approved stamp |
| expired | red "link expired", re-share | "link expired" message |
Print/share = A4 navy doc (`.doc-a4`, `#1F3864` header) like Syndic docs.

## 4. Mobile triage queue (mobile-first)
`.mphone` screen `MobileDesign`: segmented chips = **Waiting on me / Blocked / Owner replied / Vendor delay / Approval needed / Payment needed**. Each card = project + exception + age + one-tap action. Tap → compact project detail (stage rail collapsed to a progress strip + summary + the single blocking action). Reuse `MTabbar on="more"`.

## 5. State matrix (apply to every view)
Use `fad-states.jsx`. For each surface define: **empty** (`.tdempty` — "No projects yet / Add your first"), **loading** (skeleton rows: `.panel` with shimmer `.load`), **partial** (`StateBanner amber` — "Property condition data unavailable"), **error** (`StateBanner red` + Retry, actions disabled), **stale** (`SyncChip` amber "synced 12m ago"), **permission** (read-only: hide mutating actions, show "Read-only · CS/viewer role" `bdg`). AI surfaces (Design Ask Friday, budget comparables, stage suggestions) add **fallback** ("modeled estimate — not from your data") + **draft-vs-approval** boundary (nothing applied until operator confirms) + **citations** (`Provenance` chips: ledger / comparable projects / property facts).

## 6. Tokens & components to reuse (no new primitives)
`Shell`, `.dtabs/.dtab`, `.statc` (KPI), `.fai`/`.fbar` (Friday), `.panel`, `.tbl`, `.bdg` (+tones), `.pcodeD` (codes), `.vseg/.vs` (filters), `.tdrow` (clickable rows), `.tddrawer` (detail drawers), `.wiz`/`.wiz-steps` (stage workbench/pipeline), `.tdcheck` (checklists), `.tdphotos`/`.qthumb` (evidence), `.synbar` (funnel), `.synalert` (attention rows), `.doc-a4` (owner docs), `.portal` (owner portal), `.tdtimeline` (activity), `fad-states.jsx` (all state UI). New module file `fad-design.jsx` exporting `window.FADDESIGN`; routes in `fad-router.jsx` (`design`, `dz-*`); rail entry already exists.

## 7. Copy tone
Calm, operator-first, plain. Friday speaks in first person, proposes/drafts, never auto-commits gated actions. Owner-facing copy is warm + jargon-free; internal margin/strategy never leaks to owner views (mirror Syndic's internal-vs-external guardrail).
