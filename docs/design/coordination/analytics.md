# Analytics (+ Intelligence boundary) — Design Brief for Claude Design

> Sits on top of the **Analytics module scoping pack v0.1 (LOCKED)**
> ([36a43ca884928165b886fc3043e399a0](https://www.notion.so/36a43ca884928165b886fc3043e399a0)). Read `00-README` +
> `ask-friday.md` first. Analytics ships **June 2026** (Ishant). It **owns no source data** — it reads from every
> module and composes decision-grade dashboards.

## 1. The brief in one line
Design Analytics as the **cross-module commercial-measurement layer** — portfolio occupancy / ADR / RevPAR / pace /
channels / cohorts / productivity — driven by a **shared global filter bar**, with **every figure provenance-tagged
and modeled/forecast figures honestly flagged** (it reads best-effort aggregates over the FAD caches until Cube Core
lands), and a clean boundary against Finance (money-of-record) and Intelligence (AI commentary).

## 2. Source of truth and grounding (three-way reconcile)
- **Vision** (pack v0.1 LOCKED). Phase 1 = **read-only cross-module dashboards** over existing FAD data; Phase 2 =
  **Cube Core** semantic metrics layer + saved segments; Phase 3 = predictive (pace, pricing recommendations). It
  **reads** from Reservations / Properties / Reviews / Operations / Finance / HR — owns none. **Boundaries:** Finance
  owns money-of-record (P&L, owner statements, VAT); **Analytics owns commercial performance** (occupancy, ADR,
  RevPAR, pace, conversion) — Analytics revenue is **commercial/modeled, not the ledger**. **Intelligence** = AI
  narrative commentary on the same data (read-only); **per-module Insights tabs** answer module-local questions —
  Analytics answers portfolio-level ones.
- **Reality.** `/api/analytics/portfolio` (`usePortfolio`) is **LIVE** — occupancy / revenue / channel / cohort
  aggregates over the FAD caches; it's the engine behind Properties Insights, HR Insights, Owners Insights, and the
  Reservations Insights tab today. **Cube Core + the Gemini NL-ask are SPEC** (Phase 2). The prototype's occupancy ×
  price quadrant, pace card, Insights panels, and the **global filter-bar stub** were recently added (commit
  `c323f25e`) — partly wired to `usePortfolio`, partly modeled.
- **Drawn.** `FAD Manager - Analytics.html` + the analytics prototype: KPI strip, the **occupancy × price quadrant**
  (under/over-priced detection), a **pace card** (booked vs same-time-last-year), Insights panels (Reviews/HR/Owners),
  and the **global filter bar**.
- **Full-vision rule:** draw the full dashboard set + the NL ask + saved segments even though Cube Core is Phase 2;
  the **modeled / cold-cache / forecast-confidence** states are the point.

## 3. Who uses it (roles)
- **Director** — full, incl. revenue/commercial figures.
- **Manager** (ops_manager ≡ commercial_marketing) — commercial metrics (occupancy / ADR / RevPAR / pace / channel /
  productivity) **yes**; **owner-economics (payout / commission / margin) gated** (consistent with the finance rule).
- **Field** — none (desktop module).

## 4. Design principles and system
- **Provenance on every figure.** Each number names its source module/cache + freshness (`SourceTag` + `SyncChip`).
  **Modeled/forecast figures (pace, price recommendations) are explicitly flagged as modeled, never as actuals.**
- **The global filter bar is the spine.** Date range · region · property · channel · cohort drives every sub-page; the
  state is **URL-encoded + shareable**; it's the pattern other modules' Insights tabs adopt — design it as a reusable
  component.
- **Don't double-count Finance or Intelligence.** Commercial performance here; money-of-record in Finance; narrative
  in Intelligence.
- **Apply the built `ai/` kit** — Analytics figures are the archetypal `modeled` source.

## 5. Information architecture
Sub-pages: **Overview** (KPI strip + a Friday narrative summary card + the global filter bar) · **Occupancy & pace**
(heatmap by property × time, pace curve booked-vs-STLY, the **occupancy × price quadrant**) · **Channels** (mix,
per-channel ADR/commission/net, conversion funnel, direct-booking share trend) · **Cohorts** (region cohorts
flic_en_flac / grand_baie / pereybere / bel_ombre, property-type, owner; MoM grids) · **Productivity** (staff/task
rollups from Ops + HR, cleaning-cost-per-turnover, review-sentiment correlation) · **Saved segments** (Phase 2).

## 6. Surfaces to design (full vision) — P0 first
| # | Surface | Purpose | Reality | Priority |
|---|---|---|---|---|
| A | **Overview + global filter bar** | KPI strip (occ 30/90d, ADR, RevPAR, revenue, pace) + Friday narrative card + the shared, URL-encoded filter bar. | LIVE (partial) | **P0** |
| B | **Occupancy & pace** | heatmap, pace curve (booked vs STLY), the occupancy × price quadrant — modeled, flagged. | CORE (modeled) | **P0** |
| C | **Channels** | channel mix, per-channel ADR/commission/net (owner-economics gated), conversion funnel, direct-booking share. | CORE | **P1** |
| D | **Cohorts** | region/property-type/owner cohorts, MoM comparison grids. | CORE | **P1** |
| E | **Productivity** | staff/task rollups (Ops+HR), cost-per-turnover, review-sentiment correlation. | CORE | **P1** |
| F | **NL ask + saved segments** | the Cube-Core-backed natural-language ask + persisted segment views. | SPEC (Phase 2) | **P2** |

## 7. Critical states the UI must make legible
- **Modeled vs actual** — pace, price-recommendation, and pre-Cube-Core aggregates are **modeled** → `SourceTag
  modeled` + a `ConfBar` band; never presented as ledger truth.
- **Provenance + freshness** — each figure names its source module/cache + a `SyncChip` (stale when a cache is cold).
- **Cold-cache empty / partial** — when a source cache is cold, show an honest empty/partial state (e.g. "Reviews
  sentiment not synced"), not a zero.
- **Forecast confidence** — predictions (pace, pricing) carry confidence **bands**, never false precision.
- **Owner-economics gating** — channel net / commission / margin masked for managers.

## 8. Key flows to storyboard
1. **Scan the portfolio:** Overview KPIs → set the global filter (region/channel/date) → every panel re-scopes.
2. **Spot mispricing:** Occupancy × price quadrant → drill into the under/over-priced cohort.
3. **Compare cohorts:** MoM grid by region → identify a trend → (Phase 3) surface a pricing recommendation.
4. **Ask:** (Phase 2) NL ask over Cube Core → grounded answer with provenance + a saved segment.

## 9. Reference artifacts
Prototype `FAD Manager - Analytics.html` + the occupancy×price quadrant / pace card / Insights panels / filter-bar
stub (`c323f25e`); built `AnalyticsModule` + `/api/analytics/portfolio` (`usePortfolio`) — the shared engine behind
Properties/HR/Owners/Reservations Insights; the `ai/` kit; the cohort map (flic_en_flac / grand_baie / pereybere /
bel_ombre). **Intelligence** = `IntelligenceModule` (Tier3, AI commentary; redirects to Analytics for raw data) —
keep separate.

## 10. Recommended design priority
1. **A–B:** Overview + the **global filter bar** (the reusable spine) + occupancy/pace (with the modeled flagging).
2. **C–E:** channels, cohorts, productivity.
3. **F:** the NL ask + saved segments (Phase 2).

## 11. Out of scope (Phase 1)
Predictive pricing **automation** (Phase 3 — surface recommendations only) · the **Cube Core** semantic layer +
the NL ask (Phase 2) · saved segments (Phase 2) · money-of-record reporting (**Finance** owns) · per-module local
Insights (each module owns its own). Design the full vision; mark Phase-2/3 SPEC.

## 12. Open decisions (propose options, don't guess)
1. **Analytics vs Intelligence vs per-module Insights** — confirm the three-way split (raw dashboards / AI commentary
   / module-local) so the design doesn't duplicate surfaces.
2. **Global filter bar** — confirm it's the single reusable component other modules' Insights tabs adopt (shared
   contract).
3. **Modeled flagging** — how loudly to flag modeled/forecast figures (a persistent "modeled" chip vs a legend)
   before Cube Core makes them authoritative.
4. **Manager owner-economics gating** — the masked state for channel net/commission/margin.
5. **Cohort definitions** — are the four region cohorts canonical, or user-definable (Phase 2 saved segments)?

## 13. What we want back
The **Overview + global filter bar** (the reusable spine) and **Occupancy & pace** (with modeled flagging) first —
director/manager desktop — built on the live `/api/analytics/portfolio` + the `ai/` kit, with provenance / modeled /
cold-cache / forecast-confidence states visible. Then channels, cohorts, productivity, and (Phase 2) the NL ask +
saved segments. Keep the Finance / Intelligence boundaries clean; propose options on §12.
