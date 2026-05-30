# SPEC — Remaining Modules + Cross-Cutting · FAD V2

Companion to `SPEC-Design-Module.md`. Same system: dark tokens (`fad-desktop.css`), `Shell` chrome, `fad-states.jsx` trust vocabulary, drawers (`.tddrawer`), tables (`.tbl`), filters (`.vseg`), KPIs (`.statc`), Friday blocks (`.fai/.fbar`), badges (`.bdg`), codes (`.pcodeD`), A4 docs (`.doc-a4`), portal (`.portal`). New module files export `window.FADXxx`; routes added to `fad-router.jsx`; rail entries under **Business units** (design/agency) or **System**. Build with NO new primitives.

---
## PART 1 — CROSS-CUTTING COMPONENT SPECS (build first; everything depends on these)

### 1.1 Source / provenance model — per-field treatment
Extend `fad-states.jsx`. Add a reusable `<Field label value source/>` and inline `<SourceTag kind/>`. Six kinds, each a small mono chip + dot:
| kind | meaning | dot color | chip text |
|---|---|---|---|
| `guesty` | Guesty commercial truth (reservations, payouts, listing) | green | "Guesty" |
| `breezeway` | Breezeway ops/condition truth (tasks, evidence, access) | teal `--teal` | "Breezeway" |
| `friday` | FAD-owned record (tasks vetted, teachings, design budget) | indigo | "FAD" |
| `modeled` | forecast/estimate, not observed | violet | "modeled" |
| `stale` | last sync past threshold | amber | "stale 12m" |
| `failed` | sync errored | red | "sync failed · Reconnect" |
Per-field rule: data fields carry a `SourceTag`; on hover/expand show "from {system} · synced {time}". Editing a Guesty/Breezeway-truth field shows "syncs back to {system}" or is read-only if one-way. Modeled values always pair with `ConfBar`. Failed/stale gate dependent actions.

### 1.2 The five AI states on EVERY AI surface
Already on Inbox + Ask Friday + mobile thread. Apply identically (reuse `StateBanner`, `Provenance`, `ConfBar`, send/act-disable-on-failed) to:
- **Operations Daily Brief** (`ScreenOps` `.fai`): healthy=grounded brief w/ provenance (tasks/roster/supplies); partial="roster data unavailable — overload check skipped"; fallback="general morning shape — not from today's data"; failed="can't reach ops data — brief read-only"; stale banner.
- **Training / Learnings**: queue candidates show grounding source already; add stale/failed on the Sources tab; fallback when a teaching is proposed without enough signal.
- **TeamInbox** (team channel in Inbox): same draft/provenance/failed treatment as guest inbox.
- **Per-module Ask Friday**: each module's Ask panel grounds in that module's data; cite sources; draft-vs-approval boundary (nothing commits without operator confirm); show fallback when ungrounded.

### 1.3 Per-module Ask Friday contract
For each module define `{groundsIn:[entities/source systems], canDraft:[…], gatedActions:[need approval], citations:true}`. E.g. Finance Ask grounds in ledger+periods, can draft reconciliations, gated on posting; Agency Ask grounds in listings+market comps, can draft valuations/match notes, gated on sending to client.

---
## PART 2 — AGENCY (real-estate brokerage) · `window.FADAGENCY`, rail `agency`
**Job:** sell/let owner & external properties — push listings to portals, manage buyers/sellers, AI-match, value properties. **Entities:** Listing, Buyer, Seller, Lead, Match, Valuation, Viewing, Offer, Deal. **Sources:** Properties (`property_id`), portal feeds (lExpress Property, Property Cloud), market comps (modeled), Guesty (for managed units). Module tabs (`ag-*`): Overview · Listings · Buyers · Sellers · Matches · Valuations · Opportunities · Deals.

- **Overview**: `grid4` (Active listings · Hot matches · Offers in play · Pipeline value). Friday brief: "3 new buyer-seller matches, 1 price-reduction suggested, 2 owners likely to sell." Attention rows.
- **Listings** (`.tbl`): property · type · area · ask price · status (`bdg`: draft/live/under-offer/sold) · **portal push** (lExpress Property ✓/✗, Property Cloud ✓/✗ — toggles that `fadToast` "Pushed to lExpress Property") · views · enquiries · days-on-market. Row→listing drawer (gallery, description EN/FR, portal sync state via `SyncChip`, price history, AI price band).
- **Buyers** (CRM): name · budget · areas · type wanted · bedrooms · finance status · stage (new/qualified/viewing/offer) · last contact. Drawer = requirements + matched listings + activity.
- **Sellers**: owner/external · property · motivation · ask vs estimate · mandate (exclusive/open) · stage. Drawer = listing link + valuation + comms.
- **Matches (AI)**: cards pairing a buyer ↔ listing/seller with a **match score** (`ConfBar`) + reasons ("budget fit, area fit, 3-bed match, finance ready"). Actions: intro, schedule viewing, dismiss. `Provenance` = which buyer/listing fields drove it. Fallback state when comps thin.
- **Valuations (AVM)**: interactive estimator — pick property (or type+area+size+beds) → **sale estimate band** + **rent estimate band** with `ConfBar`, driven by market comps (modeled `SourceTag`). Comparable sales/rentals table. "Generate owner valuation report" → `.doc-a4` (navy). 
- **Opportunities (AI)**: surfaced leads — owners likely to sell (managed units w/ low yield / long hold), buyers re-activating, price-reduction nudges, cross-sell to Syndic/Design. Each = card + reason + CTA.
- **Deals**: offer→acceptance→deposit→deeds→commission pipeline (reuse `.wiz`/pipeline). Commission = Friday revenue line (internal).
- **Mobile**: `MobileAgency` — listings list + buyers + matches (hot) + a quick valuation tool. More-menu entry.
- **States**: empty ("No listings — add your first"), portal **failed-sync** (red `SyncChip` "lExpress Property sync failed · Reconnect"), modeled valuations always show confidence, permission (viewer read-only).

---
## PART 3 — LEGAL & ADMIN · `window.FADLEGAL`, rail under System
**Job:** contracts, e-signature, compliance docs, entity/company admin. **Entities:** Document, Contract, SignatureRequest, ComplianceItem, Entity. **Sources:** Xodo Sign (e-sign), Drive, FAD records. Tabs: Documents · Signatures · Compliance · Entities.
- **Signatures** table: doc · parties · status (`bdg`: draft/sent/partially-signed/completed/declined/expired) · sent · signed. Drawer = signer timeline + reminders. (Mirror Syndic attestation pipeline pattern.)
- **Compliance** checklist: per-entity obligations (tax filings, licences, insurance) with due dates + state (ok/due-soon/overdue). Friday flags upcoming.
- **Documents** vault: typed library (reuse Syndic `ScreenSyndicDocs` grid + `.doc-a4` previews).
- **States**: Xodo connector failed-sync banner; pending-signature partial state; permission gating (legal docs restricted role).

---
## PART 4 — MARKETING · `window.FADMKTG`, rail under System
**Job:** listing content, channel optimization, promotions, brand. **Entities:** Listing content, Channel, Promotion, Campaign, Asset. **Sources:** Channels (Airbnb/Booking/direct), Guesty listings. Tabs: Listings content · Channels · Promotions · Performance.
- **Listings content**: per property — photos, title/description (EN/FR), completeness score (`ConfBar`), AI-improve suggestions (Friday draft, approval-gated). 
- **Channels**: per channel sync state (`SyncChip`), rate/availability parity, calendar conflicts.
- **Promotions**: discount rules, min-stay, last-minute — toggle live/scheduled.
- **Performance**: views→booking funnel per channel, content score vs occupancy. 
- **States**: channel failed-sync, content "no photos yet" empty, modeled performance forecasts.

---
## PART 5 — LEADS / CRM-LITE · `window.FADLEADS`, rail under System
**Job:** capture & qualify inbound (booking enquiries, syndic/design/agency leads) before they become deals. **Entities:** Lead, Source, Activity. Tabs: Inbox/new · Qualified · Pipeline · Sources.
- **Pipeline** (kanban or `.tbl` by stage): new → contacted → qualified → converted/lost. Lead card: name · interest (stay/syndic/design/agency) · source · value · owner · next action.
- **Drawer**: contact, conversation, qualification checklist, convert-to (booking/project/listing/mandate).
- Friday: auto-qualifies, drafts first reply (approval-gated), routes to the right module.
- **States**: empty, AI fallback on qualification, source-feed failed-sync.

---
## PART 6 — DEEPEN EXISTING (extend built screens)
- **Finance**: period-close wizard already built — add **per-amount provenance** (`SourceTag`: Guesty-accounting-truth / FAD-ledger / pending-approval / modeled-forecast) on every figure; expand reconciliation workspace (match queue, exceptions). 
- **Owners**: full **statement workflow** — draft→review→sent→viewed states (`bdg`) + waterfall (revenue→fees→expenses→payout) already in `ScreenOwnerStatement`; add the state badges + a "send" gate. Clarify ownership: **Owners** = relationship/statements/comms; **Finance** = ledger/close/tax. Cross-link, don't duplicate.
- **Properties = the SPINE**: make Property record converge Guesty commercial + Breezeway ops/condition + Finance + Reviews + guest history + Ask Friday context. Each field carries a `SourceTag`. Tabs: Overview · Commercial(Guesty) · Condition/Ops(Breezeway) · Finance · Reviews · Guests · Documents · Ask Friday. This is the canonical detail record other modules link into.
- **Reviews & HR**: explicit **"no synced data yet"** empty state vs real-data (some platforms unconnected); HR **leave-request workflow** (request→pending→approved/declined, coverage check — partially in staff drawer; make it a first-class queue).
- **Settings = integration control plane**: per connector (Guesty, Breezeway, channels, WhatsApp, Xodo, lExpress Property, Property Cloud) show **last sync · direction (one-way/two-way) · owner · failure state · data domains · source-system link**. Reuse the Settings Integrations tab; add the detail rows + `SyncChip`.

---
## PART 6.5 — TENANT ADMIN TRIO (multi-tenant SaaS surfaces)
These are FridayOS platform-admin surfaces (per the `tenant_id`-on-every-table multi-tenancy model), distinct from per-tenant Settings.
- **Tenant Settings** · `window.FADTENANT`, System rail. The tenant's org-level config: organisation profile, modules enabled (toggle which business units are on: STR / Syndic / Design / Agency / Legal / Marketing), branding (logo, accent — note: navy #1F3864 for Syndic owner-facing), data residency, default language EN/FR, role definitions. Reuse Settings tab pattern. State matrix: permission (only Director role edits), saved/dirty states.
- **Billing** · `window.FADBILL`, System rail. The tenant's subscription to FridayOS: plan (Growth/Scale), per-unit pricing, units counted, next invoice, payment method, invoice history (`.tbl` + PDF `.doc-a4`), usage by module. Distinct from Finance (which is the tenant's OWN books). States: payment-failed banner (red), trial/grace, usage-over-limit.
- **Admin Analytics** · `window.FADADMIN`, System rail. Cross-tenant / cross-module platform health for an operator-admin: adoption per module, AI acceptance rates, sync health across all connectors, tenant activity. Reuse Analytics patterns + the integration control-plane rows from Settings. States: no-data, partial connector data.

## BUILD ORDER (recommended)
1. Cross-cutting (Part 1) — unblocks all. 2. Properties-spine + Settings control plane (Part 6) — canonical data surfaces. 3. Agency (Part 2) — biggest net-new. 4. Leads, Marketing, Legal (Parts 3–5). 5. Finance/Owners/Reviews/HR deepening. 6. Roll AI states into Ops Daily Brief / Training / TeamInbox.
Each ships at V2 fidelity: desktop screen + mobile + detail drawer + full state matrix, dark tokens, reused components.
