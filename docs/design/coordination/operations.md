# Operations — Design Brief for Claude Design

> Sits on top of the **FAD Ops Scheduling / Roster / Task Policy pack (LOCKED baseline 2026-05-26)**
> ([Notion 36b43ca8849281b0b1b3db967c4a2b73](https://www.notion.so/36b43ca8849281b0b1b3db967c4a2b73)) — source of
> truth for roster, schedule, task-duration, combo-property, recurring, and task-template rules. Read `00-README` +
> `ask-friday.md` first. *(Reframed 2026-05-30 from the earlier engineering-first brief into the house format.)*

## 1. The brief in one line
Design Operations as the **manager/director desktop cockpit** for turning field reports + bookings into vetted,
scheduled, rostered work — **manual-first, AI-assists-and-drafts-but-never-finalizes** — with a rich task record,
an AI **Schedule/Roster Consult**, supplies, a forward-looking live map, and the honest **draft-vs-applied** +
trust-states the module's planner already emits. (The field execution app is a **separate** mobile PWA — keep them
apart.)

## 2. Source of truth and grounding (three-way reconcile)
- **Vision** = the Ops policy pack. Core stance: *"First make the roster/schedule/task flows work manually for real
  team use. AI drafts and assists; Franny/Ishant approve and can manually edit."* Ops-manager **desktop** is the
  priority for roster / schedule / reported-task approval / all-tasks / per-property tasks; field staff **mobile** is
  the priority for My Tasks / history / comments / team chat / roster view / reported issues / pause-resume /
  expenses / push. The pack also locks the **staff directory** (6 staff + bases + capabilities + constraints —
  pregnancy/night/weekend), **working-time & fairness** (09:00–17:00, protected lunch, weekend fairness, night
  rotation), **property size classes** + combo child-task splitting, the **duration matrix**, **booking-triggered**
  + **recurring** task catalogs, **SRL/welcome-stock** formulas, the **scheduling-agent I/O + risk gates**, the
  **maintenance-charge matrix** (evidence-based, draft-only), **travel-time** (Google Routes), and **field-location
  dispatch** (consent-gated).
- **Reality** = three layers exist: (1) the dense legacy `OperationsModule.tsx` (~5.5k lines; field + default), (2)
  a **GM retrofit in repo** (`gm/screens/{ops,schedule,roster,approvals,map}.tsx`) — the V2 visual system, mounted
  for managers, live data on donut/staff-load/roster, AI/par/drag still demo, (3) the V2 prototype. Shipped backend
  contracts: mig **113** `task_attachments` (inline_base64 evidence, 7MB, hash-dedup), mig **114**
  `operations_settings` (per-tenant templates/bookingPolicies/recurringRules), `/api/tasks/*` + `/api/operations/*`
  (real, DB-backed, tenant-scoped), the consult action protocol (`[OPS_ACTION]` JSON, 7 reversible types +
  confidence), `POST /api/operations/travel-time/estimate` (built, **unwired** in the UI), `mig 093` staff-policy.
  Policy lives client-side in `_data/opsPolicy.ts` + `_data/taskRequirements.ts` until the backend config endpoint
  exists.
- **Drawn** = the V2 prototype (`fad-task-drawer.jsx`, `fad-desktop-screens.jsx`, `fad-mobile-screens.jsx`): a
  cleaner manager layer + net-new Supplies / Map / Friday-learnings; the task drawer becomes a **slide-over**.
- **Full-vision rule:** design Supplies, Live Map, automation, and the AI-suggestion surfaces complete even though
  they're SPEC; the **draft-vs-applied / deterministic-fallback / occupied-property** states are the point.

## 3. Who uses it (roles)
- **Director** — everything: Insights, all approvals, sensitive context, **Finance-flowing cost amounts**, live
  field locations.
- **Manager** (ops_manager ≡ commercial_marketing, identical) — same ops surfaces; **Approvals** gated
  `tasks.approve`, **sensitive codes** gated `canViewSensitiveContext`, **Finance cost amounts gated** (managers
  don't see the $ figures), can view field locations for dispatch.
- **Field** — the **mobile task PWA** (`field/screens/*`): My tasks, timer, requirements gating, photo evidence,
  receipt OCR, offline sync. The manager task drawer is a **read-only mirror** of field execution. **Manager mobile
  ≠ field PWA — keep them separate** (manager-GM-on-phone = `fad-mobile-screens.jsx`; field app = `field/screens/*`).

## 4. Design principles and system
- **Manual-first, AI-assists.** Every roster/schedule/task flow must work by hand; Friday **drafts**, the manager
  **approves/edits**. Nothing the AI proposes mutates until applied (the risk gate: *"Do not silently finalize
  roster/schedule"*).
- **The trust layer is the deliverable.** Bind the §7 states to the real planner signals (confidence band,
  fallback flags, occupancy/lunch/coverage constraints) + use the built `ai/` kit.
- **Don't collide with shipped models.** Design onto mig 113 (attachments) + 114 (settings) + the `[OPS_ACTION]`
  protocol + `task_supplies`/`stock_movements` — don't invent conflicting schemas.

## 5. Information architecture
Tabs (role-gated): **Overview · Schedule · All tasks · Approvals · Roster** (+ field My-tasks/history, Insights,
Settings), and net-new **Supplies · Live Map**. Overview = KPI strip + **Manager Workbench** (live: stale-open,
reported issues, supply-prep, staff-load, unassigned). The **task record** (rich): timer, requirements **checklist
w/ gating**, evidence (photos/PDF), supply-use + typed costs (owner-charge → Finance) + receipt OCR, AI suggestions,
access/sensitive-codes (gated), Breezeway imported history, comments + @mentions, activity log, offline-sync states.

## 6. Surfaces to design (full vision) — P0 first
| # | Surface | Purpose | Reality | Priority |
|---|---|---|---|---|
| A | **Overview + Manager Workbench** | KPI strip + live workbench (stale-open / reported / supply-prep / staff-load / unassigned) + Daily Brief. | LIVE (workbench) / SPEC (brief prose) | **P0** |
| B | **Schedule planner** | drag-drop (staff·day / staff·week / property·week) + **AI agent plan** (skill-fit, **lunch protection**, **occupancy policy**, **combo child-split**, draft→apply→undo) + **Schedule Friday Consult**. | LIVE (plan) | **P0** |
| C | **Task record (slide-over)** | Overview / Requirements (gated) / Photos / Supplies&cost (owner-charge→Finance) / Activity; occupancy header badge; inline expense approval; Friday "summary & suggested fix"; linked records. | LIVE | **P0** |
| D | **Approvals** | field-report queue → vetted task; approve→assign / decline; AI-vetting workflow ("approve all routine"). | LIVE (queue) / SPEC (AI vet) | **P0** |
| E | **Roster** | week grid + workload bars + publish; **Roster Friday Consult** (zone-fit, weekend fairness, night/standby, travel). | LIVE (roster) / SPEC (AI balance) | **P1** |
| F | **Supplies** | par levels, on-hand, SKU, restock orders — design the future inventory reusing `task_supplies`/`stock_movements` (movements link to the consuming task). **Biggest gap.** | SPEC | **P1** |
| G | **Live Map + field-location dispatch** | who's where for dispatch; consent-gated foreground geolocation, visible sharing indicator + stop control, ETA/proximity language, audit-logged views. | SPEC | **P2** |
| H | **Settings** | per-tenant templates / booking-policies / recurring-rules / duration matrix / SRL loadout (mig 114). | LIVE (config) | **P2** |

## 7. Critical states the UI must make legible
- **Draft-vs-applied** — first-class for Schedule / Roster / Approvals: Friday "drafted the day" → **Apply / Undo /
  Clear**; nothing mutates until applied; draft rows show **named assignees**, never generic text.
- **The five trust-states → real signals:** **Healthy** = consult grounded, `confidence ≥ 0.75` band, plan covers
  all open tasks; **Partial** = assignment-coverage gaps / pricing unknown / occupancy unresolved; **Fallback** =
  `compactFallbackUsed`; **Failed→deterministic** = `deterministicFallbackUsed` ("model unavailable — ran the safe
  local planner" — must read honest, not magic); **Stale** = roster/availability cache aged.
- **Occupancy guardrail** — a confirmed/checked-in stay **blocks non-urgent work** check-in → night-before-checkout;
  **checkout day stays schedulable**; urgent guest-linked exceptions allowed. The planner must *show* why a slot is
  blocked.
- **Lunch protection** — every staff member gets a protected 1-hour lunch (prefer 12:00–13:00); admin lunches
  staggered for coverage.
- **Combo splitting** — a combo booking (LB-C, VA-C) creates **child-unit tasks tagged to the parent**, not one big
  task.
- **Sensitive codes** (gated) + **offline-sync** (idle/saving/queued/failed) + **owner-charge** amounts (manager-
  gated, draft-only until validated).

## 8. Key flows to storyboard
1. **Triage:** field reports → vet → tasks ("approve all routine").
2. **Plan the day:** open Schedule → Friday drafts (skill-fit + lunch + occupancy + combo-split) → review unassigned
   / overloads / travel risk → **Apply** (reversible) → or talk to **Schedule Consult** to adjust.
3. **Roster:** Roster Consult reviews the week (load, zones, weekend fairness, night/standby) → draft → publish (a
   "Roster published" note posts into TeamInbox `ops`).
4. **Task record:** reassign / reschedule / approve cost / comment / complete; the manager view mirrors field
   execution read-only.
5. **Dispatch (future):** Live Map → who's nearest → assign; consent + audit honored.

## 9. Reference artifacts
Prototype `fad-task-drawer.jsx` + `fad-desktop-screens.jsx` + `fad-mobile-screens.jsx`; built `OperationsModule` +
`gm/screens/*` + `/api/tasks/*` + `/api/operations/*` (consult `[OPS_ACTION]`, settings mig 114, attachments mig
113) + `_data/opsPolicy.ts` + `taskRequirements.ts`; the duration matrix + recurring catalog + SRL formulas +
scheduling-agent I/O (Ops pack §Duration/Recurring/SRL/Scheduling-Agent); travel-time `/api/operations/travel-time/
estimate`; the `ai/` kit.

## 10. Recommended design priority
1. **A–D:** Overview/Workbench, the Schedule planner (with draft-vs-applied + occupancy/lunch), the task slide-over,
   and Approvals.
2. **E–F:** Roster + Roster Consult, and Supplies (the biggest backend gap — design onto the existing semantics).
3. **G–H:** Live Map + field-location dispatch, and Settings.

## 11. Out of scope / honest-future (don't fake as real)
**No backend yet — design but mark future / empty-state:** Supplies inventory (par/on-hand/SKU/auto-reorder don't
exist; only supply-*use* + stock_movements are real) · **Live Map / field-location telemetry** (no backend; explicit
"no location data yet / opt-in" empty state) · **automation** (booking-trigger/recurring rules persist but nothing
executes them yet) · the **AI-suggestion surfaces** (Friday-learnings, pattern detection, AI roster-balancing,
Daily-Brief prose — demo copy; gate behind a flag) · Breezeway **photo bytes** + real-time webhook. Travel-time is
built but **unwired** — design surfacing drive-time between consecutive jobs.

## 12. Open decisions (propose options, don't guess)
1. **Trust-state rendering** — confidence band (high/med/low/unknown), **draft-vs-applied**, and the deterministic-
   fallback case, consistent across Overview brief / Schedule draft / Approvals triage / scoped Consult.
2. **Task drawer scope** — the V2 slide-over drops timer / access-codes / imported-history / typed-cost-breakdown
   from the current rich detail. Keep them where? (timer + access → field PWA / Property record; "more" expansion
   for the rest?) **Flag — don't silently lose them.**
3. **Supplies** — design to the future inventory model, reuse `task_supplies`/`stock_movements`.
4. **AI-suggestion surfaces** (learnings / roster-balancing / pattern detection) — design now behind a flag, or defer?
5. **Live Map** — forward-looking with an explicit no-backend empty state + the consent/sharing-indicator UX.
6. **Travel-time** — surface drive-time between consecutive jobs in the planner (endpoint built, unwired)?
7. Confirm **manager mobile vs field PWA** stay two separate apps.

## 13. What we want back
Overview/Workbench, the **Schedule planner with draft-vs-applied + occupancy/lunch**, the **task slide-over**, and
Approvals first — manager desktop + manager-mobile — built on `/api/tasks` + `/api/operations` + the `ai/` kit, with
the deterministic-fallback + occupancy + draft-vs-applied states visible. Then Roster + Consult, Supplies (honest
SPEC), Live Map + dispatch. Keep the field PWA separate; flag the task-drawer-scope losses; propose options on §12.
