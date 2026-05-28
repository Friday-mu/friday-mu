# Ask Friday KB Research Factory

Date: 2026-05-26
Status: research and KB source-matrix operating plan
Anchor: `docs/architecture/ask-friday-master-plan-v02-2026-05-26.md`

## Purpose

Ask Friday KB work should produce source matrices and reviewed context packs, not piles of notes.

Every KB research pass must answer:

- what fact/rule are we trying to encode;
- where it came from;
- who owns it;
- whether it is public, guest-scoped, owner-scoped, staff-only, or restricted;
- whether it expires;
- which surfaces can use it;
- what eval should catch misuse.

## Required Source Matrix Columns

| Column | Meaning |
|---|---|
| `fact_or_rule` | Atomic fact, policy, behavior rule, or operating heuristic. |
| `source` | Repo file, Notion page, FAD table/API, official source, industry source, community signal, Ishant decision. |
| `source_url_or_path` | Link/path, if available. |
| `source_date` | Publication/update date or retrieval date. |
| `source_type` | `friday_truth`, `runtime_data`, `official`, `industry`, `community`, `research`, `ishant_decision`. |
| `trust_tier` | `canonical`, `runtime_source`, `official_source`, `reviewed_industry`, `community_signal`, `assumption`. |
| `owner` | Ishant, Ops, Finance, Legal/Admin, Website, FAD, source-specific owner. |
| `privacy_class` | `public`, `guest_scoped`, `owner_scoped`, `staff_private`, `restricted`. |
| `allowed_surfaces` | Explicit surface IDs or groups. |
| `freshness_rule` | Static, review monthly, review on deploy, live lookup, source-dated answer, expiry date. |
| `candidate_action` | Add, update, reject, needs review, create eval, create ADR. |
| `ishant_review` | `yes`, `no`, `later`, plus why. |

## Trust Tiers

| Trust tier | Meaning | Use |
|---|---|---|
| `canonical` | Already approved Friday truth or deployed runtime policy. | Can enter approved KB/context pack if privacy permits. |
| `runtime_source` | Live FAD/Website/API data. | Use through tools/context, not copied as static truth. |
| `official_source` | Government/regulator/platform official source. | Source-date required; review for interpretation. |
| `reviewed_industry` | Credible industry source or professional reference. | Can inform procedures after review. |
| `community_signal` | Reddit/forums/social/community. | Use to challenge assumptions, never canonical alone. |
| `assumption` | Best current inference. | Must be labeled and reviewed. |

## Privacy Classes

| Class | Examples | Rule |
|---|---|---|
| `public` | public property facts, public brand, public local guide | Can appear on Website/MCP if approved. |
| `guest_scoped` | stay guide, access instructions, guest reservation context | Only for authenticated/stay-scoped guest. |
| `owner_scoped` | owner terms, owner statements, owner communications | Only for that owner or authorized staff. |
| `staff_private` | staff workload, Ops notes, vendor notes, internal teachings | FAD staff only by role. |
| `restricted` | finance, legal, HR/private staff, payment data, secrets | Need-to-know only, reviewed. |

## KB Research Process

1. Pick one surface or KB class.
2. Fill the source matrix.
3. Mark each row with privacy and freshness.
4. Convert only reviewed/canonical rows into draft KB/context candidates.
5. Create eval cases for misuse:
   - wrong audience;
   - stale source;
   - missing uncertainty;
   - direct mutation without approval;
   - private data leakage.
6. Send assumptions and arbitrary choices to Ishant review.
7. Update completion ledger as `scoped` or `KB drafted`, not `runtime wired`.

## Existing Local KBs To Inherit Before New Research

Ask Friday planning must swallow the relevant current KBs before creating new ones. These local KBs are already stronger than generic online research for Friday-specific operations:

| KB/source | Why it matters | Initial surfaces |
|---|---|---|
| `backend/knowledge/global/critical-rules/SKILL.md` | Canonical-source discipline, PII isolation, pricing/refund bounds, commercial-policy deferral, platform/payment discipline. | Inbox, Ops, Reservations, Website, Guest Portal. |
| `backend/knowledge/global/business-config/SKILL.md` | Company identity, fees, cancellation policies, check-in flow, direct-booking payment rules, operational work rules, owner communication. | All staff surfaces; public surfaces only through reviewed public subsets. |
| `backend/knowledge/global/business-config/platform-pricing.md` | Platform pricing posture, Guesty pricing automation, platform response-time and channel differences. | Inbox, Reservations, Owner, Website public-safe subset. |
| `backend/knowledge/global/brand-voice/SKILL.md` | Guest-facing tone, language matching, no fabricated specifics, verify before commitment. | Inbox, Website, Guest Portal, Reservations. |
| `backend/knowledge/surfaces/ops-consult/*` | Ops-specific owner approval, scheduling, service recovery, supplies, vendors, task planning. | Ops, Properties, Owners, Reservations/Calendar. |
| `backend/knowledge/surfaces/inbox-advisory/*` and `backend/knowledge/surfaces/inbox-drafts/*` | Existing mature Inbox harness rules, draft bounds, platform compliance, operational workflows. | Inbox, Reservations, Website handoff. |
| `backend/knowledge/surfaces/pending-actions/operational-rules.md` and `backend/knowledge/operational-rules.json` | Task signal rules, semantic dedup, team-activity suppression, data-context integrity. | Inbox, Ops, Analytics, Internal Agent Bridge. |
| `backend/knowledge/str-practices.json` | Consolidated STR/industry/local practice pack. Use as research input, not automatic canonical truth. | Research factory for Ops, Properties, Reservations, Website, Owner. |

Rule: online/industry/community research challenges and enriches these KBs; it does not override Friday-specific canonical rules without review.

## Research Coverage Requirements

Each module research packet should include these layers when relevant:

| Layer | Include? | Rule |
|---|---|---|
| Friday operating truth | Always | Highest priority when current and reviewed. |
| Runtime data truth | Always when answering facts that change | Use live lookup/context, not static KB. |
| Local Mauritius context | Yes | Use official/source-dated facts for legal/tax/licensing; use local ops observations as candidates. |
| Industry best practice | Yes | Good for process design, eval cases, and operating heuristics. |
| Competitor/market knowledge | Yes for owner, pricing, positioning, and product strategy | Staff/private until Ishant approves public wording; never used for unsupported guarantees. |
| Community signal | Yes for AI architecture and emerging practice | Use to find failure modes and evals; never canonical alone. |
| Statistics/benchmarks | Yes when source quality is credible | Include source date and caveat; do not publish as Friday claims without review. |

This answers the open question from planning: competitor knowledge, industry knowledge, stats, and local context should be included, but each belongs in the matrix with trust tier, privacy class, freshness, and review status.

## First Research Waves

### Wave A: Reservations / Calendar

Goal:

- Build source truth for availability, reservation status, pricing/quote context, inquiry/confirmed semantics, and follow-up rules.

Current packet:

- `docs/architecture/ask-friday-reservations-properties-source-matrix-2026-05-28.md`
  - Use this as the current Wave A source matrix before agent/tool implementation.
  - It confirms availability/rates are live/source-dated facts, FAD calendar blocks are FAD-local today, and Guesty/OTA-impacting writes require a separate approval-routed tool contract.
- `docs/architecture/ask-friday-reservation-property-tool-contracts-2026-05-28.md`
  - Use this as the current Wave A contract draft for read-only reservation/calendar context and approval-routed reservation actions.

Initial source matrix:

| fact_or_rule | source | source_type | trust_tier | privacy_class | allowed_surfaces | freshness_rule | candidate_action | ishant_review |
|---|---|---|---|---|---|---|---|---|
| Reservation status must distinguish inquiry/unconfirmed from confirmed for visibility and Ops planning. | FAD calendar behavior and prior PR evidence | friday_truth | canonical | staff_private | `fad_ops_assistant`, `fad_consult`, reservations/calendar | review on reservation API changes | add eval | no |
| Null Guesty status should not be treated as confirmed. | PR #8/live coordination evidence | friday_truth | canonical | staff_private | FAD staff surfaces | review on Guesty schema change | add eval | no |
| Availability and rates should be read from current runtime source, not memorized into static KB. | PMS/channel-manager industry pattern | industry | reviewed_industry | public/staff split | public surfaces via tools; staff surfaces via FAD | live lookup | create harness rule | no |
| Pricing/quote answers need timestamp/source/expiry. | Revenue/channel management best practice | industry | reviewed_industry | public or staff depending quote | reservations, Website guest, owner only if approved | live lookup or expiry window | needs Ishant quote policy | yes |
| Booking/payment/change operations should create approval-routed action requests in V1. | Ask Friday Core policy + agent safety research | friday_truth | canonical | varies | all write-capable surfaces | static until ADR changes | ADR/action policy | no |
| Platform pricing and calendar are automated through Guesty; price answers must not infer rates when canonical pricing tables are missing. | `backend/knowledge/global/business-config/platform-pricing.md` and critical rules | friday_truth | canonical | staff_private/public-safe split | Inbox, reservations, Website if tool-backed | review on pricing integration change | add harness rule | no |
| Payment confirmation requires actual funds received, not screenshots/proof of transfer initiation. | `backend/knowledge/global/business-config/SKILL.md` | friday_truth | canonical | staff_private | reservations, inbox, owner/finance as scoped | static until policy changes | add eval | no |

Useful sources:

- EHL hospitality revenue management: https://hospitalityinsights.ehl.edu/hotel-revenue-management-myths
- PriceLabs revenue management guide: https://hello.pricelabs.co/blog/hotel-room-revenue-management/
- HotelTechReport PMS guide: https://ucarecdn.com/9fc61296-f823-4c52-96f1-96b4d88fc092/2021PMSGuideWebRezProFINAL.pdf

Open questions:

- Quote validity period.
- Which rate fields can be shown publicly.
- Who can approve price overrides, discounts, booking changes, and payment-sensitive actions.

### Wave B: Properties

Goal:

- Split public property facts from private ops/owner/security facts and assign freshness owners.

Current packet:

- `docs/architecture/ask-friday-reservations-properties-source-matrix-2026-05-28.md`
  - Use this as the current Wave B source matrix before property context-pack implementation.
  - It confirms Guesty listing cache plus FAD overlays are the read model, `fad_property_cards` is a future AI knowledge surface, and public/private/stay-scoped/staff/restricted classification still needs Ishant review.
- `docs/architecture/ask-friday-reservation-property-tool-contracts-2026-05-28.md`
  - Use this as the current Wave B contract draft for role/surface-aware property context loading.

Initial source matrix:

| fact_or_rule | source | source_type | trust_tier | privacy_class | allowed_surfaces | freshness_rule | candidate_action | ishant_review |
|---|---|---|---|---|---|---|---|---|
| Public property facts include name, area, public amenities, bedroom/bathroom counts, public description, and public policies. | Website/listing data | runtime_data | runtime_source | public | Website guest, public MCP, staff | review on listing update | source matrix | later |
| Access codes, internal ops notes, owner terms, maintenance issues, vendor notes, and staff workload are not public facts. | Ask Friday privacy rules | friday_truth | canonical | staff_private/restricted | staff surfaces only by role | static until policy ADR changes | add eval | no |
| Property fact conflicts should create candidates, not automatic canonical updates. | Ask Friday learning-loop policy | friday_truth | canonical | varies | Core review | static | add candidate rule | no |
| Property metadata needs source owner and freshness. | data quality best practice | industry | reviewed_industry | varies | all property surfaces by class | review monthly or on source change | KB rule | yes |
| Property capabilities, addresses, fixtures, amenities, pricing facts, and operational constraints must come from canonical sources; otherwise defer/ask rather than invent. | `backend/knowledge/global/critical-rules/SKILL.md` | friday_truth | canonical | varies | all property-aware surfaces by class | static until critical rules change | add eval | no |
| Guest PII from another thread must never cross into a guest answer; only de-identified property-level operational signal may be used. | `backend/knowledge/global/critical-rules/SKILL.md` | friday_truth | canonical | guest_scoped/staff_private | Inbox, Guest Portal, Properties | static until privacy ADR changes | add privacy eval | no |

Useful sources:

- Tourism Authority accommodation categories and licensing: https://www.tourismauthority.mu/tourist-accommodation-certificate/guidelines-policies/
- Tourism Authority tourist residence guidelines: https://www.tourismauthority.mu/wp-content/uploads/2023/04/Guidelines-Tourist-Residence-24.02.2022.pdf

Open questions:

- Who owns final public property corrections.
- Which private property facts can be guest/stay-scoped.
- Retention of issue history and complaint clusters.

### Wave C: Website Public Guest / FAB

Goal:

- Public answer quality without private leakage or broken handoff.

Initial source matrix:

| fact_or_rule | source | source_type | trust_tier | privacy_class | allowed_surfaces | freshness_rule | candidate_action | ishant_review |
|---|---|---|---|---|---|---|---|---|
| Public Website surfaces consume published public context packs only. | Ask Friday Core plan | friday_truth | canonical | public | Website guest/FAB, public MCP | static until ADR changes | add eval | no |
| Chatbot handoff should transfer context and avoid making the user repeat details. | customer-service handoff research | industry | reviewed_industry | public/guest | Website, Inbox | review yearly | harness rule | no |
| Public assistant should escalate urgency, complexity, user preference, and repeated misunderstanding. | customer-service handoff research | industry | reviewed_industry | public/guest | Website, guest portal | review yearly | eval cases | no |
| Local Mauritius claims must be source-dated when specific or regulatory. | official-source policy | friday_truth | canonical | public/staff split | Website public if public-safe | source-dated | add KB rule | no |
| Website/public surfaces must consume public context packs and FAD-owned public APIs for shared vendor data instead of direct private vendor integrations. | FAD ADR and repo rules | friday_truth | canonical | public/staff split | Website, public MCP | review on integration ADR change | architecture note | no |

Useful sources:

- TechTarget chatbot handoff best practices: https://www.techtarget.com/searchcustomerexperience/tip/Best-practices-for-initiating-chatbot-to-human-handoff
- EHL AI in hospitality overview: https://research.ehl.edu/hubfs/EHL-RESEARCH/Artificial-Intelligence-in-Hospitality-Transforming-Service-Experience-and-Efficiency.pdf
- Mauritius Tourism Authority: https://www.tourismauthority.mu/

Open questions:

- Public personalization consent and authenticated memory policy.
- Which competitor/market claims are allowed in owner/public flows.

### Wave D: Owner Enquiry

Goal:

- Support owner lead qualification and Friday positioning without unsupported guarantees.

Initial source matrix:

| fact_or_rule | source | source_type | trust_tier | privacy_class | allowed_surfaces | freshness_rule | candidate_action | ishant_review |
|---|---|---|---|---|---|---|---|---|
| Owner assistant can qualify property, goals, pain points, and follow-up details. | Ask Friday product direction | friday_truth | canonical | public/owner_scoped | owner enquiry, FAD owner staff | review on owner offer changes | KB/harness rule | no |
| Commercial/legal/finance claims require approved source and should be escalated when uncertain. | Ask Friday risk policy | friday_truth | canonical | owner/staff/restricted | owner enquiry, finance/legal staff | source-dated | add eval | yes |
| Competitor/market context can inform positioning but is not canonical Friday truth. | research doctrine | friday_truth | canonical | staff_private/public-safe subset | owner surfaces after review | review monthly/quarterly | source matrix | yes |
| Pricing and listings are Friday decisions and do not require owner approval; owner communication should remain minimal and essential. | `backend/knowledge/global/business-config/SKILL.md` and `backend/knowledge/ops-knowledge.json` | friday_truth | canonical | owner_scoped/staff_private | owner enquiry public-safe subset; FAD owners staff | review when owner terms change | KB rule | yes |

Open questions:

- Exact owner package wording.
- Competitor comparison policy.
- What owner financial examples can be public.

### Wave E: Feedback

Goal:

- Convert feedback into useful bugs/product candidates with safe evidence retention.

Initial source matrix:

| fact_or_rule | source | source_type | trust_tier | privacy_class | allowed_surfaces | freshness_rule | candidate_action | ishant_review |
|---|---|---|---|---|---|---|---|---|
| Feedback should capture route, version, viewport, reproduction steps, expected vs actual behavior, and screenshot/diagnostic evidence when available. | product triage practice | industry | reviewed_industry | public/staff split | feedback, internal agent bridge | review on feedback UX changes | harness rule | no |
| Screenshots and diagnostics need bounded retention and privacy review. | privacy/security policy | friday_truth | canonical | can be restricted | feedback, Core review | retention policy | needs ADR | yes |
| Feature requests become candidates, not commitments. | Ask Friday learning policy | friday_truth | canonical | public/staff | feedback, product review | static | add eval | no |
| Feedback screenshots and diagnostics are evidence refs, not KB content; they need redaction status, privacy class, expiry, and restricted storage refs. | Ask Friday evidence contract | friday_truth | canonical | can be restricted | feedback, Core review, internal agent bridge | retention policy | ADR/eval | yes |

Open questions:

- Screenshot retention period.
- What diagnostic metadata can be collected by default.

### Wave F: Mauritius / Compliance / Local Context

Goal:

- Give Ask Friday source-dated local context without creating unreviewed legal/tax advice.

Initial source matrix:

| fact_or_rule | source | source_type | trust_tier | privacy_class | allowed_surfaces | freshness_rule | candidate_action | ishant_review |
|---|---|---|---|---|---|---|---|---|
| Mauritius Tourism Authority licenses and regulates tourist accommodations; categories include hotel, guest house, tourist residence, and domaine. | Tourism Authority | official | official_source | public | public owner/guest if worded generally; legal/admin | source-dated review monthly | KB candidate | yes |
| Tourist Accommodation Certificate validity/renewal details should be source-dated and not treated as legal advice without review. | Tourism Authority | official | official_source | public/staff | owner, legal/admin | source-dated | legal/admin KB | yes |
| MRA tourist fee is 3 EUR per tourist per night from 2025-10-01 for eligible tourist accommodations, age 12+ with exceptions. | MRA e-services/notice | official | official_source | public/restricted depending use | finance/legal/admin; public only if approved | source-dated review monthly | finance/legal KB | yes |
| Mauritius Data Protection Act governs personal data processing; Ask Friday privacy policy should be reviewed against it before durable personalization. | Mauritius privacy/legal sources | official | official_source | restricted | legal/admin, Core policy | source-dated | legal review | yes |

Useful sources:

- Tourism Authority Tourist Accommodation Certificate: https://www.tourismauthority.mu/tourist-accommodation-certificate/guidelines-policies/
- Tourism Authority guidelines for Tourist Residence: https://www.tourismauthority.mu/wp-content/uploads/2023/04/Guidelines-Tourist-Residence-24.02.2022.pdf
- MRA tourist fee e-services note: https://www.mra.mu/eservices1/individual/11-e-services
- MRA VAT: https://www.mra.mu/mvat

Rule:

- Treat local legal/tax/regulatory facts as source-dated candidates until reviewed. Do not publish them as legal advice.

## Community Signal Handling

Community research is useful for:

- identifying failure modes;
- challenging architecture assumptions;
- seeing current builder practice;
- generating eval cases.

Community research is not enough for:

- legal/tax truth;
- Friday policy;
- owner commercial claims;
- guest-sensitive rules;
- staff/HR/finance truth.

Examples from current signal:

- Customers hate repeating themselves after AI handoff.
- AI support often fails in the "messy middle" where context and actions matter.
- Channel/PMS availability mismatches are common operational failure modes.
- STR turnover quality often fails on small repeat defects and non-standard tasks.

Use these to create eval cases and review prompts, not canonical KB rows.

## Output Template For Future Research Packets

```md
# Ask Friday KB Research Packet: <topic>

Date:
Surface(s):
Researcher:
Status: draft | reviewed | superseded

## Executive Takeaways

## Source Matrix

| fact_or_rule | source | source_url_or_path | source_date | source_type | trust_tier | owner | privacy_class | allowed_surfaces | freshness_rule | candidate_action | ishant_review |
|---|---|---|---|---|---|---|---|---|---|---|---|

## Contradictions / Conflicts

## Eval Cases To Add

## Candidate KB Rows

## Needs Ishant Review
```
