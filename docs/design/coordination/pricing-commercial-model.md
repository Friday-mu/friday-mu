# FridayOS — Pricing & Commercial Model (canonical for design)

> **What this is.** The single pricing/commercial reference for the design work — both the **FridayOS admin app**
> (this folder) and the **FridayOS marketing website** (`website-fridayos.md`). It consolidates the canonical Notion
> sources + Ishant's 2026-05-30 decisions + 2025-26 market research. **Status: direction, evolving — pitch-tier.**
> Billing/pricing **surfaces are designed LAST** in both the app and the site; this exists so they're consistent when
> we get there, and so the public site's pricing page and the in-app billing tell one story.
>
> **Canonical Notion sources** (don't re-derive — design to these):
> - **Freemium Pivot Decision Memo** ([36b43ca884928107b839e9af4b8567d6](https://www.notion.so/36b43ca884928107b839e9af4b8567d6)) — the 5-layer model. *Most recent commercial decision.*
> - **Product Architecture & Control Memo v1** ([36143ca884928184bddfe47c9bf8cbf0](https://www.notion.so/36143ca884928184bddfe47c9bf8cbf0)) — the 15/20/25 managed-service ladder + control doctrine.
> - **FridayOS Architecture Doctrine** ([36843ca8849281b0bbd2dcd651517fd3](https://www.notion.so/36843ca8849281b0bbd2dcd651517fd3)) — "the playbook is the product."

## 1. The one-line frame (and the positioning trap)
FridayOS is **the operating system and distribution channel for STR managers in underserved regions** — given away
free as an acquisition wedge, monetised through marketplace commission, paid usage tiers, AI credits, and managed
services. **It is ONE business** (FAD is tenant-zero of FridayOS — same codebase), not two.

**⚠ The headline is NOT "AI PMS."** Per the pivot memo: AI is **paid table-stakes** — "the one door the giants are
actively guarding" (Guesty shipped an embedded AI revenue agent Dec 2025; ~84% of operators already use AI). A model
wrapper is **not** the moat. The marketing site and the product must **not** lead with "AI." Lead with the **unbundle
+ the incumbent's dilemma + geography** (§5).

## 2. The five-layer model (canonical)
| Layer | What it is | Commercial model | Who controls money/ops |
|---|---|---|---|
| **1. FridayOS self-serve — FREE** | Software only: dashboards, automation, AI message tools, reporting, workflow logic. | **Free, metered.** Caps on the things that cost us: emails, WhatsApp sends, storage, task volume, API calls. | Client keeps listings, OTA accounts, funds, ops. |
| **friday.mu marketplace listing** | Tenant's properties listed on Friday's consumer booking site; auto-provisioned with self-serve. | **13% commission** on bookings closed through friday.mu. | Friday runs the marketplace; tenant keeps the listing. |
| **2. Paid usage tiers** | Self-serve + higher caps + gated features/modules. Triggered when a growing manager (~5–10+ units) hits free caps. | **Per-unit/month subscription**, or pay-as-you-go overage. | Same split as free. |
| **AI credits** | Orthogonal add-on, available on **any** tier incl. free. | **Usage-based, marked-up per credit** (mapped to outcomes). | — |
| **3. Online — 15%** | Friday runs the online revenue layer on the owner's behalf via FridayOS (listings, pricing, bookings, payments, guest comms, refunds, reporting). | **15% commission, €45/unit/mo floor, €100 setup.** | **Friday** controls money + guest recovery. |
| **4. Standard 20% / Full Service 25%** | Online + physical ops (cleaning rhythm → maintenance, procurement, inspections). | **20% / 25% commission.** | Friday controls money, recovery, physical ops. |

Layers 3–4 (managed services) are **Mauritius-now, partner-regions-later** and live mostly in the *Friday Retreats*
marketing story; the **self-serve SaaS (layers 1–2 + AI credits + marketplace)** is what the **FridayOS website +
the multi-tenant app** sell. Keep the two stories distinct but consistent (see `website-fridayos.md`).

## 3. The self-serve tier ladder (the part the app + site design around)
Hybrid is the proven 2025-26 shape — **base + per-unit + included AI allowance + overage + add-ons** (Bessemer: hybrid
rose 27%→41% of SaaS in a year; pure per-seat is dying — and per-seat fights our "fewer staff" pitch). **3–4 tiers is
the sweet spot** (3-tier converts 1.4× vs 2-tier, 1.8× vs 4+).

| Tier | For | Gets | Role in the funnel |
|---|---|---|---|
| **Free forever** | 1–2 units (land-grab) | Core *reactive* Friday (metered), core modules, **friday.mu listing + direct bookings**, **cold** (on-demand sync, no background jobs, no Growth loop). **No external OTA connect** (the conversion trigger). | Acquisition wedge + marketplace inventory + the playbook/data loop. Permanent free (never a trial). |
| **Starter** ("good") | small portfolios | Fuller AI allowance, **external OTA connect** (Channex), warm sync, basic proactive. | Entry paid (the OTA-gate converts here). |
| **Pro** ("hero/better") | growing | **+ the Growth layer** (proactive intelligence, analytics), more AI, premium modules. | The tier we push. |
| **Portfolio/Max** ("best" — anchor) | larger | Everything, all modules, highest AI allowance, priority. | Anchors Pro (anchoring lifts mid-tier 25–60%). |
| **Add-ons** | any | **Module add-ons** (Syndic / Design / Agency) · **AI credit top-ups**. | Capture high-WTP without bloating base tiers. |

**Per-unit norms** (from competitor research, validate live before quoting): entry **$15–40/unit/mo**, compressing to
**~$20–25 at volume**; common minimums ~$40–100/mo covering the first 1–5 units. Per-unit tiers down as count rises.
Most STR PMSs are base + per-unit (OwnerRez, Uplisting, Hospitable) or pure per-listing quote-gated (Guesty, Hostaway).

## 4. The four paid axes — gate on these, never on model power
1. **Units** (primary) — per-property. The whole market buys this way.
2. **Modules** (breadth) — Syndic / Design / Agency / deep Analytics / the full Ask Friday Growth loop gated to higher
   tiers or add-ons. *(Hospitable gates its real AI to its $99 "Mogul" tier — gating-by-tier is the STR norm.)*
3. **AI quantity** (depth) — *how much* AI, via a credit allowance per tier + buy-more overage. **Not** which model.
4. **Proactivity** (the Mind/Body/Growth split) — reactive AI is free; the **proactive Growth layer** (learning loop,
   mining, proactive insights, analytics) is paid. This is the strongest moat-aligned gate.

**No model-power axis, no user-facing model picker** (decided 2026-05-30 — supersedes the pivot memo's D8). One
"Friday"; invisible internal routing; swappable models incl. Friday's own future model. See `ask-friday.md` §4.

## 5. The moat (what the website must say instead of "AI")
- **The unbundle** — Guesty/Hostaway/Breezeway each sell *one* fragmented layer; none does software + online management
  + physical management + a consumer marketplace under one roof. They optimise for SaaS margins and won't touch the
  messy low-margin layers. Friday will. **That bundle is the moat.**
- **The incumbent's dilemma** — Guesty ($163.7M rev 2024, +64%, 500k+ properties, $410M raised) and Hostaway ($1B
  unicorn, $365M raised) have a load-bearing PMS-subscription line. **Neither can zero-price the PMS without blowing up
  its own model** — a free core PMS is a wedge they can't answer without self-harm.
- **Geography** — both giants are concentrating on France/Italy/Spain + AI. The Indian Ocean, East/Southern Africa,
  Bali, Seychelles, Réunion are **off their map**. Local-first = real wedge: Mauritian tourist tax / VAT / syndic law,
  local payment rails, local OTA quirks, on-the-ground support in their timezone.

## 6. AI-credit metering — the rules (avoid the known traps)
- **Don't meter the daily-habit core** (Ask Friday drafts, trust surfaces, scheduling) — keep it *inside* the
  subscription. Metering the thing that makes the product good suppresses the usage that drives retention.
- **Meter only expensive/optional AI** (bulk generation, deep analytics runs, agent autopilot) as credits-on-top.
- **Credits map to *outcomes*, not tokens** ("a statement generated," "a bulk reply run"). Users don't think in
  tokens; token-metering causes bill-shock.
- **Visible meter + hard caps, never silent overage** — show the gauge, alert before the ceiling, let the tenant cap.
  *(Same honesty doctrine as the AI trust-states.)*
- Cautionary tales: a monitoring SaaS sent a **$600K first-month bill (12× estimate) → pilot killed**; **Cursor's**
  silent June-2025 token switch → user backlash + public apology + refunds. Don't repeat either.
- **Margins are tighter than classic SaaS** — AI gross margins run **50–70%, not 80%+**; inference ~23% of revenue at
  scale. The free-AI allocation + the credit markup must be costed against **live inference rates** before launch.

## 7. Risks designed-around (from the pivot memo — not discovered later)
- **No price-raise-later / bait-and-switch.** Free stays **permanently** free; monetise adjacent surfaces (overage,
  AI credits, marketplace commission, managed services). YouTube/Airbnb kept free genuinely free — we do too.
- **friday.mu neutrality conflict.** FridayOS serves managers who may compete with Friday Retreats, on a marketplace
  Friday also lists on. Needs a **data wall + explicit neutrality commitment** (friday.mu = *additional demand*, not a
  competitive channel). Design deliberately; surface the commitment in the product + site.
- **Free-tier economics = cold tenants.** Free must be **near-zero marginal cost**: no background jobs/polling for free
  tenants (on-demand sync only), storage retention caps, ruthless metering. Plan to a **2–5% free→paid** conversion.
- **OTA gating as the honest conversion trigger** — free includes friday.mu + direct bookings (near-zero cost);
  external OTA connect (Channex, real per-property cost) is the paid trigger. Honest value-for-cost, not a dark
  pattern; side effect: free users are only on friday.mu until they pay (front-loads marketplace inventory).
- **Don't fix the incumbents' shortcomings — fix us, and attribute honestly.** Where an external PMS (Guesty/Breezeway)
  is flaky/rate-limited/limited, we **don't spend to paper over it** (it's the thing we're replacing). We **attribute
  the limitation honestly in-product** ("Guesty data — last synced 4h ago, their API is rate-limited") via the
  `SourceTag`/`SyncChip` system, and turn it into a **migration argument**: "switch fully to Friday for the full
  service." This is the integration-layer version of the AI trust-state honesty doctrine.

## 8. What's settled vs open
**Settled (2026-05-30):** one Friday, no model picker · gate on units/modules/AI-qty/proactivity · hybrid
base+per-unit+allowance+overage · free-forever-but-cold · 3–4 tiers + add-ons · core AI unmetered, optional AI metered
to outcomes with visible caps · headline is the unbundle/geography, not "AI" · attribute external-PMS limits honestly.
**Open (carry — pitch-tier, don't block design):** exact price points + per-unit curve (validate live) · the free-AI
allocation math (cost against live inference rates) · D2 revenue-mix target (marketplace vs managed vs software — the
most consequential, Ishant's call) · friday.mu data-wall + neutrality wording · sequencing (Mauritius → neighbour →
region). These live in the Notion pivot memo's decision register.
