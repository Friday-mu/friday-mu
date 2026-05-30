# Marketing + Leads — Design Brief for Claude Design

> Two related pitch-tier modules. No standalone Notion scoping packs — their boundaries are defined in the
> **Properties v0.2** and **Reviews v0.2** packs. Read `00-README` + `ask-friday.md` first. **Shared reality: both are
> functionally complete demos stuck in the V1 light skin with zero trust instrumentation — the V2 lift is (a) reskin
> to dark `.dwrap`/GmShell, (b) instrument every modeled figure with `SourceTag`/`ConfBar`, (c) wrap each AI surface
> in `AITrustStrip`+`StateBanner`** (use `PropertiesModuleV2.tsx` as the reference). The two genuinely new builds are
> Marketing's **friday.mu review-collection widget** and Leads' **Convert-to-Property** action.

---

# Part A — Marketing (Aug '26, pitch tier; Mathias)

## A1. The brief in one line
Design Marketing as the **commercial-growth cockpit** — campaign mix + attribution, lifecycle emails, and
**direct-booking growth** (the friday.mu review-collection widget lives *here*, not in Reviews) — re-skinned to V2
with honest provenance on its modeled revenue figures.

## A2. Grounding (three-way)
- **Vision** (distributed): **direct-booking review COLLECTION = Marketing** (the friday.mu widget + the
  review-prompt pipeline, owner-consent gated); **Reviews only consumes** the resulting `direct` channel (Reviews
  §1.1/§3/§5). Properties gives Marketing **campaign property-selection + featured-property promotion** (Properties
  §12/§15); **local-context Property Cards (grocery/pharmacy/beach) overlap Marketing guidebook content — ownership
  is flagged for Marketing to decide** (Properties §8). Module scope: channel mix, campaign attribution, lifecycle
  emails, direct-booking growth.
- **Reality** = `MarketingModule` (`Tier3Modules.tsx`, **LIVE demo**, routed in FadApp; tabs Campaigns / Channel mix /
  Lifecycle emails / Direct-booking; fixtures `@demo:data` PROD-DATA-29). **V1-skinned, zero trust components.** A
  dead `PITCH_SPECS.marketing` vision-card exists but FadApp routes to the live demo.
- **Drawn** = **no Marketing prototype screen exists** — greenfield in V2.
- **Full-vision rule:** draw the friday.mu collection widget + attribution complete even though they're SPEC.

## A3. Roles
Marketing is the **`commercial_marketing` persona's home**; manager-tier sees it fully. **But** managers are
**finance-gated** — campaign "Revenue / ROI" figures are financial. Marketing has **no resource gate** in
`permissions.ts` today (open by default) → decide whether campaign revenue inherits finance gating for managers.

## A4. Critical states (trust → real signals)
- Campaign **revenue / ROI / attribution** + the direct-booking forecast are **`modeled`** → pair `SourceTag
  modeled` + a `ConfBar` band.
- Channel-mix / attribution originates Guesty/OTA → `SourceTag guesty` + `syncedAt`; lagging pull → `stale`/`partial`.
- Lifecycle-email send/open stats are FAD-owned → `SourceTag friday`.
- AI **winback / past-guest** copy is generative → `AITrustStrip` + provenance + `fallback` when ungrounded;
  "pending approval" rows model an **approval-gated AI action**.

## A5. Surfaces (P0 first)
| # | Surface | Reality | Priority |
|---|---|---|---|
| A | **Campaigns + attribution** (modeled figures instrumented) | LIVE demo (reskin) | **P0** |
| B | **Direct-booking + the friday.mu review-collection widget** (owner-consent gated; the Marketing↔Reviews boundary) | SPEC | **P0** |
| C | **Lifecycle emails** (AI winback drafts with trust-states + approval gate) | LIVE demo (reskin) | **P1** |
| D | **Channel mix** (Guesty/OTA provenance + stale states) | LIVE demo (reskin) | **P1** |

## A6. Open decisions
1. Does Marketing **own** the friday.mu review-collection widget UI inside FAD, or just configure it?
2. Who owns **guidebook / local-context** content — Marketing or Property Cards?
3. Should **campaign revenue** be finance-gated for managers?
4. Is **featured-property promotion** a Marketing surface or a Properties action?

---

# Part B — Leads / CRM-lite ("soon"; Nitzana-driven)

## B1. The brief in one line
Design Leads as a **lightweight pre-conversion pipeline** for inbound property inquiries (owners / co-investors /
B2B) — without a heavy CRM — whose load-bearing feature is the **Convert-to-Property** handoff that flips a lead into
a Property `prospect` and pre-fills its pre-onboarding artifacts.

## B2. Grounding (three-way)
- **Vision:** Nitzana's ask — a pipeline for inbound inquiries without a heavy CRM. The **Convert-to-Property
  handoff** is locked in Properties v0.2 §4/§12/§15: the action flips a Lead → Property `prospect`, pre-filling
  pre-onboarding artifacts from the Lead record (avoids duplicate CRM data); Properties **excludes** lead-capture
  ("Leads owns; Properties takes over once the lead converts"). Phase-2 vision threads lead conversations beside
  guest threads in Inbox.
- **Reality** = `LeadsModule` (`Tier3Modules.tsx`, **LIVE demo**; board + list, **5 pipelines** guest/owner/syndic/
  interior/agency, 6 stages inquiry→won/lost; fixtures `@demo:data`). **V1-skinned, no trust.** A **second, unrelated
  Leads** lives in the Design module (`designClient` `convert` → a *project*, real endpoint) — **don't conflate** the
  two (convert-to-property vs convert-to-project).
- **Drawn** = no dedicated Leads prototype (the only "Leads" in the prototype is the Design business-unit pipeline).
- **Full-vision rule:** draw the Convert-to-Property action complete — it's documentation-only today (the single
  highest-value cross-module wiring).

## B3. Roles
Gated by the **`crm`** resource: director + both manager tiers = FULL; **field = none**; external = none. Consistent
with owner/B2B-deal sensitivity.

## B4. Critical states (trust → real signals)
- Lead **value** estimates ("est. €280k/yr") are **`modeled`** → `ConfBar` band.
- **"Friday auto"** qualifying is an AI agent action → provenance + confidence + a `fallback`/`partial` state when it
  can't ground a property fit.
- **"Friday nudges what went quiet"** (stale-lead detection) → a `stale` treatment per lead card.
- Lead source from Inbox/OTA threads → `guesty`/`friday` provenance.

## B5. Surfaces (P0 first)
| # | Surface | Reality | Priority |
|---|---|---|---|
| A | **Pipeline board/list** (5 pipelines, modeled value instrumented) | LIVE demo (reskin) | **P0** |
| B | **Convert-to-Property action** (lead → Property `prospect`, artifact pre-fill) — **the key wiring** | SPEC (doc-only) | **P0** |
| C | **Lead detail + Friday auto-qualify / nudge** (AI trust-states) | LIVE demo (reskin) | **P1** |

## B6. Open decisions
1. Where does **Convert-to-Property** live (lead card vs detail drawer), and the exact artifact pre-fill mapping
   (Lead → Properties §4 pre-onboarding list: referral source, vetting Q&A, discovery notes)?
2. Are **CRM-lite Leads and Design Leads** one module with pipeline filters, or two (different convert targets)?
3. Does the **guest pipeline** belong in Leads or in Reservations (pre-confirmation overlap)?
4. Should **field** ever see any lead slice (currently fully denied)?

---

## Shared — what we want back
For both: the V2 **reskin** (dark `.dwrap`/GmShell), every **modeled figure instrumented** (`SourceTag`/`ConfBar`),
every **AI surface wrapped** (`AITrustStrip`+`StateBanner`) per `PropertiesModuleV2` — desktop + manager-mobile. Plus
the two new builds drawn complete: Marketing's **friday.mu review-collection widget** (the collection-vs-consumption
boundary with Reviews) and Leads' **Convert-to-Property** action (the prospect handoff to Properties). Don't conflate
CRM-lite Leads with the Design module's leads. Flag clashes per `00-README` §7; propose options on the open decisions.
