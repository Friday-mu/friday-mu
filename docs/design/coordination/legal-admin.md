# Legal & Admin — Design Brief for Claude Design (director-gated, urgent)

> Sits on top of **"Legal & Admin — Mary's Documents"** ([35443ca884928172a99cc8f3836b9dc5](https://www.notion.so/35443ca884928172a99cc8f3836b9dc5)),
> the canonical scope-decision page (restructured to lead with problems, not Mary's tab list). Read `00-README` +
> `ask-friday.md` first. **Reality check: this is the lowest-maturity, highest-urgency module — rich vision, almost
> no prototype, a thin V1 demo stub in code, and a hard deadline (Mary left end-May; MRA penalties accruing since
> Aug 2025). Design is largely greenfield here.**

## 1. The brief in one line
Design Legal & Admin around its two load-bearing surfaces — an internal **e-signature engine** (the "Xodo" rebuild:
templated documents → send-for-signature → a Draft/Sent/Viewed/Signed/Declined/Expired envelope state machine →
stored signed PDFs + audit trail) and a **compliance-deadline register** (the TAC lifecycle + fire/health/license/
insurance renewals with threshold alerting) — plus a contracts relationship store and a disputes log.

## 2. Source of truth and grounding (three-way reconcile)
- **Vision.** **Stays in L&A:** **Contracts** (relationship records, amendment history, T&C-version-per-owner, KYC
  slots, special arrangements — Nitzana 17.5% / Villa Angel fixed fee / Mayeven quarterly); **Compliance register**
  (TAC 11-stage tracker, fire cert, health clearance, BLUP, business reg, insurance, AML/KYC); **Disputes** (log +
  linked T&C clause library + AI-drafted formal notices). **Rejected → re-routed:** Tax/VAT/Invoices → Finance;
  People/HR/spending-authority → HR; Onboarding/Offboarding → Owners + cross-cuts; Software register → Settings;
  Documents library → a cross-cut template engine. **Xodo = "the meat" (LOCKED §7.QQ):** Eversign's API is too
  expensive → **reverse-engineer & rebuild internally** (same pattern as Reva→Reviews). Replicate: doc templating
  with field-merge; send-for-signature (sequential/parallel signers); the **status machine Draft / Sent / Viewed /
  Signed / Declined / Expired**; auto-reminders (Day 7 flag / 14 escalate / 21 critical); audit trail (who/when/IP);
  stored signed PDFs by doc ID; a document library. **Blocker: a Mauritian e-signature legal-validity opinion is
  needed before commit.** **Compliance is the most operationally critical surface:** TAC has two models — **FR-managed
  (11-stage process tracker + fee)** vs **Owner self-service (track expiry + renewal only)**; **the fire cert renews
  annually, independent of TAC's 3-year cycle, and a lapse jeopardizes TAC.** Proposed renewal thresholds: fire 6wk,
  TAC 3mo, business reg 60d.
- **Reality.** `LegalModule()` in `StubModules.tsx` — a **V1 light-skin stub** (not a V2 GM screen), tabs Contracts /
  Renewals / Licenses / Compliance / Documents; `ComplianceCalendar` with hardcoded "3 items open for Mary". All data
  is `@demo:data` (PROD-DATA-48; the real fixtures were **emptied** in the Apr-29 audit, so prod shows empty/
  ComingSoon). **Xodo in code = Properties only** (`OnboardingArtifacts.tsx` renders `xodoEnvelopeId` + `xodoStatus`
  as a read-field) — there's no Legal-side authoring surface. **⚠ CRITICAL REUSE — the e-sign primitive already
  exists as working code:** `design/portal/AgreementTab.tsx` implements the full internal-signature flow the rebuild
  needs (states draft → sent/viewed → signed; signature canvas + typed legal name; server-captured IP/UA; a
  `SignedReceipt` with timestamp; backed by `lib/portalClient.ts`; status enum sent / viewed_by_client /
  signed_by_client / completed). **Lift this into Legal/Xodo.**
- **Drawn.** Essentially nothing — no `FAD Manager - Legal*.html`, no Legal screen in the gallery, no legal data in
  the prototype. Closest visual references are the sibling GM screens + the Finance screen. **Greenfield.**
- **Full-vision rule:** design the complete e-sign engine + compliance register + contracts + disputes even though
  the code is a stub; the **envelope-state / deadline-lapse / registry-unconfirmed** states are the point.

## 3. Who uses it (roles)
**Director-gated** (a controlled-review module — legal exposure). Manager-tier likely **read + operational chase**
(renewals, TAC stages); **field none**; team/role admin + Settings stay director-only. **Open hole:** Mary was the
de-facto Admin; her departure orphaned the onboarding "Admin" steps — step-ownership reassignment is unresolved.

## 4. Design principles and system
- **Build it as a V2 GM screen** (dark `.dwrap` + `GmShell`) — not the current V1 light stub. **Owner/signer-facing**
  signature surfaces use the **navy #1F3864 A4** skin (matches what signers receive).
- **Reuse the e-sign primitive** (`AgreementTab` / `portalClient`) rather than building a parallel signature flow.
- **Keep the envelope state machine visually distinct from AI trust chips** — signing status is deterministic
  (Draft→Sent→Viewed→Signed→Declined→Expired), not an AI band.
- **AI here is high-exposure** — AI-drafted dispute notices / contract summaries must cite the T&C clause library and
  gate low-confidence behind director approval.

## 5. Information architecture
- **Contracts** — relationship records (per owner / per property), amendment history, T&C-version, KYC, special
  arrangements.
- **Compliance register** — the TAC 11-stage tracker (FR-managed vs owner-self-service) + fire/health/BLUP/business-
  reg/insurance/AML-KYC with renewal-threshold alerting + a deadline calendar.
- **E-signature (Xodo)** — templates, send-for-signature, the envelope state machine, signed-PDF library, audit.
- **Disputes** — log + T&C clause library + AI-drafted formal notices.

## 6. Surfaces to design (full vision) — P0 first
| # | Surface | Purpose | Reality | Priority |
|---|---|---|---|---|
| A | **E-signature engine (Xodo)** | template → send (sequential/parallel signers) → **envelope state machine** → signed PDF + audit; reminders (7/14/21). Reuse `AgreementTab`. | SPEC (primitive exists) | **P0** |
| B | **Compliance register + deadline calendar** | TAC 11-stage (FR-managed vs self-service), fire/health/license/insurance/business-reg, renewal thresholds, registry SyncChip. | SPEC (stub) | **P0** |
| C | **Contracts store** | relationship records, amendment history, T&C-version-per-owner, KYC, special arrangements. | SPEC (stub) | **P1** |
| D | **Disputes** | dispute log + T&C clause library + AI-drafted formal notice (provenance-cited, director-gated). | SPEC | **P1** |
| E | **Document library** | signed PDFs + legal docs by type/period (note: the *template engine* is a cross-cut, not Legal-only). | SPEC | **P2** |

## 7. Critical states the UI must make legible
- **Envelope state machine** — Draft / Sent / Viewed / Signed / Declined / Expired + reminder stage (Day-7 flag /
  14 escalate / 21 critical). Deterministic, visually distinct from AI chips.
- **Compliance deadline state** — current / approaching-threshold / **lapsed**; the **fire-cert-lapse-jeopardizes-TAC**
  dependency made explicit; registry **SyncChip** ("MRA/MTA registry — not confirmed" = the silent-penalty risk).
- **AI dispute/contract drafting** — confidence **band** + **mandatory provenance to the T&C clause library**; low
  band → director-approval gate (legal exposure).
- **Honest empty / orphaned-owner** — post-Mary, stub data is stale ("open for Mary"); design real empty + the
  reassigned-owner state.

## 8. Key flows to storyboard
1. **Send for signature:** pick template → field-merge → add signers (order) → send → track the envelope → store
   signed PDF + audit.
2. **Renewal watch:** compliance register surfaces "fire cert due in 6 weeks" → chase → mark renewed; TAC stage
   advances.
3. **Dispute:** log → AI drafts a formal notice (cites clauses) → director reviews/approves → send.

## 9. Reference artifacts
The scope page (`35443ca8…`); the **reuse target** `design/portal/AgreementTab.tsx` + `lib/portalClient.ts` (the
e-sign primitive); the Properties `xodoEnvelopeId`/`xodoStatus` read-field; the `ai/` kit (for dispute drafting); the
TAC 11-stage + renewal-threshold rules. No prototype — draw from scratch using sibling GM screens + Finance as the
visual reference.

## 10. Recommended design priority
1. **A–B:** the e-signature engine (reuse the primitive) + the compliance register/calendar — the two load-bearing,
   deadline-critical surfaces.
2. **C–D:** contracts store + disputes.
3. **E:** the document library (template engine is cross-cut).

## 11. Out of scope / boundaries
Tax/VAT/invoices → **Finance** · People/HR/spending-authority → **HR** · onboarding/offboarding → **Owners** +
cross-cuts · software register → **Settings** · the document **template engine** is a shared cross-cut (don't build a
Legal-only one). **Blocked:** committing the e-sign rebuild needs the Mauritian e-signature legal-validity opinion.

## 12. Open decisions (propose options, don't guess)
1. **Contract record shape** — one-per-contract (multi-property) or one-per-owner with sub-records? (both co-owned and
   single-owner-multi-property exist.)
2. **Disputes in V1?** — scoped but uncoded; include now or defer.
3. **Reuse vs new** — does Legal/Xodo reuse `AgreementTab`/`portalClient` directly, or get its own envelope component?
   (strong reuse case.)
4. **AML/KYC gate** — does onboarding hard-block on ID-document upload?
5. **TAC tracker home** — inline in Legal, or as a per-property tab in Properties (where the Xodo envelope fields
   already live)?
6. **Recurring Admin calendar** — does Compliance own the deadline calendar or consume a cross-cut surface?
7. **Role matrix** — exactly what manager-tier can do vs director-only within Legal.

## 13. What we want back
The **e-signature engine** (reusing the existing primitive, with the envelope state machine) and the **compliance
register + deadline calendar** (with registry SyncChip + lapse states) first — director desktop; navy/A4 for
signer-facing surfaces — then contracts + disputes. Draw the full vision (the code is a stub); flag the greenfield/
skin/tab-drift clashes per `00-README` §7; propose options on §12.
