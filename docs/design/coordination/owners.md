# Owners (+ owner portal) — Design Brief for Claude Design

> No standalone Owners scoping pack — the module is governed by **FAD Finance scoping**
> ([36143ca88492816087d7eeeebe502a15](https://www.notion.so/36143ca88492816087d7eeeebe502a15), owner ledger + payout
> logic) plus the **Portal v2 brief** ([36a43ca8849281ffa7d1c9a2545220cb](https://www.notion.so/36a43ca8849281ffa7d1c9a2545220cb))
> and the guest-portal token pattern that precedes it. Read `00-README` + `ask-friday.md` + `properties.md` (the
> credential-reveal flow connects to Properties' masking) first.

## 1. The brief in one line
Design Owners as the **operator's statement-review-and-send cockpit** (May essentials) and the **owner-facing,
role-scoped portal** (Sep) — anchored on a **statement waterfall** (gross → commissions → tax → net payout) with a
**Friday reconciliation bar** and a first-class **held-line approval gate**, plus the **owner request-gated,
audited credential-reveal** flow — operator surfaces in the dark V2 skin, owner-facing surfaces in **Friday navy
#1F3864, A4 doc look**.

## 2. Source of truth and grounding (three-way reconcile)
- **Vision** = Finance Phase 3 (deduct commission before owner payout; clean owner ledger; tourist-fee/tax by
  jurisdiction; "Guest Recovery Authority" = refunds without case-by-case owner approval) + the Portal brief (owner
  portal = **Sept 2026, one FAD app, role-scoped — NOT a separate codebase**; the guest stay-token / `/api/public/*`
  JWT pattern is its precursor). **Owner Ask Friday stays owner-scoped** (sandboxed to their own properties). Locks:
  Cleaning Fee = net pass-through (never revenue); commission deducted before payout; `entity_id` FR/FI/S, FR only.
- **Reality** = Owners list/CRUD is **CORE→LIVE**: `_data/ownersClient.ts` → `/api/owners`
  (`backend/src/owners/index.js`) over `fad_owners` (mig **081**, seeded from Guesty owner IDs; N:M property edges
  mig 077) — `GET /`, `GET /:id`, `/:id/properties`, `POST`, `PATCH`, archive/unarchive. Schema carries
  `statement_day`, `commission_pct_default`, `payment_pref`, `language`, **`bank_details_encrypted BYTEA`**
  (pgcrypto). `OwnersInsightsPage` is LIVE-partial (`usePortfolio(30)`). **But `OwnersModule` + `OwnerDetail`
  (`StubModules.tsx`) still render DEMO fixtures (`OWNERS` + `OWNER_STATEMENTS`, 5 owners) — the list isn't wired to
  the live client (gap). And there is NO statement-generation endpoint — the waterfall, PDF, "Send to owner", and
  payouts are entirely demo.** Ask-Friday owner-statement context is scaffolded server-side (mig 074 tools
  `load_owner_statement_context`, `create_finance_draft`; knowledge `owner_statement_rules`) → **SPEC**.
- **Drawn** = `fad-desktop-screens.jsx` `ScreenOwners` (list; tabs All owners / Statements / Payouts / Documents /
  Insights; stat cards 38 owners / 27 units / YTD; rows → owner drawer) and the marquee **`ScreenOwnerStatement`**:
  breadcrumb `Owners › {Trust} › April 2026 statement`; left context card (period, net payout, **Generate PDF** +
  **Send to owner**, sub-nav Statement / Transactions / Properties / Documents / Insights); a **Friday reconciliation
  bar** ("reconciled against 4 reservations and 3 posted expenses … €43 retile BL-12 excluded, awaiting approval");
  the **statement waterfall** (Gross rental revenue → − channel commissions → − tourist tax (MRA) → **Net rental
  income** → − management commission 15% → − commission VAT → − maintenance & supplies → **Net payout**); a **held-
  line gate** ("BL-12 retile €43 held — needs approval before inclusion"). **No owner-portal screen is drawn yet
  (the navy/A4 portal look is unbuilt — a gap to fill).**
- **Full-vision rule:** design the full statement engine + owner portal even though no statement backend exists
  yet; the **held-line / reconciliation / placeholder-owner** states are not "future".

## 3. Who uses it (roles)
`permissions.ts` defines **four** roles and **no owner portal role yet** (the Sep portal must add one + RLS +
owner-scoped Ask Friday isolation):
| Role | Sees |
|---|---|
| **Director** (Admin) | full statement CRUD: generate, recalculate, **approve held lines**, PDF, send |
| **Manager** (ops_manager ≡ commercial_marketing) | owners **READ_ONLY**; **finance $ amounts gated** (sees owners/statements but figures masked, per the director-only finance-amount rule) |
| **Field** | none (`owners: {}`) |
| **Owner** (portal, Sep — NEW role) | own statements / reviews / occupancy + **forms**: download PDF, approve/dispute a held line, **request a credential reveal**; owner-scoped Ask Friday only |

## 4. Design principles and system
- **Two skins, one app.** Operator surfaces = dark V2 (`.dwrap` / GmShell). Owner-portal surfaces = **Friday navy
  #1F3864, A4 doc look** (logo top, navy headings) — what the owner receives matches what the operator previews.
- **The reconciliation bar is earned, not cosmetic.** It must derive from real signals (which reservations /
  expenses reconciled, what's unmatched) — see §7.
- **Held lines are first-class.** Amounts pending approval are visually **excluded with a reason**, never silently
  dropped or silently included.
- **Money rules are locked.** Cleaning fee = net pass-through; commission before payout; bank details stay encrypted
  (never rendered).

## 5. Information architecture
- **Owners list** — All owners / Statements / Payouts / Documents / Insights; owner detail drawer.
- **Owner detail** — properties + ownership %, contract status, commission %, payment day, language, statement
  history (role-gated $).
- **The statement** — the document: context card + waterfall + transactions + held-line gate + Generate PDF / Send.
- **Owner portal** (Sep) — navy/A4: own statements, payment history, reviews, occupancy, credential requests,
  owner-scoped Ask Friday.

## 6. Surfaces to design (full vision) — P0 first
| # | Surface | Purpose | Reality | Priority |
|---|---|---|---|---|
| A | **Statement document + waterfall** | gross→net payout waterfall, transactions, held-line gate, Generate PDF + Send. | SPEC (no endpoint) | **P0** |
| B | **Friday reconciliation bar** | "reconciled against N reservations + M expenses; €43 held" — bound to real signals. | SPEC | **P0** |
| C | **Owners list + detail** | live list (converge off the demo fixtures), owner record, statement history. | CORE/LIVE (list wiring gap) | **P0** |
| D | **Owner portal — statement + forms** | navy/A4 own-statement view; download PDF; approve/dispute held line; owner-scoped Ask Friday. | SPEC | **P1** |
| E | **Credential-reveal flow** | masked codes + "Request access codes" → audited request → staff accept / auto-grant-but-logged. (§7) | SPEC (masking primitives exist) | **P1** |
| F | **Payouts + Documents + Insights** | payout schedule/status, statement docs vault, owner-performance insights (live `usePortfolio`). | CORE (Insights) / SPEC | **P2** |

## 7. Critical states the UI must make legible
- **Reconciliation (the AI bar) → real signals:** **healthy** = statement reconciled against N reservations + M
  posted expenses, all sourced; **stale** = expense/Guesty feed older than `statement_day` ("figures may be
  incomplete"); **partial** = "4 of 5 reconciled" (an expense with no owner edge); **fallback** = owner still a
  placeholder ("Guesty owner abc123") or `commission_pct_default` missing → statement uses tenant default, flagged;
  **failed** = portfolio/analytics fetch error (already modelled with retry in `OwnersInsightsPage`).
- **Held-line gate** — a held amount (BL-12 €43) is shown **excluded, with the reason + an approve/dispute action**,
  not merged into the total. First-class trust pattern.
- **Confidence is a band** — retire the legacy numeric `AIConfidenceChip` for the band vocab.
- **Owner credential-reveal — request-gated + audited** (connects to Properties' masking matrix):
  in the owner portal, access/wifi codes render **masked (●●●●)** with a **"Request access codes"** button. On tap →
  an **audited request** (owner_id, property_id, reason, ts) routes to staff (Inbox/Approvals, ADR-008). **Staff
  accept** → codes unmask for the owner for a bounded window; **or tenant policy auto-grants** → codes reveal
  immediately **but every reveal is logged** (who/when/which credential) into the property's Access-card audit log +
  the owner's activity trail. Every reveal writes an immutable audit row; the **`audit-logged` badge is permanent
  UI**. Honest **pending / declined-with-reason** states required. (The masking primitives exist: `PropertyDetail`
  time-gates access cards; `TaskDetail` already says "access can be requested … no code displayed here".)

## 8. Key flows to storyboard
1. **Statement cycle:** generate → Friday reconciles (bar) → resolve/hold lines → Generate PDF → **Send to owner**.
2. **Owner self-service:** magic-link portal → view statement → download PDF → **approve/dispute** a held line.
3. **Credential reveal:** owner taps "Request access codes" → audited request → staff accept (or auto-grant-logged)
   → codes unmask for a window → audit row written.

## 9. Reference artifacts
Prototype `ScreenOwners` + `ScreenOwnerStatement` + `MobileOwners` + the property `POwner` tab (the `audit-logged`
Access card); built `ownersClient` + `/api/owners` (mig 081/077) + `OwnersInsightsPage` (`usePortfolio`); the
scaffolded mig-074 owner-statement Ask-Friday tools; the `ai/` kit. Statement waterfall lines are the design target
for the document look.

## 10. Recommended design priority
1. **A–C:** the statement document + waterfall, the reconciliation bar, and the live owners list/detail.
2. **D–E:** the owner portal (navy/A4) statement + forms, and the credential-reveal flow.
3. **F:** payouts, documents vault, owner insights.

## 11. Out of scope (Phase 1)
Owner portal = **read + forms, not payment initiation**. Owner-facing portal *preview of onboarding* deferred
(mid-2027). No bank-detail rendering ever (encrypted at rest). Statement engine backend is a Finance dependency
(Mary's end-May accounting automation) — design the full vision, mark SPEC.

## 12. Open decisions (propose options, don't guess)
1. **Missing `owner` role** — the Sep portal needs a new role + RLS + owner-scoped Ask Friday isolation before any
   owner-facing surface ships. Design assumes it exists.
2. **Operator vs owner-portal skin** — confirm the dark-operator / navy-A4-owner split (every existing owner screen
   is dark today).
3. **Manager finance visibility** — do managers see $ amounts on statements, or masked (like the design module's
   fee-masked-to-0 precedent)?
4. **Held-line approval actor** — does the owner approve the held expense (portal) or is it resolved internally
   before send? Reconcile with Finance's "Guest Recovery Authority" (refunds *without* owner approval — a different
   gate).
5. **Credential-reveal default policy** — accept-required vs auto-grant-but-logged is **tenant-configurable**
   (`@demo:config`) — design **both** states.
6. **List convergence** — V2 binds the owners list to the live `/api/owners` client (off the demo fixtures); only
   the statement waterfall stays SPEC.

## 13. What we want back
The **statement document + waterfall + reconciliation bar + held-line gate**, and the **live owners list/detail**,
first — desktop (operator, dark) — built on the live `ownersClient` + the `ai/` kit, with the reconciliation states
visible. Then the **owner portal** (navy/A4) statement + forms and the **credential-reveal** flow. Propose options
on §12 (esp. the new owner role + the credential default policy); flag clashes per `00-README` §7.
