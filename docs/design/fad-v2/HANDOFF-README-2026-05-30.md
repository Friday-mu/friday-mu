# Handoff: FridayOS — FAD V2 (Friday Admin App)

> Design export for the code team. Branch target: `claude/fad-v2-ai-trust-states-20260530`.
> Generated from the live Claude Design project on 2026-05-30. **This supersedes the May-29 package** (`fad-redesign-claude-design-package-2026-05-29` + its `CLAUDE_DESIGN_PROMPT.md`) — ignore that one.

---

## Overview

FAD V2 is the **FridayOS admin app** — the operations cockpit property managers run their business in. It redesigns a real, working product (Friday Retreats runs ~25 properties on it today). The defining idea: **one AI named "Friday" is the spine of every module** — it drafts guest replies, plans the day, vets field reports, reconciles owner statements, and surfaces what needs a human. The UI's central job is to make Friday's actions **trustworthy and reviewable** (provenance, confidence, honest failure states, human approval gates) — not to hide the AI behind a chat box.

This bundle contains **five clickable HTML prototypes** covering the product across form factors:

| # | Prototype file | What it is | Canvas |
|---|---|---|---|
| 1 | `FAD V2 - Manager Desktop (Prototype).html` | **Primary surface.** The full GM/Manager web app — left rail + topbar + ~30 module screens, Ask-Friday drawer, task drawer, role switcher. | 1440px wide app shell |
| 2 | `FAD V2 - Manager Mobile (Prototype).html` | Manager app on phone (tab bar + bottom-sheet nav). Renders inside a switchable device bezel (Dynamic Island / Notch / Android / Huawei). | 390×812 device |
| 3 | `FAD V2 - Field Desktop (Prototype).html` | Field-staff (cleaner/maintenance) desktop view — two-pane day list + job detail. | 1440px |
| 4 | `FAD V2 - Field PWA Prototype.html` | Field-staff mobile PWA — the on-the-job phone experience (timers, checklists, photo capture, receipts). | 402×858 phone |
| 5 | `FAD V2 - Friday Surfaces (Widgets, Island, Watch).html` | **Static showcase** (not interactive): how Friday appears off-app — Dynamic Island live activity, lock-screen, iOS/Android home widgets, Apple Watch, push notifications, branded email. | Gallery page |

---

## About the design files

The files in this bundle are **design references built in HTML/CSS + React-via-Babel (in-browser, no build step)** — prototypes that show the intended look, behavior, and interaction model. **They are not production code to copy verbatim.** The task is to **recreate these designs in the target codebase's environment** — `frontend/src/app/fad/` (React) — using its established patterns, component libraries, routing, and data layer.

How they run (for reference only): each HTML file pulls React 18 + Babel-standalone from a CDN and loads a set of `.jsx` files as `<script type="text/babel">`. Components export to `window.*` namespaces (e.g. `window.FADD`, `window.FADSTATE`, `window.FADSCREENS`) so sibling files can use them. Open any HTML file directly in a browser to interact with it. **Do not port the `window.*`-namespace pattern or the CDN/Babel setup** — that's a prototype-only constraint; use the real codebase's module system.

The `.jsx` here is plain React function components with inline styles + class names against the shared CSS. Lift the **markup structure, class semantics, exact tokens, copy, and interaction logic** — re-house them in your component system.

---

## Fidelity

**High-fidelity.** Final colors, typography, spacing, iconography, copy, motion, and interaction states are all specified. Recreate the UI pixel-faithfully using the codebase's existing libraries. Where this design clashes with what the backend currently does, see **§ Open decisions & clashes** below — do not silently resolve; flag with options.

---

## ⚠️ Two locked decisions the current prototype does NOT yet match

The design-coordination pack locked these. The on-disk prototype predates them in two specific spots — **implement the LOCKED behavior, not the prototype's current behavior:**

1. **Confidence = a BAND, never a %.** `fad-states.jsx → ConfBar` currently renders a numeric percentage (`88%`) with a colored track. **Locked decision: show a qualitative band, never a number** (e.g. *High / Medium / Low* confidence, or a 3-segment meter with no digits). When you implement, drop the `{p}%` readout and the precise width; bind the band to the real backend confidence signal. Keep the green ≥ high / amber = medium / red = low tone mapping.
2. **One "Friday" intelligence — NO user-facing model picker.** Never surface model names, tiers, or "levels" anywhere. There is exactly one assistant called **Friday**. (The prototype already honors this — just don't reintroduce a picker.)

Also locked (prototype already honors): the five trust-states bind to **real backend signals**; **Manager tier** = `ops_manager` + `commercial_marketing` see an identical view; **Finance is director-only**.

---

## The Friday spine — AI trust components (REUSE, don't rebuild)

Defined in **`fad-states.jsx`** (`window.FADSTATE`). Every AI surface across every module composes these. This is the most important shared system in the app.

### Global "AI health" model
Five operating states, each with a first-class visual treatment (the prototype has a floating toggle, `AIStateToggle`, to demo each — **that toggle is a prototype affordance, not a product feature; drop it**). In production each state is driven by real backend signals.

| State | Meaning | Treatment |
|---|---|---|
| `healthy` | Live data, grounded answers | Normal UI; green sync dot |
| `stale` | Sync is behind; last-known shown | Amber banner + "Re-sync" action; amber sync chip |
| `partial` | Some source data couldn't load | Amber banner; missing fields tagged "unavailable"; provenance shows what's missing |
| `fallback` | Answer not grounded in user's data | Indigo "general guidance — verify before sending" banner; confidence drops |
| `failed` | A downstream tool/API is down | Red banner; **actions paused, recommendations read-only**; "Retry"/"Reconnect" |

### Components in `window.FADSTATE`
- **`SyncChip({source, health})`** — per-integration status pill: `Guesty · Synced · just now` (green) / `Stale · 12m ago` (amber) / `Sync failed` + Reconnect (red). Sources seen: Guesty (commercial, green), Breezeway (operational, teal).
- **`Provenance({items, health})`** — "Grounded in" chip row showing the records an answer is built from (e.g. reservation `GY-q7ubP9Ak`, property `GBH-B4` facts, "2 active teachings"). On `fallback` → "General guidance — not grounded". On `failed` → "Couldn't generate a grounded draft" + Retry. On `partial` → trims sources + shows a red "guest history unavailable" chip.
- **`ConfBar({pct, health})`** — confidence meter. **See locked decision #1 — convert to a band, no %.**
- **`StateBanner({surface, health})`** — surface-level degraded/error banner; returns nothing when healthy. Carries the per-state copy verbatim (see table).
- **`SourceTag({kind, note})`** + **`Field({label,value,kind,note})`** — per-field provenance tag. Kinds: `guesty` (green), `breezeway` (teal), `friday`/`FAD` (indigo), `modeled` (violet, "forecast — not observed"), `stale` (amber), `failed` (red + Reconnect). A `Field` is a label/value row that carries its own source tag — use it for any data point whose origin matters.

**Design intent:** failure, stale, and empty states are part of the vision, never "future work." Build the unhappy paths.

---

## Shell / chrome (Manager Desktop) — `fad-desktop.jsx` (`window.FADD`)

The reusable app frame. Every desktop module screen renders inside `<Shell>`.

### Layout
- `.dapp` — `1440px` wide, `display:grid; grid-template-columns:210px 1fr; grid-template-rows:50px 1fr;` border `1px var(--line)`, radius `14px`, `overflow:hidden`.
- **Topbar** (`.dtop`, 50px, full width): collapse/menu button → `more` · **"FridayOS"** wordmark (Archivo italic 800, → `ops`) · tenant label "Friday Retreats · Admin" with a live dot · centered **search/Ask bar** (`.dsearch`, max 540px, "Search or **Ask Friday**…  ⌘K") · right cluster: Ask-Friday button (the `friday-f.png` F-mark, 18px), notifications bell (`.alert` red dot), theme/sun toggle, and **"Viewing as · {role}"** dropdown.
- **Left rail** (`.drail`, 210px, bg `var(--rail) #080F22`): a highlighted **"Ask Friday"** entry at top, then grouped nav (`.nsec` mono uppercase labels + `.nitem` rows with optional count badge; hot counts in red). Footer: settings gear + "FridayOS v2.0".
- **Main** (`.dmain`, scrolls): `.dhead` (eyebrow mono-caps + `<h1>` Archivo 300/25px + sub) → optional `.dtabs` (underline-active tabs) → `.dbody` (padding `16px 24px 36px`).
- **Right panel** (`.daside`, optional): the context **Ask Friday** drawer, opens over the content; Esc closes.

### Role-based views ("Viewing as")
`window.__FADROLE` + `ROLES` map. Switching role filters which rail items render (via each module's `access` list). **Match the locked tiers:**
- `gm` — GM · Director — access `*` (everything, incl. Finance).
- `ops` — Ops Manager — inbox, ops, cal, prop, res, own, ppl, rev, training, more.
- `commercial` — Commercial/Marketing — inbox, cal, res, ppl, leads, marketing, agency, rev, more. **(ops + commercial together = the "Manager" tier; they must see an identical surface where they overlap.)**
- `finance` — Finance — inbox, fin, an, own, legal, billing, more. **Finance module is director-only.**
- "Field staff" option routes out to the Field Desktop app.

### Icons
`fad-desktop.jsx` defines `DP` (a path dictionary) + `<DI n="..." s={2}/>` — a single inline-SVG component, 24×24 viewBox, `stroke="currentColor"`, sized via `em`. ~70 line icons (Feather-style). In production use your existing icon set; match these glyph choices by name. `PriD({level})` renders priority glyphs: `urgent`=double-chevron-up (red), `high`=arrow-up (amber), `med`=diamond filled (green), `low`=double-chevron-down (gray).

### Navigation primitive
`window.FADGO(key)` swaps the in-app screen (hash-synced for back/forward/refresh). In production this is your router. Desktop route keys → screens are in `fad-router.jsx` (`DROUTES`); mobile in `MROUTES`.

---

## Modules / screens

The desktop rail + "All modules" index (`fad-router.jsx → MODULE_GROUPS`) define the full IA. Each route key maps to a screen component. Component source is split across the `fad-*.jsx` files (see § Files).

**Today:** `inbox` (guest & team threads with AI drafts) · `ops` (daily brief, schedule, live ops — *default landing screen*) · `cal` (portfolio occupancy timeline) · `notif` (what Friday surfaced).
**Operations:** `schedule` (Friday's draft day plan) · `tasks` (all tasks across properties) · `approvals` (vet field reports into tasks — AI-suggestion → human accept → mutation) · `roster` (staff coverage & time off) · `supplies` (inventory across stores & vans) · `map` (field staff on active jobs).
**Portfolio:** `prop` / `property` (units, condition, owners) · `res` / `reservation` (bookings across channels) · `own` / `ownerstmt` (statements & payouts).
**Business:** `fin` (period close, expenses, compliance — *director-only*) · `an` (analytics: revenue, occupancy, channels) · `ppl` (guests: profiles & history) · `hr` (team records & permissions) · `rev` (reviews & AI replies).
**Growth & admin:** `leads` (CRM capture/qualify) · `marketing` (campaigns, content calendar, social) · `legal` (contracts, e-sign, compliance).
**Business units:** `syndic` (building/co-ownership management — overview, owners, charges, payments, arrears, AGM, docs, compliance, onboarding + a `synportal` owner portal) · `design` (interior-design unit + portal) · `agency` (sales/rental agency).
**System:** `training` (govern how Friday learns & acts) · `settings` (roles, integrations, branding) · `askfull` (Ask Friday full-screen) · `help`.
**Platform admin (SaaS):** `tenant` (org config, modules, branding) · `billing` (FridayOS subscription) · `admin` (platform health & adoption).

> Component-availability note: a few deep routes (`billing`→`window.FADBILL`, `admin`→`window.FADADMIN`) reference namespaces not loaded in the current Manager Desktop HTML, so they fall back. Treat those as **specified in IA but not yet built as screens** — confirm scope before implementing.

### Ask Friday (the spine surface) — `fad-ask-drawer.jsx` + `AskPanel` in `fad-desktop.jsx`
A context-aware right drawer present on every screen. Header shows scope chips (current surface vs. "All of FridayOS") + an awareness line. Body is a message thread; **Friday's action proposals render as an approval gate** (`.afact`): a titled action card + description + **primary "Approve" button** + "Tweak" ghost button, then a "done" confirmation. Composer: "Ask or tell Friday to act…". **This human-approve-then-mutate pattern is the core interaction** (the code team's AF7/AF8 wire these Approve buttons to real mutations).

### Field app screens
- **Field PWA** (`fad-kit.jsx` + `fad-screens-a..f.jsx` + `fad-proto.jsx`, styled by `fad.css`): day list, job detail, requirement checklists (with photo-required flags), big timer + sticky running-timer pill, receipt-scan animation → extracted-fields review, inventory counts, team chat threads, completion success, notification-preferences matrix, calling/video screens, tutorial.
- **Field Desktop** (`fad-field-*.jsx` + `fad-field.css`): two-pane (day list ↔ job detail) desktop equivalent.

---

## Interactions & behavior

- **Boot splash** — every app HTML shows a `#boot` overlay: orbiting F-mark + animated "**Friday**OS" wordmark (clip-wipe reveal) + indeterminate progress bar + mono caption. Hides ~500ms after mount (failsafe at 3.5s). Animations: `fos-mark-in`, `fos-word-clip`, `bootbar`.
- **Routing** — hash-synced screen swap (`FADGO`), `.dmain` scrolls to top on change. Mobile shows a brief Friday-mark loader (~360ms) between routes.
- **Screen transitions** — `.scr.fwd` / `.scr.back` / `.scr.up` slide+fade (0.28s `cubic-bezier(.2,.7,.3,1)`). Content entrance: children fade-up staggered (`fadeUpF`, 40ms steps).
- **Tap feedback** — `.tap:active{transform:scale(.985)}`; buttons `scale(.97)`.
- **Ask bar sheen** — animated diagonal highlight sweeps the Ask bar (`sheenF`, 4.5s loop).
- **Approval gate** — Friday proposes → human reviews provenance + confidence → **Approve** (primary) commits / **Tweak** edits / approvals can also be snoozed. Nothing auto-sends.
- **Sync/health** — chips & banners react to the global health state; `failed` makes actions read-only with Retry/Reconnect.
- **Mobile device switcher** — Manager Mobile has Dynamic-Island / Notch / Android / Huawei bezel toggle buttons below the device (prototype-only chrome).
- **Toasts** — `window.fadToast(msg)` for transient confirmations.
- **Reduced motion** — all decorative animation is gated behind `@media (prefers-reduced-motion: no-preference)`. Honor it.

---

## State management (for the real app)

- **Auth/role** — current role gates rail visibility and module access (see Roles table). Finance director-only; ops+commercial identical "Manager" surface.
- **AI health per source** — each integration (Guesty, Breezeway, Friday model API) reports a health signal that drives `SyncChip`/`StateBanner`/`Provenance`/`ConfBar`/`SourceTag`. This is real backend state, not a UI toggle.
- **Ask Friday thread** — per-scope conversation; proposed actions carry a structured mutation payload that the Approve button commits.
- **Per-field provenance** — data points carry their source (guesty/breezeway/friday/modeled) + freshness, surfaced via `SourceTag`.
- **Field timers / checklists / photos** — running-job timer state (persisted), checklist completion %, photo-required gating before completion.

---

## Design tokens

Defined in `:root` of `fad-desktop.css` (desktop) and `fad.css` (field PWA) — values are identical. **The live palette is INDIGO** (below). A future migration to a cyan accent is planned but **not applied** — see § Brand migration.

### Color — dark theme (default)
```
/* surfaces */
--bg:        #070C1A   /* app base */
--bg-2:      #0a1124   /* status/tab chrome */
--topbar:    #05091a
--surface:   #0C1428   /* panel */
--card:      #0F1A33   /* raised card */
--card-2:    #15223f   /* nested / hover */
--rail:      #080F22   /* left nav */
--line:      #1d2b46   /* hairline border */
--line-2:    #162238   /* fainter border */
--line-3:    #2a3d5e   /* stronger border */
/* text */
--tx:        #EAF0FB   /* primary */
--tx-2:      #8FA0C2   /* secondary */
--tx-3:      #5d6f93   /* tertiary / labels */
--tx-4:      #3d4d6b   /* faint */
/* accent (indigo — LIVE) */
--indigo:        #3E74D9
--indigo-bright: #6BA3F2
--indigo-dim:    #11356F
--indigo-ghost:  rgba(62,116,217,.10)   /* .12 in field css */
--indigo-line:   rgba(62,116,217,.24)   /* .35 in field css */
--accent:    #3E74D9   /* alias of indigo */
--royal:     #11356F   --royal-2:#1A4A9E   --ink:#04121f
/* status */
--green: #3fb389   --green-ghost: rgba(63,179,137,.12)
--red:   #ef6b66   --red-ghost:   rgba(239,107,102,.12)
--amber: #d6a85a   --amber-ghost: rgba(214,168,90,.12)
--violet:#9a82e0   --violet-ghost:rgba(154,130,224,.13)
--teal:  #3ec6cf
```
Status color semantics: **green** = healthy/done/vacant/synced · **red** = urgent/failed/occupied · **amber** = high-priority/stale/warning · **violet** = mentions/modeled values · **teal** = Breezeway source.

### Typography
Google Fonts: **Archivo**, **Space Grotesk**, **JetBrains Mono**.
```
--serif / display:  "Archivo", Georgia, sans-serif      /* headings: weight 300 for h1; italic 800 for wordmark */
--ui   / body:      "Space Grotesk", system-ui, sans-serif   /* default UI text, ~13–14px */
--mono / meta:      "JetBrains Mono", ui-monospace, monospace /* labels, codes, counts, timestamps; uppercase + letter-spacing */
```
This is a deliberate **three-voice** system: Archivo (display/headlines), Space Grotesk (everything UI), JetBrains Mono (eyebrows, micro-labels, property codes, counts, timers, provenance). Base UI `letter-spacing:-.005em`, `-webkit-font-smoothing:antialiased`. Mono micro-labels: ~9.5–10.5px, `letter-spacing:.10–.14em`, `text-transform:uppercase`.

### Radius / spacing / shadow
```
--r:    13px  (desktop) / 14px (field)   /* card radius */
--r-sm:  9px  / 10px
--pill: 999px
```
Buttons: desktop `.dbtn` 30px tall / radius 8px; field `.btn` 34px / radius 9px. Primary = indigo fill, white text. Grid gaps 9–12px. Drawer/sheet shadows `0 14px 40px rgba(0,0,0,.45)`. Card hover lifts border to `--line-3` / `--indigo-line`.

### Light theme
A `[data-theme="light"]` variant is specified in the brand spec (bg `#F4F6FB`, surface `#FFFFFF`, surface-2 `#EEF2FA`, fg `#0A1834`, muted `#5A6A88`) — the sun toggle in the topbar is its entry point. Build it as a true theme (token swap), not a separate stylesheet.

---

## Brand migration (planned, NOT yet applied — confirm before doing)

`fridayos-brand-spec.md` (included) documents a **target brand** the prototype has not migrated to:
- **Accent: bright cyan `#3DE0FF`** replacing indigo `#3E74D9` (with `--royal #11356F`, `--royal-2 #1A4A9E` as deeper companions). The plan is to keep existing CSS var *names* and remap `--indigo*` → cyan, or add aliases, so classes pick up the new accent.
- Background shifts slightly toward `#070C1A` base / `#0C1428` / `#111C36` surfaces (close to current).
- Fonts stay Archivo / Space Grotesk / JetBrains Mono.
- Boot splashes, voice orb, thinking dots, route-sweep would recolor to cyan.

**Decision needed:** ship on the current indigo, or apply the cyan target as part of this build? The included spec has the full token list and an apply plan. Don't assume — flag it.

---

## Assets

- **`friday-f.png`** — the Friday "F" app mark (used as favicon, topbar Ask button, rail Ask entry, widget/notification icon, boot splash). Square, rounded.
- **`friday-wordmark-white.png`** — white "FridayOS" wordmark (available; most surfaces render the wordmark as live Archivo-italic text rather than the image).
- **Fonts** — loaded from Google Fonts CDN. In production, self-host or use your font pipeline.
- **No other raster art** — all UI is CSS/SVG. Imagery placeholders (property photos, receipts, video feeds) are CSS-drawn stand-ins; wire real media in production.
- The Friday "orb" in the Surfaces showcase is a pure-CSS radial-gradient sphere (`.orb`) with a breathing animation — reusable as the voice/assistant avatar.

---

## Files in this bundle

**Prototypes (open these):**
- `FAD V2 - Manager Desktop (Prototype).html` — primary; start here.
- `FAD V2 - Manager Mobile (Prototype).html`
- `FAD V2 - Field Desktop (Prototype).html`
- `FAD V2 - Field PWA Prototype.html`
- `FAD V2 - Friday Surfaces (Widgets, Island, Watch).html` — static showcase.

**Shared system & shell:**
- `fad-desktop.css` — desktop design system (tokens + all component classes). **Primary stylesheet.**
- `fad.css` — field-PWA design system (same tokens; mobile component classes).
- `fad-field.css` — field-desktop additions.
- `fos-anim.css` — FridayOS motion keyframes (`fos-*`).
- `fad-desktop.jsx` — `window.FADD`: icons (`DI`/`DP`), `Topbar`, `Rail`, `Shell`, `AskPanel`, roles, `FADGO`. **Read first.**
- `fad-states.jsx` — `window.FADSTATE`: the AI trust components (health model, SyncChip, Provenance, ConfBar, StateBanner, SourceTag, Field). **Read second.**
- `fad-router.jsx` — desktop + mobile route maps + "All modules" index + mobile "More".
- `fad-ask-drawer.jsx` — Ask Friday drawer host/UI (`window.FADASKUI`).
- `fad-task-drawer.jsx` — task detail drawer host (`window.FADTASK`).
- `fad-voice.jsx` — voice/dictation UI. `fad-dictation.js` — dictation helper. `fos-boot.js` / `friday-f-paths.js` — boot-splash F-mark drawing.

**Desktop module screens:**
- `fad-desktop-screens.jsx` — `window.FADSCREENS`: the bulk of desktop screens (inbox, ops, schedule, tasks, approvals, roster, supplies, map, calendar, properties, reservations, owners, owner-statement, finance, analytics, guests, HR, notifications, settings, help, ask-full).
- `fad-property.jsx` (`FADPROP`) · `fad-reservation.jsx` (`FADRES`) · `fad-training.jsx` (`FADTRAIN`) · `fad-teamchat.jsx` (`FADTEAM`) · `fad-reviews.jsx` (`FADREVIEWS`) · `fad-syndic.jsx` (`FADSYNDIC`) · `fad-agency.jsx` (`FADAGENCY`) · `fad-design.jsx` (`FADDESIGN`) · `fad-leads.jsx` (`FADLEADS`) · `fad-marketing.jsx` (`FADMKTG`) · `fad-legal.jsx` (`FADLEGAL`) · `fad-tenant.jsx` (`FADTENANT`).

**Mobile screens:** `fad-mobile-screens.jsx` (`window.FADMOBILE`).

**Field app:** `fad-kit.jsx` (field UI kit) · `fad-data.jsx` (mock data) · `fad-screens-a.jsx`…`fad-screens-f.jsx` (field PWA screens) · `fad-proto.jsx` (field PWA router/app) · `fad-field-desktop.jsx` · `fad-field-screens.jsx` · `fad-field-screens2.jsx` · `fad-field-router.jsx`.

**Other:** `fad-demo.jsx` (standalone demo helper — likely unused by the five prototypes; verify before relying on it). `fridayos-brand-spec.md` (brand + cyan migration plan).

---

## Suggested implementation order

1. Read `fad-desktop.jsx` (shell) and `fad-states.jsx` (trust spine) — these define everything reused everywhere.
2. Port the **design tokens** (`fad-desktop.css :root`) into the codebase's theme.
3. Build the **Shell** (topbar + rail + role gating + main/tabs) and the **AI trust components** (with the two locked corrections: confidence band, no model picker).
4. Build the **Ask Friday drawer** + approval-gate pattern (the team's AF7/AF8 wire these to mutations).
5. Implement P1 modules first — **Inbox** and **Operations** (incl. Approvals AI-suggestion → accept → mutation) — then P2/P3 per the coordination pack.
6. Resolve the **cyan brand migration** and **light theme** decisions before locking visual QA.

Questions on data shape, mutation payloads, or which routes are in-scope for v2 → raise against the real code/APIs. Honest failure/stale/empty states are part of the spec — build them.
