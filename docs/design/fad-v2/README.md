# Handoff: FAD V2 — AI Operations Platform for Short-Stay Rentals

## Overview
**FAD** is an operations platform for a short-stay / vacation-rental management company ("Friday Retreats"). Its differentiator is **Friday**, an embedded AI operations manager that drafts guest replies, triages field reports into tasks, plans schedules, and learns the team's operating rules over time. There are two surfaces: a **manager/GM desktop app** and a **manager mobile app** (plus a separate field-staff PWA, not in scope here).

This bundle is the **design source of truth**: working, clickable HTML/React prototypes that demonstrate the intended look, structure, interactions, and — importantly — the **AI trust/failure states**. They are **design references, not production code to ship**. The task is to **recreate these designs in a real codebase** (recommended: React + TypeScript SPA; see Stack) using its own patterns, a real router, a real data layer, and real integrations.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, component structure, copy, and interaction states are all final and should be reproduced faithfully. The prototypes are built with React 18 + Babel-in-browser and a single hand-written stylesheet (`fad-desktop.css`); in production these become proper components + a real styling system, but the **visual values and behavior are the spec**.

---

## Architecture of the prototype (so you can map it to real code)

The prototype is a single-page app assembled from plain `<script type="text/babel">` files. Key pieces to translate:

| Prototype mechanism | Production equivalent |
|---|---|
| `window.FADGO(key)` nav primitive + `location.hash` router (`fad-router.jsx`) | Real client router (React Router / TanStack Router). Routes table is in `fad-router.jsx` (`DROUTES`, `MROUTES`). |
| `window.FADSCREENS` / `FADTRAIN` / `FADPROP` / `FADRES` screen registries | Route components / pages |
| `window.FADTASK` drawer store (pub/sub) + `DrawerHost` (`fad-task-drawer.jsx`) | A global slide-over/drawer system (task, guest, review, staff, owner detail records) driven by app state or a route param |
| `window.FADSTATE` health store + `useHealth()` (`fad-states.jsx`) | **Real per-resource fetch state** (loading / stale / partial / error) from your data layer — see "AI Trust & Failure States" below. The prototype simulates this with a manual toggle; in production it is driven by actual query/sync status. |
| `fadToast()` toast store | Toast/notification system |
| Screen-level `useState` (filters, tabs, approvals, learning queue) | Real local + server state (React Query / RTK Query / Zustand) |

**Important:** the prototype's `useHealth()` is a *manual simulator* of operating conditions. In production, those five states must be **derived from real signals** (sync timestamps, partial-response flags, API errors, model-grounding metadata). Do not ship a manual toggle — wire each surface to the actual state of its data and AI calls.

---

## AI Trust & Failure States (THE core requirement — do not skip)

A prior failure-pattern review flagged that AI surfaces must **never present as magic**. Every AI surface must make the following explicit and visible. The prototype implements the vocabulary in `fad-states.jsx` (`SyncChip`, `Provenance`, `ConfBar`, `StateBanner`) and applies it to **Inbox** and **Ask Friday**. Implement these as first-class, reusable components and apply to **all** AI surfaces (Inbox, Ask Friday, Training/Learnings, TeamInbox, Operations Daily Brief).

### The five operating states each AI surface must handle
| State | Trigger (real signal) | Required UI |
|---|---|---|
| **Loaded / healthy** | Live data fetched, answer grounded | Green "Synced · just now" sync chip; **provenance** ("Grounded in: reservation #, property facts, N teachings"); confidence indicator; actions enabled |
| **Stale** | Data older than threshold / sync lagging | Amber banner "showing last-known data, synced N min ago"; "Re-sync" affordance; sync chip amber |
| **Partial context** | One or more source records failed to load | Amber banner; provenance shows which source is **unavailable** (e.g. "guest history unavailable"); answer scoped to what loaded |
| **Fallback** | AI could not ground in user data; answered from general knowledge | Indigo banner "general guidance — not grounded in your data — verify"; provenance replaced by an ungrounded warning; sends get flagged for review |
| **Failed (tool/API)** | A downstream service (Guesty/Breezeway/model) errored | Red banner "service unavailable, actions paused, read-only until recovery"; sync chip "Sync failed · Reconnect"; **draft generation shows "couldn't generate · Retry"**; **mutating actions DISABLED** (no fake success); clear **error ownership** (which service) + retry |

### Non-negotiables (from the review)
- **Contract discipline**: every screen's data needs a typed contract; render explicit empty / loading / partial / error states, never assume the happy path.
- **Truthful error surfacing & observability**: surface *which* dependency failed and *whose* problem it is; success toasts only on confirmed success; log/telemetry hooks on AI actions.
- **Provenance everywhere**: AI outputs cite what they're grounded in (reservation, thread, KB fact, teaching).
- **Human-in-the-loop**: draft-only vs. pending-approval vs. committed-action must be visually distinct (already modeled in Inbox drafts, Approvals, and Training's Learning Queue).
- **Context wiring**: Inbox, Ask Friday, and TeamInbox must share the same guest/reservation/property context object; partial context in one reflects in all.

---

## Modules / Screens

The rail groups modules as: **Today** (Inbox, Operations, Calendar), **Portfolio** (Properties, Reservations, Owners), **Business** (Finance, Analytics, Guests & Team, Reviews), **More** (Training, All modules), plus **Notifications** and **Settings**. Each is a route; detail records open as right-side slide-over drawers.

| Module | Route key | Source component | Depth implemented | Detail record |
|---|---|---|---|---|
| Inbox | `inbox` | `ScreenInbox` | thread list, conversation, AI draft w/ provenance+confidence, **full AI-state handling** | thread (mobile) |
| Operations (overview/Daily Brief) | `ops` | `ScreenOps` | donut + KPIs, Daily Brief, fix-today, task list, Ask-Friday side panel | task drawer |
| Schedule | `schedule` | `ScreenSchedule` | day grid of jobs (Friday's draft plan) | — |
| All tasks | `tasks` | `ScreenAllTasks` | filterable table | **task drawer** (overview, requirements, photos, supplies/cost, activity; reassign/status/cost actions) |
| Approvals | `approvals` | `ScreenApprovals` | **stateful**: approve report → creates+assigns task → row removed + toast; Friday suggestions | opens task drawer |
| Roster | `roster` | `ScreenRoster` | week coverage grid | — |
| Supplies | `supplies` | `ScreenInventory` | inventory table, below-par filter, order actions | — |
| Live Map | `map` | `ScreenMap` | staff pins, on-shift list | — |
| Calendar | `cal` | `ScreenCalendar` | multi-property reservation timeline; bars click → reservation | — |
| Properties | `prop` / `allprops` | `ScreenProperties` / `ScreenAllProperties` | grid + flat table | **Property record** (`FADPROP.ScreenProperty`, 7 tabs) |
| Reservations | `res` / `allres` | `ScreenReservations` / `ScreenAllReservations` | list | **Reservation detail** (`FADRES.ScreenReservation`, 8 tabs) |
| Owners | `own` | `ScreenOwners` | list | **Owner drawer** (Overview/Properties/Statements/Comms) + `ownerstmt` waterfall |
| Finance | `fin` | `ScreenFinance` | brief, KPIs, approvals, reconciliation, period-close entry | — (period-close flow is a good next build) |
| Analytics | `an` | `ScreenAnalytics` | **interactive date range** (7d/30d/90d/YTD) re-renders KPIs/trend/channel mix; rows drill to property | — |
| Guests | `ppl` | `ScreenGuests` | list | **Guest drawer** (Overview/Stays/Messages) |
| Team / HR | `hr` | `ScreenHR` | staff list | **Staff drawer** (Overview/Permissions/Time off) |
| Reviews | `rev` | `ScreenReviews` | distribution, cohorts, latest | **Review drawer** (review + editable AI reply, approve & post; create task on low rating) |
| Training (AI governance) | `training` | `FADTRAIN.ScreenTraining` | **7 tabs**: Teachings, Learning Queue (approve→becomes teaching), Sources, Performance, Knowledge base, Brand voice, Automations | teaching drawer |
| Notifications | `notif` | `ScreenNotifsMgr` | All/Needs-you/Today/Muted filter, mark-all-read, routed actions | — |
| Settings | `settings` | `ScreenSettings` | tabs: Roles, Integrations, Notifications matrix, Branding, Billing | — |

Mobile equivalents live in `fad-mobile-screens.jsx` (`window.FADMOBILE`), wrapped in a `.mphone` shell with a bottom tab bar + "More" grid.

---

## Design Tokens (exact)

```
/* Backgrounds */     --bg:#0a0d12  --bg-2:#0c0f16  --topbar:#080a0e
                      --surface:#11161f  --card:#141b27  --card-2:#1a2230  --rail:#0c1017
/* Lines */           --line:#222c3c  --line-2:#1a2230  --line-3:#283648
/* Text */            --tx:#e8ecf3  --tx-2:#95a0b2  --tx-3:#5e6a7e  --tx-4:#3f4856
/* Indigo (brand) */  --indigo:#4f72cf  --indigo-bright:#8aa1d8  --indigo-dim:#1e2a4a
                      --indigo-ghost:rgba(86,129,255,.10)  --indigo-line:rgba(86,129,255,.22)
/* Status */          --green:#4a9b76  --red:#cf6660  --amber:#c19a57  --violet:#8773c0  --teal:#4ca6aa
                      (+ matching -ghost @ ~.11 alpha for each)
/* Type */            --serif:"Newsreader"  --ui:"Hanken Grotesk"  --mono:"JetBrains Mono"
/* Radius */          --r:13px  --r-sm:9px  --pill:999px
```

**Typography roles:** serif (Newsreader, light weight) for page/record titles & big numbers; Hanken Grotesk for all UI text (slight negative letter-spacing −0.005em); JetBrains Mono for codes, counts, timestamps, KPI sub-labels. **Dark theme only** currently. Desktop app frame is a fixed **1440px** grid (`210px` rail + fluid main); mobile is **382×768** in a device frame.

**Component conventions:** cards = `--card` bg + `--line-2` border + `--r` radius; badges `.bdg` in tone variants; "Friday" AI blocks use indigo-ghost bg + indigo-line border + spark icon; tables `.tbl`; primary buttons indigo, ghost buttons bordered. Icons are a single inline-SVG set (`DP` map in `fad-desktop.jsx`) — replace with your icon library (Lucide is the closest match).

---

## Data Contracts (define these as typed APIs)
Per the contract-discipline requirement, model at least: `Task`, `Reservation`, `Property`, `Owner`, `Guest`, `StaffMember`, `Review`, `MessageThread` + `Message`, `FieldReport`, `Teaching`, `LearningCandidate`, `Automation`, `Notification`, `OwnerStatement`, `SupplyItem`. Each AI response should carry **grounding metadata**: `{ sources: [{type, id, label}], confidence: number, grounded: boolean, degraded?: 'stale'|'partial'|'fallback' }` so the trust UI is driven by real data, not guesses.

**Integrations** referenced in the UI: **Guesty** (reservations/properties/guests/financials), **Breezeway** (tasks/supplies/access/evidence), **channels** (Airbnb/Booking.com/direct), **WhatsApp Business** (guest messaging), and the **model/AI service**. Each needs sync-state + failure handling surfaced in the UI (see Settings → Integrations and the sync chips).

---

## Files in this bundle
- `FAD V2 - Manager Desktop (Prototype).html` — the full desktop app (start here)
- `FAD V2 - Manager Mobile (Prototype).html` — the mobile app
- `FAD V2 - Product Tour (Auto-play).html` — self-playing guided walkthrough of the story
- `fad-desktop.css` — **all design tokens + every component style** (the styling spec)
- `fad-desktop.jsx` — shell (rail/topbar), icon set, `FADGO` nav primitive
- `fad-states.jsx` — **AI trust/failure-state vocabulary** (read this carefully)
- `fad-task-drawer.jsx` — drawer system + task/guest/review/staff/owner detail records + toasts
- `fad-desktop-screens.jsx` — all desktop module screens
- `fad-training.jsx` — Training (AI governance) module, 7 tabs
- `fad-property.jsx`, `fad-reservation.jsx` — Property record / Reservation detail (deep multi-tab records)
- `fad-router.jsx` — route table (desktop + mobile) + screen registries
- `fad-mobile-screens.jsx` — all mobile module screens
- `fad-demo.jsx` — the guided-tour driver (not product code; useful for understanding intended flows)

## Recommended stack
React 18 + TypeScript, Vite, a real router, React Query (or equivalent) for server state with per-query loading/stale/error wired into the trust components, CSS variables (port `fad-desktop.css` tokens) or Tailwind with these tokens, Lucide icons, the three Google fonts above. Keep the dark-theme tokens exact. Treat `fad-states.jsx` as the contract for how every AI surface must degrade.

> A developer who wasn't in this conversation should be able to build from this README + the bundled files. When in doubt about a value, open `fad-desktop.css` (tokens + component styles) and the relevant `Screen*` component.
