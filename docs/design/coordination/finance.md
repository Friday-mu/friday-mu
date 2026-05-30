# Finance — Design Brief for Claude Design (director-only)

> Sits on top of the **FAD Finance master scope** ([34e43ca8849281d49027cd5845494e02](https://www.notion.so/34e43ca8849281d49027cd5845494e02)),
> the **Phase-3 owner-ledger** spec ([36143ca88492816087d7eeeebe502a15](https://www.notion.so/36143ca88492816087d7eeeebe502a15)),
> and the **Finance Insights panel v0.1 (LOCKED)** ([36a43ca8849281e48272f92596717764](https://www.notion.so/36a43ca8849281e48272f92596717764)).
> Read `00-README` + `ask-friday.md` first. **Finance is director-only** — managers never see this module, and owner
> payout/commission figures are hidden from managers everywhere they appear.

## 1. The brief in one line
Design Finance as the **AI-native financial backbone** — capture-at-source, Postgres-as-source-of-truth,
**trust-before-automation** (v1 surfaces + proposes, humans confirm), every action audited — anchored by a
**decision-grade Insights cockpit** for the CEO (consolidated cash with the GBH syndic fund ring-fenced out, a ranked
insight feed, and an always-on compliance/liability spine) and the operational ledger beneath it (capture → classify
→ reconcile → period-close → owner statements).

## 2. Source of truth and grounding (three-way reconcile)
- **Vision.** Five principles: capture-at-source · Postgres = SoT · **trust before automation** · audit-everything ·
  multi-tenant. Replaces Mary's institutional memory (**she left end-May — MRA VAT penalties have been accruing since
  Aug 2025**; ~Rs 1M unpaid VAT accumulated silently across 5 quarters because books lived in Slack + 4 Excels + one
  head). 5 phases: P1 capture/classify/bank-ingest/period-close-shell/revenue-recon/tourist-tax → P2 double-entry GL
  + QuickBooks + MRA remittance → P3 real-time refund detection + Guesty push + Reva replacement → P4 FI+Syndic books
  → P5 native owner portal + AI revenue mgmt. **Phase-3 owner-ledger** must: **deduct commission before owner
  payout**, exercise **Guest Recovery Authority** (refunds without case-by-case owner approval), handle
  free-cancellations, keep a clean owner ledger, and do **tourist fee/tax by jurisdiction**. Schema = 14 tables,
  `entity_id` FR/FI/S (FR only legal entity). **Hard lock: Cleaning Fee = net pass-through, never revenue.**
- **The Insights cockpit (LOCKED v0.1)** — *the* director surface: "the CEO's financial cockpit, decision-grade not
  ledger-grade." **Role-gated to the top financial role only** (Ishant; Mathias/Franny reduced or none). One adaptive
  scroll (not tabs): **headline row** (consolidated operating cash with the **GBH syndic fund ring-fenced out**, month
  net, single pending liability) · **ranked insight feed** · **standing reads** (P&L vs trailing, payables,
  receivables) · an **always-on compliance + liability spine** (VAT/quarter, tourist-fee liability, statutory
  accounts vs the 30-Jun year-end) · a **Finance-scoped NL ask box**. **Push vs pull:** the overview is pull; the
  compliance watch **pushes** into the morning brief + Slack. Cash = 6 MUR accounts consolidated, syndic ring-fenced,
  runway on operating only. Boundaries: TAC → Properties/Legal; commercial trends (occ/ADR/RevPAR/pace) → Analytics;
  accountant export = a separate Reports feature.
- **Reality.** `FinanceModule.tsx` (~165KB, **10 sub-pages built** — CORE): Overview · Transactions · Approvals ·
  Owner-statements (`Waterfall`, `CleaningFeeToggle`, `GuestyDivergence`) · Tourist-tax · P&L · Float-ledger ·
  Reports · **Insights (stub)** · Settings. **LIVE backend (only two finance mounts):** `/api/finance/property/:code/
  summary` (real Guesty-reservation revenue agg, returns `data_quality{revenue_source, expenses_source,
  channel_fees_source}`; channel_fees/friday_margin = 0 heuristic, "needs Phase 2") and `/api/expenses` + `/api/
  owners`. **Receipt OCR is LIVE:** `POST /api/intent/parse-receipt` (Gemini, returns `{extracted, confidence:
  high|medium|low}`; **503 `template-fallback` when the key is unset**; 402 on quota); the capture form
  (`CaptureExpenseDrawer`) is fully wired (receipt → parse → prefill → POST). **SPEC** (UI references, no backend):
  most `/api/finance/*` (vendors/periods/pnl/policies/banks/escalation/tourist-tax-totals), the **14-account bank
  topology** fixture, the anomaly recon engine, the `Rs 200` refund cap.
- **Drawn.** `fad-desktop-screens.jsx` `ScreenFinance`: a **Friday brief = 6 severity cards** (COMPLIANCE /
  APPROVAL-URGENCY / ANOMALY / FORECAST / REFUND-RISK / CASHFLOW — each "tap to ask Friday" + "Open source ↗"); KPI
  row; an **8-stage period-close stepper** (Pre-flight → FX → Bank recon → Revenue recon → Per-property → Tourist tax
  → P&L preview → Lock+post). `ScreenOwnerStatement` = the waterfall (shared with `owners.md`).
- **Full-vision rule:** draw Phase-3 (Guest Recovery Authority, commission-before-payout, refund detection) complete
  even though the backend is SPEC; the **OCR-fallback / Guesty-divergence / sync-failed** states are not "future".

## 3. Who uses it (roles)
**Director-only.** `permissions.ts`: `finance` = FULL for director, **`{}` for managers and field**. The comment is
explicit: *"Managers don't see the Finance module; financial figures in Owners/Properties are finance-gated too —
owner payout amounts hidden from managers by design."* The Insights cockpit narrows further to the **top financial
role** (Ishant). So design the **manager-facing redaction** (a "Director only" chip / "—") wherever finance figures
surface in Owners/Properties/Reservations/Marketing.

## 4. Design principles and system
- **Trust before automation.** v1 **surfaces and proposes**; a human confirms. Every Friday brief card, OCR prefill,
  divergence, and statement reconciliation is a proposal with provenance — never a silent posting.
- **Decision-grade cockpit vs ledger-grade detail.** The Insights panel is for *decisions* (cash, compliance,
  liabilities); the sub-pages are the ledger. Don't conflate.
- **Ring-fence the syndic fund.** Consolidated cash visibly excludes the GBH syndic fund (it's not Friday's money).
- **Apply the built `ai/` kit** — Finance currently wires **none** of it despite modeled figures + AI surfaces.

## 5. Information architecture
Sub-pages: **Overview** (Friday brief + KPIs) · **Insights** (the LOCKED cockpit) · **Transactions** · **Approvals** ·
**Owner statements** (waterfall — see `owners.md`) · **Tourist tax** · **P&L** (by entity) · **Float ledger**
(14-account bank topology) · **Reports** (accountant export) · **Settings** (categories/caps/vendors/accounts/
escalation). **Period-close** is an 8-stage wizard.

## 6. Surfaces to design (full vision) — P0 first
| # | Surface | Purpose | Reality | Priority |
|---|---|---|---|---|
| A | **Insights cockpit** | headline cash (syndic ring-fenced) + ranked insight feed + standing reads + the always-on compliance/liability spine + Finance NL ask; push compliance watch. | SPEC (stub) | **P0** |
| B | **Friday brief (6 severity cards)** | compliance / approval / anomaly / forecast / refund-risk / cashflow; tap-to-ask + open-source. **With trust-states.** | SPEC (static) | **P0** |
| C | **Expense capture + receipt OCR** | receipt → OCR prefill (confidence band) → classify → submit; the 503/manual-fallback path. | LIVE | **P0** |
| D | **Approvals + GuestyDivergence** | expense/refund approvals; the Accept-Guesty / Accept-FAD / Investigate reconciliation. | CORE | **P0** |
| E | **Owner statement waterfall** | gross→net payout, held-line gate, reconciliation banner (shared with Owners). | SPEC | **P1** |
| F | **Period-close wizard** | the 8 stages with per-stage health + lock. | SPEC | **P1** |
| G | **P&L · Float ledger · Tourist tax · Transactions** | by-entity P&L, the 14-account bank topology, tourist-tax-by-jurisdiction, the transaction ledger. | CORE/SPEC | **P1** |
| H | **Reports (accountant export)** | the separate export feature. | SPEC | **P2** |

## 7. Critical states the UI must make legible
- **OCR confidence band** on receipt prefill (high/med/low — the word, not a fake %) + the **503 template-fallback**
  ("AI extraction unavailable — enter manually"). Real, LIVE signal.
- **`data_quality` provenance** — `/api/finance/property/:code/summary` returns the source per figure; channel_fees /
  friday_margin = 0 heuristic must read **partial/estimated** ("needs Finance Phase 2"), never as truth.
- **GuestyDivergence** — the canonical stale/partial reconciliation surface (Accept Guesty / Accept FAD /
  Investigate); show the diff honestly.
- **Owner-statement reconciliation** — "reconciled against N reservations + M expenses; €43 held" → real provenance;
  held lines excluded with a reason (see `owners.md` §7).
- **Period-close per-stage health** + **compliance/liability spine** (VAT due, tourist-fee owed, statutory-accounts
  countdown) — the push-state that *prevents another silent Rs 1M*.
- **Sync-failed / empty** — recon with zero discrepancies, statement with no reservations, Guesty sync failed →
  actions paused/read-only, never fabricated.
- The five trust-states map as in `ask-friday.md` §7; confidence is a **band**.

## 8. Key flows to storyboard
1. **Capture:** snap a receipt → OCR prefill (confidence) → classify → submit (or manual fallback on 503).
2. **Morning:** Insights cockpit → cash (syndic ring-fenced) + the ranked feed + the compliance spine → tap a brief
   card → ask Friday → open source.
3. **Reconcile:** GuestyDivergence → Accept/Investigate; approve a held expense.
4. **Close the period:** the 8-stage wizard → lock + post.
5. **Owner statement:** generate → reconciliation banner → resolve held lines → PDF → send (see `owners.md`).

## 9. Reference artifacts
Prototype `ScreenFinance` + `ScreenOwnerStatement`; built `FinanceModule.tsx` (10 sub-pages) + `CaptureExpenseDrawer`
+ `/api/finance/property/:code/summary` + `/api/expenses` + `/api/intent/parse-receipt` (OCR) + `_data/{finance.ts
(14-account topology), financeAnomalies.ts, financeClient.ts, intentClient.ts}`; the 14-table schema; the `ai/` kit.

## 10. Recommended design priority
1. **A–D:** the Insights cockpit, the Friday brief (with trust-states), capture + OCR, and Approvals/divergence.
2. **E–G:** owner statements, period-close, P&L / float / tourist tax / transactions.
3. **H:** Reports.

## 11. Out of scope (per scope)
TAC → Properties/Legal · commercial trends (occ/ADR/RevPAR/pace) → Analytics · accountant-export is a separate
Reports feature · double-entry GL + QuickBooks + MRA remittance are Phase 2 · native owner portal is Phase 5. Design
the full vision; mark Phase-2/3 backend SPEC.

## 12. Decisions
**RESOLVED (Ishant, 2026-05-30): Finance = director-only, FLAT.** Collapse the legacy `financeRoles.ts` internal
tiers (admin/manager/contributor) and retire the dev RoleSwitcher — there are no Finance sub-roles for now (capture
included). A capture-only accountant tier is a *future* variation, deliberately deferred ("get the platform right
first"). Managers see nothing; figures are masked wherever they surface in Owners/Properties.

**Still open (propose options):**
1. **Insights home** — drawn inside Finance (the stub) or built in Analytics and surfaced as a Finance window? (Scope
   says Analytics-built/Phase-3 — draw the full vision regardless.)
3. **Manager finance redaction** — the masked state where managers view Owners/Properties (hidden vs "—" vs "Director
   only" chip).
4. **OCR low-confidence / 503** — confirm the capture-form UX for low-confidence + AI-unavailable manual fallback.
5. **GBH syndic ring-fence** — the visual treatment in the consolidated-cash headline (separate/greyed).
6. **Cleaning-fee net/gross** — confirm it's a `@demo:config` policy surface and that **net is the immovable default**
   in every drawn state.

## 13. What we want back
The **Insights cockpit** + the **Friday brief (with trust-states)** + **capture/OCR** + **Approvals/divergence**
first — director desktop — built on the live `/api/expenses` + `/api/intent/parse-receipt` + `data_quality`
provenance + the `ai/` kit, with the OCR-fallback, divergence, and compliance-spine states visible. Then owner
statements, period-close, and the ledgers. Finance is **director-only flat** (no sub-roles); design the
manager-redaction masked state; propose options on §12.
