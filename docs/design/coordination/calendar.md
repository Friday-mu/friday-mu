# Calendar — Design Brief for Claude Design

> No standalone Calendar scoping pack — its vision is split across the **Reservations pack v0.2**
> ([34f43ca884928188a83ad290b1a13b1b](https://www.notion.so/34f43ca884928188a83ad290b1a13b1b) §2, which makes
> Calendar a top-level entry that **owns the create-flow**) and the **Ops Scheduling/Roster/Task pack**
> ([36b43ca8849281b0b1b3db967c4a2b73](https://www.notion.so/36b43ca8849281b0b1b3db967c4a2b73), which locks the
> occupancy-grounding rules). Read `00-README` + `ask-friday.md` first.

## 1. The brief in one line
Design Calendar as the **multi-property timeline + availability + blocks** surface that **owns the
reservation/quote/block create-flow** — reading Guesty's calendar with a **FAD block overlay where staff intent wins**
— with honest **unknown-price**, **FAD-block-vs-channel-closed**, and **Phase-1-local-block** states the prototype
currently glosses over.

## 2. Source of truth and grounding (three-way reconcile)
- **Vision** = Reservations §2 (Calendar owns: Find availability → quote / new reservation / new owner reservation /
  manual block / min-nights override / restrict check-in-out; a reservation event = a continuous bar → click →
  StayPopover with Financials) + the Ops pack's grounding rules (a confirmed/checked-in stay **blocks non-urgent
  property work** check-in → night-before-checkout; **checkout day stays schedulable**; occupancy/price grounding
  uses FAD reservation overlays + **cached calendar-pricing**). **FAD does not re-implement Guesty Smart Calendar
  Rules — it reads them.**
- **Reality** = `CalendarModule.tsx` (views multi / agenda / day / week / month) + `calendar/
  MultiCalendarGrid.tsx` (per-cell € price chips, occupancy, block/unblock popover; reason enum owner_stay /
  maintenance / private_use / channel_block / other) + `calendar/AvailabilitySearchModal.tsx` (dates + guests →
  matches / partial → "Generate quote link"). Backends: **`/api/availability/search`** (real SQL over
  `guesty_listings.accommodates` × `guesty_calendar.is_available` → `{matches, partial, unavailable}` + nightly_avg)
  **CORE**; **`/api/calendar/grid`** (per-property × per-day price + availability from `guesty_calendar`, with the
  **`fad_calendar_blocks` overlay, mig 090** — a FAD block flips availability false, **staff intent wins**)
  **CORE/LIVE**; `POST/DELETE /api/calendar/block`. Reservation bars come from `useLiveReservations`. Quote-link
  generation is **SPEC** (the friday.mu Guesty-whitelabel quote API is a Phase-2 audit dependency).
- **Drawn** = `fad-desktop-screens.jsx` `ScreenCalendar`: a 14-day × ~27-property **timeline grid** (sticky property
  column with code + nickname + occupancy dot, channel-coloured stay bars, task tick-marks, channel legend). Tabs
  Timeline / List / Availability / Blocks; toolbar Availability / Block / New-reservation; a right panel = **Check
  availability** (per-region rollup "North 3 · West 3"), **New reservation** quick-create, **Block dates**
  (Maintenance / Owner-stay / Off-market chips, "Blocks sync to Guesty & close availability across channels").
- **Full-vision rule:** design the complete create-flow + availability + blocks even though quote-link + channel
  write-through are Phase 2; the **unknown-price** and **pending-sync** states are not "future".

## 3. Who uses it
Calendar is **not an explicit resource in `permissions.ts`** → ungated/open by default. But it surfaces reservation
+ price data, so **finance-gating applies to the money it shows**: per-cell € price and the StayPopover Financials
must follow the same director-vs-manager rule as Reservations (managers **don't** see owner payout / commission).
Block-create is a write action — fine for managers (ops). **Field** is desktop-deprioritised: field staff get My
Tasks / roster view in the PWA, not the multi-calendar.

## 4. Design principles and system
- **Read Guesty, overlay FAD intent.** The grid is Guesty's calendar; a **FAD block overrides** it (staff intent
  wins). That override is a **provenance distinction** worth a visible marker — a FAD-blocked cell ≠ a channel-closed
  cell. Don't collapse them.
- **Honesty over a pretty grid.** The live grid returns **null** for cells with no cache row (`price:null,
  available:null`) — a real *unknown* state the always-populated prototype never shows. Design it (a neutral chip,
  not a fake price).
- **Use the built kit** (Calendar imports zero trust components today — another wiring gap).

## 5. Information architecture
- **The grid** — property rows × day columns; channel-coloured continuous stay bars; occupancy dot per property;
  task tick-marks; per-cell price/availability; views multi / agenda / day / week / month.
- **Availability** — date + guest search → matches / partial / unavailable, nightly avg + total → (SPEC) quote link.
- **Blocks** — create/remove FAD blocks with a reason; the StayPopover on a bar (with role-gated Financials).
- **Create-flow entry** — Calendar is where "new reservation / owner reservation / quote / block" begins.

## 6. Surfaces to design (full vision) — P0 first
| # | Surface | Purpose | Reality | Priority |
|---|---|---|---|---|
| A | **Multi-property timeline grid** | property rows × days, stay bars, occupancy dots, task ticks, per-cell price/availability **incl. the unknown-cell state**. | CORE/LIVE | **P0** |
| B | **Block dates** | create/remove a FAD block (reason enum); the FAD-block-overrides-Guesty marker; honest "FAD-side; channel write-through Phase 2" copy. | LIVE (FAD-local) | **P0** |
| C | **Availability search** | dates + guests → matches / **partial** / unavailable; nightly avg + total. | CORE | **P1** |
| D | **StayPopover** | click a bar → reservation summary with **role-gated** Financials; "Open full reservation". | LIVE | **P1** |
| E | **Quote-link / create-flow** | new reservation / owner reservation / quote-link generation (multi-property select → friday.mu link). | SPEC (quote) / LIVE (create) | **P2** |

## 7. Critical states the UI must make legible
- **Unknown price/availability** — null cache cells are real → a neutral "no data" chip, never a fabricated price.
- **FAD-block-overrides-Guesty vs channel-closed** — two different reasons a cell is unavailable; mark them
  distinctly (staff intent vs channel state).
- **Block sync state** — blocks are **Phase-1 FAD-local** (they do **not** yet push to channels) → the block UI must
  say so honestly. *(The prototype's "Blocks sync to Guesty & close availability across channels" is aspirational —
  clash.)*
- **Calendar freshness** — `SyncChip` stale when `guesty_calendar` ages.
- **Partial availability** — the search `partial` bucket (some nights free, some not) is a first-class result.
- **Occupancy grounding** — a confirmed stay blocks non-urgent work check-in → night-before-checkout; checkout day
  schedulable. Surface this where Calendar feeds Ops scheduling.

## 8. Key flows to storyboard
1. **Scan the grid:** spot occupancy, gaps, turnovers; hover a bar → StayPopover.
2. **Block dates:** pick property + range + reason → FAD block (overrides Guesty) → "pending channel sync (Phase 2)".
3. **Check availability:** dates + guests → matches/partial → (SPEC) generate quote link.
4. **Create from a cell:** empty cell → new reservation / owner reservation (hands to the Reservations Draft→Confirm).

## 9. Reference artifacts
Prototype `ScreenCalendar`; built `CalendarModule` + `MultiCalendarGrid` + `AvailabilitySearchModal` +
`/api/calendar/grid` (mig 090 blocks) + `/api/availability/search` + `_data/{calendarGridClient,
availabilityClient}.ts`; the `ai/` kit.

## 10. Recommended design priority
1. **A–B:** the timeline grid (with the unknown-cell state) + blocks (with honest sync copy + the override marker).
2. **C–D:** availability search + the role-gated StayPopover.
3. **E:** the quote-link / create-flow (mark backend pending).

## 11. Out of scope (Phase 1)
Re-implementing Guesty Smart Calendar Rules (FAD reads them) · channel write-through for blocks (Phase 2) ·
quote-link backend (friday.mu whitelabel API, Phase 2 audit dependency). Design the flows; mark the backend pending.

## 12. Open decisions (propose options, don't guess)
1. **Availability + Blocks** — top-level **tabs** (prototype) or **flows** off the create-entry (vision)?
2. **Finance-gating** — confirm per-cell € price + StayPopover Financials hide owner payout / commission for managers.
3. **Override marker** — how to show a FAD-block-overriding-Guesty cell vs a channel-closed cell.
4. **Unknown cells** — the neutral treatment for null price/availability.
5. **Scoped Ask Friday?** — does Calendar get a scoped assistant (like Ops' Schedule/Roster Consult), or only the
   toolbar actions + the global panel?
6. **Region rollups** — the prototype's "North/West" availability summary isn't in the live per-property endpoint —
   build it or drop it.

## 13. What we want back
The **timeline grid** (with the unknown-cell + occupancy states) and **blocks** (honest FAD-local + override marker)
first — desktop + manager-mobile — built on the live grid/availability clients + the `ai/` kit; then availability
search, the role-gated StayPopover, and the quote/create-flow (backend marked pending). Flag clashes per
`00-README` §7.
