# DEMO_CRUFT.md — Frontend demo registry

> **Master registry of every place the FAD frontend fakes a backend.** When the real backend lands and Judith starts wiring real APIs, this file is the punch-list. Each row maps a `// @demo:*` tag in the source to the backend action needed.

The frontend is currently a **complete demo** — auth is fake, data is local fixtures, mutations write to in-memory arrays, "logout" just clears localStorage. None of this should ship to production unchanged.

---

## How to use this file

**For Judith (or whoever wires the backend):**

1. Grep the tags: `rg "// @demo:" frontend/src/`
2. For each match, find the row in this file using the trailing `Tag: PROD-XXX-N` ID
3. Do the backend action listed
4. Remove the `// @demo:*` comment from the source
5. Cross-check this file: when every PROD-* tag is gone from the codebase, this file should be empty (or describe only intentional static config)

**For future Claude / Ishant (when adding new code):**

If you write something demo-only or fake-backend, add a `// @demo:*` comment in the source AND a row here. See `CLAUDE.md` § "Demo cruft tagging" for the convention.

---

## Tag taxonomy

| Tag | Means | Backend action |
|---|---|---|
| `@demo:data` | Hardcoded fixtures the UI reads from | Replace with API fetch |
| `@demo:logic` | Client-side logic that should be authoritative on backend | Move to backend; replace with API call |
| `@demo:state` | Frontend-only persisted state (localStorage) that needs server sync | Add backend mirror + sync layer |
| `@demo:auth` | Anything that bypasses real authentication / authorization | Wire real auth + replace permission checks with backend gating |
| `@demo:ui` | UI surfaces that exist only because we're showcasing | Remove or hide behind feature flag |

---

## PROD-DATA — Fixtures

15 data fixture files exist purely so the UI has something to render. Each gets replaced by a real API endpoint.

| ID | Path | What it holds | Backend action |
|---|---|---|---|
| PROD-DATA-1 | `frontend/src/app/fad/_data/fixtures.ts` | Inbox threads, internal notes, channel tree, calendar events, KPIs | Split into `GET /api/inbox/threads`, `GET /api/calendar/events`, etc. — the largest fixture file, may need decomposition first |
| PROD-DATA-3 | `frontend/src/app/fad/_data/finance.ts` | Expenses, approvals, reconciliation, payouts, refunds (~228 rows) | Multiple endpoints: `GET /api/finance/expenses`, `/api/finance/payouts`, `/api/finance/refunds`, `/api/finance/transactions` |
| PROD-DATA-4 | `frontend/src/app/fad/_data/properties.ts` | Properties + onboarding state + portfolio insights (~30 rows) | `GET /api/properties` (with `?include=onboarding,insights`) |
| PROD-DATA-5 | `frontend/src/app/fad/_data/fixtures-tier3.ts` | HR staff, time-off requests | `GET /api/hr/staff`, `GET /api/hr/time-off-requests` |
| PROD-DATA-6 | `frontend/src/app/fad/_data/reservations.ts` | Bookings (~65 rows) | `GET /api/reservations` (with pagination + filters) |
| PROD-DATA-7 | `frontend/src/app/fad/_data/analytics.ts` | Benchmarking, occupancy, revenue across properties | `GET /api/analytics/benchmarks`, `GET /api/analytics/kpis` |
| PROD-DATA-8 | `frontend/src/app/fad/_data/gms.ts` | GMS conversation threads + messages | `GET /api/gms/conversations` (already partly backed by real GMS — verify what's mock vs. real) |
| PROD-DATA-9 | `frontend/src/app/fad/_data/reviews.ts` | Channel reviews (Airbnb, Booking, etc.) with reply state (~32 rows) | `GET /api/reviews`, `POST /api/reviews/:id/reply` |
| PROD-DATA-10 | `frontend/src/app/fad/_data/roster.ts` | Staff roster, scheduled by week, with publish state | **Partly replaced 2026-05-22:** Operations Roster page now uses `GET/PUT /api/hr/roster?week_start=:date` and `POST /api/hr/roster/publish`; fixture rows remain for notification/pending-count demo consumers until notifications are backend-backed |
| PROD-DATA-11 | `frontend/src/app/fad/_data/teamInbox.ts` | Team-internal threads | `GET /api/inbox/team-threads` |
| PROD-DATA-12 | `frontend/src/app/fad/_data/breezeway.ts` | Breezeway integration / synced data | `GET /api/integrations/breezeway` |
| PROD-DATA-13 | `frontend/src/app/fad/_data/friday.ts` | Friday-the-AI card metadata + prompts | `GET /api/friday/cards`, `GET /api/friday/prompts` |
| PROD-DATA-14 | `frontend/src/app/fad/_data/notifications.ts` | Notification entries | `GET /api/notifications` (per-user) |
| PROD-DATA-15 | `frontend/src/app/fad/_data/aiFixtures.ts` | AI inference context fixtures | Depends on AI integration — likely returned alongside conversation fetch |
| PROD-DATA-16 | `frontend/src/app/fad/_components/modules/FinanceModule.tsx` (~line 1373) `PNL_BY_ENTITY` | Inline P&L by entity (FR/FI/S/all) with hardcoded MUR figures | `GET /api/finance/pnl?entity=:entity&period=:period` |
| PROD-DATA-17 | `frontend/src/app/fad/_components/modules/properties/PropertyDetail.tsx` (~line 525) `AI_SUGGESTIONS_BY_CODE` | Hardcoded AI Card suggestions per property code | `GET /api/properties/:code/ai-suggestions` (server-side LLM-derived) |
| PROD-DATA-18 | `frontend/src/app/fad/_components/modules/StubModules.tsx` (~line 1338) `PITCH_SPECS` | "Coming soon" pitch narratives for unreleased modules; references demo guests/owners | `GET /api/cms/pitches` — or just remove module-stub UI when each module ships |
| PROD-DATA-19 | `frontend/src/app/fad/_components/modules/StubModules.tsx` (~line 1472) `TEASE_SPECS` | "Coming soon" tease blurbs; hardcoded "Ishant only", "until 2028", etc. | `GET /api/cms/teases` — or remove tease UI when modules ship |
| PROD-DATA-20 | `frontend/src/app/fad/_components/modules/SettingsModule.tsx` (multiple inline blocks lines ~103-238) | Hardcoded "Ishant Sagoo" + email + 6-person team roster + integrations list + bug reports + billing | Multiple endpoints: `GET /api/users/team`, `GET /api/integrations`, `GET /api/bug-reports`, `GET /api/billing` |
| PROD-DATA-21 | `frontend/src/app/fad/_data/finance.ts` (~line 60) `FIN_OWNERS` | Hardcoded property owners (Smith Family, Marchand SCI, etc.). Was on KEEP list in first audit but contains Friday-specific demo names. | `GET /api/finance/owners` |
| PROD-DATA-22 | `frontend/src/app/fad/_data/finance.ts` (~line 84) `FIN_CATEGORIES` | Hardcoded expense categories | `GET /api/finance/categories` (likely tenant-configurable) |
| PROD-DATA-23 | `frontend/src/app/fad/_data/finance.ts` (~line 110) `FIN_VENDORS` | Hardcoded vendor records | `GET /api/finance/vendors` |
| PROD-DATA-24 | `frontend/src/app/fad/_data/finance.ts` (~line 178) `FIN_PERIODS` | Hardcoded fiscal periods (April 2026, etc.) | `GET /api/finance/periods` |
| PROD-DATA-25 | `frontend/src/app/fad/_components/modules/TrainingModule.tsx` (entire file) | Training module — Sources, Performance, Brand voice sub-pages all render inline demo JSX | Real Training UI when shipped, OR `<ComingSoon />` placeholder until then |
| PROD-DATA-26 | `frontend/src/app/fad/_components/modules/HRModule.tsx` (entire file) | HR module — Staff names, time-off, stats, permissions all inline demo JSX | Wire to `GET /api/hr/staff`, `/api/hr/time-off`, `/api/hr/permissions` |
| PROD-DATA-27 | `frontend/src/app/fad/_components/modules/ReviewsModule.tsx` (entire file) | Reviews — anomaly callouts, suggested actions, trends, staff perf names all inline | Wire to `GET /api/reviews`, `/api/reviews/anomalies`, `/api/reviews/suggested-actions` |
| PROD-DATA-28 | `frontend/src/app/fad/_components/modules/AnalyticsModule.tsx` (entire file) | Analytics — Overview, Revenue, Occupancy, Channels, Reviews, Team, Margin sub-pages all inline charts/cards with mock numbers | Wire to `GET /api/analytics/*` per sub-page |
| PROD-DATA-29 | `frontend/src/app/fad/_components/modules/Tier3Modules.tsx` (entire file) | Guests, Marketing, Leads, Intelligence — all four modules are inline demo JSX (top-card stats, channel mix, direct booking funnel, morning digest, weekly pulse, etc.) | Wire each to its own backend endpoints OR keep as `<ComingSoon />` until shipped |
| PROD-DATA-30 | `frontend/src/app/fad/_data/fixtures.ts:399` `CAL_EVENTS` | 7 hardcoded calendar events (Pool service · BBH, Ops stand-up, Mary handover, etc.) keyed by absolute date | `GET /api/calendar/events?from=:date&to=:date` returning maintenance + meeting events |
| PROD-DATA-33 | `frontend/src/app/fad/_data/financeAnomalies.ts:79` `FIN_PAYOUT_DISCREPANCIES` | 6 seeded reconciliation discrepancies (resolution-centre sync, special-offer collapse, etc.) with named guests (Hugo Meunier, Wei Chen, Eleanor Dray) | `GET /api/finance/payout-discrepancies?period=:periodId` (auto-detected by recon engine) |
| PROD-DATA-34 | `frontend/src/app/fad/_data/finance.ts:520` `FIN_TOURIST_TOTALS.ownerOverRefundDueEur/Count` | Hardcoded illustrative roll-up for tourist-tax over-refund hero block (1294 EUR / 23 reservations) | `GET /api/finance/tourist-tax/totals` returning roll-up across all months |
| PROD-DATA-35 | `frontend/src/app/fad/_components/modules/FinanceModule.tsx:1255` "Reservations included 14" | Hardcoded reservation count in tourist-tax filing summary | Compute from `FIN_TOURIST_TAX[period].reservationsIncluded` once that field exists, OR derive from a future `GET /api/finance/tourist-tax/period/:id` |
| PROD-DATA-37 | `frontend/src/app/fad/_data/timeOff.ts:23` `TIME_OFF_REQUESTS` | 6 hardcoded leave requests with named staff (Mary, Bryan, Catherine etc.). The request data is demo; the type/status labels in this file remain config | `GET /api/hr/time-off-requests` |
| PROD-DATA-38 | `frontend/src/app/fad/_data/tasks.ts:101` `TASK_USERS` | 9 hardcoded staff records (Judith, Ishant, Mathias, Franny, Mary, Bryan, Alex, Catherine + Oracle Cleaning Co). Drives HR Staff, role-switcher, mentions, assignee picker, FridayDrawer greeting | `GET /api/users/team`. Role-switcher (PROD-AUTH-3) goes away when real auth lands; `useCurrentUser()` reads from JWT |
| PROD-DATA-39 | `frontend/src/app/fad/_data/roster.ts:71` `ROSTER_USERS_ORDER` | Hardcoded 7-user list driving old fixture roster grids | **Replaced for Operations Roster page 2026-05-22:** grid staff now comes from `GET /api/hr/staff?status=active`; constant remains only for fixture consumers |
| PROD-DATA-40 | `frontend/src/app/fad/_data/roster.ts:255` `WORKLOAD_THIS_WEEK` + `ROSTER_THIS_WEEK.aiNotes`/`aiConstraintWarnings` | Pre-aggregated workload preview (by zone × department, by day) plus AI-generated notes referencing Bryan / Mary / Catherine / specific properties | **Partly replaced 2026-05-22:** Operations Roster workload now computes from live `/api/tasks` in the page; AI roster suggestions/constraint notes still need a future backend suggestion endpoint |
| PROD-DATA-41 | `frontend/src/app/fad/_data/reservations.ts:628` `INQUIRIES` | 5 inquiry records with named guests (Elena Rossi, James Thompson, Sofía Mendez, etc.) and quote amounts in EUR | `GET /api/reservations/inquiries` |
| PROD-DATA-42 | `frontend/src/app/fad/_data/reviews.ts:584` `STAFF_REVIEW_LINKS` + `COHORT_NARRATIVES` (~745) + `SUGGESTED_ACTIONS` (~769) + `REVIEW_ANOMALIES` (~809) | All four populated with staff + property names + AI-style narrative bodies referencing Mary, Catherine, BCN-A, LB-2, etc. | `GET /api/reviews/staff-links`, `/api/reviews/cohort-narratives`, `/api/reviews/suggested-actions`, `/api/reviews/anomalies` |
| PROD-DATA-43 | `frontend/src/app/fad/_components/modules/AnalyticsModule.tsx:128` Portfolio-health bullets | 5 inline JSX bullets with named properties (Sable Noir rating slipping, Nitzana soft-launch, etc.) | `GET /api/analytics/portfolio-health` returning a list of `{ label, detail, direction }` |
| PROD-DATA-44 | `frontend/src/app/fad/_data/fixtures.ts:333` Legacy demo cluster (`FIN_KPIS` / `FIN_TX` / `OPS_CLEANS` / `OPS_TICKETS` / `LEGAL_CONTRACTS` / `OWNERS`) | Pre-rebuild stub-module data with hardcoded amounts, owner names, contract parties (Nitzana, Beaumont, Harrington, Breezeway, etc.). Consumed only by `StubModules.tsx` | Wire each consumer to its real backend when the relevant module ships, OR remove this cluster entirely once `StubModules.tsx` is decommissioned |
| PROD-DATA-45 | `frontend/src/app/fad/_data/gms.ts:279` `LEARNING_SOURCES` + `LEARNING_SOURCE_SUMMARY` (~289) | Inline event log of teachings derived from staff actions, plus per-origin summary counts. Drives Training · Sources tab | `GET /api/training/learning-sources` (event log of teaching-derivation events) + roll-up |
| PROD-DATA-46 | `frontend/src/app/fad/_data/gms.ts:310` `STAFF_PERFORMANCE` + `PERFORMANCE_KPI` (~318) | Per-staff conversation/draft-acceptance metrics + portfolio KPIs. Drives Training · Performance tab | `GET /api/training/staff-performance`, `GET /api/training/kpis` |
| PROD-DATA-47 | `frontend/src/app/fad/_data/gms.ts:233` `BRAND_VOICE` | Voice principles + good/bad reply examples (referencing Thibault, Linde) + tone-by-situation map. Drives Training · Brand voice tab | Optional: keep as static config if Friday's voice is canonical, OR `GET /api/training/brand-voice` for tenant-configurable voice |
| PROD-DATA-48 | `frontend/src/app/fad/_data/fixtures.ts:447` Legal cluster: `LEGAL_RENEWALS` + `LEGAL_LICENSES` + `LEGAL_COMPLIANCE` + `LEGAL_DOCS` | Drives Legal & Admin · Renewals / Licenses / Compliance / Documents sub-pages. References Harrington, Beaumont, Nitzana + named owners (Mary, Ishant) | Multiple endpoints: `GET /api/legal/renewals`, `/api/legal/licenses`, `/api/legal/compliance`, `/api/legal/documents` |
| PROD-DATA-49 | `frontend/src/app/fad/_components/modules/reviews/SettingsPage.tsx:13` Hardcoded masked API keys (`gst_8f2a`, `brz_4d91`) + inline integration sync stats ("2 minutes ago", "3 reviews today") | Reviews · Settings sub-page integration card | `GET /api/integrations/{guesty,breezeway}/status` returning masked-secret + last-sync timestamps + recent activity |
| PROD-DATA-50 | `frontend/src/app/fad/_data/supplies.ts` | Starter Operations supply catalog, stock locations, and SRL/welcome-pack loadout rules used by task execution | `GET /api/inventory/supplies` plus tenant-configurable loadout rules once Inventory is fully backed |

**Static config (intentionally NOT tagged, ships as-is):**
- `_data/modules.ts` — FAD module definitions (sidebar nav)
- `_data/permissions.ts` — role × resource matrix (could move to backend later, fine static for v1)
- `_data/financeAnomalies.ts` — anomaly detection rule config (`DISCREPANCY_KIND_LABEL`, helpers)
- `_data/financeRoles.ts` — approval tier config
- `_data/timeOff.ts` — type + status label maps only (the request data itself is now PROD-DATA-37)

---

## PROD-AUTH — Authentication bypass

| ID | Path | What it does today | Backend action |
|---|---|---|---|
| PROD-AUTH-1 | `frontend/src/components/LoginScreen.tsx` (entire file) | Accepts any email + password, fakes a "Welcome" flash, navigates to `/fad`. Includes hardcoded TEAM, FUNNY_GREETINGS, TIPS pools. | Wire real auth (OAuth/JWT/SAML). Replace `enterAs()` with `POST /api/auth/login`, store token, redirect on success. Remove TEAM hardcoding (replaced by `GET /api/users/team` if still needed). |
| PROD-AUTH-2 | `frontend/src/app/fad/_components/Header.tsx` (`handleLogout` in AvatarDropdown) | Clears localStorage and redirects to `/`. No server call. | Replace with `POST /api/auth/logout` to invalidate session server-side. Keep the localStorage cleanup for client-side hygiene. |
| PROD-AUTH-3 | `frontend/src/app/fad/_components/PermissionGate.tsx` (role-switcher UI ~lines 82-155) | "View as · dev preview" lets the user pick any role. Powers all the role-gated UI in the FAD. | **Remove the UI entirely.** Real auth resolves role from JWT. Keep `<PermissionGate>` as a no-op wrapper or delete and replace usages with backend role checks. |
| PROD-AUTH-4 | `frontend/src/app/fad/_components/usePermissions.ts` (lines 33-89: STORAGE_KEY trio + PermissionsProvider) | Reads `fad:dev-role` / `fad:dev-user` / `fad:real-role` from localStorage. `pickUserForRole()` finds first fixture user matching a role. | Replace with auth-context provider that reads role + user from JWT (or `GET /api/auth/me`). Delete dev-role storage entirely. Backend MUST also enforce permission on API endpoints — client checks are not authoritative. |
| PROD-AUTH-5 | `frontend/src/app/fad/_components/modules/StubModules.tsx` (line ~26) `CURRENT_USER = 'Ishant'` | Hardcoded current user identity used for task filtering | `useCurrentUser()` hook from auth context (JWT/session payload) |

---

## PROD-STATE — localStorage state

| ID | Key(s) | Set / read in | Backend action |
|---|---|---|---|
| PROD-STATE-1 | `fad:dev-role`, `fad:dev-user`, `fad:real-role` | `usePermissions.ts` | **Delete entirely.** Replaced by JWT/auth-context (see PROD-AUTH-4). |
| PROD-STATE-2 | `fad:last-email` | `LoginScreen.tsx`, `Header.tsx` (cleared on logout) | Either delete (auth provider remembers), or move to httpOnly cookie. Don't keep in localStorage. |
| PROD-STATE-3 | `fad:notif-read`, `fad:notif-context` | Notifications module | Sync with backend per user. `PUT /api/notifications/:id/read`, `PATCH /api/notifications/:id/context` (snooze/note/waiting-on/forward). |
| PROD-STATE-4 | `fad:roster-ack:{weekId}` | `_data/pendingCounts.ts` | `POST /api/hr/roster/:weekId/acknowledge` (event-based). Backend stores per-user ack with `publishedAt` timestamp; on re-publish, ack invalidates. |
| PROD-STATE-5 | `fad:review` (review mode toggle) | `_data/reviewMode.ts` | Backend feature flag (`GET /api/feature-flags`). |
| PROD-STATE-6 | `fad:theme`, `fad:collapsed`, `fad:inbox:list`, `fad:inbox:right` | UI preferences across FAD shell | **Optional** — these are pure UI prefs, fine to keep client-only. If we want cross-device persistence: `GET/PUT /api/user/preferences`. |

---

## PROD-LOGIC — Mock mutations + frontend-computed

| ID | Path | What it does today | Backend action |
|---|---|---|---|
| PROD-LOGIC-1 | `frontend/src/app/fad/_components/modules/properties/CreatePropertyDrawer.tsx` (line ~121) | `PROPERTIES.push(property)` mutates the fixture array directly, then `bumpRev()` to force re-render. | `POST /api/properties` with the created property body. Backend returns the created entity; frontend appends to its cache or refetches. |
| PROD-LOGIC-2 | `frontend/src/app/fad/_components/modules/reservations/CreateReservationDrawer.tsx` (line ~139) | `RESERVATIONS.push(newRsv)` direct fixture mutation. | `POST /api/reservations`. |
| PROD-LOGIC-3 | `frontend/src/app/fad/_components/modules/reservations/ReservationDetail.tsx` (line ~313) | Cancel sets `r.status = 'cancelled'` directly on fixture. | `POST /api/reservations/:id/cancel` (Guesty cancel + owner notification, per Phase 2 comment). |
| PROD-LOGIC-4 | `frontend/src/app/fad/_components/modules/operations/CreateTaskDrawer.tsx` (line ~59) | Phase 1 regex-based intent parsing for natural-language task creation. | Backend LLM intent endpoint (`POST /api/intent/parse-task`) — already noted as Phase 2 in the source. |
| PROD-LOGIC-5 | `frontend/src/app/fad/_data/pendingCounts.ts` (entire file) | Computes sidebar pending-count badges by filtering local fixtures. Hardcoded `TODAY = '2026-04-27'` baseline. | `GET /api/pending-counts?role=:role&userId=:id` returns role-aware signals computed server-side. |
| PROD-LOGIC-6 | `bumpPendingRev()` / `subscribePendingRev()` pattern, defined in `pendingCounts.ts:314-328` | Client-side pub/sub that lets fixture mutations trigger badge recomputation across components. | Replace with WebSocket/SSE subscription to backend mutation events (e.g., `task.created`, `notification.new`). Frontend listens, refetches affected slices, or applies optimistic update. |
| PROD-LOGIC-7 | Hardcoded `TODAY = '2026-04-27'` in `_data/notifications.ts:19`, `_data/reviews.ts:621`, `_data/pendingCounts.ts:22` | Demo timeline anchored to a specific date so fixtures stay self-consistent. Ops task fixtures have been removed from `_data/tasks.ts`; remaining references belong to adjacent modules. | Use real `Date.now()` / server `now()`. All "today / yesterday / next week" calculations need to be relative to the actual current date. |
| PROD-LOGIC-8 | Various inline `bumpRev()` patterns (ReviewsModule, OperationsModule, CalendarModule, FinanceModule, RosterPage, hr/* pages) | Each module keeps a `[rev, setRev]` and bumps it after mutating fixtures. | Same as PROD-LOGIC-6 — server-pushed updates replace client-side bump pattern. |
| PROD-LOGIC-9 | Hardcoded `TODAY` / `TODAY_ISO` constants in 6 module files: `CalendarModule.tsx:38`, `reservations/InquiriesPage.tsx:34`, `reservations/OverviewPage.tsx:15`, `reservations/AllReservationsPage.tsx:23`, `hr/StaffPage.tsx:13`, `roster/RosterPage.tsx:26` | Demo-anchored "now" so fixture math stays self-consistent. `OperationsModule.tsx` was moved to a client-local date helper in the Operations/Breezeway Wave 2 cutover. | Use `new Date()` / server `now()`. Audit every "in N days" / "M days ago" calculation cascading from the remaining fixture modules. |
| PROD-LOGIC-10 | `frontend/src/app/fad/_components/modules/InboxModule.tsx` (~line 1062) `INBOX_INTERNAL_NOTES.push(note)` | Mock mutation: appending an internal note pushes directly to the fixture array | `POST /api/inbox/threads/:id/notes` |
| PROD-LOGIC-11 | `frontend/src/app/fad/_components/modules/FinanceModule.tsx` (~line 2759) `const cap = 200_00` (Mathias refund authority cap) | Hardcoded business policy constant | `GET /api/finance/policies` returning per-role authority caps. Likely tenant-configurable when multi-tenant lands. |
| PROD-LOGIC-12 | **Brittle `array[0]` accesses** (NOT demo content per se, but breaks when source fixtures are empty): `FinanceModule.tsx:912-913` (`FIN_OWNER_STATEMENTS[0]`), `1252-1253` (`FIN_TOURIST_TAX[0]`), `1529` (`FIN_FLOAT_ACCOUNTS[0]`), `2624` (`FIN_BANK_LINES[0]`), `2948` (`FIN_ACCOUNTS[0]`); `InboxModule.tsx:139` (`INBOX_THREADS[0]`); `inbox/TeamInbox.tsx:56-59` (`visibleChannels[0] / visibleDms[0]`); `FridayDrawer.tsx:151` (`TASK_USER_BY_ID[currentUserId]?.name.split`) | useState initializers and `find() \|\| array[0]` cascades that crash on empty arrays | When wiring backend, add empty-state guards: `array.length > 0 ? array[0].id : null`, plus loading/empty states in the JSX. |
| PROD-LOGIC-13 | `frontend/src/app/fad/_data/pendingCounts.ts:217` `pendingFinance` always-fires-+1 reconciliation signal | When `TODAY_DAY >= 25`, the Finance sidebar pending-count badge added a hardcoded `+1` for "reconciliation due" regardless of whether any items needed reconciling — surfaced a "1" chip on Finance even with all fixtures empty | Already fixed: now requires `monthEndItems > 0`. When real backend lands, drop the `TODAY_DAY` check entirely and rely on `monthEndItems` (server-computed) being non-zero |

---

## PROD-UI — Demo-only UI surfaces

| ID | Path | What it is | Action |
|---|---|---|---|
| PROD-UI-1 | `frontend/src/components/LoginScreen.tsx` ("SIMULATED · DEMO" pill, line ~328) | Pill above the wordmark indicating demo mode | **Remove** when real auth is wired. |
| PROD-UI-2 | `frontend/src/components/LoginScreen.tsx` (FUNNY_GREETINGS, lines ~26-41) | 14-line random greeting pool ("Wait a second… who are you? 0.0", etc.) | **Optional.** Keep if Friday's voice on a real login screen is still playful. Drop for a more conventional production login. |
| PROD-UI-3 | `frontend/src/components/LoginScreen.tsx` (TIPS pool, lines ~46-59) | 12 admin/STR tips shown below the form | **Optional.** Could become `GET /api/login-tips` (backend-served daily tip), or drop entirely. |
| PROD-UI-4 | `frontend/src/app/fad/_components/PermissionGate.tsx` ("View as · dev preview", lines ~82-155) | Role-switcher UI in the FAD header | **Remove entirely.** Real auth assigns role; users can't pick. |

---

## Architectural notes

### Approvals duplication: Operations vs Finance

Both modules have an "Approvals" sub-page. Confirmed via investigation (audit extension Apr 29 2026):

| | Finance Approvals | Operations Approvals |
|---|---|---|
| Component | `FinanceModule.tsx` `FinanceApprovals()` (~lines 666-751) | `OperationsModule.tsx` `ApprovalsPage()` (~lines 1171-1276) |
| Data source | `FIN_APPROVALS` (linked to `FIN_EXPENSES` via `expenseId`) | Live `/api/tasks` rows with `awaitingHumanApproval`, `blocked`, or approval tags |
| Conceptually | Owner expense approvals (workflow: pending expense → owner decision → approval record) | Field-staff work/task exceptions awaiting manager action |
| UI shape | Split-pane list/detail | Split-pane list/detail (similar but separately implemented) |

**Recommendation:** Keep separate (different domains, different lifecycles). But **extract a shared `<ApprovalSplitPane>` component** to eliminate the UI code duplication. That's a refactor task, not a backend wiring task — file under code-quality follow-ups.

---

## PROD-CONFIG — Business constants & tenant-configurable policy

Hardcoded values that are not fake data but will become tenant-configurable once multi-tenant lands or the backend policy layer exists.

| ID | Path | What it holds | Backend action |
|---|---|---|---|
| PROD-CONFIG-1 | `app/fad/_components/modules/properties/PropertyDetail.tsx:568-571` `FinancialTab` revenue formula | MUR/EUR rate (`44`), PMC commission (`0.20`), Airbnb commission (`0.17`), mock float ratio (`0.08`), tourist-tax proxy (`0.05`) — all hardcoded in per-property payout estimate | `GET /api/finance/policies` returning `{pmcRate, channelRates: {airbnb, bdc, …}, mur_eur_rate, touristTaxRate}` (Finance Phase 2) |
| PROD-CONFIG-2 | `app/fad/_components/modules/FinanceModule.tsx:2188-2194` `SettingsCaps()` inline team array | Per-user spending caps (`20_000_00` manager, `5_000_00` contributors) hardcoded in JSX alongside staff names. Names duplicate PROD-DATA-38; caps are business policy. | `GET /api/finance/policies/caps` returning `[{userId, displayName, role, capMinor, updatedAt}]` |
| PROD-CONFIG-3 | `app/fad/_data/finance.ts:859` `FIN_ESCALATION_CHAIN` | Tier1/2/3 escalation chain with hardcoded recipient IDs (`u-ishant`, `u-mathias`, `u-franny`), timeout minutes (30/15), and `fallbackApprovalCapMinor: 20_000_00` | `GET /api/finance/escalation-chain` returning tenant-configured escalation policy |
| PROD-CONFIG-4 | `app/fad/_components/modules/FinanceModule.tsx:2963` `platformLabel` map | Importable payout platforms hardcoded as Airbnb/BDC/Direct only. Tenant-configurable when multi-tenant lands (different channel mix per property). | `GET /api/finance/import-platforms` returning supported platforms with label, sourceHint, and expected format |
| PROD-CONFIG-5 | `app/fad/_components/modules/FinanceModule.tsx:3157` `useState('MCB')` | MCB hardcoded as default bank in vendor-add form. Mauritius-specific. | Replace default with first connected bank from `GET /api/finance/banks` |
| PROD-CONFIG-6 | `app/fad/_components/modules/reviews/SettingsPage.tsx:8-12` | Channel subscription defaults (`airbnb: true, booking: true, vrbo: true, google: true, direct: false`), auto-publish threshold (5 min), and low-activity window (90 days) hardcoded as `useState` initial values | `GET /api/reviews/settings` returning per-tenant channel subscriptions and review policy config |
| PROD-CONFIG-7 | `app/fad/_components/modules/inbox/ScheduleCallDrawer.tsx:65` | `https://meet.google.com/…` hardcoded as video conferencing provider. No abstraction for Zoom/Teams. | `GET /api/integrations/video-conferencing` returning active provider + URL template |
| PROD-CONFIG-8 | `app/fad/_components/modules/reservations/ReservationDetail.tsx:267` | `https://www.airbnb.com/hosting/reservations` hardcoded in Airbnb resolution handler. Won't route correctly for BDC/Vrbo channels. | `GET /api/integrations/channels/:channelId/resolution-url` returning channel-specific management URL |
| PROD-CONFIG-9 | `app/fad/_components/modules/OperationsModule.tsx:1254, 1311` `r.currency ?? 'MUR'` (×2) | 'MUR' hardcoded as fallback currency in spend-request display (list item + detail view). | Replace with `defaultCurrency` from `GET /api/tenant/config` |

## Notes for backend wiring

- **`bumpRev` pattern is everywhere** — lots of components depend on it. Search-replace strategy: every `bumpRev()` call becomes either (a) an optimistic update + refetch, or (b) a no-op once the SSE event handler refreshes the affected slice.
- **`gms.ts` may already be partly real** — the legacy GMS already has a backend at `/api/conversations`. Verify what's mock vs. real before touching.
- **Permissions check happens twice** — the FAD does client-side gating (UX), but the real backend MUST also enforce permissions on every endpoint. Don't trust the client.
- **The TODAY constant problem cascades** — when you switch to live `Date.now()`, scan every "in N days" / "M days ago" calculation and verify the math still makes sense without a fixed reference point.
- **Brittle `array[0]` initializers (PROD-LOGIC-12)** — when fixtures get replaced with API loading states, these crash on first render. Convert each useState initializer pattern to `array.length > 0 ? array[0].id : null` plus an empty-state UI in the JSX.

---

## Inventory summary

After Apr 29 2026 config audit extension:

- **49 data fixtures + inline business-data Maps** to replace with API endpoints (PROD-DATA-1..49)
- **5 auth-bypass surfaces** to wire real authentication (PROD-AUTH-1..5)
- **6 localStorage-state buckets** to either sync or delete (PROD-STATE-1..6)
- **13 logic patterns** to move to backend or fix (PROD-LOGIC-1..13)
- **4 demo UI surfaces** to remove or feature-flag (PROD-UI-1..4)
- **9 business constants / policy values** to move to config endpoints (PROD-CONFIG-1..9)
- **1 architectural note** — Approvals duplication (Operations vs Finance)

**Total: ~86 `// @demo:*` tags across the codebase.** Grep `// @demo:` to confirm count.
