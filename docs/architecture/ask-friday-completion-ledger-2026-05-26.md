# Ask Friday Completion Ledger

Date: 2026-05-26
Status: recovery ledger and execution plan
Branch: `codex/ask-friday-autonomous-core-20260526`

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
| Ask Friday Core | built beyond scaffold | partial global contracts | worker/review/policy scaffold | runtime wired on branch | backend green | not deployed | not directly user-facing | merge/deploy candidate, not finished platform |
| FAD Inbox / Friday Consult | mature existing plan | existing Inbox/runtime KB | strong existing harness | learning events + DB turn lease on branch | backend green | not deployed from this branch | likely improves after deploy, but needs live smoke | Plan 1 priority |
| FAD Ops / Friday Consult | strong active plan | strong Ops KB | improving, still young | learning events + schedule constraints on branch | backend/frontend green | not deployed from this branch | not proven live for Franny yet | Plan 1 priority |
| FAD global Ask Friday | scoped and partly wired | module context only | existing FAB/action harness | events + action mirroring on branch | backend green | not deployed from this branch | not the main Plan 1 target | later smoke after merge |
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

1. Verify branch ancestry and current live production before merge.
2. Merge/push current Ask Friday Core + Ops constraint branch through the FAD canonical path.
3. Apply migrations `095` through `098` if not already applied in production.
4. Decide analyzer process mode before deploy:
   - default: keep analyzer manual/off in web process;
   - run worker only if PM2/process plan is explicit.
5. Deploy backend and frontend together; no frontend-only deploy if backend changed.
6. Smoke production:
   - `/api/version`;
   - `/api/ask-friday/core/surfaces`;
   - public routes reject private surfaces;
   - Inbox/Friday Consult draft/consult;
   - Ops Schedule Friday Consult draft/apply/undo;
   - Ops Roster Friday Consult conversation/draft;
   - global FAD Ask Friday harmless action suggestion.
7. Run live workflow QA with staff-shaped scenarios:
   - Inbox guest complaint draft with latest guest turn;
   - Inbox property/reservation-grounded reply;
   - Inbox teaching/action feedback still included;
   - Ops daily schedule with occupied property;
   - Ops weekly schedule with checkout and arrival pressure;
   - Ops roster with lunch/coverage/fairness;
   - Ops urgent guest issue during occupancy.
8. Patch only blocking defects.
9. Record what is actually live in this ledger and Notion.

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

Continue with Plan 1.

The branch has pushed but not deployed Ask Friday Core hardening plus Ops constraints.

Draft PR: `https://github.com/Friday-mu/friday-mu/pull/9`

The next safe action is coordinated FAD review/merge/deploy/smoke for Inbox and Ops only, then patch any production-blocking defects before Plan 2 research/buildout.
