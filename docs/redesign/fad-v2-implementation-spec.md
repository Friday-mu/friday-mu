# FAD V2 — Implementation Spec (React / Next.js)

**Source:** Claude Design bundle at `/tmp/fad-design-3/fad-v2/` (HTML/CSS/JSX prototypes, read directly, not rendered).
**Target:** the FAD frontend (`frontend/src/app/fad/`), Next.js 14 App Router static export, React 18 + TS + Tailwind.
**Status of source:** static design prototypes built React-on-window (Babel-in-browser). Treat as visual + structural truth, not production React. Port the *CSS system + DOM structure + interaction model*, not the prototype's `window.*` globals or babel loaders.

> Provenance of the design intent: `chats/chat1.md` (read fully). The arc: field-staff PWA built first (locked), then the manager/GM desktop in the *real FAD dark/indigo skin* — "refine for flow, space and clutter, don't reinvent." Two design systems ship: **field PWA** (`fad.css`, bright indigo, dark-first, scoped `.fad`) and **manager desktop + mobile-web** (`fad-desktop.css`, *muted* indigo, scoped `.dwrap`). They share type voices, status language, provenance chips and the Ask Friday model.

---

## 0. Bundle inventory (what maps to what)

| File | Role |
|---|---|
| `project/fad.css` | **Field-staff PWA** design system + prototype-phone chrome. Global `:root`. Device class `.fad`. |
| `project/fad-desktop.css` | **Manager/GM desktop + mobile-web** design system. Global `:root` (overrides field tokens — see §6). Shell class `.dwrap`/`.dapp`; mobile `.mphone`. |
| `project/fad-kit.jsx` | Field shared kit: `Icon`, `StatusBar`, `AppHeader`, `AskBar`, `TabBar`, `BackBtn`, `PriorityGlyph`, `Badge`, `SrcChip`, `Occ`, `TaskCard`, `MLabel`, `PropPicker`, `fmtTimer/fmtDur`, `useNav` context. |
| `project/fad-data.jsx` | Fixture data shapes (tasks w/ requirements, chats, properties, access, on-site guide, lost-items, roster, time-off, reviews). **The backend contract lives here.** |
| `project/fad-desktop.jsx` | Manager shell: `Topbar`, `Rail`, `Shell`, **`AskPanel`** (the universal right-side Ask Friday). `window.FADD`. |
| `project/fad-desktop-screens.jsx` | All 16 manager desktop screens. |
| `project/fad-mobile-screens.jsx` | Manager **mobile-web** screens + `MTabbar` (bottom nav). |
| `project/fad-screens-a…f.jsx` | Field-staff PWA screens (Tasks, Detail, History, Chat, Account, Notifs, Supplies, Expense, AI help, Comments, Report, Requirements, Complete, ChatThread, Property, Create, NotifPrefs, Tutorial, MyRoster, TimeOff, Reviews). |
| `project/fad-proto.jsx` | Field PWA router/state engine (timer, requirements, calls) — reference for interaction state, not for porting. |
| `project/FAD V2 - Screens Gallery.html` | Flat gallery of every field screen, grouped: **Daily work · On a task · Reporting & create · Comms & you**. |
| `uploads/.../docs/*.md` | Provenance/source-of-truth model + Design-module deep brief. |

---

## 1. DESIGN SYSTEM

Two scoped systems. Both use the same three font voices and the same status semantics; they differ in **token brightness** and **root scope class**.

### 1.1 Tokens — Field PWA (`fad.css`, global `:root`, scope `.fad`)

Surfaces (dark, blue-tinted near-black):
```
--bg:#0a0d12  --bg-2:#0d1118  --surface:#121826  --card:#151c2b  --card-2:#1a2230
--line:#243044  --line-2:#1c2536
```
Text:
```
--tx:#e8ecf3  --tx-2:#97a1b3  --tx-3:#5e6a7e  --tx-4:#414c5e
```
Accent (bright indigo) + status:
```
--indigo:#5681ff  --indigo-bright:#6f93ff  --indigo-dim:#2a3a6b
--indigo-ghost:rgba(86,129,255,0.12)  --indigo-line:rgba(86,129,255,0.35)
--green:#46c08a  --red:#f06a63  --amber:#e6ad52  --violet:#9b7cf0  --teal:#54c2c7
(each status also has a *-ghost rgba ~0.13 fill variant)
```
Radii: `--r:14px  --r-sm:10px  --r-pill:999px`.

### 1.2 Tokens — Manager desktop (`fad-desktop.css`, global `:root`, scope `.dwrap`)

Same structure, **muted/desaturated** (deliberate — the team rejected the brighter take; see chat §"too fat and big fonts"):
```
--bg:#0a0d12  --bg-2:#0c0f16  --topbar:#080a0e  --surface:#11161f  --card:#141b27
--card-2:#1a2230  --rail:#0c1017  --line:#222c3c  --line-2:#1a2230  --line-3:#283648
--tx:#e8ecf3  --tx-2:#95a0b2  --tx-3:#5e6a7e  --tx-4:#3f4856
--indigo:#4f72cf  --indigo-bright:#8aa1d8  --indigo-dim:#1e2a4a
--indigo-ghost:rgba(86,129,255,.10)  --indigo-line:rgba(86,129,255,.22)
--green:#4a9b76  --red:#cf6660  --amber:#c19a57  --violet:#8773c0  --teal:#4ca6aa
(status *-ghost ~0.11)
```
Radii smaller: `--r:13px  --r-sm:9px  --pill:999px`.

> **Reconciliation note:** field accents are ~15–20% more saturated and lighter than desktop. The provenance chip blues/greens (`#86b6ff` Breezeway, `#5fd09a` Guesty) are **identical across both**. Keep one token set per scope; do not unify the indigo (the muting is intentional product feedback).

### 1.3 Typography — three voices (both systems)

```
--serif: "Newsreader", Georgia, serif         /* page titles (h1), big numbers, call names — weight 300 */
--ui:    "Hanken Grotesk", -apple-system, system-ui, sans-serif   /* all UI text; letter-spacing -0.005em */
--mono:  "JetBrains Mono", ui-monospace, monospace   /* IDs, property codes, meta, eyebrows, micro-labels, timers */
```
- **h1**: serif, weight **300**, ~25px desktop / 26px field, color `#f3f6fb`, line-height ~1.05.
- **Eyebrow / micro-label** (`.eyebrow`, `.mlabel`, `.dml`): mono, ~9.5–10px, letter-spacing .12–.14em, UPPERCASE, `--tx-3`, often with a trailing `.rule` hairline that flexes to fill.
- Body UI 12.5–14px. Tabular numerics on timers (`font-variant-numeric:tabular-nums`).
- **Repo gap:** existing `frontend/src/app/fad/fad.css` uses **Inter + Fraunces**, not Hanken/Newsreader. V2 switches the title serif to **Newsreader** and UI to **Hanken Grotesk**. Add these `@font-face`/Google Fonts (static-export safe: self-host or `<link>` in `layout.tsx`). Keep JetBrains Mono (already present).

### 1.4 Spacing / shape

No formal scale variable; values are literal. Cards pad 11–16px, gaps 8–12px, section labels margin ~16/8. Hairline borders everywhere (`--line-2`). Radii 7–16px. The whole system is **dense** — small type, tight gaps, restrained color. "Better use of space, less clutter" is the north star.

### 1.5 Key reusable component classes

**Field PWA** (`.fad …`):
- `.tcard` task card — `.t-top` (`.pcode` mono chip · `.addr` ellipsis · `.grow` · due `Badge`), `.title`, `.meta` (mono, `·`-separated), `.t-foot` (`PriorityGlyph` · `.occ` · `SrcChip` · `.avatar`). Optional `.accent.{red|amber|indigo|green}` left bar; `.sel` selected; `.tap` press-scale.
- `.badge.{green|red|amber|indigo|violet|gray}` + `.dot`; mono uppercase pill.
- `.srcchip.{bz|gy}` provenance chip (lock glyph + label) — see §3.
- `.occ.{in|vacant|soon}` occupancy dot+label (red/green/amber).
- `.pri.{urgent|high|med|low}` priority glyph disc (Breezeway language — double-chevron-up / arrow-up / diamond / double-chevron-down).
- `.btn` `.btn.primary/.ghost/.sm/.full/.danger`; `.iconbtn` (38px, `.alert` red dot).
- `.statrow`+`.stat` (3-col stat cards w/ top accent bar — *field only; desktop dropped these for the donut*).
- `.brief` / `.askbar` — indigo-gradient AI panels.
- `.tabbar` bottom nav + center `.fab` (50px raised indigo). `.tabitem.on`.
- `.seclink` hub-link rows; `.frow` field rows; `.setgroup`/`.setrow`/`.toggle`; `.reqsection`/`.checkitem`/`.invrow`/`.stepper`; `.codebox`; `.guiderow`/`.lostrow`; `.callscreen`/`.callpill`/`.timerpill`; `.readby`.

**Manager desktop** (`.dwrap …`):
- `.dapp` shell grid (see §2). `.dtop` topbar, `.drail` left nav, `.dmain`, `.dhead`, `.dtabs`/`.dtab`, `.dbody`.
- `.panel` (card), `.grid2/3/4`, `.statc` (compact stat — note `::before` accent **disabled**, color applied to `.n` only).
- `.tbl` dense table (mono uppercase `th`, hairline rows, hover tint, `.pcodeD` code chip, `.av1`/`.avset` avatars, `.pri` glyph).
- `.bdg.*` badges, `.srcbz`/`.srcgy` provenance chips.
- `.fai` (full AI panel) + `.gate` (dashed approval-gate card) + **`.fbar`** (the slim one-line Friday strip — left indigo border, text + Draft/Apply/Review buttons).
- `.daside` (Ask Friday right panel) + `.afp-*` + `.afm`/`.afact`/`.afdone` (chat bubbles + action cards) — see §2/§3.
- `.donut`/`.donutwrap`/`.dleg` (overview donut), `.qrow`/`.qactions` (approval rows), `.sgrid`/`.sgrow`/`.sblock` (schedule grid), `.rweek`/`.rwrow`/`.rcell`/`.rbar`/`.rtoprow` (roster), `.maplayout`/`.mapcanvas`/`.mpin` (live map), `.inboxlay`/`.ibthreads`/`.ibconv`/`.ibdraft`/`.ibctx` (inbox), `.vseg` (segmented view toggle), `.weeksel` (week navigator), `.dd*` (searchable dropdown), `.aichip` (small AI/filter chip).
- Mobile-web: `.mphone` frame, `.top`, `.mchips`/`.mchip`, `.mlist`, `.mthread`, `.mctx`, `.msheet`/`.mhandle`, `.mcal*` (mobile calendar), `.pwa-tab`/`.pwa-ti`/`.pwa-fab` (bottom nav).

### 1.6 Motion (both systems, gated on `prefers-reduced-motion`)

`fadeUp` staggered section entrances (`.dbody>*` / `.fad-scroll>*` nth-child delays .04→.2s); `slideLeft` for `.daside`; `popIn` for `.mphone`; `barGrow` (scaleX) for load/progress bars; `sheen` shimmer on the Ask Friday rail/askbar button; hover `translateY(-1/-2px)` on buttons/cards, active `scale(.97)`; pulse on live dots. Port verbatim — it's all CSS, static-export safe.

---

## 2. IA / NAVIGATION (the V2 shell)

### 2.1 Desktop shell — `.dapp` CSS grid

```
grid-template-columns: 210px 1fr            (default)
                       210px 1fr 326px       (.withpanel — Ask Friday open)
grid-template-rows: 50px 1fr
```
Regions: **`.dtop`** spans all columns (row 1); **`.drail`** col1/row2; **`.dmain`** col2/row2 (scrolls); **`.daside`** col3/row2 when Ask Friday is open. Fixed 1440px design width.

**Topbar (`.dtop`)** left→right: collapse hamburger · `FAD` serif-italic wordmark · `Friday Retreats · Admin` mono label · centered **`.dsearch`** ("Search or **Ask Friday**… ⌘K") · right cluster: bell (`.alert` red dot), theme toggle (sun), **`.viewas`** role switcher (`FG` avatar · "Viewing as · GM ▾").

**Left rail (`.drail`)** — this is the key IA departure: at the **very top, above the nav**, sits the **`.askfri`** Ask Friday launcher (indigo gradient, shimmer). Then grouped nav (`.nsec` mono headers · `.nitem` rows w/ icon + label + optional count `.ct`, `.ct.hot` = red). Groups in the prototype: **Today** (Inbox `3`, Operations `6`·hot, Calendar) · **Portfolio** (Properties, Reservations, Owners) · **Business** (Finance, Analytics, Guests & Team) · **More** (Reviews, All modules). Foot: gear + "FAD v2.0".

> **How it differs from a conventional sidebar+header:** (1) Ask Friday is a **first-class nav element pinned above modules**, not a floating bubble. (2) The header search bar **is** the Ask Friday command entry ("Search or Ask Friday"). (3) A persistent **"Viewing as · {role}"** switch in the topbar drives role-scoped views (Director/GM/Field/Owner) — same app, role-filtered. (4) The right column is **not** a static panel — it's the squeeze-in Ask Friday rail that only exists when invoked.

**Page body** within `.dmain`: `.dhead` (eyebrow + serif h1 + sub on the left; action buttons right) → optional `.dtabs` (module sub-tabs) → `.dbody` content. Operations sub-tabs in the prototype: Overview · Schedule · All tasks · Approvals(3) · Roster · Insights. (Real repo Operations has 10 sub-pages — see §7.)

### 2.2 The universal Ask Friday side panel — **the central V2 pattern**

Replaces all scattered AI boxes. Triggered by a **`Review`** button on any module's slim `.fbar`, or the rail launcher. Component: `AskPanel({scope, aware, msgs, action, done})` rendering `.daside`:
- Header `.afp-h`: "✦ Ask Friday" + close ×; **scope chips** `.afp-chip` (e.g. "Operations · Overview" + "All of FAD"); **`.afp-aware`** line listing what Friday currently knows about the page ("Aware of: today's 32 tasks, 4 staff on, 2 guest-blocked jobs…").
- Body `.afp-body`: a **real chat** — `.afm`/`.afm.me` bubbles. Friday turns can embed an **`.afact` action card** (title + desc + Approve/Tweak buttons) and an **`.afdone`** confirmation ("3 tasks reassigned · order drafted"). This is the approval-gated write surface.
- Composer `.afp-comp`/`.afp-in`: "Ask or tell Friday to act…" + send.

The panel **squeezes content left** (grid widens to 3 columns), it does not overlay. Same component on every module, scope-aware, can act on the page.

### 2.3 Mobile / PWA shell — bottom nav + Ask Friday in the middle

`.mphone` frame: `.top` (FAD wordmark · screen title · bell) → `.body` (scrolls; `.mchips` filter row, lists, sheets) → **bottom nav `.pwa-tab`** with `MTabbar`: **Inbox · Ops · [✦ Ask Friday FAB] · Calendar · More**. The center FAB is the Ask Friday entry; the side panel becomes a **full-height bottom sheet** on mobile (chat + editable draft + action cards live in the sheet so the loop completes without leaving — explicit chat decision). This is the manager/GM mobile-web shell.

The **field-staff PWA** uses its own bottom nav (`.tabbar` in `fad.css`): **Tasks · Chat · [＋] · History · Account**. The center ＋ is **Report-only** (field staff cannot create tasks — they report; an ops manager vets the report into a task). Notifications live behind the header bell.

> Two distinct bottom navs by role: **field** = Tasks/Chat/＋report/History/Account; **manager mobile** = Inbox/Ops/AskFriday/Calendar/More.

---

## 3. PROVENANCE MODEL (FAD V2's defining concept)

FAD is the unification layer over **Guesty (commercial)** and **Breezeway (operational)**; every load-bearing fact must show where it came from. The deep brief enumerates the provenance vocabulary: **Friday-created · Owner-provided · Vendor-provided · Guesty-linked · Breezeway-linked · Imported document · Calculated/modelled**. The audit doc adds: Finance amounts must declare *Guesty truth vs FAD ledger vs pending vs modelled*; Reviews/HR must not look "live" unless backed or marked "not synced"; Settings/integrations need *last-sync, direction, owner, failure state*.

### How it renders

**Source chips** (the primary device):
- Field PWA: `.srcchip.bz` (Breezeway, blue `#86b6ff`) and `.srcchip.gy` (Guesty, green `#5fd09a`) — mono, ~9.5px, hairline border, optional lock glyph. `SrcChip` component: `<SrcChip src="bz">breezeway</SrcChip>`.
- Desktop: `.srcbz` / `.srcgy` (same colors). Used inline in panel headers (e.g. Reservation panel shows a green `guesty` chip; Inbox context panel shows `guesty`; Supplies footer "synced from Breezeway").

**Color convention (memorize):** blue = Breezeway/operational, green = Guesty/commercial. (Guesty's brand green was deliberately *not* adopted as a FAD accent — see chat: "I won't mistake Guesty's green for a FAD palette cue.")

**Read-only / audit treatment** (`fad-screens-d.jsx ScreenProperty` is the canonical example — access codes):
- Pre-reveal: `.tcard` "Access policy" + `SrcChip bz "audit-only"` + copy "Codes stay in source. Revealing is logged to the property audit trail with your name & time." + "Reveal code (logged)" button.
- Revealed: green "Codes revealed" + amber **audit chip** "✦ logged 09:14" + `.codebox` rows (Lockbox/Alarm) + mono line "Reveal logged to {code} audit trail · {name}" + Hide.
- Completed task: codes **closed** — "Access codes are closed for completed tasks. Reopen if you need re-entry."

**AI-modelled / suggestion treatment:** dashed indigo borders. `.gate` (desktop) and `.aigate` (field) are dashed `--indigo-line` cards = "Friday drafted / suggested / approval-gated." Friday learnings (pattern detections) render as dashed `.qrow` with a `suggested` badge and Accept/Tweak/Dismiss. Confidence shown as mono "conf 88%" / "REV 1". **No silent writes** — every AI change is a gate card or an `.afact` action card requiring confirmation.

**Occupancy / status** also act as provenance-adjacent state: `.occ` dots (in-house red / vacant green / soon amber) drive the "don't disturb in-house guests" rule, surfaced on task cards, reservation rows, calendar property column dots.

**Implementation:** model a `provenance` enum on every field-bearing record (`guesty|breezeway|friday|owner|vendor|imported|modelled`) plus `lastSyncedAt`, `syncDirection`, `confidence?`. Render via a single `<SourceChip src=… />` component (one per scope class). Finance/Settings/Reviews/HR are the modules where this is non-negotiable per the audit.

---

## 4. DETAIL PATTERN

Two convergence patterns: the **reservation detail panel** and **property-as-spine**.

### 4.1 Reservation detail (right-side panel, not a dead-end row)

The audit's #1 complaint: "Reservations list rows don't open a useful detail." V2 fixes this with the `.daside` panel (`ScreenReservations` panel): a `guesty` source chip + stacked `.ibctx` field rows — **Guest** (name · count · ★rating · returning badge), **Stay** (dates · nights · check-in), **Channel** (colored dot + name), **Payout** (mono Rs · paid), **Ops** (linked turnover badge "15:00 · IA"). Then a **2×2 action grid**: Message · Create task · Property · Modify. Below: an inline **New booking** mini-form (property dropdown · date chip · "Available · no conflicts" `.afdone` · Create) and an inquiries `.gate` ("Friday drafted replies & can convert to bookings on approval"). Same pattern in Inbox (the conversation's reservation/guest context panel with **Linked tasks**).

### 4.2 Property-as-spine (the missing anchor)

Audit: "Property detail is the missing spine — it should join Guesty commercial fields, Breezeway operational health/tasks, FAD owner/finance, guest history, reviews, and Ask Friday context." Two realizations in the bundle:

**Field-staff Property screen** (`ScreenProperty`, per-task context — built for staff *and third-party vendors*): serif title (property name) + `.occ` state → **Open in Google Maps** (real `maps/search` deep-link) → **Check-in instructions** card → **On-site guide** `.setgroup` (`.guiderow` rows: Wi-Fi `network + pass`, Parking, Bins+collection-days, Water mains, Fuse box, Linen & supplies storage, "Good to know" quirks) → **Access** (the audit-logged reveal, §3) → **Active issues on this property** (`.pissue` rows: status badge · title · reporter · when) → "Report an issue here." Wi-Fi sits openly in the guide (not a security risk); lockbox/alarm stay behind the audit gate.

**Manager Properties** (`ScreenProperties`): portfolio grid of `.panel` property cards (code chip · occupancy badge · name · location · next reservation · open-task / low-supply flags) + a 4-stat header (Active units · Occupied now · Open tasks · Avg rating) + an **Onboarding** side panel: a **7-step wizard** (Property details → Access & lockbox → Photos & layout → Amenities & house rules → Supplies par levels → Owner & contract → Publish to channels) with per-step status (done/in-progress/to-do/locked) + progress bar + "Friday can import details, photos & access from Guesty and seed supplies par from a similar unit."

### 4.3 Field-staff task detail = the hub

Task detail is the spine of the field workflow (not crammed; sub-screens linked via `.seclink` rows): timer (Start/Pause/Resume → big `.bigtimer` + `.timerpill` sticky follower) → **Complete** (proof-gated: required checks + photo must be done → success → auto-posts an executive summary as the **closing comment** + activity-log entry). Linked sub-screens: **Requirements** (cleaning checklist with per-item `photo` flags; amenity inventory `.stepper` with low-stock "restock N"; **Linen & breakables** condition count flagging damaged/broken/missing; post-clean inspection; photo grid), **Supplies** (confirm/edit qty, "from receipt" tag), **Expense** (capture → scan animation → Friday-extracted fields → accept/edit → flows line items into Supplies), task-scoped **Ask Friday** (`.aigate`, photos + guidance, approval-gated), **Comments + activity log** (`#tags`/`@mentions`, `.summary-cmt` auto-posted closing summary), **Property** (§4.2). A **Friday heads-up** card surfaces known patterns ("this pump trips on dry-run — check the breaker before resetting").

---

## 5. PER-MODULE SPECS (Operations · Inbox · Reservations · Properties · Guests)

### 5.1 OPERATIONS

**Desktop** (`ScreenOps` overview): top row = **donut** (`Donut` SVG, 4 segments Open/Overdue/Urgent/Done in one ring, center total + `.dleg` legend) at ~1.55fr beside a **Needs-attention** `.panel` at 1fr (the donut deliberately doesn't waste right-side space — a chat-feedback fix). Then a slim **`.fbar` Friday Daily Brief** (Apply plan / Review). Then `.grid2`: **Fix today** workbench (`.panel` rows: reports to approve / overdue / supplies low, each with an action button) + **Staff load** (`.zperson` rows w/ `.load` bars, `.warn`/`.over` tones). Then **Today's tasks** dense `.tbl` (Property · Task · Occupancy · Due · Pri · Status · Who). Ask Friday panel scope "Operations · Overview".

Sub-screens: **Schedule** (`ScreenSchedule`) — `.fbar` "Friday drafted the day" + Draft/Apply/Undo + `.vseg` view toggle (By staff·day / By property / By staff·week); grid `.sgrid` (`.sgrow` rows × time columns, draggable `.sblock` blocks with `.grip`, lunch hatch, multi-hour `span`); **Unassigned** `.dropzone` with "Let Friday place these." **All tasks** (`ScreenAllTasks`) — dense filterable `.tbl` (Property·Task·Dept·Assignee·Due·Occupancy·Pri·Status·Cost) + `.vseg` (All/Open/Overdue/Done) + `.aichip` filters (Dept/Property/Assignee/Priority). **Approvals** (`ScreenApprovals`) — the field-report vetting queue (closes the ＋report loop): Friday-triage panel + 4 stats + **Friday learnings** dashed `.qrow`s (pattern-detected suggested tasks, Accept&assign/Tweak/Dismiss) + **Waiting on you** `.qrow`s (thumbnail · title · `urgent` · code/dept/by/photos · Friday-drafted gate · cross-link "Draft guest message" for guest-affecting issues · Approve&assign/Edit/Decline). **Roster** (`ScreenRoster`) — full-width `.rweek` grid (staff × 7 days, **colored clickable `.rcell`** zone cells: North green / West blue / Off maroon / Stand-by violet / Leave gray — tap to change zone/status), `.rtoprow` stats row (counts · Review panel · Tasks-by-day/dept/assignee `.rbar` bars) moved to a top row for full width, `.weeksel` week navigator. **Live map** (`ScreenMap`) — `.mapcanvas` zoned map (North/West coastline shapes) + `.mpin` staff pins color-coded (on-task green / en-route amber / urgent red / stand-by gray, pulsing ring) + property `.mprop` markers + `.fbar` rebalance + `.maplist` on-shift side list + privacy note "locations shown only while a task is active." **Supplies** (`ScreenInventory`) — SKU `.tbl` (Item·Category·Location[store/van]·On-hand·Par·Status[OK/Low/Out]·Unit·Last-movement) + 4 stats + `.fbar` restock + Ask-panel **Restock order** (Friday-drafted line items w/ `.stepper`, supplier, split-by-store, Place order; Receive/Adjust-par/History; auto-order toggle). Movements link to the consuming task; footer "synced from Breezeway."

**Mobile** (`MobileOperations`): donut + legend, slim Daily Brief (Apply/Review), fix-today list, task list — on the bottom-nav shell. Field-staff get the focused execution app (My Tasks → detail), *not* the workbench.

**Backend data:** tasks (Breezeway-sourced: id, code, property, dept, priority, status, occupancy, due, window, requirements[], supplies[], cost, assignee, refId, importedFrom, learning) · staff/roster (zones, shifts, load, status) · schedule blocks · supplies/SKUs (on-hand, par, location, last-movement→taskId) · field reports (→ approval queue) · Friday learnings (pattern detections) · staff live locations (active-task-gated). Provenance: tasks/supplies/access = Breezeway; occupancy/reservation context = Guesty.

### 5.2 INBOX

**Desktop** (`ScreenInbox`): three-column `.inboxlay` — **thread list** `.ibthreads` (`.ibth` rows: avatar · name+unread dot+time · preview · `.pcodeD` property + channel + `AI draft` badge), **conversation** `.ibconv` (header w/ guest · property · check-in · channel + **Create task** / **Reservation** buttons + `guesty` chip; `.ibmsgs` bubbles `.ibmsg`/`.ibmsg.me`; **editable draft composer** `.ibcomp` — `.ibdraft` is a real editable field pre-filled by Friday with a `Friday draft` badge + "editable — or just type your own" + mono "REV 1 · conf 88%"; **Send works standalone with AI off**; `.aichip` Polish/Shorter + `Ask Friday` chip), and a **context panel** (3rd column `.daside`: reservation/guest provenance — Property/Guest/Stay/Check-in/Channel/Payout + **Linked tasks** + "Ask Friday about this stay"). Filter tabs: All/Guest/Needs reply/Team.

> Inbox AI rule (explicit decision): **the composer box is only the draft** (human-first, AI-optional). Everything conversational/action-y — learnings ("Marie mentioned the AC was loud"), task-creation suggestions, guest-message prompts — lives in the **Ask Friday side panel/sheet** as approval-gated cards that cross-link task ↔ thread ↔ reservation.

**Mobile** (`MobileInbox`/`MobileThread`): list (`.mchips` filters + `.ibth` rows) → thread (`.mctx` collapsible reservation strip + `.mthread` bubbles + `.ibcomp` editable draft). Ask Friday **sheet** carries the editable reply draft + Send *inside the sheet* + conversation summary + create-&-link-task card.

**Backend data:** guest threads (channel: Airbnb/Booking/Direct, messages, unread, WA-window state), AI drafts (rev, confidence), reservation+guest context per thread (Guesty), linked tasks (Breezeway), team channels. Provenance: messages/reservation = Guesty/channel; tasks = Breezeway; drafts = Friday.

### 5.3 RESERVATIONS

**Desktop** (`ScreenReservations`): 4-stat header (Arrivals today · Departures · Turnovers due · Occupancy 30d) → `.fbar` Friday summary → bookings `.tbl` (Guest avatar+name · Property code · Channel dot+name · Check-in · Check-out · Nights · Status badge [Arriving/In-house/Checkout/Upcoming, color+dot] · **Ops** column [Turnover due / Clean booked] · Payout mono). Tabs: All/Arrivals/In-house/Departures/Inquiries. Row opens the **reservation detail panel** (§4.1). Sub "Guesty bookings."

**Mobile**: reflowed list with channel dots + status; detail as sheet. (Built per chat; mirror desktop fields.)

**Backend data:** Guesty reservations (guest, property, channel, dates, nights, status, payout, paid-state) + Breezeway ops linkage (turnover/clean status per stay) + inquiries (→ booking conversion, Friday-drafted replies). **Reservations is the primary cross-link key** (repo ADR-006) — everything links back to a reservation. Detail must not be a dead end (audit). Provenance: commercial = Guesty; ops column = Breezeway.

### 5.4 PROPERTIES

**Desktop** (`ScreenProperties`) + **Onboarding wizard** + **field Property spine** — fully covered in §4.2. Portfolio grid + 4 stats + 7-step onboarding panel; property card = code · occupancy · name · location · next-reservation · open-task/low-supply flags.

**Mobile**: property cards reflowed to phone; the field per-task Property screen (§4.2) is the staff/vendor on-site brief.

**Backend data:** property record is the **spine** joining: Guesty (listing, address, channels, pricing/policies, owner, amenities, photos), Breezeway (condition, elements, requirements, task history, access codes [audit-only]), FAD (supplies par levels, owner/finance, on-site guide, lost-items), guest history, reviews. Onboarding = a state machine (7 steps, each with status + provenance of imported data). Provenance per field critical here.

### 5.5 GUESTS

**Desktop** (`ScreenGuests`): 4-stat header (Guests · Returning% · Avg rating · In-house now) → guest `.tbl` (avatar+name · Home unit code · Stays · Last stay · Rating ★ · Channel dot · Tags [VIP amber / Returning gray] · **Lifetime value** mono). Tabs: All/VIP/Returning/In-house/New. Sub "synced from Guesty." (No deep profile drawer built in the bundle, but the audit flags this as the big opportunity — Guesty's contacts are a raw table with no clean profile; FAD should give guests a real profile drawer following the §4.1 panel pattern.)

**Mobile**: guest list reflowed; profile drawer/sheet to follow the reservation-detail pattern.

**Backend data:** Guesty contacts/guests (history, tier, LTV, preferences, prior stays, channel, ratings) — **must show source-merge status** before staff trust it (audit: FAD guest data currently looks synthetic). Cross-link to reservations + reviews. Provenance: Guesty, with merge/confidence indicator.

---

## 6. RELATION TO EXISTING REPO

### 6.1 What's actually in the repo (verified)

- The brief references `field.css` + `gm-desktop.css` scoped `.ff-app` / `.dwrap` from an **earlier** port of this same design — **those files do not exist in the current tree.** The repo has a single **`frontend/src/app/fad/fad.css`** with a **global `:root`** defining a *light-default* brand system (cream/navy `--color-brand-navy:#0F1836`, `--color-brand-accent:#2B4A93`) plus a `html.fad-dark` dark theme, fonts **Inter + Fraunces + JetBrains Mono**. No `.ff-app`/`.dwrap` scoping anywhere in `frontend/src`.
- App shell: **`frontend/src/app/fad/_components/FadApp.tsx`** — `useState('inbox')` active module + `subPage`, renders `<Sidebar>` + `<Header>` + `<CommandPalette>` + `<FridayDrawer>`/`<FridayFullscreen>` + a big switch over module components in `_components/modules/*`. Role-aware (`useCurrentRole`, field-staff lands on Operations→My tasks). URL-param routing (`?m=&sub=`).
- Sidebar groups (`_data/modules.ts` `GROUPS`): **Today · Portfolio · Business · People · Growth · Units · Manage · System** — already very close to the V2 rail grouping (Today/Portfolio/Business/More). Modules already registered: Inbox, Operations (10 sub-pages), Calendar, Properties, Reservations, Finance, Legal, Guests, Owners, Reviews, HR, Marketing, Leads, Analytics, Intelligence, Notifications, Training, Settings, Design, Tenant/Billing/AdminAnalytics, AskFridayReview.
- There is an existing **FridayDrawer** + **FridayFullscreen** (the current Ask Friday surfaces) and **FridayConsult**/**ConsultChat** (catalogued reusable feature).

### 6.2 How V2 reconciles

**Tokens / theming:** V2 ships **dark-first** with **muted indigo**; the repo is **light-first** brand-navy. Recommendation: introduce the V2 token set as the FAD theme, mapping V2 vars onto (or replacing) the repo's `--color-*` system. Because the repo already supports `html.fad-dark`, the cleanest path is to make the V2 dark palette the canonical FAD skin and keep a light variant. **Do not** ship both `:root` blocks globally (field `fad.css` and desktop `fad-desktop.css` both write `:root` and will collide). Choose one of:
  - **(A, recommended) One shared V2 stylesheet, two scope classes.** Move the field tokens under a `.fad{…}` scope and desktop tokens under `.dwrap{…}` scope (CSS custom props cascade fine when scoped to the wrapper). Single import in `layout.tsx`/`fad.css`. This matches the existing repo convention (everything already under the FAD subtree) and avoids `:root` collision. The two scopes legitimately differ (field bright / desktop muted), so per-scope tokens are correct, not duplication.
  - (B) Per-area stylesheets loaded only on their routes — heavier for static export, more drift risk.

**Shell mapping (`FadApp.tsx`):** V2's `.dapp` grid = the existing Sidebar+Header+main, plus a **third grid column for the Ask Friday `.daside`**. Concretely:
  - Keep `FadApp`'s module-switch architecture. Re-skin `Sidebar.tsx`→`.drail` (add the pinned `.askfri` launcher above groups; keep existing `GROUPS`), `Header.tsx`→`.dtop` (fold the command palette into `.dsearch` "Search or Ask Friday", keep the View-as switch).
  - **Replace** `FridayDrawer`/`FridayFullscreen` with the **`AskPanel` (`.daside`) pattern** as the primary AI surface: add a `withpanel` state to `FadApp` that widens the grid to `210px 1fr 326px` and renders `AskPanel` with the current module's scope/awareness. Keep `FridayFullscreen` as the default-landing full-page (`ScreenAskFull` is its V2 design). Trigger from the per-module slim `.fbar` `Review` button. `ConsultChat`/`FridayConsult` becomes the chat engine *inside* `.daside` — **update its feature-catalog entry in the same commit** (repo discipline).
  - Mobile: the existing mobile sidebar behavior is replaced by the `.pwa-tab` bottom nav (Inbox/Ops/AskFriday/Calendar/More) for managers, and the field `.tabbar` (Tasks/Chat/＋/History/Account) for field role. Drive by `useCurrentRole`.

**Per-module:** each existing `modules/*Module.tsx` gets re-skinned to its V2 screen (§5). Operations sub-pages already match (Overview/Schedule/My/All/Issues/History/Approvals/Roster/Insights/Settings) — note V2 **adds Supplies** as an Operations sub-view (the bundle flags Supplies as currently unaccounted-for; wire it under Operations and feed the Property record). Properties already has Overview/All/Onboarding/Insights sub-pages — the V2 onboarding wizard slots into `onboarding`.

**Fonts:** add Newsreader (titles) + Hanken Grotesk (UI) to the FAD font stack; keep JetBrains Mono. Self-host or `<link>` for static-export safety. This changes the repo's current Inter/Fraunces — a deliberate V2 type refresh.

**Provenance:** new cross-cutting concern — add a `<SourceChip>` component (`.srcbz`/`.srcgy` desktop, `.srcchip` field) and thread `provenance`/`lastSyncedAt` through module data adapters (`_data/*`). Tag every demo fixture per repo `DEMO_CRUFT.md` discipline (`// @demo:data`, etc.) — the bundle's `fad-data.jsx` shapes are the fixture contract.

### 6.3 Migration order (suggested, matches task #9)

1. Land the V2 token system (scoped `.dwrap`/`.fad`) + fonts + the `<SourceChip>` + `<AskPanel>`/`.daside` shell column in `FadApp` — the "foundation" (this is exactly in-progress task #9).
2. Re-skin Sidebar/Header → `.drail`/`.dtop`; wire the slim `.fbar`→Review→panel pattern.
3. Re-skin the 5 core modules (Operations, Inbox, Reservations, Properties-spine, Guests) — task #7.
4. Mobile-web shells (bottom nav) per role; field PWA is its own already-locked design (`fad.css` + screens-a…f).
5. Remaining modules (Calendar, Supplies, Owners, Finance, HR, Analytics, Settings, Help, Notifications) to the same patterns.

---

## 7. Quick reference — class → purpose cheat sheet

| Field (`.fad`) | Desktop (`.dwrap`) | Purpose |
|---|---|---|
| `.tcard` | `.tbl` row / `.panel` | task/record surface |
| `.askbar` / `.brief` | `.fbar` / `.fai` | inline Friday strip / panel |
| (full-screen sheet) | `.daside` + `.afp-*`/`.afm`/`.afact` | **universal Ask Friday** |
| `.srcchip.{bz,gy}` | `.srcbz`/`.srcgy` | **provenance chip** (blue=Breezeway, green=Guesty) |
| `.pri.{urgent,high,med,low}` | `.pri.*` | Breezeway priority glyphs |
| `.occ.{in,vacant,soon}` | `.bdg.*dot` | occupancy / status |
| `.aigate` (dashed) | `.gate` (dashed) | AI suggestion / approval gate |
| `.tabbar`+`.fab` | `.pwa-tab`+`.pwa-fab` / `.drail` | nav |
| `.statrow`/`.stat` | `.donut`/`.statc` | metrics (desktop prefers donut) |
| `.codebox` + audit chip | — | revealed access code (logged) |
| `.reqsection`/`.checkitem`/`.invrow` | — | field requirements/inventory |
| — | `.sgrid` / `.rweek` / `.mapcanvas` / `.inboxlay` | schedule / roster / map / inbox layouts |

**Hard rules carried from intent:** field staff **report**, never create tasks (manager vets). Ask Friday is **one panel everywhere**, scope-aware, approval-gated, no silent writes, squeezes content (desktop) / sheet (mobile). Every fact shows source. Density + muted color on desktop ("respect the current FAD"); field PWA may be more vivid/app-like. Codes audit-logged. Inbox draft is human-first/AI-optional.
