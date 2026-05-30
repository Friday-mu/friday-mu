# Guests (+ stay portal) — Design Brief for Claude Design

> No standalone Guests scoping pack — the staff CRM vision is distributed (Reservations §3 Guests sub-tab, Analytics,
> CLAUDE.md module table), and the **guest portal** has two dedicated packs: the **Guest-portal chat v0.1 (DRAFT)**
> ([36943ca8849281939417fad24d881f94](https://www.notion.so/36943ca8849281939417fad24d881f94)) and the **Friday Stay
> Portal stay-token contract v2 (PARKED)** ([36743ca8849281c9ad30ecba66cbdc62](https://www.notion.so/36743ca8849281c9ad30ecba66cbdc62)).
> Read `00-README` + `ask-friday.md` first. **Note the codebase split (§2): the staff Guests CRM is FAD; the guest
> `/stay/[token]` portal lives on the Friday Website, FAD owning only the public API + reveal engine.**

## 1. The brief in one line
Design Guests as the **staff CRM for persistent, multi-trip guest identity** (lifetime value, stay history,
Friday-maintained preferences) **and** the **guest-facing stay portal** (`/stay/[token]`) — a magic-link surface
with a **time-gated access-code reveal engine**, a guest-facing house guide, a check-in form, and a **retrieval-only,
clearly-disclosed stay-scoped Ask Friday chat**.

## 2. Source of truth and grounding (three-way reconcile)
- **Vision.** Staff CRM: persistent guest identity across OTAs + the Reservations §3 **Guests sub-tab** (profile,
  contacts, linked reservations, OTA profiles, **consent data, documents**) + Analytics (origin / repeat rate /
  demographics). **Lifecycle** (persistent identity, contact unification) = Mathias; the **admin slice** = Mary
  (captured pre-2026-05-25). Guest portal: the **stay-token contract** (magic token = **one reservation**, not a
  login; access codes reveal **arrival-day 10:00 MU or 4h before approved arrival**, hidden **checkout+6h**; address
  reveals after confirmation + acceptable payment; portal lives until **checkout+90d**; check-in form for **every
  guest, not just primary**; a fully-specced `evaluateStayPortalVisibility()` reveal engine) + the **portal chat**
  (unified into `inbox_threads` as `channel='portal_chat'`, **retrieval-only AI V1** over guest-facing Property Cards
  + reservation, an **"Friday AI" disclosure badge**, two-way auto-translate, structured cards for cleaner-ETA /
  payment / access). **Owner Ask Friday stays owner-scoped; guest Ask Friday stays stay-scoped.**
- **Reality.** Staff module `Tier3Modules.tsx` `GuestsModule` + `GuestDetail` (registered `modules.ts`, ship Jul) is
  **DEMO** — reads **un-tagged** local fixtures (`GUESTS` + `GUESTS_KPI`, 10 hardcoded). A **live typed client
  exists but the module ignores it**: `_data/guestsClient.ts` → `/api/guests` (FAD `fad_guests`, backfilled from
  `guesty_reservations`; `GET /api/guests`, `/:id`, `/:id/reservations`, `POST /lookup`, `POST`, `PATCH`) —
  consumed only by `ReservationDetail` (Guests sub-tab) + `GuestInfo` (Inbox) → **LIVE where wired**. **`/stay/
  [token]` DOES NOT EXIST** (no `stay/` dir; `lib/portalClient.ts` is the *DESIGN owner-portal*, unrelated). None of
  `/api/public/stays/*` exist; `guest_portal_ask_friday` = zero refs → **SPEC**.
- **Drawn.** Staff CRM: `fad-desktop-screens.jsx` `ScreenGuests` (CRM table: Guest · Home unit · Stays · Last stay ·
  Rating · Channel · Tags VIP/Returning/New · Lifetime; tabs All/VIP/Returning/In-house/New; KPI strip; "synced from
  Guesty") + `MobileGuests`. **No guest-portal mock exists** — the closest analog is the **field-staff PWA
  access-code reveal** (`fad-screens-d.jsx`: an "audit-only" chip, "Reveal code (logged)" → code shown with an audit
  stamp, closes on task completion) — the trust pattern to adapt for guest-facing reveal.
- **Full-vision rule:** design the complete staff CRM **and** the guest stay-portal (incl. chat) even though the
  portal isn't built and lives in another codebase; the **reveal-window / not-yet-revealed / declined** states are
  the whole point.

## 3. Who uses it (roles)
- **Staff CRM** — gated by the `crm` resource. **Manager-tier (ops_manager ≡ commercial_marketing) get `crm:
  FULL_ACCESS`, same as director** — no guest-$ divergence at the CRM level (the finance split lives in Reservations
  §6). Lifetime-value €/LTV in the Guests module is borderline — managers may see guest-facing revenue but
  owner-economics stay director-only. **Field** is not a CRM consumer (sees per-task access codes only).
- **Guest portal** — authed by a **magic stay-token = one reservation**, *not* a staff role. A guest **may** see (per
  the reveal engine): own reservation identity / dates / guest-count / channel / status, masked contact, payment
  status, **exact address** (after confirmation + payment), **access codes** (only inside the reveal window, hidden
  checkout+6h), the **guest-facing house guide** (Property Cards `guest_facing`/`both` only — `internal_only`
  **never**), add-ons, check-in form, support. A guest must **never** see staff/team, owner payout/margin/commission,
  internal notes, other reservations, OTA private IDs, or other guests' passport/ID. **The backend sanitises — the
  frontend is never the gate.**

## 4. Design principles and system
- **Two distinct portals — don't conflate.** The DESIGN owner-portal (`portalClient.ts`, exists) vs the guest
  stay-portal (`/stay/[token]`, doesn't exist, lives on the **Friday Website**) vs the guest-portal **chat** (a third
  DRAFT pack). Be explicit which surface a screen is.
- **The stay portal is cross-codebase.** Route + page live on the Friday Website; FAD owns the **public API + reveal
  engine**. Design the portal as the *vision* (consistent with FAD), noting it builds on the Website against
  `/api/public/stays/*`, not inside FAD.
- **Bind the staff module to the live client.** Today it renders demo fixtures while `/api/guests` is live — design
  the CRM against real data with honest **stale / partial / failed / empty** states.
- **Guest AI is retrieval-only + disclosed.** The stay chat carries a permanent "Friday AI" badge and answers only
  from grounded guest-facing sources; no actions in V1.

## 5. Information architecture
- **Staff CRM** — list (tabs All/VIP/Returning/In-house/New), KPI strip, guest detail (preferences memory, stay
  history, contacts, consent + documents), + the embedded **Reservations Guests sub-tab**.
- **Guest stay portal** — resolve token → stay home (dates, property, status) → check-in form (every guest) →
  **access & directions** (reveal-gated) → **house guide** (guest-facing Cards) → **chat / support** → add-ons.

## 6. Surfaces to design (full vision) — P0 first
| # | Surface | Primary user | Purpose | Reality | Priority |
|---|---|---|---|---|---|
| A | **Staff Guests CRM (list + detail)** | director / manager | persistent identity, LTV, stay history, preferences memory; bound to `/api/guests`. | SPEC (UI built, demo fixtures, unwired) | **P0** |
| B | **Guest stay-portal — access & directions** | guest | reveal-gated access codes + address + map; the time-window reveal engine. | SPEC (Website + FAD API) | **P0** |
| C | **Guest stay-portal — home + check-in form** | guest | stay summary; check-in form for every guest (name/email/phone/country/ETA/transport/flight/passport + upload/house-rules/privacy/upsell). | SPEC | **P1** |
| D | **Stay-scoped Ask Friday chat** | guest | retrieval-only RAG over guest-facing Cards + reservation; "Friday AI" badge; structured cards; auto-translate. | SPEC | **P1** |
| E | **Guest house guide** | guest | guest-facing Property Cards (guide/wifi/local context) — `internal_only` never. | SPEC (Cards live) | **P1** |
| F | **Preferences memory + consent/documents** | staff | Friday-maintained notes (AI), consent state, passport/ID docs (handled, not exposed). | SPEC | **P2** |

## 7. Critical states the UI must make legible
**Staff CRM:** **stale** when `fad_guests.synced_at` lags / Guesty sync down (show last-synced, not fabricated
counts); **failed** if `/api/guests` errors → degraded/empty; `total_revenue_minor` is **modeled** (best-effort
currency) → `SourceTag modeled`, not an authoritative €; **preferences memory** is an AI surface → confidence band +
source disclosure + honest empty state when no memory exists.

**Guest stay portal — the reveal engine is the headline state:** access codes render **masked until the reveal
window opens** (arrival-day 10:00 MU / 4h before approved arrival), and **hide checkout+6h**; address is masked until
confirmation + payment; each state needs an honest face — **not-yet-available (with when), available, expired,
declined-with-reason**. Mirror the field PWA's "Reveal code (logged)" + audit stamp doctrine.

**Stay-scoped Ask Friday:** **fallback** when no grounding ("I can't answer that — here's how to reach the team");
**partial** when a Card load fails; **stale** Card; permanent **"Friday AI" disclosure** badge; never surfaces
`internal_only` content.

## 8. Key flows to storyboard
1. **Staff:** browse CRM → open a guest → see identity, LTV (modeled), stays, preferences; jump to a reservation.
2. **Guest pre-arrival:** resolve token → check-in form (all guests) → "access available on arrival day at 10:00".
3. **Guest arrival:** reveal window opens → codes + address + map unmask (logged) → house guide.
4. **Guest in-stay:** chat ("what's the wifi?") → retrieval-only answer + structured card; support handoff.

## 9. Reference artifacts
Prototype `ScreenGuests` + `MobileGuests` + the field PWA reveal pattern (`fad-screens-d.jsx`); built `guestsClient`
+ `/api/guests` (`fad_guests`) + the `ReservationDetail`/`GuestInfo` consumers; the stay-token contract's
`evaluateStayPortalVisibility()` + check-in form spec; the portal-chat pack (`inbox_threads` `portal_chat`); the
`ai/` kit. **Build homes:** staff CRM = FAD; stay portal = Friday Website against `/api/public/stays/*`.

## 10. Recommended design priority
1. **A–B:** the staff CRM (bound to live data, honest states) + the guest-portal **access & directions** reveal
   engine (the trust headline).
2. **C–E:** the portal home + check-in form, the stay-scoped chat, the house guide.
3. **F:** preferences memory + consent/documents.

## 11. Out of scope (per packs)
Voice/video, payment-in-chat, group chats, marketing broadcast, **replacing WhatsApp** (the portal *complements* it).
The `/stay/[token]` route is **Website-hosted** (FAD owns the API + reveal engine) — design the vision; it isn't
buildable inside FAD. Guest-portal actions (beyond requests) are Phase 3.

## 12. Open decisions (propose options, don't guess)
1. **Module ↔ live API** — bind V2 Guests to `/api/guests` and draw the stale/partial/failed/empty states (the
   fixtures are also an un-tagged `@demo` violation to clean up).
2. **What does the design session draw** — the staff CRM (FAD), the guest stay-portal (Website-hosted), or both?
   (Recommend **both**, clearly labelled by build-home.)
3. **Persistent identity vs per-stay token** — how a returning guest's portal/chat threads the persistent
   `fad_guests` identity vs the per-reservation `public_stay_tokens`.
4. **LTV € visibility** — is the modeled lifetime revenue OK for managers, or director-only (cf. Reservations §6)?
5. **`accessReadyAt` source** — manual Ops vs derived-from-task-completion vs both (affects the reveal state).

## 13. What we want back
The **staff Guests CRM** (bound to live `/api/guests`, honest states) and the **guest stay-portal access-reveal
engine** first — desktop + mobile for staff; mobile-first guest portal — built on the live client + the reveal
contract + the `ai/` kit, with the time-gated reveal states + the "Friday AI" disclosure visibly represented. Then
the portal home/check-in, the stay chat, and the house guide. Label each surface by build-home (FAD vs Website);
flag clashes per `00-README` §7.
