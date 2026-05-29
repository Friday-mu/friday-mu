# Ask Friday Completion Ledger

Date: 2026-05-26
Last reconciled: 2026-05-29
Status: recovery ledger and execution plan
Current continuation branch: `codex/ask-friday-plan2-20260529`

## Purpose

This ledger exists to prevent a repeat of the compaction failure where scoped/planned work was treated as completed work.

Primary recovery manifest: `docs/architecture/ask-friday-core-manifest-2026-05-26.md`.

Use this file after every compaction, handover, interruption, or parallel-session merge. A surface is not "done" unless it has explicit status across plan, knowledge, harness, wiring, verification, deployment, and team usefulness.

## Naming

- Assistant/intelligence layer: Ask Friday.
- Runtime/control plane: Ask Friday Core.
- Whole platform/product: FridayOS.
- Retired/wrong assistant label: do not use it in UI, docs, public/product wording, branch names, prompts, or handovers.
- FAD module mode alias: Friday Consult, under Ask Friday.

## Completion States

| State | Meaning |
|---|---|
| `not started` | No meaningful artifact exists. |
| `scoped` | Mission/profile/contracts are described, but not usable. |
| `KB drafted` | Knowledge files/docs exist, but may not be wired. |
| `harness drafted` | Session/action/tool/memory behavior is specified, but may not run. |
| `runtime wired` | Code loads the KB/harness and emits/consumes Core artifacts. |
| `tested` | Automated and/or workflow tests cover the intended behavior. |
| `pushed` | Branch exists remotely. |
| `deployed` | Live production is running it. |
| `team-useful` | The relevant Friday user can use it effectively in today's workflow. |

## Current Status By Surface

| Surface | Plan | KB | Harness | Core wiring | Tests | Deploy | Team-useful | Verdict |
|---|---|---|---|---|---|---|---|---|
| Ask Friday Core | built beyond scaffold | partial global contracts | worker/review/policy scaffold | runtime wired live | focused tests green; live API smoke passed | deployed at `5d44d16d` | not directly user-facing | deployed control plane, not finished platform |
| FAD Inbox / Friday Consult | mature existing plan | existing Inbox/runtime KB | strong existing harness | learning events + DB turn lease live | focused tests green; live structured Consult smoke passed; detail load fix verified; PR #20 Consult draft/timer tests green | deployed at `73dc8fec` | real staff-thread browser smoke passed for Julia closed-thread review; Mary flicker still needs staff/pair verification if it recurs | Plan 1 needs broader staff-shaped workflow QA |
| FAD Ops / Friday Consult | strong active plan | strong Ops KB | improving, still young | learning events + schedule constraints live; planner guardrails live | focused tests green; bounded live Ops prompt smoke passed; PR #21 Ops guardrail tests/build green | deployed at `5d44d16d` | daily schedule draft and broad schedule-review Consult smoke passed; live model smoke found real unassigned/occupancy blockers; Franny workflow proof still needed | Plan 1 materially improved; roster task-allocation contract still open |
| FAD global Ask Friday | subplan added | module context only | existing FAB/action harness | events + action mirroring live | focused tests green; live harmless-action smoke passed | deployed at `5d44d16d` | staff command smoke passed for navigation only | Plan 1 mostly clear; broaden later |
| Website guest hero Ask Friday | scoped | Website docs/source truth exist | existing Website harness | not wired to Core events/packs | not in this branch | no | no Core integration yet | Plan 2 / separate Website worktree |
| Website Ask Friday FAB | scoped | partial public KB sources | existing Website harness | not wired to Core events/packs | not in this branch | no | no Core integration yet | Plan 2 |
| Website owner enquiry | scoped | public owner skeleton only | existing Website chat | not wired to Core | no | no | no | Plan 2 |
| Website feedback | scoped | feedback skeleton only | existing Website FAB/chat | not wired to Core | no | no | no | Plan 2 |
| Guest portal Ask Friday | scoped | not built | not built | not wired | no | no | no | later |
| Reservations/calendar agent | source-mapped, not full agent | source matrix drafted | read-tool contract drafted | branch has staff-only read context route + eval seeds | focused tests green locally | no | no | read-only context implemented on branch; not merged/deployed/live-smoked |
| Properties agent | source-mapped, not full agent | public/private split drafted | read-tool contract drafted | branch has staff-only read context route + eval seeds | focused tests green locally | no | no | privacy field policy still needs Ishant review before public use |
| Owners agent | scoped | design-only | not built | registry/eval seed only | no | no | no | later until owner-private rules locked |
| Finance agent | scoped | design-only | not built | registry/eval seed only | deterministic privacy seed only | no | no | later until access/redaction locked |
| Legal/admin agent | scoped | design-only | not built | registry only | no | no | no | later until legal review rules locked |
| HR/training agent | scoped | partial SOP direction | not built | registry only | no | no | no | Plan 2/partial |
| Analytics/intelligence agent | scoped | not built | not built | registry only | no | no | no | later after event volume |
| Public MCP | scoped | public-only contract direction | not built | registry/eval seed only | no | no | no | later |
| Internal agent bridge | scoped | prompt direction only | not built | registry/eval seed only | no | no | no | later |

## Plan 1: Production-Useful Inbox And Ops Agents

Goal: get the team a better Inbox draft/Friday Consult flow and give Franny a usable Ops schedule/roster assistant in production.

### Inbox Principle

Inbox is not swallowed by Ask Friday Core. The existing Inbox/Friday Consult harness remains dominant because it already handles real user workflows:

- conversation/session history;
- stale-draft prevention;
- draft-only send behavior;
- teachings and action feedback;
- full-to-compact context fallback;
- takeover/handoff compatibility;
- team-visible staff context.

Ask Friday Core wraps Inbox behind the scenes:

- emit compact staff-private learning events;
- record action/evidence lifecycle;
- provide future candidate mining/evals;
- never change user-facing draft/send behavior without a separate Inbox QA pass.

### Ops Principle

Ops can be more strongly absorbed/formalized by Ask Friday Core because the harness is less mature.

Core should help define:

- schedule/roster planning contract;
- occupancy/availability/pricing constraints;
- staff assignment, fairness, lunch, travel, and skill matching;
- reversible draft/apply/clear/undo protocol;
- owner-approval/request-action boundaries;
- evals for task safety and operational feasibility.

### Plan 1 Tasks

Current reconciliation as of 2026-05-29:

- PR #9 was merged on 2026-05-27 as `da67c7be`.
- Later PR #13 was merged and deployed on 2026-05-28 as `7caf6576f0030a6935b9f13342c52cbce10e6d6f`.
- PR #15 was merged and deployed on 2026-05-29 as `c55e94c08691b977ebf8995f3c86f22742e4ea3a`.
- PR #16 was merged and deployed on 2026-05-29 as `75ef9bc8479074619bfa76f9d4f25a3013c5fbce`.
- PR #17 was merged and deployed on 2026-05-29 as `205d8a91545d336e7db726eb576ddf108813c4ea`.
- PR #18 was merged and deployed on 2026-05-29 as `c52f1a6eb3b9f82ba703635b5bd61071322c3b0b`.
- PR #20 was merged and deployed on 2026-05-29 as `73dc8fece965ed64ee1b1360ead23b547b171666`.
- PR #21 was merged and deployed on 2026-05-29 as `5d44d16dd26c4fb2edc323fcbb570f816089aaa3`.
- Live frontend and backend both report `5d44d16d`.
- Migrations through `100_feedback_multi_screenshots.sql` have been applied in production; startup logs showed `095` through `100` available/applied and migration 100 applied during the feedback deploy.
- Analyzer remains out of the web request path by default; production logs show the web-process scheduler disabled unless `ASK_FRIDAY_ANALYZER_IN_WEB=1`.
- Live authenticated smoke passed for `/api/ask-friday/core/surfaces`, seeded eval cases, KB-candidate list, and unauthenticated staff-route denial.
- 2026-05-28 continuation branch `283c6796` reconciled stale planning docs against live truth.
- Focused backend tests passed locally after dependency install: `src/operations/consult.test.js`, `src/inbox/consult.test.js`, `src/ask_friday/index.test.js`, `src/ask_friday/policy.test.js`, `src/ask_friday/contracts.test.js`, `src/ask_friday/eval_runner.test.js` = 6 suites, 49 tests.
- Live non-destructive API/model smoke passed:
  - Core staff routes: auth/me, active surfaces = 9, active eval cases = 10, KB candidates = 0, unauth/private route denial = 401.
  - Ops Friday Consult synthetic schedule: loaded `ops-consult` KB, used `gemini-3.5-flash`, deferred non-urgent occupied work, allowed urgent guest lock issue, named assignee, mentioned lunch, returned `draft_schedule` suggestion only.
  - Inbox Friday Consult synthetic teaching review: loaded `inbox-advisory`, used `gemini-3.5-flash`, no draft mutation, no automatic teaching creation, session created.
  - Global FAD Ask Friday synthetic command: routed website AI handoffs to Inbox, returned navigation-only action, no direct mutation.
- Browser snapshot smoke loaded live Operations > Schedule and showed the Friday Consult panel plus live task queues. Multi-step browser click/type QA is parked because the local bridge repeatedly released/closed the claimed tab between commands; this is a tooling blocker, not a product result.
- PM2 log watch after smoke showed no new Ask Friday route errors. It did show pre-existing AI classifier/extraction warnings and push fan-out with `subscriptions: 0`; keep that in the notification bug lane, not as an Ask Friday Core blocker.
- 2026-05-28 continuation branch runtime patch pushed as `0a65333d`: Roster Friday Consult now receives weekly reservation overlays and cached calendar-pricing signals; the local roster draft uses arrivals/checkouts/in-house stays as demand; Ops consult open-work constraints ignore completed/closed tasks; Inbox Friday Consult browser timeout is aligned with the backend long-context budget.
- Focused local verification for that runtime patch passed before full regression: `src/operations/consult.test.js` = 7 tests, Inbox consult/draft/reservation context tests = 46 tests, frontend TypeScript passed.
- 2026-05-29 bugfix release `c55e94c0` hardened Inbox/Friday Consult structured draft output: model calls now request JSON envelopes, API returns `draft_updates[]` while preserving `draft_update`, and the frontend renders multiple lightweight draft cards without sending guest messages.
- 2026-05-29 deploy verification passed: frontend build, backend build, backend syntax checks, `/version.json`, `/api/version`, authenticated `/api/auth/me`, Inbox conversation list, and Consult active-session read.
- 2026-05-29 live non-destructive Plan 1 smoke passed:
  - Inbox Friday Consult returned a structured JSON envelope through `gemini-3.5-flash` with `draftUpdateCount=1`, `structuredEnvelope=true`, `degraded=false`, and `fallbackUsed=false`.
  - Ops Friday Consult returned through `gemini-3.5-flash`, suggested only reversible `draft_schedule`, and referenced occupancy, lunch/breaks, and named staff assignees for the synthetic occupied-property schedule scenario.
  - PM2 stayed online; startup logs showed migrations complete with 107 already applied. Recent error log entries were pre-existing classifier/extraction warnings from before the `c55e94c0` deploy.
- 2026-05-29 follow-up release `75ef9bc8` restored Inbox conversation detail loading after `backend/src/inbox/whatsapp_window.js` queried a non-existent `messages.communication_channel` column on production. The helper now reads message `module_type` and falls back through `conversations.communication_channel` / `conversations.channel`. Live browser QA loaded the top Inbox detail with no error, visible Ask input, visible Send button, `whatsapp_window_open=true`, and both `email`/`whatsapp` available channels.
- 2026-05-29 Plan 1 browser/live QA on production after `75ef9bc8`:
  - Inbox loaded without the previous conversation-detail error. A real Julia Maichle message-review Consult turn returned through `gemini-3.5-flash`, used structured envelope mode, grounded the answer to property `GBH-C3`, and correctly said no further guest reply was needed after the thread had already been closed.
  - Ops Schedule loaded live with 4 visible open tasks and 2 initially unassigned visible tasks. The local reversible `Draft schedule` action drafted 4 moves and assigned every visible move, including occupancy reasoning, calendar-pricing overlay notes, and preferred 12:00-13:00 lunch protection.
  - Ops Roster loaded live with 187 scheduled weekly tasks and 87 unassigned tasks. The reversible `Draft roster` action drafted 11 staff coverage cells using reservation pressure. This is staff-coverage planning, not per-task assignment; if Friday expects roster generation itself to assign individual tasks, that needs a separate roster/task-allocation contract.
  - Ops Consult model QA exposed a blocker: `/api/operations/consult` returned HTTP 200 but visible text was cut mid-task id and had no reversible action suggestion. Current branch `codex/ask-friday-consult-finish-reason-20260529` patches the shared draft client so non-normal provider finish reasons with partial text are treated as incomplete and trigger fallback/failure instead of being shown as successful advice. This needs deploy plus live re-smoke before closing Plan 1 Ops Consult.
- 2026-05-29 PR #17 merged and deployed as `205d8a91`; frontend/backend versions aligned, PM2 online, and post-deploy smoke confirmed the previous partial output no longer leaks. The same Ops schedule prompt failed closed as `ops_consult_model_failed` when Gemini hit `MAX_TOKENS` and Kimi hit `finish_reason=length`, which proved the guard was safe but not team-useful.
- 2026-05-29 PR #18 merged and deployed as `c52f1a6e`; frontend/backend versions aligned, PM2 online, and the exact broad live Ops schedule-review prompt returned a complete bounded QA summary with no cut-off text and no `ops_consult_model_failed`. The answer identified unassigned visible tasks, occupancy/property risks, lunch-verification limits, and suggested only the reversible `Draft schedule` action.
- 2026-05-29 PR #20 merged and deployed as `73dc8fec`; frontend/backend versions aligned, PM2 online, and live smoke confirmed auth, Inbox conversation detail reads, and current frontend chunks. This release split email-style multi-recipient Consult drafts into separate draft cards, suppressed duplicate same-session task suggestions, fixed Inbox/FAD Consult textarea shortcut propagation, and tightened WhatsApp-window source detection so email does not refresh a WhatsApp window by accident.
- 2026-05-29 PR #21 merged and deployed as `5d44d16d`; frontend/backend versions aligned, PM2 online, and live Ops Consult smoke returned HTTP 200 with 4 scheduled tasks, 15 unscheduled tasks, 6 active staff, 26 overlapping reservations, `finishReason=STOP`, and no compact fallback. The response identified the real unassigned scheduled work and occupied-property backlog risk. This release adds named unassigned/occupancy task signals to Ops Consult, exposes assignable staff in planning context, makes `Schedule Today` choose a safe assignee/time when possible, and blocks applying a selected-day plan that would leave visible work unassigned, untimed, or in non-urgent occupancy conflict.

Remaining Plan 1 tasks:

1. Continue browser/live workflow QA with real staff-shaped scenarios:
   - Inbox guest complaint draft with latest guest turn;
   - Inbox property/reservation-grounded reply;
   - Inbox teaching/action feedback still included;
   - Ops weekly schedule with checkout and arrival pressure;
   - Ops roster with lunch/coverage/fairness;
   - Ops urgent guest issue during occupancy.
2. Patch only blocking defects from that browser/workflow QA.
3. Decide whether Ops roster generation must allocate individual tasks or remain staff-coverage planning; current live behavior drafts coverage cells and schedule planning assigns visible tasks.
4. Pair with Franny/Mary on real use after the `5d44d16d` deploy: the code now blocks known planner failures, but staff-use proof is still the team-usefulness gate.
5. Record team-useful evidence in this ledger and mirror to Notion when connector access is available.

Plan 3 source-mapping progress:

- `docs/architecture/ask-friday-reservations-properties-source-matrix-2026-05-28.md` maps Reservations/Calendar and Properties against current FAD runtime paths, Guesty docs, and known gaps.
- It confirms these surfaces are not yet dedicated agents. It only closes the source-truth planning gap enough to design read-only context tools and evals.
- `docs/architecture/ask-friday-reservation-property-tool-contracts-2026-05-28.md` drafts the first read-only context contracts and the approval-routed reservation action contract.
- Branch implementation added staff-only `/api/ask-friday/core/context-tools/load-reservation-context`, `/load-calendar-context`, and `/load-property-context`, plus migration `101_ask_friday_context_tools.sql` for registry/eval seeds. This is not deployed.
- Key gaps carried forward: Guesty/OTA write-through contract, quote validity policy, public price fields, property public/guest/staff/restricted classification, and richer privacy enforcement for `fad_property_cards`.
- `docs/architecture/ask-friday-website-owner-feedback-source-matrix-2026-05-28.md` now source-maps Website public Ask Friday, owner enquiry/FAD owners assistant, and feedback/bug-learning. These are scoped only, not runtime wired. Key gaps carried forward: public property-field policy, owner package/competitor wording, owner-data retention/consent, feedback evidence retention/redaction, and Website/FAD event/context-pack contracts.
- Branch migration `102_ask_friday_public_owner_feedback_evals.sql` seeds deterministic eval scaffolding for Website public handoff/privacy, owner safety/privacy/compliance, and feedback evidence/candidate safety. This is not deployed.
- `docs/architecture/ask-friday-public-owner-feedback-contracts-2026-05-28.md` now drafts the Website context-pack request, Website learning event, owner lead capsule, feedback evidence capsule, and handoff/takeover alignment contracts. It is mirrored in Notion at `https://www.notion.so/36e43ca8849281e39565c1d18a057827`. This is planning/contract work only; Website is not wired to consume Core packs or emit Core events yet.
- `backend/src/ask_friday/policy.test.js` now pins the public/owner/feedback contract boundaries: valid Website public context-pack/event shapes, owner lead event summaries, feedback evidence refs, and rejection of owner-private scopes or restricted unredacted evidence on public routes. Focused Core verification passed on 2026-05-28: `src/ask_friday/policy.test.js`, `contracts.test.js`, and `index.test.js` all green.
- `backend/src/ask_friday/index.test.js` now covers public owner follow-up and feedback issue action requests. This confirms `request_owner_followup` and `create_feedback_issue` queue as approval-routed pending action requests under public surface policy; they do not execute directly.
- Branch migration `103_ask_friday_public_contract_evals.sql` adds contract-specific eval seeds for missing context-pack fallback, ready owner lead capsules, feedback evidence/action requests, and restricted evidence rejection. This is not deployed.
- `docs/handover/2026-05-28-ask-friday-website-public-wiring-prompt.md` is a paste-ready Website-session prompt for implementing public context-pack consumption, redacted learning-event emission, owner lead capsules, feedback evidence capsules, and takeover preservation from a separate Website worktree.

## Plan 2: Broader Ask Friday Agent/KB Buildout

Goal: build every planned agent/KB as a governed Ask Friday surface, then gradually refine each with real evidence.

### Plan 2 Tracks

| Track | Surfaces | First output |
|---|---|---|
| Public guest/website | guest hero, FAB, feedback, owner enquiry | public KB/source matrix + Website event/pack wiring plan |
| Reservation/commercial | reservations/calendar, quotes, booking proof | availability/quote grounding KB + eval cases |
| Property truth | properties, public/private property packs | property public/private split and freshness rules |
| Staff operations | Ops, Inbox, global FAD Ask Friday | live mining/eval loop from real staff events |
| Owner/private | owners, owner portal | owner-private access/redaction plan |
| Restricted | finance, legal/admin, HR/performance | design-only KB boundaries and approval matrix |
| Platform | public MCP, internal agent bridge | public-safe tool/action schema and internal summary/candidate prompts |
| Intelligence | analytics/evals/mining | learning-loop dashboard/report plan |

### Research Required Before Claiming A KB Is Ready

Every module KB should include, where relevant:

- Friday-specific truth and policy;
- source-of-truth data owners;
- competitor/market positioning where useful;
- industry best practices;
- local Mauritius context;
- legal/tax/regulatory caveats with source dates;
- operational stats or benchmark ranges where useful;
- privacy/access classification;
- freshness/expiry rules;
- eval cases and failure examples;
- explicit "needs Ishant review" assumptions.

Competitor/industry knowledge should not be global by default. It should be scoped:

- public owner/sales surfaces can use positioning and market context;
- guest surfaces can use public/local travel context;
- Ops can use STR/field-service practices;
- finance/legal can use sourced compliance context only after review;
- private competitor strategy should stay staff/internal.

## Research Signals Already Captured

Architecture and AI:

- Use simple, scoped agent workflows before multi-agent complexity.
- Enforce tools/actions with server-side policy, not prompt wording.
- Evaluate traces, tool calls, and lifecycle behavior, not only final answers.
- Separate session memory, evidence traces, candidate memories, and approved canonical memory.
- Run mining/analyzer/evals in workers, not live chat request paths.
- Public routes require surface registry checks even when API scopes look broad.

Ops and STR:

- Turnovers need checklists, restocking, inspection, evidence, and maintenance escalation.
- Scheduling needs skill match, travel, duration, occupancy, staff fairness, lunch, standby/off days, and disruption handling.
- Owner charges and maintenance pricing need evidence and human review before automation.
- Mauritius/legal/tax answers must be source-dated and reviewed before public use.

## Compaction Recovery Protocol

After every compaction or session resume:

1. Re-read this ledger.
2. Run naming scan for the retired assistant label.
3. Check git branch, HEAD, origin/fad-rebuild, and production version.
4. Update the status table before new implementation.
5. Choose one active plan:
   - Plan 1 production Inbox/Ops;
   - Plan 2 broader agent/KB buildout.
6. Do not call a surface complete unless it is `runtime wired`, `tested`, `deployed`, and `team-useful`.
7. If a detail is only in Notion or only in a repo doc, mark it as mirrored/not mirrored.

## Judith Parallel Work Plan

Use Judith or subagents for bounded parallel work only:

- research one module KB at a time;
- audit one surface against this ledger;
- extract existing KB/harness facts from a repo area;
- produce eval scenarios from real workflows;
- compare Notion mirror versus repo source.

Do not use Judith/subagents to edit the same source files concurrently with the main implementation branch. They should return findings/prompts, not uncoordinated patches.

## Immediate Next Step

Continue with Plan 1 browser/workflow usefulness verification.

PR #9 is no longer pending. It was merged as `da67c7be`, and production now runs `c52f1a6e`, which includes PR #9, later Feedback FAB evidence-flow work, Website Ask Friday Core scopes, the Inbox/Consult structured-draft bugfix release, the WhatsApp-window Inbox detail fix, Consult partial-output rejection, and bounded Ops Consult compact fallback.

New execution-planning artifacts on this branch:

- `docs/architecture/ask-friday-master-plan-v02-2026-05-26.md`
- `docs/architecture/ask-friday-surface-subplans-2026-05-26.md`
- `docs/architecture/ask-friday-kb-research-factory-2026-05-26.md`
- `docs/architecture/ask-friday-eval-mining-adr-plan-2026-05-26.md`

Current autonomous execution note:

- Judith/OpenClaw was pulled in for a read-only critique of the execution pack, but the gateway returned a Gemini quota `429`. That critique is parked; do not treat it as completed external review.
- Local repo evidence has been folded into the execution pack: FAD shared-integration ownership, existing critical rules, business-config pricing/payment rules, Inbox/Consult session behavior, Ops owner-approval rules, and seed eval coverage.
- The surface subplans now explicitly include the FAD global Ask Friday command surface and an "absorbed module" policy for modules that do not yet justify independent agents.

The next safe action is browser/workflow proof for Inbox and Ops using real staff-shaped flows, then patch only production-blocking defects. If browser/workflow proof passes, start reservations/calendar and properties subplans because they are upstream of Ops, Inbox, guest, owner, and Website surfaces.
