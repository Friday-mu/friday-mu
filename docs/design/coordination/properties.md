# Properties — Design Brief for Claude Design

> **What this is.** A design-layer brief for the FAD V2 **Properties** module. It sits on top of, and does not
> replace, the **Properties scoping pack v0.2 (LOCKED)**
> ([Notion 34f43ca8849281f3a130f7def80a7c5d](https://www.notion.so/34f43ca8849281f3a130f7def80a7c5d)), which stays
> the source of truth for data model, lifecycle, and workflows. It also folds in the **M1 rework spec**
> (`docs/handover/2026-05-30-m1-properties-rework-spec.md`) — the already-agreed reconciliation of the design's
> record against our current build. Read `00-README` and `ask-friday.md` first.
>
> **Heads-up — this module is partly built and the design↔build reconciliation is already decided.** Don't
> redesign the record from scratch: §6 below tells you exactly what to keep, what shell to adopt, and where the
> clashes already resolved.

## 1. The brief in one line
Design Properties as the **unification layer between Guesty (commercial) and Breezeway (operational)** — the single
destination page for everything property-anchored, the home of the **Property Cards** AI-knowledge surface that
feeds Ask Friday, and a first-class **onboarding** workflow — as a **left-rail record** (design's shell) carrying
our full **superset** of tabs, with **role × circumstance credential masking** as the central sensitive-data
design problem.

## 2. Source of truth and grounding (three-way reconcile)
- **Vision** = Properties scoping pack **v0.2 LOCKED** (the IA, the 9 composed sub-tabs, the two-field lifecycle,
  Property Cards schema, Insights-vs-Knowledge-Extraction split, onboarding artifacts, role visibility). **Design to
  it; don't re-derive.** ADR-007: Properties is the unification layer; ADR-006: Reservations is the primary key it
  cross-links to. Phase 1 = **read-from** Guesty + Breezeway, FAD-native fields layered over; Phase 2 write-through;
  Phase 3 source-of-truth (mid-2027).
- **Reality** = our code: a rich legacy **`PropertyDetail.tsx`** (11 tabs, real list with lifecycle KPIs, bulk-edit,
  real create POST, Insights) + a first-pass **`modules/v2/PropertiesModuleV2.tsx`** (top-tab version, **being
  reworked** to the left-rail record). The trust kit + Ask Friday focus envelope are wired (`PropertiesModuleV2`
  already calls `mergeFocus` / `contractFor('properties')`).
- **Drawn** = the prototype **`fad-property.jsx`** (`ScreenProperty`) — a 7-tab **left-rail record**
  (`.rdgrid`/`.rdctx`/`.rdnav`): Overview · Identity & layout · Owner · Operational · Financial · Calendar ·
  Listings. Plus `FAD Manager - Properties.html` / `Property record.html` and the mobile variants.
- **Full-vision rule:** design the complete record + onboarding + portfolio even though Phase 1 only reads from
  Guesty/Breezeway — we build toward source-of-truth. Honest **sync-stale / missing-source** states are not "future".

## 3. Who uses it
| Role (our locked model) | Scoping-pack role | Sees |
|---|---|---|
| **Director** | Admin | everything incl. owner contract, commission %, maintenance-cap amount, financials |
| **Manager** (ops_manager + commercial_marketing, identical) | Manager | all **except** owner contract details + commission % + maintenance-cap **amount** (sees the cap *exists*, not the figure) + Financial amounts |
| **Field** | Contributor | Identity & Layout / Operational / Tasks / Reservations / Activity — **no** Financial, Owner contract, commission, Insights. Lives in the **mobile task PWA**, not this record. |
| **Owner** (portal) | Owner portal | **own** properties only, own financials only; full Identity / Operational / onboarding-history / Reservations. Same FAD app, role-scoped (navy #1F3864, A4 doc look). |

## 4. Design principles and system — and what's ALREADY decided
- **The record is the spine** (ADR-007). It composes panels owned by *source* modules (Owner→Owners, Tasks→Ops,
  Financial→Finance, Listings→Guesty, Reservations→Reservations) — Properties is the anchor, data ownership stays in
  source modules. Design the composition; show provenance with `SourceTag` (guesty / breezeway / friday).
- **Use the V2 system + the built kit** (`00-README` §4, `ask-friday.md` §4). The record's left-rail classes
  (`.rd*`) get ported from the prototype's `fad-desktop.css` into repo `gm-desktop.css` scoped under `.dwrap`.
- **⚠ The design↔build reconciliation for the record is LOCKED — design the SUPERSET, don't shrink to the
  prototype's 7 tabs.** Per the M1 rework spec + `clashes.md`:
  - Adopt the **left-rail record shell** (thumbnail · code · status badge · name · BR/bath/sleeps · channel
    color-dots · vertical tab nav | right = per-tab header + content).
  - Carry the **full 11-tab superset**: the design's 7 (Overview · Identity & layout · Owner · Operational ·
    Financial · Calendar · Listings) **plus keep ours** (Pricing · Reservations · Tasks · Activity). The scoping
    pack's 9 composed sub-tabs map into these (incl. **Insights** + **Activity**).
  - **Keep Property Cards** (the AI-knowledge base) and **promote credentials** (wifi / lockbox / gate / team) to
    typed, privacy-classed fields for masking.
  - **Ask Friday** header action on Overview opens the panel focused on this property (`focusedObject:{type:
    'property', id:code}`).

## 5. Information architecture (per the scoping pack)
Four surfaces:
1. **Overview** (portfolio dashboard) — count by lifecycle status, occupancy snapshot, **alert strip** (contracts
   expiring, missing photos, syndic issues, no-reservations-30d, onboarding behind schedule, gap-analysis pending,
   stuck >7d in a stage).
2. **All Properties** (list) — filterable, sortable, **column customization**; default columns Code · Name ·
   Lifecycle · Region · Bedrooms · Owner · Channels · Occ(90d) · ADR(90d) · Rating · Last activity; tag chips; the
   reusable **quick-view side panel** (StayPopover-style "preview before open", reused across modules).
3. **Property detail** (the record) — the 9→11 composed sub-tabs (§4).
4. **Onboarding** (standalone workflow) — see §8; spans all in-progress properties + prospects.

## 6. Surfaces to design (full vision) — P0 first
Reality tag: LIVE = wired · CORE = control-plane exists · SPEC = designed-toward.

| # | Surface | Purpose & key content | Reality | Priority |
|---|---|---|---|---|
| A | **Property record — left-rail shell + Overview tab** | Left rail (thumb/code/status/specs/channels/nav) + Overview (hero, KPI tiles occ/ADR/rating/base-rate, listing-quality recs, next stays, channels/tags/paused-reason). | LIVE (rework) | **P0** |
| B | **Operational tab + credential masking** | Property Cards (AI knowledge) + typed credentials masked per the §7 matrix + on-site guide (parking/waste/utilities/entry) + Breezeway department defaults. **The central sensitive-data problem.** | LIVE (Cards) / SPEC (typed creds) | **P0** |
| C | **All Properties list + quick-view panel** | Rich list (lifecycle KPIs, sortable, bulk-edit, real create) re-skinned; occupancy color-dot / open-tasks / supplies-low signals; the reusable side-panel. | LIVE | **P0** |
| D | **Identity & Layout · Owner · Financial · Listings tabs** | Composed panels w/ `SourceTag`; Owner = contract/commission/cap (role-gated) + owner-reporting toggles + "Send report now"; Financial = 90-day summary (role-gated) + per-channel markup; Listings = per-channel push + integration IDs + "Preview on channels ↗". | LIVE (partial) / SPEC | **P1** |
| E | **Onboarding workflow + owner-facing report** | Prospect→onboarding pipeline, progress bars, stage-timing dashboard, structured artifact capture (Owner Agreement→Xodo, Standards Book *compliance gate*, Keys, Amenities Form, Gap Analysis, Build-Out, Photoshoot, Listing Setup), auto-task on completion, generated owner PDF report. | SPEC | **P1** |
| F | **Insights tab (AI listing recs)** | Photo-quality scores, description benchmarks, pricing recs, occupancy trends + drops, group analytics ("south-coast occupancy −8% across 4"), completeness checks. AI surface → trust-states. | SPEC | **P1** |
| G | **Pricing · Reservations · Tasks · Activity tabs** | Kept from current build, re-skinned: Tasks (consumes Ops, side-panel open, aggregate strip), Activity (full audit trail), Reservations (cross-link), Pricing (read-only base price Phase 1). | LIVE | **P1** |
| H | **Multi-unit / combo** | Parent/component chips ("Component units: LB-1, LB-2, LB-3"), combo aggregate stats + per-unit drill-down (Blue Lagoon, Villa Azur). | LIVE (read) | **P2** |
| I | **Owner-portal property view** | Own-property record, own financials, onboarding history — role-scoped, navy/A4. Detailed in the Owners brief. | SPEC | **P2** |

## 7. Critical states the UI must make legible
**Credential masking — the role × circumstance matrix (design this precisely; it's the headline sensitive-data
surface).** Types: **wifi · team codes · lockbox · gate**.

| Audience | wifi | team | lockbox | gate |
|---|---|---|---|---|
| Director / Manager | ✓ | ✓ | ✓ | ✓ |
| Field — assigned | ✓ | ✓ | **window** | **window** |
| Field — not assigned | – | – | – | – |
| Guest (during stay) | ✓ | – | ✓ | ✓ |
| Owner / external / public | – | – | – | – |

- **window** = visible from task **assigned** (or 24h before due) until task **closed** (mirrors Breezeway's Access
  pattern). Every staff reveal is **audit-logged**; the masked state must look deliberate (a reveal affordance +
  "logged" note), never an accidental leak. The **owner** can *request* a reveal — that flow lives in the Owners
  brief.

**Sync / freshness (Guesty + Breezeway are read-from in Phase 1):**
- **Healthy** → source synced recently → green `SyncChip` + `SourceTag` (guesty/breezeway).
- **Stale** → `synced_at` past threshold (>30m lagging, >2h stale, >24h expired) → amber + "Re-sync"; the affected
  panel names *which* source is stale.
- **Partial** → record loaded but a source panel is missing (no Breezeway profile, no Guesty listing) → name the gap.
- **Failed** → a sync errored → red, name the service; reads/writes that depend on it disable.

**Other first-class states:**
- **Lifecycle** — `prospect | onboarding | live | paused | off_boarded`, plus the derived **`Active · Pending`**
  badge (live but onboarding incomplete) vs **`Active`**. Paused shows reason + return-by.
- **Onboarding progress** — % checklist complete, days-in-stage, **stuck >7d** escalation, the compliance-gate
  state on Standards Book (verified-before-launch, not just "sent").
- **Property Card provenance** — `manual / ai_extracted / onboarding_form / breezeway_imported / guesty_imported`;
  guest-facing vs internal-only surface flag; AI-extracted cards show confidence + "pending review" (the Knowledge-
  Extraction accept/reject is a Training surface, shown inline here).
- **Insights confidence** — recommendations are AI; show the confidence **band**, not a number; "verify" on fallback.

## 8. Key flows to storyboard
1. **Open a property → read the record:** left-rail → Overview KPIs → jump tabs; `SourceTag`s show what's
   Guesty/Breezeway/FAD; Ask Friday button answers grounded in this property's Cards.
2. **Reveal a credential (field, on a task):** assigned + in-window → reveal lockbox/gate → audit-logged; not
   assigned → masked with an explain state.
3. **Onboard a property:** prospect artifacts → site visit → `onboarding` → structured artifact capture (each a
   form-driven record, documents as fields) → auto-tasks fire → checklist completes → listing pushed → `live` →
   generate the owner-facing onboarding report PDF.
4. **Curate photos:** FAD-owned gallery — drag-order, hero selection, per-channel subset, tags.
5. **Act on an Insight:** AI flags "occupancy −8% across the south-coast cohort" → drill to the 4 properties →
   pricing/description rec → (Phase 2) push change.
6. **Lead → Property:** "Convert to Property" flips a Lead into `prospect`, pre-filling pre-onboarding artifacts.

## 9. Reference artifacts (design against real shapes)
- **Prototype:** `fad-property.jsx` (`ScreenProperty`, the left-rail `.rd*` record), `Properties.html` /
  `Property record.html`, mobile variants.
- **Built:** legacy `PropertyDetail.tsx` (the 11 tabs + rich list to re-skin, **don't rewrite**),
  `PropertiesModuleV2.tsx` (the rework target), the `ai/` kit + focus envelope.
- **Data shapes (scoping pack):** `PropertyCard` (id, property_id|'global', category, title, body, surface,
  source, ai_extraction_metadata), the two-field lifecycle (`lifecycle_status` + `onboarding_checklist`),
  `PropertyOwner` (property_id, owner_id, ownership_pct, is_primary), Gap-Analysis line items, Build-Out registry.
- **M1 rework spec** — the build order + exact keep/merge per tab.

## 10. Recommended design priority
1. **The record spine (A–C):** left-rail shell + Overview, the Operational tab **with credential masking**, and the
   list + quick-view panel. These are being built now — get them right first.
2. **Then D–G:** the composed tabs (Identity/Owner/Financial/Listings), the onboarding workflow + owner report,
   Insights, and the kept tabs re-skinned.
3. **Then H–I:** multi-unit and the owner-portal property view.

## 11. Out of scope (Phase 1 — per scoping §13)
Pricing/rate-plan editor (Guesty owns; show read-only base price) · house-rules editor · per-channel description
editor (Phase 2 write-through) · advanced photo-caption/room editor (Phase 2) · property-level P&L deep dive
(Analytics) · bulk operations (Phase 2 backend) · owner-facing portal *preview* (mid-2027) · per-property-type
templates (AI handles variation) · **Knowledge-Extraction queue + portfolio-wide Cards view → Training module** ·
owner-retention exit-signal feature. Design the record's *surfaces* for these where they read-only-reflect (e.g.
"this property has X SRL templates"), but not the editors.

## 12. Open decisions (propose options, don't guess)
1. **Credential reveal affordance** — how a masked code looks and reveals (tap-to-reveal + "logged" toast? hold?),
   and how the **window** state reads for field staff (countdown? "available until task closes"?).
2. **Tab count** — 11 is a lot for a left rail. Group (e.g. Operational holds Cards+creds+guide; an "More" overflow)
   or all-visible? Propose. *(Clash already resolved as superset — this is about presentation, not dropping tabs.)*
3. **Insights confidence** — same band/label question as the global clash #1; no precise %.
4. **Onboarding** — linear wizard vs persistent workspace (Mathias lives in it during onboarding pushes)?
5. **Quick-view side panel** — confirm one shared component across Properties/Calendar/Reservations/Inbox/Reviews.
6. **Sidebar pending badges** — per-module count chips (Ishant raised); needs a per-module signal definition.

## 13. What we want back
The Properties **record** (left-rail shell + Overview + Operational-with-masking) and the **list + quick-view
panel** first — desktop + manager-mobile — **built on the kept `PropertyDetail` substance and the `ai/` kit**, with
the credential matrix and the Guesty/Breezeway sync states visibly represented, in a form buildable directly in
Next.js + Tailwind. Then the composed tabs, onboarding + owner report, and Insights. Honour the LOCKED **superset**
decision (design the shell, keep our substance); propose options on §12; flag any *new* clash to Ishant per
`00-README` §7.
