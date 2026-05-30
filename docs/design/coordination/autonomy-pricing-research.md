# Autonomous / Agentic AI Pricing — Research (PARKED · intelligence only)

> **Status: PARKED — not a decision, not locked, no action.** Background intelligence for a *future* call on whether/
> how FridayOS charges for **autonomous mode** (Friday running the operation with the human out of the loop) as a
> premium unlock above the assisted/free tiers. Gathered 2026-05-30 at Ishant's request ("doesn't hurt to research it
> now — we're far from autonomous, but it informs the architecture"). Revisit when we're closer to shipping real
> autonomy. Does **not** change `pricing-commercial-model.md` — that stays the live direction.
>
> Currency: price points are 2025–early-2026 and mostly current; third-party contract figures (Sierra/Decagon) are
> reseller estimates, directional. Sources inline.

## TL;DR — the three findings that matter for FridayOS
1. **Genuine whitespace.** **No STR/PMS player prices autonomy as a premium unlock** — every one bundles AI into a
   subscription tier (HostBuddy $79–199, Hospitable $29–99, Besty $99–299 + 10–15% upsell rev-share). And
   **"trust-graduated" pricing (autonomy unlocks as the agent earns it) doesn't exist as a shipped model anywhere** —
   it's discussed only as a *design* pattern. So FridayOS's "assisted→autonomous curve, pay for autonomy" idea is a
   first-mover position, not a copy. *(Whitespace cuts both ways — could be untapped, could be that nobody's made it
   work yet. The measurement/trust problem in §4 is why.)*
2. **FridayOS's trust-state architecture is the answer to outcome-pricing's #1 killer problem.** The biggest blocker
   to outcome/agentic pricing is the **"resolved" black box** — buyers distrust a vendor whose revenue depends on the
   vendor's own definition of success ("they have every incentive to stretch 'resolved'"). The emerging fix is
   exactly what FridayOS *already builds*: append-only audit logs, provenance on every action, exportable trails,
   dispute windows. **The honesty doctrine + SourceTag/trust-states are a pricing asset, not just a UX one.** If we
   ever bill on outcomes, we can *prove* the outcome — most can't.
3. **Klarna is the cautionary tale aimed straight at "human-out-of-the-loop."** Klarna claimed its AI did 700→853
   FTEs' work / saved $60M, then **reversed in May 2025** — "lower quality," more complaints, lower CSAT — and
   **rehired humans** for VIP support. Lesson: full autonomy carries quality/brand risk that *pricing alone doesn't
   solve*. This **reinforces the assisted→autonomous *curve*** (earn trust gradually, keep a human-on-the-loop option)
   over a hard "we run it, you're out" switch — both as product design and as the honest version of the premium.

## 1. The four agentic pricing models (Kyle Poyar, 60+ agent companies)
| Model | Unit | Examples | Note |
|---|---|---|---|
| **Per Agent / FTE-replacement** | a monthly "AI worker" priced vs a salary | 11x ($5K/mo AI SDR vs ~$8K human), Harvey, Vivun | "$2,000/mo agent replaces a $60K/yr junior." $1–5K/agent/mo band. |
| **Per Action** | each action taken | Bland, Parloa, Agentforce ($0.10/action) | granular; predictable-ish |
| **Per Workflow** | a completed multi-step job | Rox, Artisan, Salesforce | mid-grain |
| **Per Outcome** | a confirmed business result | Intercom, Zendesk, HubSpot, Chargeflow | Poyar: **"highest customer alignment, lowest risk of competitive displacement"** — but hardest to operationalize (§4) |
*(75% of 175 founders surveyed say they don't know how to price AI features. The whole space is unsettled.)*

## 2. Real outcome/per-action price points (the live comps)
- **Intercom Fin** — **$0.99/resolution** (now "per outcome"), on top of $49/mo seat, after 50 included/mo. "Resolution"
  = customer confirms resolved OR doesn't ask for more help. Backed by a **$1M performance guarantee**. $1M→$100M+ ARR,
  ~1M issues/week.
- **HubSpot Breeze Customer Agent** — **$0.50 per *resolved* conversation** (was $1.00; changed Apr 14 2026). "Resolved"
  = AI shares a source OR acts AND no human handoff within **72h**. Prospecting Agent: **$1/qualified lead**.
- **Salesforce Agentforce** — runs **3 models at once**: $2/conversation (legacy) · **Flex Credits** ($0.10/action,
  $0.15/voice, $500/100K credits) · pre-commit. Flex wins below ~20 actions/conversation.
- **Sierra** (Bret Taylor) — outcome-based (resolved conversations, purchases, memberships saved); escalations free.
  ~**$150K/yr** start, $50–200K setup (reseller est.).
- **Decagon** — ~**$0.99/conversation** OR per-resolution + **$50K/yr platform fee**; median contract ~$386K. Most pick
  per-conversation over per-resolution (predictability).
- **Zendesk** — **$1.50/automated resolution** committed, **$2.00** PAYG — *plus* $50/agent AI add-on *plus* the seat.
- **Besty AI (STR!)** — $99–299/mo **+ 10–15% of upsell revenue** — the one rev-share example in short-term rental.

## 3. Autonomy-as-tier + ROI-share framing
- **HITL vs HOTL is the conceptual ladder** but **nobody prices it as a clean tier yet.** Human-in-the-loop (AI
  proposes, human approves each) → Human-on-the-loop (AI acts, human supervises by exception) → full autonomy. Today's
  tiering is **by capability**, not by autonomy level. Bessemer's relevant line: **"copilots offering advice without
  closing the loop live in dangerous soft-ROI territory"** — i.e. *autonomy/outcome-completion is where the pricing
  power is; assist is where value leaks.* That validates charging more for autonomy in principle.
- **AI-employee / salary-fraction** is concrete in sales (11x ~$5K/mo vs ~$8K human = 40% saving). Tiering seen:
  point tools $300–1,500/mo · "AI worker" autonomous $1–5K/agent/mo · enterprise $50–250K/yr. **Klarna's value framing
  (not price):** AI = 853 FTEs, $60M saved, cost/transaction $0.32→$0.19. *(But Axios Apr 2026: AI can now cost **more**
  than humans in heavy-usage cases — the salary-fraction logic isn't guaranteed.)*

## 4. The measurement/trust problem (why outcome pricing is hard — and FridayOS's edge)
- a16z: **~half of buyers struggle to define the outcome** — the #1 adoption barrier.
- The distrust (Siena AI, verbatim): *"the definition of 'resolved' becomes a black box controlled by the vendor… the
  vendor's revenue depends on maximizing 'resolutions,' so they have every incentive to stretch that definition."*
- Emerging fixes: **append-only logs w/ cryptographic verification, pricing rules stamped on each credit, exportable
  audit trails, 30-day dispute windows, credit-back if criteria unmet**, contractual outcome definition + attribution
  rules when multiple factors contribute.
- **→ FridayOS connection (my synthesis):** this is *exactly* the trust-state/provenance/audit machinery already in the
  product (SourceTag, the honesty doctrine, audit-logged reveals, the learning-loop evidence trail). The thing that
  blocks everyone else from outcome-pricing is the thing FridayOS builds by default. **If autonomy pricing ever
  happens, "we can prove the outcome" is our differentiator.** Worth keeping the architecture outcome-attributable
  even before we monetize it.

## 5. Analyst framing 2025-26
- Usage-based pricing **30% (2019) → ~85% (2024)**; outcome-based **~15% (2022) → ~30% (2025)** of enterprise SaaS
  (Gartner). Seat-based **21%→15%** in a year; **hybrid 27%→41%**. Credit models +126% YoY (35→79 of the PricingSaaS
  500). 1,800+ pricing changes across the top 500 in 2025.
- **Bessemer "2026 renewal cliff":** 2025 was adoption-at-all-costs; 2026 renewals demand proven ROI — soft-ROI
  copilots are exposed. AI gross margins **50–60% vs SaaS 80–90%**.
- **Consensus default = hybrid** (base fee + success/outcome component) — balances upside vs revenue stability.

## 6. Risks / anti-patterns (the watch-list if we go here)
- **Klarna reversal** (§TL;DR #3) — full-autonomy quality/brand risk; pricing doesn't fix it.
- **Margin risk:** outcome pricing masks unit-economics risk — one fintech chatbot burned **$400/day per client**.
  Acute for us: autonomous ops on a flaky external PMS could run expensive.
- **Black-box "resolved":** vendor-defined success + revenue-tied = distrust (our trust-states mitigate, §4).
- **Revenue unpredictability:** outcome volume swings **seasonally** — directly painful for an STR business with
  seasonal occupancy. A pure outcome model would make *our* revenue as seasonal as our tenants' bookings.
- **All-or-nothing backfire:** huge value delivered but no clean "outcome" = unbillable.

## 7. If/when we revisit — the shape that fits FridayOS (my read, not a decision)
- **Don't** make autonomy a pure per-outcome bill on day one (seasonality + margin + trust-definition risk). 
- **Do** consider: autonomy as a **tier/dial above the per-unit subscription** (HOTL "Friday runs it, you supervise by
  exception" as the premium), priced as a **per-unit uplift or an AI-worker-style flat add-on**, *not* per-resolution.
  Keep a **success/outcome component as upside** (hybrid), not the whole bill.
- **Lean on the trust edge:** every autonomous action is logged, attributable, disputable — make that the reason
  buyers trust paying for autonomy when they won't trust competitors.
- **Honest curve:** the assisted→autonomous graduation *is* the de-risked version of "human out of the loop" — sell
  the destination, let each tenant earn autonomy as Friday proves itself on their operation (Klarna lesson).
- **Open Q for later:** is the premium **per-unit uplift**, **flat AI-worker/mo**, **outcome-share**, or **hybrid**?
  All four are live in market; none is settled for vertical SMB ops. Decide when we can actually back autonomy.

## Sources
Intercom Fin (help, GTM Now interview) · HubSpot Breeze (company-news, MarTech, Apr 2026) · Agentforce (SaaStr,
Salesforce news May 2025, jitendrazaa) · Sierra (blog), Decagon (eesel, Vendr), Zendesk (CorePiper) · Poyar agent
framework + 2025 pricing state (Growth Unhinged) · Bessemer AI pricing playbook · a16z Dec-2024 newsletter · Siena AI,
Nevermined, Stripe (trust/verification) · Klarna reversal (Entrepreneur, TechCrunch Jun 2025), Axios Apr 2026 · STR:
Hostaway, rapideye, Besty.
