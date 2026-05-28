# Ask Friday Completion Ledger

Date: 2026-05-26
Last reconciled: 2026-05-28
Status: recovery ledger and execution plan
Current continuation branch: `codex/ask-friday-continuation-20260528`

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
| Ask Friday Core | built beyond scaffold | partial global contracts | worker/review/policy scaffold | runtime wired live | focused tests green; live API smoke passed | deployed at `7caf6576` | not directly user-facing | deployed control plane, not finished platform |
| FAD Inbox / Friday Consult | mature existing plan | existing Inbox/runtime KB | strong existing harness | learning events + DB turn lease live | focused tests green; live synthetic Consult smoke passed | deployed at `7caf6576` | needs real staff-thread browser smoke | Plan 1 browser/workflow priority |
| FAD Ops / Friday Consult | strong active plan | strong Ops KB | improving, still young | learning events + schedule constraints live | focused tests green; live synthetic Ops smoke passed | deployed at `7caf6576` | needs Franny real schedule/roster proof | Plan 1 browser/workflow priority |
| FAD global Ask Friday | subplan added | module context only | existing FAB/action harness | events + action mirroring live | focused tests green; live harmless-action smoke passed | deployed at `7caf6576` | staff command smoke passed for navigation only | Plan 1 mostly clear; broaden later |
| Website guest hero Ask Friday | scoped | Website docs/source truth exist | existing Website harness | not wired to Core events/packs | not in this branch | no | no Core integration yet | Plan 2 / separate Website worktree |
| Website Ask Friday FAB | scoped | partial public KB sources | existing Website harness | not wired to Core events/packs | not in this branch | no | no Core integration yet | Plan 2 |
| Website owner enquiry | scoped | public owner skeleton only | existing Website chat | not wired to Core | no | no | no | Plan 2 |
| Website feedback | scoped | feedback skeleton only | existing Website FAB/chat | not wired to Core | no | no | no | Plan 2 |
| Guest portal Ask Friday | scoped | not built | not built | not wired | no | no | no | later |
| Reservations/calendar agent | scoped | not complete | not built as agent | registry/eval seed only | no workflow test | no | no | Plan 2 |
| Properties agent | scoped | property source split partial | not built as agent | registry only | no | no | no | Plan 2 |
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

Current reconciliation as of 2026-05-28:

- PR #9 was merged on 2026-05-27 as `da67c7be`.
- Later PR #13 was merged and deployed on 2026-05-28 as `7caf6576f0030a6935b9f13342c52cbce10e6d6f`.
- Live frontend and backend both report `7caf6576`.
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
- PM2 log watch after smoke showed no new Ask Friday route errors. It did show pre-existing AI classifier/extraction warnings and push fan-out with `subscriptions: 0`; keep that in the notification bug lane, not as an Ask Friday Core blocker.

Remaining Plan 1 tasks:

1. Run browser/live workflow QA with real staff-shaped scenarios:
   - Inbox guest complaint draft with latest guest turn;
   - Inbox property/reservation-grounded reply;
   - Inbox teaching/action feedback still included;
   - Ops daily schedule with occupied property;
   - Ops weekly schedule with checkout and arrival pressure;
   - Ops roster with lunch/coverage/fairness;
   - Ops urgent guest issue during occupancy.
2. Patch only blocking defects from that browser/workflow QA.
3. Record team-useful evidence in this ledger and mirror to Notion when connector access is available.

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

Continue with Plan 1 smoke and usefulness verification.

PR #9 is no longer pending. It was merged as `da67c7be`, and production now runs `7caf6576`, which includes PR #9 plus later bugfixes and the Feedback FAB evidence-flow work.

New execution-planning artifacts on this branch:

- `docs/architecture/ask-friday-master-plan-v02-2026-05-26.md`
- `docs/architecture/ask-friday-surface-subplans-2026-05-26.md`
- `docs/architecture/ask-friday-kb-research-factory-2026-05-26.md`
- `docs/architecture/ask-friday-eval-mining-adr-plan-2026-05-26.md`

Current autonomous execution note:

- Judith/OpenClaw was pulled in for a read-only critique of the execution pack, but the gateway returned a Gemini quota `429`. That critique is parked; do not treat it as completed external review.
- Local repo evidence has been folded into the execution pack: FAD shared-integration ownership, existing critical rules, business-config pricing/payment rules, Inbox/Consult session behavior, Ops owner-approval rules, and seed eval coverage.
- The surface subplans now explicitly include the FAD global Ask Friday command surface and an "absorbed module" policy for modules that do not yet justify independent agents.

The next safe action is production smoke for Inbox and Ops, then patch any production-blocking defects before Plan 2 research/buildout. If smoke passes, start reservations/calendar and properties subplans because they are upstream of Ops, Inbox, guest, owner, and Website surfaces.
