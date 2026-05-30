# Design-input brief — OPERATIONS (for the Claude Design session)

> Paste-ready context for designing the V2 Operations surfaces (manager/director desktop + manager mobile).
> Rule: build on our **real** `/api/tasks` + `/api/operations/*` contracts (the strongest part of the stack),
> never lose functionality, and **don't invent data models that collide with shipped backend**. Where a V2
> surface has no backend yet, design it but mark it future (don't fake it as real).

## 0. Must-knows before designing
- **Trust vocabulary already exists in our code** (this session, S1/S2) — `frontend/src/app/fad/_components/ai/`
  → `TrustStates.tsx` (SyncChip/Provenance/ConfBar/StateBanner/AITrustStrip), `SourceTag.tsx`, `aiHealth.ts`
  (`deriveAIHealth` → healthy/stale/partial/fallback/failed), `trustEnvelope.ts`. **Design to USE these.**
- **Three layers exist today:** (1) the dense legacy `OperationsModule.tsx` (5.5k lines, field + default), (2) a
  **GM retrofit already in repo** (`gm/screens/{ops,schedule,roster,approvals,map}.tsx`) — already the V2 visual
  system, mounted for managers, live data on donut/staff-load/roster, AI/par/drag still demo, (3) the V2
  prototype (`docs/design/fad-v2/prototype/` — real content in `fad-task-drawer.jsx`, `fad-desktop-screens.jsx`,
  `fad-mobile-screens.jsx`). The prototype is a cleaner layer-2 + net-new Supplies/Map/Friday-learnings.
- **Already-shipped backend contracts — DO NOT design colliding models:** migration **113** `task_attachments`
  (inline_base64 evidence before/after/document, 7MB, hash-dedup, attachment_count) and **114**
  `operations_settings` (per-tenant JSONB templates/bookingPolicies/recurringRules, each enabled/paused).
  Also live + shape-stable: requirements/requirement_state, typed costs (owner_charge→Finance),
  supplies→`stock_movements`, the consult action protocol (`[OPS_ACTION]` JSON, 7 reversible types + confidence).
- **Manager mobile ≠ field PWA** — keep them separate. Manager-GM-on-phone = `fad-mobile-screens.jsx`; the field
  task app = `field/screens/*` (My tasks, timer, requirements gating, photo evidence, receipt OCR, offline sync).

## 1. Purpose & core use-cases (manager/director)
1. **Triage** field reports → vetted tasks (Friday draft + "approve all routine").
2. **Plan** the day/week (draft schedule → review occupancy/lunch/unassigned → apply; reversible undo).
3. **Roster** — draft + publish the weekly roster (zone-fit, weekend fairness).
4. **Task drawer** — reassign / reschedule / approve cost / comment / mark complete.
5. **Supplies** — keep above par + restock orders (future-backed).
6. **Live Map** — who's where (future-backed).

## 2. Features we run today (keep the intent)
Tabs (role-gated): Overview · Schedule · All tasks · Approvals · Roster (+ field My-tasks/history, Insights,
Settings). All-tasks: table+card, rich filter chips, search, server pagination. Overview: KPI strip + **Manager
Workbench** (live: stale-open, reported issues, supply-prep, staff-load, unassigned). **Task detail** (rich):
timer, requirements **checklist w/ gating**, **evidence** (photos/PDF), supply-use + typed costs (owner-charge→
Finance) + **receipt OCR**, AI suggestions accept/reject, **access/sensitive-codes** (gated), Breezeway imported
history, comments+@mentions, activity log, **offline sync states** (idle/saving/queued/failed). **Schedule**:
drag-drop planner (by staff·day / staff·week / property·week) + **live AI agent plan** (skill-fit, **lunch
protection**, **occupancy policy**, undo, draft→apply) + Friday consult. **Roster**: week grid + workload bars +
publish. **Approvals**: queue, approve→assign/decline. **Friday Consult** (real `/api/operations/consult`).

## 3. Real backend (endpoint → gives → live/mock → get vs don't)
`/api/tasks/*` + `/api/operations/*` are **real, DB-backed, tenant-scoped**.
| Endpoint | Key fields | Live? | Get vs don't |
|---|---|---|---|
| `GET /api/tasks` (filters, pagination) | id, title, status, priority, dept/subdept, property_code, assignees, due, est/spent_min, source, reservation_id, **requirements+state**, attachment_count, ai_suggestions, activity_log | LIVE | full CRUD + server filters; no server-side AI ranking/riskFlags (client-derived) |
| `GET/POST/PATCH /api/tasks/:id` (+ comments/costs/supplies) | + comments[], **typed costs** (owner_charge→Finance), supplies→`stock_movements` | LIVE | status set reported→…→completed; multi-assignee |
| `POST /api/tasks/:id/attachments` (mig 113) | inline_base64 evidence/before/after/document, 7MB, dedup | LIVE | durable per-task photo/PDF; object-store reserved-unused |
| `POST /api/tasks/imports/breezeway/*` + Breezeway OAuth enrichment | CSV import; live per-task assignments, **photo refs+counts**, costs, supplies, report_url | LIVE (Breezeway) | refs/counts only — **no photo bytes**; no live webhook (fetch-based) |
| `POST /api/operations/consult` | response, **confidence (0–1 + band)**, **action_suggestions[7 reversible types]**, metadata{compact/deterministic **fallback** flags} | LIVE AI (Kimi) | planning constraints computed server-side (occupancy/lunch/assignment-coverage/pricing-known); **AI reads context from the request body, not the DB** |
| `GET/PUT /api/operations/settings` (mig 114) | templates/bookingPolicies/recurringRules (enabled/paused) | LIVE (config) | editable+persisted; **but no automation job auto-creates tasks from rules yet** |
| `POST /api/operations/travel-time/estimate` | Google Routes drive time/distance between properties | LIVE | built but **unwired** in the schedule UI |
| `GET/PUT /api/hr/roster` + publish | week draft/published, days{staff,date,avail,zone,leave,times} | LIVE | roster owned by HR; no AI balancing; ack still localStorage |
| `GET /api/hr/staff` · `GET /api/availability/search` | staff directory (role/zone/canAssign); Guesty availability+cached pricing | LIVE | — |

## 4. Real vs FUTURE — design honestly (don't fake as real)
**Real, design straight onto it:** tasks + comments/costs/supplies/attachments + requirements; consult AI (confidence/actions/fallback/constraints); ops settings config; roster (HR); staff dir; availability; travel-time (build the UI).
**NO backend yet — design but mark future / empty-state:**
- **Supplies inventory** — par levels, on-hand, SKU master, stock value, auto-reorder **don't exist** (only supply-*use* + stock_movements are real). The V2 Supplies screen needs a new backend; design it reusing `task_supplies`/`stock_movements` semantics (movements link to the consuming task), not a conflicting model. **Biggest gap.**
- **Live Map** — **no location telemetry backend at all**; pure aspiration → explicit "no location data yet / opt-in" empty state.
- **Automation** — booking-trigger/recurring rules persist but **nothing executes them** yet.
- **AI suggestion surfaces** — Approvals "Friday learnings"/pattern-detection (recurring-fault, batch-runs), **AI roster-balancing**, Friday-suggested ordering, the Daily-Brief prose — **all demo copy**; no suggestion endpoints. Gate behind a flag or mark aspirational.
- Breezeway **photo bytes** + real-time webhook — not pulled.

## 5. The 5 trust-states → REAL signals (Operations)
- **Healthy** → consult grounded, `confidence ≥ 0.75` band, plan covers all open tasks.
- **Partial** → assignment-coverage gaps / pricing unknown for some nights / occupancy unresolved.
- **Fallback** → `compactFallbackUsed`; **Failed→deterministic** → `deterministicFallbackUsed` ("model unavailable — ran the safe local planner") — must read as honest, not magic.
- **Stale** → roster/availability cache aged.
- Also: **draft-vs-applied** is a first-class state for Schedule/Roster/Approvals (Friday "drafted the day" → Apply/Undo/Clear; nothing mutates until applied).

## 6. Roles
- **Director** — everything (Insights, all approvals, sensitive context, Finance-flowing cost amounts).
- **Manager** (ops_manager + commercial_marketing, identical) — same ops surfaces; Approvals gated `tasks.approve`, sensitive codes gated `canViewSensitiveContext`, **Finance cost amounts gated** (managers don't see $ figures).
- **Field** — the **mobile task PWA** (`field/screens/*`): My tasks, timer, requirements gating, photo evidence, receipt OCR, offline sync. The manager task drawer is a **read-only mirror of field execution**.

## 7. New-design diff highlights + open questions
**Net-new in V2:** Supplies + Map as first-class tabs; task drawer becomes a **slide-over** (Overview/Requirements/Photos/Supplies&cost/Activity) with an **Occupancy** header badge + **inline expense approval** + a prominent **Friday "summary & suggested fix"** + Linked-records; Approvals gains an **AI-vetting workflow**; manager-mobile surfaces.
**Open questions for the design session:**
1. **Trust-state rendering** — confidence band (high/med/low/unknown), **draft-vs-applied**, and the deterministic-fallback case, consistent across Overview brief / Schedule draft / Approvals triage / scoped Ask Friday.
2. **Task drawer scope** — the V2 slide-over drops timer / access-codes / imported-history / typed-cost-breakdown from the current rich detail. Keep them where? (timer + access → field PWA / Property record; "more" expansion for the rest?). **Flag — don't silently lose them.**
3. **Supplies** — design to the future inventory model but mark not-yet-backed; reuse `task_supplies`/`stock_movements` semantics.
4. **AI suggestion surfaces** (learnings / roster-balancing / pattern-detection) — design now as aspirational behind a flag, or defer?
5. **Live Map** — forward-looking surface w/ explicit no-backend empty state?
6. **Travel-time** — surface drive-time between consecutive jobs in the planner (endpoint built, unwired)?
7. Confirm **manager mobile vs field PWA** stay two separate apps.
