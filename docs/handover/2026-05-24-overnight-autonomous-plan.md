# Overnight autonomous plan — 2026-05-24

> **Read this first if you wake up cold (post-compaction).** It's the full plan + decisions Ishant pre-approved so the loop can keep running without him.
>
> Authoring context: at session start frontend was live at `7e85416d`, backend at `0306bbba`. Tree tip on `fad-rebuild`: `c520742b`.

---

## Mandate

Ishant is asleep. He gave a one-shot "do everything you can without my approval; when I wake up I want it done." Three screenshots received:

1. **Breezeway task detail** — clean section layout, prominent title, timer in red when running, sections: TIME / ASSIGNEES / GUEST RATING / ATTACHMENTS / TASK TAGS / LINKED RESERVATIONS / comments. Description editable inline. This is the target shape for T1.15.
2. **Breezeway Property Schedule** — Property × Date grid (vertical = properties, horizontal = days), reservation bars at the top of each property row, task cards in each cell with assignee + status chip. Right side opens the task-detail drawer (same shape as screenshot 1).
3. **Guesty Multi-Calendar** — same Property × Date pattern, cleaner. Reservation bars span multiple cells (green), available cells show nightly €PRICE, task chips overlay, today vertical pink line, top filters (Cities / Tags / Status), top-right buttons (Today / Find availability).

The user-facing direction synthesised:
- Multi-calendar (Property × Date) is THE primary calendar view. Today's banded Month view becomes a secondary/alternate view.
- Task detail UI gets a Breezeway-style sectioned redesign.
- Build Guests + Owners backends to unblock the rest of the detail pages.
- Wire what we can on the existing front-end so data shows even if not interactive yet.

## Pre-authorised decisions

These are calls Ishant explicitly delegated:

- **Calendar**: full rebuild of the frontend Calendar surface as a Property × Date multi-calendar (matches the Guesty screenshot). Keep the backend (already aggregates `guesty_reservations` + `guesty_calendar` correctly). Old Month/Week views stay as alternate tabs for now; can be removed in a later session if redundant.
- **Quote generator (T4.40)**: v1 = redirect to the Friday Website (Vercel preview) with property-filter query params. No native FAD quote page yet.
- **Insights**: do real wiring where backend aggregations already exist; for the others, surface "Data wiring pending — Phase 2" placeholders rather than fixture numbers.
- **Multi-tenant safety**: every new table gets `tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES tenants(id) ON DELETE CASCADE` + index. Non-negotiable.
- **Migrations**: prefix new tables `fad_*` (per the 2026-05-24 rename convention). Numbers continue from `079_*`.

## Live state snapshot (at plan write time)

- Frontend live: `7e85416d` · backend live: `0306bbba`
- Tree tip: `c520742b` (docs only)
- 60 properties, 210 reservations, 100+ tasks, 7 staff, 18 website inquiries — all backend-wired
- PROD DB on VPS: idle reservations webhook + guesty sync workers running
- VPS disk ~87% — be careful with backups; skip snapshots for small diffs

## Phase order + per-phase plan

Each phase ends with: type-check → build → commit (Judith Friday <judith@friday.mu> author) → push → deploy → verify on prod via Chrome MCP. Roll back via revert + redeploy if any verification fails.

---

### Phase 1 — Guests module backend wiring  (T3.11)  est. 2h

**Goal**: backend-back the Guests module so the Reservation Detail → Guests tab + Property Detail can join real guest data.

**Steps**:

1. Write `backend/migrations/079_guests_fad_native.sql`:
   - `fad_guests` table: `id UUID PK`, `tenant_id` (FK to tenants), `primary_email`, `primary_phone`, `display_name`, `first_name`, `last_name`, `language_pref` (en/fr), `country`, `vip_tier` (`none`/`silver`/`gold`/`vip`), `notes`, `first_seen_at`, `last_seen_at`, `total_stays_count`, `total_revenue_minor`, timestamps + `set_updated_at_now` trigger.
   - Unique constraint on `(tenant_id, COALESCE(LOWER(primary_email), 'NO-EMAIL:'||primary_phone, 'NO-CONTACT:'||id))` — best-effort dedup key.
   - Index on `tenant_id, primary_email`.
2. Write `backend/src/guests/index.js`:
   - `GET /api/guests` — list (paginated, filter by search/vip_tier)
   - `GET /api/guests/:id` — full record
   - `GET /api/guests/:id/reservations` — joined via guest_email/guest_name match against `guesty_reservations`
   - `PATCH /api/guests/:id` — update notes, language_pref, vip_tier
   - All routes use `attachIdentity` + `tenant_id = req.tenantId`
3. Sync logic: extend `backend/src/reservations/sync.js` to upsert into `fad_guests` on each reservation insert (best-effort match on lower-trimmed email; fall back to phone; fall back to name).
4. Register route in `backend/server.js`.
5. Backfill: run a one-shot SQL on prod to seed `fad_guests` from existing `guesty_reservations` data (de-duped on email/phone).
6. Frontend client `frontend/src/app/fad/_data/guestsClient.ts` with `loadGuests`, `loadGuestById`, `loadGuestReservations`, `patchGuest`, `useGuest(id)` hook.
7. Wire Reservation Detail Guests tab: replace `GUEST_PROFILES[r.guestName]` fixture lookup with `useGuestByEmail(r.guestEmail) || useGuestByName(r.guestName)`.
8. Build / commit / push / deploy backend + frontend / verify on prod.

**Rollback**: backend migration is additive → safe. If frontend breaks on the Guests tab, revert the ReservationDetail edit + redeploy.

---

### Phase 2 — Owners module backend wiring  (T3.12)  est. 1.5h

**Goal**: real owner records, closes T1.12 ("o-guesty-unknown" placeholder).

**Steps**:

1. Write `backend/migrations/080_owners_fad_native.sql`:
   - `fad_owners` table: `id`, `tenant_id`, `display_name`, `legal_entity_name`, `contact_email`, `contact_phone`, `address`, `country`, `payment_pref`, `bank_details_encrypted` (pgcrypto), `language`, `statement_day`, `commission_pct_default`, `notes`, `archived_at`, timestamps + trigger.
   - Already-existing `fad_property_owners` (mig 077) links properties → owners (M:N with ownership_pct).
2. Backend routes `backend/src/owners/index.js`:
   - `GET /api/owners` — list with property counts
   - `GET /api/owners/:id` — full record
   - `GET /api/owners/:id/properties` — joined via `fad_property_owners`
   - `GET /api/owners/:id/statements` — placeholder (returns empty `[]` for v1, future links to Finance owner-statements)
   - `POST /api/owners`, `PATCH /api/owners/:id`, `POST /api/owners/:id/archive`
   - All routes `attachIdentity` + `tenant_id` filter
3. Sync hint: extend property sync to seed owner from Guesty `accountManager` field where present (best-effort; skip silently when absent).
4. Register route in `backend/server.js`.
5. Frontend client `frontend/src/app/fad/_data/ownersClient.ts` + `useOwners` / `useOwner(id)` hooks.
6. Wire PropertyDetail Owner tab: load `fad_property_owners` rows for this property → join to `fad_owners` records → display real names instead of "o-guesty-unknown".
7. Wire `mergedListingToProperty` to populate `primaryOwnerId` from the linked owner row (replace the hardcoded 'o-guesty-unknown').
8. Update Overview cards owner display to use the resolved name.
9. Build / commit / push / deploy / verify.

**Rollback**: additive migration; frontend changes guarded with fallback to empty string.

---

### Phase 3 — PropertyDetail Financial tab wiring  est. 1h

**Goal**: real per-property revenue + expense aggregation.

**Steps**:

1. Backend route `GET /api/finance/property/:code/summary?window=90d` returning `{ revenue_minor, channel_fees_minor, expenses_minor, net_to_owner_minor, friday_margin_minor, reservation_count, occupancy_pct, adr_minor, currency }`.
   - Aggregate `guesty_reservations` joined on `listing_guesty_id = code`, filter by check_in within window.
   - Aggregate `fad_expenses` (or `expenses` — check actual table name) joined on `property_code = code`.
2. Frontend hook + render in `FinancialTab`.
3. While here: implement T1.11 (occupancy + ADR) by exposing the same numbers on the property card via `GET /api/properties` listing → add `metrics_30d: {occupancy_pct, adr_minor}` field to the returned shape.

---

### Phase 4 — Task detail UI redesign  (T1.15)  est. 2-3h

**Goal**: re-skin TaskDetail to match Breezeway shape (screenshot 1). Keep all existing functionality.

**Target layout** (top → bottom):
- **Top bar**: status chip (e.g. "Medium · In Progress"), title icon + title (bold, prominent), action menu (⋮), close (×), "Open in full view" button (NOW WIRE IT).
- **Sub-line**: due date (calendar icon) · "Add time" button (clock icon).
- **Property + address**: property code in bold, address line below. "+ Add element" link.
- **Description**: clickable to edit inline. Placeholder "Add a description…".
- **TIME section**: timer display in red when running (e.g. "0h 24m 15s"). Start/Stop button.
- **ASSIGNEES section**: avatars + names with Remove button per assignee. "+ Add assignee" affordance. **EDITABLE — fix the read-only complaint.**
- **GUEST RATING**: read-only chip ("Not Rated" or stars).
- **ATTACHMENTS**: grid of thumbnails + "+ Add attachment".
- **TASK TAGS**: chips + "+ Add tag".
- **LINKED RESERVATIONS**: stack of linked reservation cards + "Link reservation" affordance.
- **Comments**: input at top with @-mention support, then comment thread below with avatar + name + relative time.

**Steps**:

1. Find current TaskDetail component (`frontend/src/app/fad/_components/modules/operations/TaskDetail.tsx` likely).
2. Create new layout matching above; preserve all callbacks (assignee change, status change, complete, defer, etc.).
3. Wire "Open in full view" → `window.location.href = '/fad?m=operations&sub=all&task=' + task.id` with the URL param triggering the same drawer but pinned open + maximized.
4. Make assignee picker work: list active staff from `/api/hr/staff`, multi-select, PATCH to `/api/tasks/:id/assignees`.
5. Make sure execution_summary moves to the Complete flow — when status flips to `completed`, prompt for summary; don't show it as a top-level field on active tasks.
6. Timer becomes floating bottom-right button when active; collapse to a compact "Start timer" in the TIME section when stopped.
7. Build, deploy, verify on prod.

---

### Phase 5 — Multi-calendar rebuild v0.1  (T4.38)  est. 3-4h

**Goal**: ship a working Property × Date multi-calendar (per Guesty screenshot) as the primary Calendar view. v0.1 = read-only with hover details + price + reservation bars + task chips. Interactions (drag-to-create, edit times) deferred to v0.2.

**Steps**:

1. New component `frontend/src/app/fad/_components/modules/CalendarModuleV2.tsx` (keep old `CalendarModule.tsx` as fallback during transition).
2. Top toolbar: Cities filter dropdown · Tags filter · Status filter (Listed / Paused / Unlisted) · "Add filter" link · Today button · "Find availability" button (wires to Phase 6).
3. Date scroller: horizontal scroll, ~60 days visible at once, sticky property column on the left, sticky date header on top, today vertical pink line.
4. Left column (sticky): property thumbnail (heroPhotoUrl) + code + lifecycle status icon. Click → opens PropertyDetail drawer.
5. Cells:
   - Default: nightly €PRICE pulled from `guesty_calendar.price_minor / 100`. Greyed out if unavailable.
   - Reservation: full-cell colored bar (green = confirmed, yellow = hold, etc., spanning multiple cells). Hover → popover with guest + channel + nights + status. Click → opens ReservationDetail drawer.
   - Task overlay: small chip on the cell (title truncated to ~10 chars + assignee initial avatar). Hover → full task summary. Click → opens TaskDetail drawer (new Breezeway-style one from Phase 4).
6. Backend: extend `GET /api/properties?include=calendar&from=Y-M-D&to=Y-M-D` to return per-property calendar slice (already in LATERAL JOIN — just extend the date window to the requested range). Add separate `GET /api/tasks?dueAfter=Y-M-D&dueBefore=Y-M-D&group_by=property_code` for the task overlay.
7. Performance: virtualise the date columns (only render visible + 7-day buffer on each side). React-window or similar — or simple CSS overflow + IntersectionObserver.
8. Update CalendarModule entry point: tab switcher Today/Schedule/Multi (default) / Month / Week / Day / Agenda. Multi is the new default.
9. Build, deploy, verify on prod via Chrome MCP. **Critical**: confirm it scrolls smoothly with 60 properties × 60 days.

**Stopping condition**: if the multi-calendar v0.1 build hits over 5 hours, ship what's working (even without all 60 properties paginated) and continue in the next phase.

---

### Phase 6 — Availability search  (T4.39)  est. 1h

**Goal**: top-right "Find availability" button opens a date+guests modal; returns matching properties with prices.

**Steps**:

1. Backend `GET /api/availability/search?from=Y-M-D&to=Y-M-D&guests=N` returning `[{property_code, nickname, picture_url, available_nights, total_nights, nightly_avg_minor, total_minor, currency}]`. Compute from `guesty_calendar` over the window.
2. Frontend `AvailabilitySearchModal` opened from the Calendar v0.1 top toolbar.
3. Result list: thumbnail + code + name + price + "+ Add to quote" button.
4. Selected properties accumulate in a "Quote draft" panel. "Send quote" button → next phase.

---

### Phase 7 — Quote generator v0.1  (T4.40)  est. 0.5h

**Goal**: shareable link to Friday Website preview with filtered properties.

**Steps**:

1. Backend `POST /api/quotes` accepts `{property_codes[], from, to, guests}`, persists to `fad_quotes` table (mig 081), returns `{quote_id, share_url}`.
2. `share_url` v1 = `https://preview-website.../search?codes=XXX,YYY&from=...&to=...&guests=N` (Friday Website handles the filter UI).
3. Frontend: "Send quote" button in availability search opens a modal with the share URL + "Copy" + "Send via WhatsApp" + "Send via email" buttons.
4. v1 doesn't auto-send — just gives the URL.

**Note**: depends on Friday Website preview accepting the query param shape. If unclear, just ship the URL generator and let Ishant validate the destination in the morning.

---

### Phase 8 — Insights wiring  (T1.14)  est. 1-1.5h

**Goal**: replace fixture stats on every Insights page with real backend aggregations OR a "Data wiring pending — Phase 2" placeholder.

**Per-module audit + wire**:

- **HR Insights**: real headcount, leave-this-week-count, hours-worked-this-week aggregated from `fad_hr_staff` + roster + task time-tracking. Replace `WORKLOAD_THIS_WEEK` fixture.
- **Reviews Insights**: aggregate `/api/reviews/list` → rating-trend, channel-distribution, anomalies (already partially wired — verify).
- **Operations Insights**: aggregate tasks by department/status/assignee from `/api/tasks`. Pre-existing endpoints likely exist; verify and wire.
- **Properties Insights**: photo-gallery-sweep + description-coverage already real (verified earlier today); anomaly bullets are PROD-DATA-43 hardcoded — replace with computed signals (`live_without_photos_count`, `description_empty_count`, etc.).
- **Analytics Insights**: portfolio-health bullets (PROD-DATA-43) → real signals.
- **Finance Insights**: most still mocked — wrap in "Data wiring pending — Phase 2" rather than ship fake numbers.

---

### Phase 9 — Quick wins from existing backlog  est. 1-2h

Sweep in order:

- **T1.8** — Delete `parseNl` + the "Quick draft (offline)" button (smart drafter has proven reliable).
- **T1.9** — Gate hardcoded TODAY constants in `_data/reviews.ts` + `_data/pendingCounts.ts` + `hr/StaffPage.tsx` behind `liveOnlyMode()`. Use real `new Date()` in prod.
- **T1.13** — Drop the blocking spinner on Ops Insights + Reservations Inquiries; rely on the existing stale-while-revalidate pattern.
- **T1.17** — Debug expense capture LLM. Trace: upload `POST /api/expenses/receipts` → should auto-trigger `POST /api/expenses/extract` (Gemini OCR) → result populates form. Likely culprits: auto-trigger never fires (frontend bug), or the LLM endpoint returns non-JSON, or CORS. Try to fix; if too deep, document the diagnosis in a follow-up backlog item.

---

### Phase 10 — Documentation + handover  est. 30 min

When the loop ends (either everything done or stopping condition hit):

1. Update `docs/FAD_BACKLOG.md`:
   - Strike completed items, add `✓ shipped 2026-05-24 (<sha>)` annotation.
   - Bump live-version line.
   - Add any new follow-ups discovered.
2. Write `docs/handover/2026-05-25-morning-handover.md` for Ishant:
   - Quick "what changed overnight" ledger.
   - Per-phase: shipped vs deferred + why.
   - Anything broken or risky that needs his eyes.
   - Open questions for him to answer.
3. Final commit + push.

---

## Hard rules during the autonomous run

- **Never deploy without typecheck + build passing.** Roll back on type/lint regression.
- **After every deploy: verify on prod via Chrome MCP** (Ishant's "Working Browser"). Hit at least one screen affected by the change.
- **Mobile QA after every UI commit** per CLAUDE.md (FAD primary = mobile). Resize to 375×812, screenshot, click changed interactive element.
- **Commit author MUST be Judith Friday <judith@friday.mu>** (hook enforces).
- **No `--no-verify`. No force-push. No skipping hooks.** If a hook blocks, fix the root cause.
- **Backend migrations: apply via SSH to prod DB after rsync.** Use the migration runner one-liner from the smart-compact anchor.
- **Skip VPS backups for small commits** (disk at 87%).
- **Multi-tenant safety**: every new table + every new SQL site must filter on `tenant_id = req.tenantId`. Verify with grep after each backend addition.
- **Don't touch website_inbox tables** until T3.7 (separate sprint).
- **Don't edit Friday Website code** in this session (per CLAUDE.md "no FAD + website in same session"). Quote v1 just generates the link; Ishant validates destination tomorrow.

## Stopping conditions (when to halt vs continue)

Halt + write Phase 10 handover if:
- 3 consecutive deploy failures
- A migration fails in a way that's not trivially fixable
- Context window hits 80% — wrap up cleanly + leave continuation pointers
- An unexpected production regression I can't diagnose in 30 minutes

Continue if:
- Any phase finishes faster than estimated → pick the next one
- A type/build error is fixable in under 15 min → fix + continue
- A backend route returns 500 on first hit → debug from pm2 logs + retry once

## Recovery instructions (post-compaction)

If you (future-self) come back to this and the conversation summary is fuzzy:

1. **Read this plan top to bottom first** — it's the source of truth for what to do.
2. Run `git log --oneline -10` to see what's already shipped against the plan.
3. Run `curl https://admin.friday.mu/version.json` + `/api/version` to see what's live.
4. The phase you should be on = first unfinished phase per git history.
5. Resume there. Don't re-do earlier phases.

## Open questions for Ishant (compile + raise in morning handover)

- Confirm the multi-calendar v0.1 is the right primary view (or should we keep banded Month as default until v0.2 has interactions)?
- Quote URL shape — does the Friday Website preview accept `?codes=X,Y&from=...&to=...&guests=N`, or does it need a different filter param schema?
- Are there other Insights surfaces beyond the 6 listed in Phase 8?
- Task assignee endpoint shape — should we add `PATCH /api/tasks/:id/assignees` (clean) or extend the existing PATCH `/api/tasks/:id` to accept `assignee_user_ids` (lighter)?
- Owner agreement / contract / payment terms — surface them in the new Owner tab now, or wait for the Owners module v0.2?

## Ready to start checklist

Before "go":
- [ ] Plan saved to disk at `docs/handover/2026-05-24-overnight-autonomous-plan.md` ✓
- [ ] Plan committed to git so a fresh agent post-compaction can read it ✓ (next commit)
- [ ] Live versions noted (frontend `7e85416d`, backend `0306bbba`)
- [ ] Chrome MCP "Working Browser" connected and authenticated (verified earlier this session)
- [ ] SSH key `~/.ssh/do_friday_admin` works (deployed multiple times today)
- [ ] PRE-FLIGHT: re-read this plan immediately before starting Phase 1

Once Ishant says **"go"**: start Phase 1. Don't ask for confirmation between phases. Don't stop for clarification on items already pre-authorised above. Park anything not in the plan into the morning handover.
