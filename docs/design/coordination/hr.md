# HR — Design Brief for Claude Design

> No standalone HR scoping pack — HR is distributed across the **Ops pack** (roster, `36b43ca8849281b0b1b3db967c4a2b73`),
> the **Reviews pack** (HR Stats fed by task-completion + review sentiment), and the **Analytics pack** (HR Insights =
> a Cube-Core projection). Read `00-README` + `ask-friday.md` first. **HR = staff records / roster / time-off / stats
> / permissions; the boundary with Training is explicit — HR ≠ SOP/learning.**

## 1. The brief in one line
Design HR as the **staff-operations surface** — the staff directory, the **time-off request queue** (promoted to
first-class), the weekly **roster** (HR-owned, Ops-operated, draft→publish), and staff **stats/insights** — with the
director-only **permissions** matrix, honest **"no synced data yet"** states, and trust instrumentation on every
modeled productivity figure.

## 2. Source of truth and grounding (three-way reconcile)
- **Vision.** **Roster** is **HR-owned but Ops-operated** (Ops pack): manual-first, AI drafts + assists, Franny/
  Ishant approve; **risk gates — don't silently finalize; approval-routed.** The module AI is **Friday Consult** (the
  Ops Consult agent), not a separate HR bot. **HR Stats** = task-completion + review sentiment → richer staff
  performance (Reviews pack). **HR Insights** = a per-module projection of the **Analytics Intelligence Core (Cube
  Core)**. **HR↔Training split locked** (Apr 28): HR holds staff/roster/time-off/stats; Training holds SOP/learning —
  the Master-Plan `fad_hr_training_assistant` therefore spans two FAD modules (don't merge onboarding-SOP UI into HR).
- **Reality.** **LIVE:** `hrClient.ts` → `/api/hr/staff` (GET/POST/PATCH + archive/reactivate) + `/api/hr/time-off`
  (GET/POST/PATCH-decide + cancel); `StaffPage` + `TimeOffPage` run live (with a fixture fallback so they never
  blank). `rosterClient.ts` → `/api/hr/roster` (GET, PUT draft, **publish**) — the draft/publish lifecycle is real.
  HR is in `LIVE_WIRED_MODULE_IDS`. **CORE:** `HRInsightsPage` computes per-assignee productivity from live ops
  tasks + portfolio ("Phase 0 partial; becomes a scoped Cube-Core query later"); `StatsPage` partly fixture-
  extrapolated. **SPEC/demo:** the `HRModule.tsx` wrapper still carries a stale `@demo:data` tag; **AI roster-
  balancing is demo/draft-only** (the Consult panel drafts cells, never auto-applies — matches the risk gate);
  `PermissionsPage` mutates an **in-memory** object (no persistence endpoint yet). **Ops↔HR overlap:**
  `OperationsModule` gates a Roster tab on `hr_roster` and renders **field → `RosterPage`** vs **manager → `GmRoster`**
  — two skins over the **same `/api/hr/roster`**.
- **Drawn.** `ScreenHR` (tabs Staff / Time-off / Stats / Insights / Permissions; KPIs; staff table → drawer; a
  time-off approve/decline card with a coverage line) — **no Friday/trust chips (pure CRUD)**. `ScreenRoster` lives
  **under Operations** (the canonical HR↔Ops shared surface) with the **full roster Friday Consult** (coverage agent →
  Draft → Publish). `MobileHR`.
- **Full-vision rule:** draw the leave queue, the roster Consult states, and the stats/insights complete; the
  **"no synced data yet" / draft-vs-published / modeled** states are the point.

## 3. Who uses it (roles + the sensitivity gap)
HR resources: `hr_staff, hr_roster, hr_time_off, hr_stats, hr_permissions`.
- **Director-only:** `hr_permissions` (team & role management — enforced twice; the director role row is
  lockout-protected, cannot be revoked).
- **Manager** (ops_manager ≡ commercial_marketing): FULL on staff/roster/time-off/stats; **denied** hr_permissions
  (+ finance/tenant/billing/admin-analytics).
- **Field:** `hr_roster` read=self, time-off/stats self-only, `hr_staff` none.
- **⚠ Sensitivity gap:** the data model exposes **no salary/wage, no performance-rating, no private-HR-notes** fields
  (the staff drawer edits only operational fields + leave_reason/notes on archive). The manager-vs-director line today
  is **finance + permissions, not personnel privacy.** If V2 adds individual performance or private notes, they need a
  **new restricted scope** (director-only, or manager-but-not-self) — not yet modeled. Design that scope.

## 4. Design principles and system
- **Roster: manual-first, AI-assists, never auto-publishes.** The Consult drafts; a human publishes. The risk gate is
  non-negotiable.
- **Apply the built `ai/` kit** — HR renders none today.
- **Keep HR ≠ Training** — SOP/onboarding/learning live in Training (the `fad_hr_training_assistant` scope spans both;
  don't merge the UIs).

## 5. Information architecture
Tabs: **Staff** (directory + drawer) · **Time-off** (the first-class request queue) · **Stats** · **Insights** ·
**Permissions** (director-only). **Roster** is the shared HR↔Ops surface (rich editor lives in Operations; HR shows
the staff-roster summary).

## 6. Surfaces to design (full vision) — P0 first
| # | Surface | Purpose | Reality | Priority |
|---|---|---|---|---|
| A | **Staff directory + drawer** | live staff records (role/zone/skills/constraints); `SourceTag friday` + freshness. | LIVE | **P0** |
| B | **Time-off queue** | promote request→pending→approved/declined + coverage check from the drawer to a first-class queue. | LIVE | **P0** |
| C | **Roster (shared w/ Ops) + Roster Consult** | week grid (zone cells), draft→publish, the Consult coverage agent with trust-states (disable Publish on `failed`). | LIVE (roster) / SPEC (AI balance) | **P0** |
| D | **Stats + Insights** | modeled productivity (task completion + review sentiment) with `SourceTag modeled` + `ConfBar` + "no synced data yet" empty. | CORE | **P1** |
| E | **Permissions matrix** | director-only role/permission management; needs a persistence contract. | SPEC (in-memory) | **P1** |
| F | **Personnel-privacy fields** (if V2 adds them) | salary/performance/private notes behind a new restricted scope. | SPEC (not modeled) | **P2** |

## 7. Critical states the UI must make legible
- **Roster Consult** → `StateBanner` + `Provenance` + `ConfBar` on a draft (grounded-in tasks/roster/availability;
  **partial** = "staff directory unavailable — fairness check skipped"; **failed** = "can't reach ops data — Publish
  disabled"). **Draft-vs-published** is first-class.
- **Staff / Time-off** → `SyncChip` (FAD freshness; stale-while-revalidate already exposes `isRevalidating`) +
  per-row `SourceTag friday`.
- **Stats / Insights** → modeled numbers pair `SourceTag modeled` + a `ConfBar` band; **"no synced data yet"** empty
  state for unconnected sources (don't fabricate counts).
- **Permissions** → the director-row lockout-protected state; "Only the Director can manage permissions".

## 8. Key flows to storyboard
1. **Time-off:** request → queue (pending) → coverage check → approve/decline.
2. **Roster:** Roster Consult reviews the week (load/zones/fairness/night-standby) → **Draft** → **Publish** (posts a
   note into TeamInbox `ops`).
3. **Staff:** add/edit a staff record (operational fields); archive with reason.
4. **Permissions:** director edits the role matrix (needs persistence).

## 9. Reference artifacts
Prototype `ScreenHR` + `ScreenRoster` (under Ops) + `MobileHR`; built `HRModule` + `hr/{StaffPage,TimeOffPage,
StatsPage,HRInsightsPage,PermissionsPage,StaffDrawer}.tsx` + `roster/RosterPage.tsx` + `_data/{hrClient,rosterClient,
availabilityClient,permissions}.ts`; the `ai/` kit; the Ops pack roster policy + the Reviews/Analytics upstreams for
Stats/Insights provenance.

## 10. Recommended design priority
1. **A–C:** staff directory, the time-off queue, and the roster + Consult (with draft-vs-published + trust-states).
2. **D–E:** stats/insights (modeled + empty states) and the permissions matrix.
3. **F:** the personnel-privacy fields + their restricted scope (if V2 adds them).

## 11. Out of scope / boundaries
SOP / onboarding / learning → **Training** (don't merge). Roster AI **never auto-publishes** (approval-routed).
Field location/telemetry is an **Ops dispatch** concern (director/ops-manager only, audit-logged) — at most an
on-shift status in HR. Cube-Core-backed Insights are Phase-later; show `modeled`/`stale` honestly meanwhile.

## 12. Open decisions (propose options, don't guess)
1. **Roster home** — HR tab, Operations, or shared-and-cross-linked? (The prototype puts the rich editor in Ops; HR
   shows the summary.) **Flag — the sharpest clash.**
2. **Personnel privacy** — does V2 add individual performance / private-notes records, and what restricted scope
   guards them (director-only vs manager-not-own)?
3. **Roster auto-publish** — ever allowed, or permanently draft+approve?
4. **HR Stats** — keep Phase-0 task-derived, or block on Cube Core? (affects how loudly to show `modeled`/`stale`.)
5. **Permissions persistence** — a `/api/hr/permissions` write contract is needed before the matrix is real.
6. **On-shift / location** — does any Ops field-location signal surface in HR?

## 13. What we want back
The **staff directory**, the **time-off queue**, and the **roster + Consult** (draft-vs-published + trust-states)
first — manager desktop + the field/self mobile slice — built on the live `/api/hr/*` clients + the `ai/` kit, with
the "no synced data yet" + modeled + draft states visible. Then stats/insights + permissions. Resolve the roster-home
clash; design the personnel-privacy restricted scope; propose options on §12.
