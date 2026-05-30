# FridayOS Marketing Website — Design Brief for Claude Design

> **What this is.** A design brief for the **customer-facing FridayOS marketing website** (`fridayos.com`-class) —
> the site that sells FridayOS to property managers and routes them into sign-up. **This is a different surface from
> the FAD/FridayOS admin app** (that's the other coordination pack in this folder). Read `00-README` for the working
> loop + house format. Pricing is canonical in **`pricing-commercial-model.md`** (this folder) — design to it.
>
> **In the Claude Design account, refer to:**
> - the **FridayOS SaaS project** (the admin-app design work in progress) — for product truth, the real module set,
>   the Ask Friday spine, and the V2 visual language. The site must look like it belongs to that product.
> - the **FridayOS Brand Kit** — the canonical brand source (logo, type, color, tone). **Defer to it.** If it's
>   silent on something, the backup palette in §4 applies.

## 1. The brief in one line
Design the FridayOS marketing site that converts STR property managers — in Mauritius first, underserved regions next
— from "what is this" to "signed up free," by leading with **the unbundle + the incumbent's dilemma + local-first**
(NOT "AI"), proving it with the **live Friday Retreats operation as reference**, and routing cleanly into the
free-forever sign-up.

## 2. Source of truth & positioning (read before designing)
- **Pricing/commercial:** `pricing-commercial-model.md` (canonical). The site sells **self-serve layers 1–2 + AI
  credits + the friday.mu marketplace** (free-forever, per-unit paid tiers, add-ons). The **managed-service ladder
  (Online 15% / Standard 20% / Full 25%)** is the *Friday Retreats* offer — present it as an optional "let Friday run
  it for you" path, regionally gated, not the core SaaS pitch.
- **⚠ Positioning — do NOT lead with "AI."** AI is **paid table-stakes** and "the one door the giants are guarding"
  (Freemium Pivot Memo). A model wrapper isn't the moat. **Lead with:**
  1. **The unbundle** — software + online management + physical ops + a consumer marketplace, under one roof. Nobody
     else does all four.
  2. **The incumbent's dilemma** — the giants *can't* give the PMS away without breaking their own model; FridayOS is
     free.
  3. **Local-first / geography** — built for underserved regions the giants ignore (Indian Ocean, East/Southern
     Africa, Bali, Seychelles, Réunion): local tax/VAT/syndic law, local payment rails, local OTA quirks, real
     on-the-ground support in-timezone.
- **Proof, not claims** — Friday Retreats is **tenant-zero**: a real 25+-property operation in Mauritius runs on this.
  "Live reference, not a demo" is the credibility wedge the giants can't fake. Use it.
- **Honesty doctrine** carries to marketing — no overclaiming. Conditional language where reality is conditional
  (e.g. tourist-tax: *"collection, filing and remittance where applicable, where Friday collects the funds and is
  legally authorised or required to do so"* — use this exact framing, per the Product Architecture memo).

## 3. Who it's for (audiences → site paths)
- **Primary: independent / small-portfolio STR managers** in target regions hitting the limits of spreadsheets,
  Guesty cost, or fragmented tools → the **free-forever** wedge.
- **Growing managers (5–10+ units)** → the **paid per-unit tiers** (the OTA-connect + Growth-layer story).
- **Owners who'd rather Friday run it** → the **managed-service** path (regionally gated; routes to a contact/qualify
  flow, not self-serve sign-up).
- **Investors / partners / press** (secondary) → an about/vision surface (the platform + marketplace ambition).

## 4. Brand & system
- **Defer to the FridayOS Brand Kit in the CD account.** It governs logo, type, color, tone.
- **The site must feel like the product.** Pull the FridayOS app's V2 language from the SaaS project: the dark,
  precise, intelligent aesthetic; the `spark` Friday mark; the trust/precision feel. The marketing site is the
  product's front door — a visitor should recognise the app when they land in it.
- **Backup palette (only if the Brand Kit is silent):** the FridayOS dark identity from the company deck —
  bg `#060810`, blue `#6395ff`, amber `#f59e0b`; Friday Retreats corporate is navy `#1a2744` + gold `#c9960f` on cream
  `#f8f7f4` (use the corporate palette for the *Friday Retreats managed-service* framing, the dark FridayOS palette for
  the *FridayOS SaaS* framing — they're two related brands).
- **Type (deck-locked, pending Brand Kit):** Display **Fraunces**, body **DM Sans**, mono **JetBrains Mono**. Logo is
  typographic ("Friday" + accent).
- **Bilingual EN/FR** (Mauritius), responsive, fast. Marketing site stack is the **Friday website** (Next.js), separate
  from the app — but consistent design language.

## 5. Pages to design (P0 first)
| # | Page | Purpose & key content | Priority |
|---|---|---|---|
| A | **Home / hero** | The unbundle + incumbent's-dilemma + local-first thesis; "free forever" CTA; the live-Friday-Retreats proof; the one-product-many-layers story. **Not "AI" first.** | **P0** |
| B | **Pricing** | The self-serve ladder (free + per-unit tiers + add-ons + AI credits), the **visible-meter/no-silent-overage** promise, marketplace 13% line, managed-service tiers as a separate "done-for-you" block. Mirrors `pricing-commercial-model.md`; must read consistently with the in-app billing. | **P0** |
| C | **Product / how it works** | The modules (Inbox, Operations, Properties, Reservations, Reviews, Owners, Finance, Analytics…) + **Ask Friday** as the spine — shown honestly (the trust-states are a *feature*, not hidden). Pull real screens/feel from the SaaS project. | **P0** |
| D | **Sign-up / onboarding entry** | The free-forever sign-up funnel start (the actual flow lives in-app — see §6); the OTA-connect-as-upgrade framing. | **P0** |
| E | **The moat / why FridayOS** | The unbundle vs Guesty/Hostaway/Breezeway, the local-first wedge, the friday.mu marketplace + neutrality commitment. | **P1** |
| F | **Managed services (Friday Retreats)** | Online 15 / Standard 20 / Full 25, regionally gated, control doctrine framing, conditional tourist-tax language. Routes to contact/qualify. | **P1** |
| G | **For owners / for managers split** | Audience-routed landing variants (a manager wants software; an owner wants someone to run it). | **P1** |
| H | **About / vision / investors** | The platform + marketplace + underserved-regions ambition; the live-operation credibility. | **P2** |
| I | **Trust / legal surfaces** | Neutrality commitment, data handling, the honest "limited-by-external-PMS" explainer. | **P2** |

## 6. The pricing surfaces span BOTH the site AND the app — design them together
This is the key cross-surface ask. Pricing isn't just a marketing page; it's a **funnel that crosses into the
product**, and the two must tell **one story**:
- **On the site:** the **Pricing page** (B) + the **sign-up entry** (D).
- **Inside the FridayOS SaaS app** (hand this to the admin-app CD session too — it's `settings-tenant.md` §A + this
  doc): **(1) the sign-up / plan-select flow** (free vs paid, per-unit count picker); **(2) the in-app billing &
  subscription surface** (current plan, invoices, the bank-transfer "I've paid" flow that exists today); **(3) the
  AI-credit meter** — the gauge showing free vs subscription allowance vs paid overage, the cap controls, the
  buy-more-credits flow; **(4) the upgrade prompts** at the natural gates (hit a cap, try to connect an external OTA,
  open a paid module). These in-app surfaces must visually + narratively match the site's Pricing page.
- **Consistency contract:** same tier names, same per-unit framing, same "visible meter, never silent overage"
  promise, same module-gating language. A user who reads the site's pricing and then signs up should feel zero seam.

## 7. Critical things the design must get right
- **Don't say "AI" in the headline.** AI appears as a *capability* deep in the product story (C), framed honestly via
  the trust-states — never as the lead claim.
- **Free is genuinely free, permanently** — the site must read trustworthy, not bait-and-switch. No "free trial"
  language; "free forever." The upgrade triggers (OTA connect, caps, Growth layer) are honest value-for-cost.
- **No model picker, one Friday** — if the product story mentions intelligence, it's "Friday," not model names/levels.
- **The friday.mu neutrality commitment** must be visible (FridayOS serves managers who may compete with Friday
  Retreats; the marketplace is *additional demand*, with a data wall — say so).
- **Proof over hype** — the live 25+-property Mauritius operation is the strongest asset; lead with it, not adjectives.
- **AI-credit meter (in-app)** — visible gauge, alert-before-cap, user-settable cap. Never a surprise bill.

## 8. Open decisions (propose options; some are Ishant's)
1. **Brand split** — how distinctly to separate the **FridayOS** (dark, SaaS) identity from **Friday Retreats**
   (navy/gold, managed service) on one site, or whether FridayOS gets its own domain/site entirely. *(Brand Kit may
   answer; else propose.)*
2. **Revenue-mix emphasis (Ishant, memo D2)** — should the site foreground the **marketplace**, the **managed
   services**, or the **software tiers**? The most consequential open question; the hero emphasis follows it.
3. **Sign-up depth on the marketing site** — does sign-up start on the site and hand to the app, or does the site CTA
   deep-link straight into the app's sign-up?
4. **Managed-services prominence** — co-equal path, or a quieter "done-for-you" option below the self-serve pitch?
5. **Exact pricing numbers** — placeholders until validated live (per `pricing-commercial-model.md` §3).

## 9. What we want back
The **Home/hero, Pricing, Product, and Sign-up entry** first (P0) — desktop + mobile, EN/FR, in the FridayOS brand,
**consistent with the SaaS project's product design and with the in-app pricing surfaces (§6)** — leading with the
unbundle/incumbent's-dilemma/local-first thesis and the live-Friday-Retreats proof, **not "AI."** Then the moat,
managed-services, audience-split, and about pages. Propose options on §8; flag any clash with `pricing-commercial-
model.md` or the SaaS project to Ishant per `00-README` §7.
