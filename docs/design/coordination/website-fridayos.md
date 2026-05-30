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
— from "what is this" to "signed up free," by leading with **the AI that runs your rentals end to end + free
software**, proven by the **live 25+-property Friday Retreats operation**, with the unbundle / local-first / global
distribution (friday.travel) as the reasons it's real, routing cleanly into the free-forever sign-up.

## 1a. Brand & domain architecture (LOCKED 2026-05-30 — read first)
Three distinct surfaces — **this brief is ONLY the FridayOS one:**
- **FridayOS** — its **own site + domain** (e.g. fridayos.com / app.fridayos.com). The **software**, sold to property
  managers globally. **← this brief.**
- **friday.mu** — **Friday Retreats**, a *separate business*: the Mauritius STR-management company + the managed
  services (Online 15 / Standard 20 / Full 25). Mauritian guest bookings. **Not designed here; not on the FridayOS
  site.** Don't put managed-service tiers on the FridayOS site.
- **friday.travel** — the **new global guest marketplace** (flights + accommodation + activities worldwide). The
  distribution flywheel for FridayOS clients: **international clients list on friday.travel only; Mauritian clients on
  both friday.mu + friday.travel.** A separate guest-facing site (future design effort) — referenced here only as the
  *distribution benefit* a FridayOS client gets.

## 2. Source of truth & positioning (read before designing)
- **Pricing/commercial:** `pricing-commercial-model.md` (canonical). The FridayOS site sells the **software**:
  free-forever self-serve + per-unit paid tiers + AI credits + module add-ons, and the **distribution** benefit
  (your inventory on friday.travel, 13% on bookings it brings you). The **managed-service ladder is NOT on this site**
  (that's friday.mu / Friday Retreats).
- **Positioning — LEAD WITH THE AI (the *right* framing).** Decided 2026-05-30: the AI + free software **is** the
  advantage. **But the defensible claim is "the AI that runs your rentals end to end," not "we have AI"** (a model
  wrapper is commodity — the giants have AI too). Lead with autonomy + proof:
  1. **The AI that runs your rentals end to end** — autonomous, multi-agent, acts across the whole operation
     (inbox, ops, pricing, guests, finance) — *not* an assist-you chatbot. "Runs it while you sleep."
  2. **Proven, not promised** — it already runs a **real 25+-property operation** (Friday Retreats, tenant-zero).
     **Live reference, not a demo** — the one claim the giants structurally cannot make (their AI is a bolt-on).
  3. **Free software** — the OS itself is free; you only pay for usage/AI-credits/distribution. The giants can't
     match free without breaking their own model (the incumbent's dilemma).
  - **The unbundle is the *reason the AI is real*, not a separate headline:** a single-layer tool's AI can only
    *advise*; FridayOS's AI can *act* end-to-end because FridayOS owns all the surfaces (software + ops +
    distribution). Use the unbundle + local-first as the proof beneath the AI claim.
- **Honesty doctrine** carries to marketing — no overclaiming. The autonomy claim is backed by the live operation;
  surface the AI's **trust-states as a feature** (Friday shows its work + confidence + sources), which *reinforces*
  "trustworthy autonomy" rather than "magic." Conditional language where reality is conditional (tourist-tax etc.).

## 3. Who it's for (audiences → site paths)
- **Primary: independent / small-portfolio STR managers** (Mauritius first, underserved regions next) hitting the
  limits of spreadsheets, Guesty cost, or fragmented tools → the **free-forever** wedge + the **autonomous-AI** pitch.
- **Growing managers (5–10+ units)** → the **paid per-unit tiers** (the OTA-connect + Growth-layer + AI-credits story).
- **Managers wanting global distribution** → list inventory on **friday.travel** (the booking flywheel benefit).
- **Investors / partners / press** (secondary) → an about/vision surface (the global platform ambition).
- **NOT here:** owners who want Friday to *run* their rental → that's **Friday Retreats on friday.mu** (managed
  services), a separate business + site. The FridayOS site can carry at most a small "based in Mauritius? Friday
  Retreats can run it for you → friday.mu" pointer, not the managed-service pitch.

## 4. Brand & system
- **Defer to the FridayOS Brand Kit in the CD account.** It governs logo, type, color, tone.
- **The site must feel like the product.** Pull the FridayOS app's V2 language from the SaaS project: the dark,
  precise, intelligent aesthetic; the `spark` Friday mark; the trust/precision feel. The marketing site is the
  product's front door — a visitor should recognise the app when they land in it.
- **Backup palette (only if the Brand Kit is silent):** the FridayOS dark identity from the company deck —
  bg `#060810`, blue `#6395ff`, amber `#f59e0b`. *(Friday Retreats' navy `#1a2744` + gold `#c9960f` on cream is a
  **different** brand for friday.mu — don't mix it into the FridayOS site.)*
- **Type (deck-locked, pending Brand Kit):** Display **Fraunces**, body **DM Sans**, mono **JetBrains Mono**. Logo is
  typographic ("Friday" + accent).
- **Bilingual EN/FR**, responsive, fast. Its own site/domain (Next.js), separate from the app — consistent design
  language with the SaaS project.

## 5. Pages to design (P0 first)
| # | Page | Purpose & key content | Priority |
|---|---|---|---|
| A | **Home / hero** | **"The AI that runs your rentals end to end" + free software**; the live-25+-property proof ("not a demo"); free-forever CTA. The unbundle/local-first as the *proof beneath* the AI claim, not the headline. | **P0** |
| B | **Pricing** | The self-serve ladder (free + per-unit tiers + add-ons + **AI credits**), the **visible-meter/no-silent-overage** promise, the friday.travel distribution line (13% on bookings it brings). **No managed-service tiers** (those are friday.mu). Mirrors `pricing-commercial-model.md`; consistent with in-app billing (§6). | **P0** |
| C | **Product / how it works** | The autonomous AI running the operation end-to-end across the modules (Inbox, Operations, Properties, Reservations, Reviews, Owners, Finance, Analytics) + **Ask Friday** as the spine — trust-states shown as a *feature* (trustworthy autonomy, not magic). Pull real screens/feel from the SaaS project. | **P0** |
| D | **Sign-up / onboarding entry** | The free-forever sign-up funnel start (flow lives in-app — §6); OTA-connect-as-upgrade framing. | **P0** |
| E | **Why FridayOS** | Why the autonomy is *real* + defensible: the unbundle (AI can *act*, not just advise, because we own all surfaces) vs Guesty/Hostaway/Breezeway; local-first; the incumbent's dilemma (free, they can't match). | **P1** |
| F | **Distribution (friday.travel)** | The global guest marketplace benefit — list once, get booked worldwide; 13% on bookings it brings. Links to friday.travel (separate guest site). | **P1** |
| G | **For managers (audience focus)** | The site is manager-facing throughout; this sharpens the by-size story (solo → portfolio). *(No "for owners" path — that's friday.mu.)* | **P1** |
| H | **About / vision / investors** | The global platform + distribution + underserved-regions ambition; the live-operation credibility. | **P2** |
| I | **Trust / legal surfaces** | Data handling, the honest "limited-by-external-PMS" explainer, the autonomy/authority boundaries. | **P2** |

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
- **Lead with autonomy, not "we have AI."** The headline is **"the AI that runs your rentals end to end"** — backed by
  the live operation. Avoid the bare "AI-powered" claim (commodity; the giants have it). The product story (C) shows
  the AI *acting* across modules, with **trust-states as a feature** (it shows its work + confidence + sources →
  *trustworthy* autonomy, not magic).
- **Free is genuinely free, permanently** — trustworthy, not bait-and-switch. No "free trial"; "free forever." Upgrade
  triggers (OTA connect, caps, Growth layer, AI credits) are honest value-for-cost.
- **No model picker, one Friday** — the intelligence is "Friday," never model names/levels.
- **Proof over hype** — the live 25+-property Friday Retreats operation is the strongest asset; "live reference, not a
  demo." Lead with it.
- **Three brands, kept clean** — FridayOS (this site, software) ≠ friday.mu (Friday Retreats, managed service) ≠
  friday.travel (global guest marketplace). Don't blur them; at most a small cross-pointer.
- **AI-credit meter (in-app)** — visible gauge, alert-before-cap, user-settable cap. Never a surprise bill.

## 8. Open decisions (propose options; some are Ishant's)
**RESOLVED (Ishant, 2026-05-30):**
- *Revenue-mix / hero (memo D2)* → **the autonomous end-to-end AI + free software** is the lead. Managed services are
  out (friday.mu); marketplace is the friday.travel distribution benefit, not the headline.
- *Brand/domain* → **FridayOS gets its own site + domain**, distinct from friday.mu and friday.travel (§1a).

**Still open (propose options):**
1. **Sign-up depth** — does sign-up start on the marketing site and hand to the app, or does the site CTA deep-link
   straight into the app's sign-up flow?
2. **friday.travel cross-link** — how prominent is the distribution/marketplace benefit on the FridayOS site, given
   friday.travel is a separate (future) guest site — a full page (F), a section, or a teaser?
3. **friday.mu pointer** — whether/how to surface "based in Mauritius? Friday Retreats can run it for you" without
   pulling managed-services onto the FridayOS site.
4. **Exact pricing numbers** — placeholders until validated live (per `pricing-commercial-model.md` §3).

## 9. What we want back
The **Home/hero, Pricing, Product, and Sign-up entry** first (P0) — desktop + mobile, EN/FR, in the FridayOS brand,
**consistent with the SaaS project's product design and with the in-app pricing surfaces (§6)** — leading with **"the
AI that runs your rentals end to end" + free software**, proven by the live operation, with the unbundle/local-first
as the proof beneath. Then Why-FridayOS, Distribution (friday.travel), the audience focus, and about. Keep the three
brands clean (§1a); propose options on §8; flag any clash with `pricing-commercial-model.md` or the SaaS project per
`00-README` §7.
