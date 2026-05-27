# Ask Friday Surface Subplans

Date: 2026-05-26
Status: execution subplans, not implementation proof
Anchor: `docs/architecture/ask-friday-master-plan-v02-2026-05-26.md`
Branch: `codex/ask-friday-autonomous-core-20260526`
PR: `https://github.com/Friday-mu/friday-mu/pull/9`

## Purpose

This document turns the broad Ask Friday surface list into executable surface subplans.

Rule: a surface is not ready because it appears here. A surface is ready only when the completion ledger marks its KB, harness, Core wiring, tests, deployment, and team usefulness.

## Execution Order

1. Inbox / Friday Consult and Ops / Friday Consult production readiness.
2. FAD global Ask Friday staff command surface.
3. Reservations/calendar.
4. Properties.
5. Website guest hero and public FAB.
6. Owner enquiry and FAD owners assistant.
7. Feedback.
8. Guest portal.
9. HR/training and analytics/intelligence.
10. Finance and legal/admin.
11. Public MCP.
12. Internal agent bridge.

Reasoning:

- Inbox and Ops are active production staff surfaces.
- Reservations/calendar and properties are upstream truth for Ops, Inbox, guest, owner, and public surfaces.
- Website should consume clean public/private context boundaries, not invent them.
- Finance/legal/HR require stricter access and review before runtime use.

## Surface Readiness Standard

Every surface must have:

- mission and non-goals;
- current runtime state;
- source-of-truth matrix;
- public/private/staff/restricted knowledge split;
- privacy class and identity policy;
- allowed tools/actions;
- memory/session policy;
- handoff/escalation policy;
- learning signals;
- eval suite;
- failure and rollback path;
- Ishant-review assumptions;
- first implementation slice.

## Runtime Truths Already Verified In FAD

These are current repo/runtime constraints, not future design wishes:

- FAD is the single source of truth for shared external integrations such as Guesty, Breezeway, Resend, Kimi, and future overlapping vendors. Website should call FAD-owned public APIs/context packs instead of building a second integration brain.
- Guesty and Breezeway remain upstream systems of record during the current phase. Ask Friday reads from FAD wrappers/caches and creates approval-routed requests before write-through behavior.
- Current guest-facing KBs already enforce canonical-source discipline: property cards, pricing tables, team availability, current conversation, and approved policies are the allowed fact sources.
- Current critical rules block guest PII crossing threads and block unsupported pricing, refunds, commercial-policy commitments, and booking/payment commitments.
- Ops already has real owner-approval and service-recovery thresholds in `backend/knowledge/surfaces/ops-consult/owner-terms-approval-rules.md`.
- Inbox/Consult already has durable session storage, compact fallback, session summaries, and learning-event emission. The new Core work should wrap and strengthen this, not replace it.

## Absorbed Module Surfaces

Not every FAD module should become a separate agent immediately. Until a module has enough unique tools, KB, risk, or workflow volume, it is absorbed by an existing Ask Friday surface:

| Module or domain | V1 handling |
|---|---|
| Reviews | Absorb into Inbox / Friday Consult and Analytics until review-response and reputation workflows need a dedicated surface. |
| Guests | Absorb into Inbox, Reservations/Calendar, and Guest Portal by identity scope. |
| Marketing and Leads | Absorb into Owner Enquiry, Website Public, and Analytics until campaign workflows need a dedicated surface. |
| Design / Interior | Absorb into Properties and Owners unless project-specific Design workflows need their own restricted assistant. |
| Notifications | Harness layer, not a separate agent in V1. |
| Settings | Admin/config surface, not an AI agent unless Ask Friday is helping configure policies. |
| Syndic | Treat as restricted/staff-private under Legal/Admin or Owners until scope is separated. |

Rule: absorbed modules still need KB/privacy/eval coverage when their facts are used. They just do not get independent runtime personas in V1.

## FAD Global Ask Friday Staff Command Surface

Status: registry active as `fad_global_ask_friday`; harness still young.

Mission:

- Give staff one command surface that can route across FAD modules, answer with live context, and create approval-routed actions without forcing staff to know which module owns the data.

Non-goals:

- Do not bypass module-specific tools, approval rules, or privacy boundaries.
- Do not become a flat prompt stuffed with every private KB.
- Do not mutate high-risk systems without a click/approval gate.

Source truth:

- FAD live context.
- Focused Inbox thread when requested.
- Ops tasks, reservations, properties, reviews, HR, design projects, and analytics only through registered scopes/tools.
- Published Core context packs.

Harness:

- Route intent to the smallest required module/surface.
- Load focused context, not all FAD context.
- Call action gateway only for allowlisted module actions.
- Require staff click for actions and explicit approval for high-risk actions.

Learning loop:

- Failed routes.
- Missing module context.
- Repeated staff commands.
- Action-gateway failures.
- Cross-module questions that should become specialist subplans.

Evals:

- Correctly routes Inbox, Ops, Reservations, Properties, Owners, and Analytics requests.
- Does not reveal restricted module data without role/scope.
- Does not mutate without staff approval.
- Provides source/status caveats when data is stale or unavailable.

Acceptance criteria:

- Staff can ask broad operational questions and get a routed answer or draft action without losing module ownership.

First implementation slice:

- Keep read/routing/action-gateway behavior behind existing role gates; add eval coverage before expanding tools.

Ishant review:

- Which modules can be invoked from the global surface in V1.
- Which actions require Ishant approval vs module lead approval.

## Inbox / Friday Consult

Status: active production-critical FAD surface, Plan 1 priority.

Mission:

- Help staff draft better guest replies, reason through conversation context, surface task candidates, and preserve teaching/action-feedback loops.

Non-goals:

- Do not replace the existing mature Inbox harness.
- Do not send messages automatically.
- Do not expose staff Consult history or teachings to public Website/MCP contexts.

Source truth:

- Inbox conversation/thread records.
- Reservation and property context.
- Dynamic teachings.
- Action feedback and pending action history.
- Website handoff/takeover events.
- Existing runtime KBs under `backend/knowledge/surfaces/inbox-*`.

Harness:

- Existing Inbox harness remains dominant.
- Ask Friday Core wraps behind the scenes for events, evidence, candidates, evals, and mining.
- Preserve stale-draft validation and latest-message checks.
- Preserve full-context to compact-context fallback.

Learning loop:

- Staff corrections.
- Regenerate reasons.
- Accepted/rejected drafts.
- Explicit teachings.
- Repeated missing-knowledge questions.
- Task/action candidates.

Evals:

- Latest guest turn is respected.
- Draft does not answer stale thread state.
- Property/reservation facts are grounded.
- Teaching/action feedback remains included.
- No private staff notes leak to public surfaces.
- Handoff/takeover state is preserved.

Acceptance criteria:

- Staff can use Consult without workflow regression.
- Draft quality improves or at least remains stable.
- Core events are emitted without changing user-facing behavior.

First implementation slice:

- PR #9 Plan 1 deploy/smoke, then live mining design against recent Inbox Consult conversations.

Ishant review:

- Final staff session visibility matrix.
- Which teachings can become canonical rules and who approves after Ishant.

## Ops / Friday Consult

Status: active FAD surface with strong KB and young harness, Plan 1 priority.

Mission:

- Help Franny and ops staff plan tasks, rosters, schedules, maintenance, owner-approval flows, and operational follow-through.

Non-goals:

- Do not silently apply high-risk schedule/task/owner/vendor changes.
- Do not schedule non-urgent occupied-property work unless the guest requested it or it is urgent and cannot wait.
- Do not expose staff workload, locations, or private property ops notes publicly.

Source truth:

- FAD tasks and schedules.
- Reservation/cache data and calendar overlays.
- Staff roster/availability.
- Ops Consult KB under `backend/knowledge/surfaces/ops-consult/*`.
- Property ops metadata.
- Breezeway/import history where available.
- Vendor/owner approval rules.

Harness:

- Draft-first schedule/roster/task action model.
- Reversible draft/apply/clear/undo behavior.
- Server-side action parsing for allowlisted `[OPS_ACTION]` families.
- Occupancy, assignment, lunch, travel, staff skill, and owner-approval constraints.
- Availability/pricing awareness through reservations/properties/calendar sources.

Learning loop:

- Scheduling conflicts.
- Task duration corrections.
- Staff reassignment patterns.
- Owner-charge/vendor decision corrections.
- Repeated missing property ops facts.

Evals:

- Daily schedule with occupied property and checkout window.
- Weekly schedule with checkout/arrival pressure.
- Roster with lunch and head-office coverage.
- Urgent guest issue during occupancy allowed with explanation.
- Non-urgent work during occupancy deferred.
- Generated plan cannot silently leave tasks unassigned.

Acceptance criteria:

- Franny can produce a useful daily/weekly/monthly schedule and roster.
- Staff can inspect and edit before applying.
- Risky operations remain approval-gated.

First implementation slice:

- PR #9 Plan 1 deploy/smoke, then live Ops scenario QA.

Ishant review:

- Staff fairness policy beyond current defaults.
- Exact tolerated exceptions for occupied-property work.
- Final owner-charge approval thresholds.

## Reservations / Calendar

Status: scoped, not built as an agent.

Mission:

- Give Ask Friday surfaces reliable reservation, availability, quote, and calendar conflict truth.

Non-goals:

- Do not directly confirm bookings, change prices, take payments, or override channel/PMS truth without approval.
- Do not expose guest PII beyond the authorized surface.

Source truth:

- Guesty and FAD reservation/cache data through FAD-owned wrappers.
- Calendar overlays.
- Pricing/rate sources.
- Payment-proof and inquiry/confirmed semantics.
- Channel manager/PMS state where available.
- Manual FAD overrides with provenance.

Knowledge scopes:

- Reservation identity and status.
- Check-in/check-out dates and times.
- Guest count and stay constraints.
- Availability and blocked dates.
- Quote/rate context and expiry.
- Inquiry, unconfirmed, confirmed, cancelled, payment-proof states.
- Follow-up cadence.

Harness:

- Read/ground availability and quote context.
- Draft follow-up or quote explanation.
- Create action requests for booking/change/payment-sensitive work.
- Never mutate a booking directly in V1.
- Treat availability/rates as live lookup or source-dated context, not memorized static KB.

Learning loop:

- Availability mismatch.
- Quote mismatch.
- Follow-up conversion outcome.
- Repeated guest confusion about confirmation/payment.
- Null/ambiguous status handling.

Evals:

- Null Guesty status maps to inquiry/unconfirmed behavior.
- Confirmed reservations remain visible and protected.
- Availability answer cites freshness/source.
- Price answer avoids unsupported guarantees.
- Booking/payment action becomes approval request.

Acceptance criteria:

- Ops and Inbox can rely on reservation/calendar context for schedule and draft decisions.
- Guest/public surfaces can answer only public-safe availability/quote guidance.

First implementation slice:

- Create source-of-truth matrix and eval cases before runtime agent work.

Ishant review:

- Quote validity/expiry policy.
- Which price/availability fields may be shown publicly.
- Who approves booking/payment-sensitive actions.

## Properties

Status: scoped, not built as an agent.

Mission:

- Maintain property truth and provide public-safe and staff-only property context to Ask Friday surfaces.

Non-goals:

- Do not let public surfaces see private owner terms, staff notes, access codes, exact sensitive coordinates, security details, or private issue history.
- Do not let unreviewed guest complaints rewrite canonical property facts.

Source truth:

- Website public property pages.
- Guesty/listing data.
- FAD property overlays.
- Ops property metadata.
- Owner terms and property exceptions.
- Maintenance/issue history.
- Staff-reviewed corrections.

Knowledge split:

- Public: name, area, public amenities, bedrooms/bathrooms, public description, public photos, public policies.
- Guest/stay-scoped: check-in guide, access instructions, stay rules, property-specific guest help.
- Staff-only: access codes, internal ops notes, owner terms, maintenance issues, cleaning classifications, vendor details.
- Restricted: owner financial terms, legal disputes, sensitive security information.

Harness:

- Public surfaces consume public property facts only.
- Staff surfaces can load staff/private property context by role.
- Property fact conflicts create candidates, not automatic rewrites.

Learning loop:

- Repeated missing amenities.
- Guest complaint clusters.
- Staff correction of property facts.
- Ops metadata gaps.
- Public/private conflict warnings.

Evals:

- Public response does not reveal staff-only fields.
- Staff response can use authorized private property context.
- Conflicting fact creates candidate/review path.
- Freshness/last-reviewed date is visible for time-sensitive property data.

Acceptance criteria:

- Website and FAD can both ask for property truth without using one flat unsafe context.

First implementation slice:

- Build property public/private source matrix and freshness rules.

Ishant review:

- Which property facts are public, guest-scoped, staff-only, or restricted.
- Who owns approval of property fact corrections.

## Website Guest Hero And Ask Friday FAB

Status: scoped; Website Core integration not wired in this FAD branch.

Mission:

- Help public visitors discover Friday stays, experiences, local context, and next steps while handing off cleanly when human judgment is needed.

Non-goals:

- Do not read staff/private FAD knowledge.
- Do not claim live price/availability unless backed by current source.
- Do not continue AI replies after takeover.
- Do not create direct booking/payment mutations in V1.

Source truth:

- Website public content.
- Public property facts.
- Public experience/local guide.
- Guest booking rules.
- Published public context packs.
- Approved public Mauritius/local context.

Harness:

- Intent route: guest stay, owner, feedback, handoff, unsupported.
- Read public catalog/availability tools.
- Emit compact redacted learning events.
- Consume only published context packs.
- Stop after `human_takeover` or `aiMayReply:false`.

Learning loop:

- Unanswered public questions.
- Failed property discovery.
- Low-confidence local guidance.
- Repeated handoff reasons.
- Abandoned booking path.

Evals:

- No staff/private leakage.
- Honest uncertainty for price/availability.
- Handoff context transfer works.
- Public context-pack version is respected.
- Owner/feedback intents route correctly.

Acceptance criteria:

- Public visitor gets useful answers without compromising staff/private data or takeover contracts.

First implementation slice:

- Website event emitter and context-pack consumption in a separate Website worktree after Plan 1 is stable.

Ishant review:

- Public personalization/consent policy.
- Local/competitor context boundaries for public guest answers.

## Owner Enquiry

Status: scoped; public owner skeleton only.

Mission:

- Help owner/operator leads understand Friday's service model and collect enough structured context for a good follow-up.

Non-goals:

- Do not make unsupported commercial/legal/finance guarantees.
- Do not expose private owner terms from another owner.
- Do not browse public web unless separately approved.

Source truth:

- Approved owner package/service docs.
- FridayOS product positioning.
- Public case studies/testimonials if approved.
- Internal owner terms only when authorized and scoped.
- Competitor/market context as positioning input, not canonical truth.

Harness:

- Qualify property/owner need.
- Answer public-safe service questions.
- Draft follow-up/action request.
- Escalate legal/finance-specific questions.

Learning loop:

- Repeated objections.
- Package confusion.
- Missing commercial terms.
- Conversion/drop-off signal.

Evals:

- Avoids unsupported guarantees.
- Captures owner lead details.
- Escalates legal/finance claims.
- Uses competitor context only as public-safe positioning.

Acceptance criteria:

- Owner lead leaves clearer, and staff receives a useful capsule.

First implementation slice:

- Owner KB source matrix and objection/eval set.

Ishant review:

- Exact owner package/commercial claims.
- Competitor positioning boundaries.

## FAD Owners Assistant

Status: registry planned as `fad_owners_assistant`; separate from public owner enquiry.

Mission:

- Help authorized staff handle owner communications, owner terms, owner statement context, owner property context, and owner action requests.

Non-goals:

- Do not expose one owner's private data to another owner.
- Do not create owner-facing legal/finance/commercial commitments without approval.
- Do not let public owner enquiry access restricted owner records.

Source truth:

- Owner records.
- Owner/property mapping.
- Owner terms and property exceptions.
- Owner statement rules.
- Approved public owner overview.
- Finance/legal context only through restricted tools and role gates.

Harness:

- Owner-scoped retrieval.
- Draft owner reply/action request.
- Approval required for external owner outputs.
- Cross-owner memory forbidden.

Learning loop:

- Repeated owner objections.
- Owner terms conflicts.
- Owner approval delays.
- Statement/dispute patterns.

Evals:

- Cross-owner data isolation.
- Owner commitment safety.
- Finance/privacy boundaries.
- Escalation for legal or finance uncertainty.

Acceptance criteria:

- Staff can draft owner communications with evidence and approval gates, without leaking other owner or finance context.

First implementation slice:

- Owner source matrix and cross-owner isolation evals.

Ishant review:

- Which owner terms are staff-only vs owner-visible.
- Who approves owner-facing messages by class.

## Feedback

Status: scoped; existing feedback surfaces not wired to Core in this branch.

Mission:

- Turn user/team feedback into clear bug reports, feature candidates, and product learning signals.

Non-goals:

- Do not expose screenshots/private diagnostics broadly.
- Do not auto-create canonical product decisions.
- Do not collect more personal data than required.

Source truth:

- Current URL/route.
- Viewport/device.
- Deploy SHA/version.
- Screenshot if consented/attached.
- Console/network diagnostics where available.
- User narrative.

Harness:

- Bug vs feature vs confusion routing.
- Capture reproduction steps.
- Attach bounded evidence.
- Create issue/product candidate.
- Handoff when account/guest/private data appears.

Learning loop:

- Repeated UI bug clusters.
- Missing diagnostics.
- Confusing flows.
- Feature request clusters.

Evals:

- Repro steps captured.
- Screenshot/diagnostic privacy respected.
- Feature request does not become a commitment.
- Sensitive/private details are redacted before learning event.

Acceptance criteria:

- Team receives actionable feedback capsules with enough context to reproduce or triage.

First implementation slice:

- Feedback event schema and retention/privacy rules.

Ishant review:

- Screenshot retention.
- Public/team tester consent wording.

## Guest Portal Ask Friday

Status: later; not built.

Mission:

- Help authenticated/stay-token guests during the stay lifecycle.

Non-goals:

- Do not expose another guest's data.
- Do not reveal staff/private ops workload.
- Do not bypass human escalation for urgent/safety issues.

Source truth:

- Stay token/session.
- Reservation.
- Property guide.
- Guest guidebook.
- Access windows.
- House rules.
- Public Mauritius/local context.

Harness:

- Stay-scoped memory.
- Urgent/safety escalation.
- Handoff to staff.
- Request/help ticket action requests.

Learning loop:

- Repeated in-stay questions.
- Missing property guide items.
- Urgent issue categories.
- Handoff outcomes.

Evals:

- Stay scope isolation.
- Access instructions only shown to authorized stay identity.
- Urgent issue escalation.

First implementation slice:

- Guest portal privacy/session policy and source matrix.

Ishant review:

- Authenticated personalization and consent terms.

## HR / Training

Status: partial SOP direction only.

Mission:

- Help staff find SOPs, onboard, train, and apply role-specific guidance.

Non-goals:

- Do not expose private HR/performance notes broadly.
- Do not make disciplinary decisions.

Source truth:

- SOPs.
- Role definitions.
- Training checklists.
- Approved quality standards.
- Manager-reviewed feedback.

Harness:

- Staff role-scoped retrieval.
- Training task/candidate drafting.
- Escalate HR-sensitive cases.

Learning loop:

- Repeated SOP questions.
- Training confusion.
- Quality feedback clusters.

Evals:

- Role-scoped answer.
- No private HR leak.
- SOP source cited.

First implementation slice:

- SOP profile catalog and privacy split.

Ishant review:

- Staff visibility and HR-private boundaries.

## Analytics / Intelligence

Status: later; depends on event volume.

Mission:

- Help Ishant and staff understand aggregate operational, learning, eval, and product trends.

Non-goals:

- Do not expose PII by default.
- Do not make performance judgments from thin data.

Source truth:

- Aggregate Core events.
- Eval runs.
- Candidate queues.
- FAD operational metrics.
- Product feedback clusters.

Harness:

- Aggregate preferred.
- Drill-down requires role and privacy gates.
- Reports are candidates unless reviewed.

Learning loop:

- Trend detection.
- Failure clusters.
- Eval regressions.

Evals:

- Aggregate-only default.
- No private data in broad dashboards.
- Trace links require authorization.

First implementation slice:

- Reporting schema after Core events exist in volume.

Ishant review:

- Who can see what analytics.

## Finance

Status: design-only until access/redaction rules are locked.

Mission:

- Support owner statements, categorization, VAT/tax workflows, and workpaper preparation without leaking restricted data.

Non-goals:

- Do not provide public finance/legal advice.
- Do not expose owner-private statements across owners.
- Do not mutate accounting/payment data without explicit approval.

Source truth:

- Finance workpapers.
- Owner statements.
- Chart of accounts.
- MRA/VAT/tourist fee official sources.
- Internal reviewed policy.

Harness:

- Restricted need-to-know access.
- Draft-only outputs.
- Evidence citations.
- Human approval for changes.

Learning loop:

- Categorization corrections.
- Missing evidence.
- Statement adjustment reasons.

Evals:

- Owner data isolation.
- No public leakage.
- Source-dated tax/VAT answers.
- Approval required for mutations.

First implementation slice:

- Restricted KB boundary and source-date matrix.

Ishant review:

- Access roles.
- Retention rules.
- Finance source-of-truth owner.

## Legal / Admin

Status: design-only until legal/admin source and review rules are locked.

Mission:

- Support contracts, filings, licenses, compliance reminders, and controlled document drafting.

Non-goals:

- Do not give unreviewed legal advice.
- Do not submit filings automatically.
- Do not expose restricted documents broadly.

Source truth:

- Approved templates.
- Official Tourism Authority / MRA / regulator sources.
- Internal contracts and filings.
- Review status and expiry dates.

Harness:

- Source-dated retrieval.
- Draft-only document generation.
- Human review for legal/admin actions.

Learning loop:

- Repeated clause questions.
- Missing document evidence.
- Deadline gaps.

Evals:

- Source date shown.
- Legal uncertainty escalated.
- Restricted docs not exposed.

First implementation slice:

- Compliance/source inventory.

Ishant review:

- What can be answered vs drafted vs escalated.

## Public MCP

Status: scoped; not built.

Mission:

- Let external agents discover approved public Friday truth and submit safe requests.

Non-goals:

- No direct booking/payment/ops mutation.
- No staff/private reads.
- No durable public-agent memory in V1.

Source truth:

- Published public context packs.
- Website public catalog/tools.
- Public action-request schema.

Harness:

- MCP auth/scope policy.
- Read/discovery tools.
- Approval-routed action requests.
- Audit every request.

Learning loop:

- Missing public facts.
- Tool failures.
- Bad schema requests.
- Repeated external-agent needs.

Evals:

- Public-only context.
- Direct write blocked.
- Action request created with audit.
- Prompt injection/tool misuse attempts fail.

First implementation slice:

- Public MCP action/read schema after Website public context packs are stable.

Ishant review:

- Public MCP write/request scope.

## Internal Agent Bridge

Status: scoped; prompt direction only.

Mission:

- Let Codex, Claude, Judith, and future internal agents contribute sanitized summaries, decisions, eval cases, and KB candidates.

Non-goals:

- Do not ingest raw private transcripts or secrets by default.
- Do not let agents write canonical truth.
- Do not create circular self-improvement without review.

Source truth:

- Repo commits.
- PRs.
- Notion pages.
- Handover docs.
- Sanitized session summaries.

Harness:

- Submit candidate summary.
- Include provenance, privacy class, and evidence refs.
- Review before canonical knowledge.

Learning loop:

- Accepted fixes.
- Repeated implementation failures.
- New runbooks.
- Cross-repo contract decisions.

Evals:

- No raw secret/private data.
- Candidate has provenance.
- Canonical write blocked.

First implementation slice:

- Internal candidate submission contract.

Ishant review:

- Which internal agent sources are trusted enough for candidate creation.
