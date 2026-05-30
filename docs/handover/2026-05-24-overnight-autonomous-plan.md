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

---

# Appendices — deeper detail

## Appendix A — Guests + Owners schema (full SQL)

### `backend/migrations/079_guests_fad_native.sql`

```sql
-- Guests module — FAD-native overlay over Guesty's reservation-embedded
-- guest data. Lets us track preferences, language, VIP tier, and notes
-- across stays. Backfilled from guesty_reservations on first run.

CREATE TABLE IF NOT EXISTS fad_guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
    REFERENCES tenants(id) ON DELETE CASCADE,
  primary_email TEXT,
  primary_phone TEXT,
  display_name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  language_pref TEXT CHECK (language_pref IN ('en', 'fr', 'es', 'de', NULL)),
  country TEXT,
  vip_tier TEXT NOT NULL DEFAULT 'none'
    CHECK (vip_tier IN ('none', 'silver', 'gold', 'vip')),
  notes TEXT,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  total_stays_count INT NOT NULL DEFAULT 0,
  total_revenue_minor BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Best-effort dedup key. We prefer email, fall back to phone, then to
-- a stable surrogate so the unique constraint never blocks an insert.
CREATE UNIQUE INDEX IF NOT EXISTS fad_guests_tenant_identity_uq
  ON fad_guests (
    tenant_id,
    COALESCE(
      NULLIF(LOWER(TRIM(primary_email)), ''),
      'phone:' || COALESCE(NULLIF(TRIM(primary_phone), ''), 'NO-PHONE:' || id::text)
    )
  );

CREATE INDEX IF NOT EXISTS fad_guests_tenant_email_idx
  ON fad_guests (tenant_id, LOWER(primary_email));
CREATE INDEX IF NOT EXISTS fad_guests_tenant_last_seen_idx
  ON fad_guests (tenant_id, last_seen_at DESC NULLS LAST);

CREATE TRIGGER fad_guests_set_updated_at
  BEFORE UPDATE ON fad_guests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

-- Backfill (idempotent): one row per distinct (email | phone) seen in
-- guesty_reservations. Uses the most-recent reservation as the source
-- of truth for name + language.
INSERT INTO fad_guests (
  tenant_id, primary_email, primary_phone, display_name,
  first_name, last_name, first_seen_at, last_seen_at,
  total_stays_count, total_revenue_minor
)
SELECT
  r.tenant_id,
  NULLIF(LOWER(TRIM(r.guest_email)), '') AS email,
  NULLIF(TRIM(r.guest_phone), '') AS phone,
  COALESCE(
    NULLIF(TRIM(CONCAT_WS(' ', r.guest_first_name, r.guest_last_name)), ''),
    r.guest_email,
    'Unnamed guest'
  ) AS display_name,
  r.guest_first_name,
  r.guest_last_name,
  MIN(r.check_in_date) AS first_seen,
  MAX(r.check_in_date) AS last_seen,
  COUNT(*) AS stays,
  COALESCE(SUM(r.total_amount_minor), 0)
FROM guesty_reservations r
WHERE (r.guest_email IS NOT NULL OR r.guest_phone IS NOT NULL
       OR r.guest_first_name IS NOT NULL OR r.guest_last_name IS NOT NULL)
GROUP BY r.tenant_id, email, phone,
         r.guest_first_name, r.guest_last_name, r.guest_email
ON CONFLICT (tenant_id, COALESCE(
  NULLIF(LOWER(TRIM(primary_email)), ''),
  'phone:' || COALESCE(NULLIF(TRIM(primary_phone), ''), 'NO-PHONE:' || id::text)
)) DO NOTHING;
```

### `backend/migrations/080_owners_fad_native.sql`

```sql
-- Owners module — FAD-native property-owner records. Links to existing
-- fad_property_owners (mig 077) which already provides the M:N edge
-- with ownership_pct.

CREATE TABLE IF NOT EXISTS fad_owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
    REFERENCES tenants(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  legal_entity_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  address TEXT,
  country TEXT DEFAULT 'MU',
  payment_pref TEXT CHECK (payment_pref IN ('bank_transfer', 'mcb_juice', 'cheque', 'cash', NULL)),
  bank_details_encrypted BYTEA, -- pgcrypto sym_encrypt() — never returned raw
  language TEXT DEFAULT 'en' CHECK (language IN ('en', 'fr', 'es', NULL)),
  statement_day INT CHECK (statement_day BETWEEN 1 AND 28), -- monthly statement send day
  commission_pct_default NUMERIC(5,2), -- e.g. 20.00
  notes TEXT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fad_owners_tenant_active_idx
  ON fad_owners (tenant_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS fad_owners_tenant_email_idx
  ON fad_owners (tenant_id, LOWER(contact_email));

CREATE TRIGGER fad_owners_set_updated_at
  BEFORE UPDATE ON fad_owners
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

-- Extend fad_property_owners to FK fad_owners. Existing rows have
-- owner_id as a free-text string; widen to a UUID owner_record_id
-- without dropping the legacy column (back-compat during migration).
ALTER TABLE fad_property_owners
  ADD COLUMN IF NOT EXISTS owner_record_id UUID REFERENCES fad_owners(id);
CREATE INDEX IF NOT EXISTS fad_property_owners_owner_record_idx
  ON fad_property_owners (owner_record_id);
```

### `backend/migrations/081_quotes_fad_native.sql`

```sql
CREATE TABLE IF NOT EXISTS fad_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
    REFERENCES tenants(id) ON DELETE CASCADE,
  created_by_user_id UUID,
  property_codes TEXT[] NOT NULL,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  guests_adults INT NOT NULL DEFAULT 1,
  guests_children INT NOT NULL DEFAULT 0,
  share_url TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('draft', 'sent', 'opened', 'converted', 'expired')),
  opened_at TIMESTAMPTZ,
  converted_reservation_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fad_quotes_tenant_recent_idx
  ON fad_quotes (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fad_quotes_status_idx
  ON fad_quotes (tenant_id, status) WHERE status IN ('sent', 'opened');

CREATE TRIGGER fad_quotes_set_updated_at
  BEFORE UPDATE ON fad_quotes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();
```

## Appendix B — Multi-calendar architecture

### Component tree

```
CalendarModuleV2 (new)
├── CalendarToolbar
│   ├── PropertyFilters (Cities, Tags, Status, Add filter)
│   ├── DateRangePicker (week / month / 60-day)
│   ├── ViewSwitcher (Multi | Month | Week | Day | Agenda)
│   └── Actions (Today, Find availability)
├── CalendarGrid
│   ├── PropertyColumnSticky (left, sticky)
│   │   └── PropertyRowHeader[] (thumbnail, code, lifecycle icon)
│   ├── DateHeaderRowSticky (top, sticky)
│   │   └── DayCellHeader[] (Mon 24, with month-change separator)
│   └── GridBody
│       ├── DayBackgrounds[][] (cells with optional €PRICE)
│       ├── ReservationBars[] (positioned via grid-column span)
│       ├── TaskChips[] (positioned via cell + offset)
│       └── TodayLine (vertical, position absolute, z-index high)
└── Drawers
    ├── ReservationDetail (existing, opened on bar click)
    ├── TaskDetail (new Breezeway-style, opened on chip click)
    ├── PropertyDetail (existing, opened on row-header click)
    ├── CreateReservationDrawer (opened on empty-cell click; date prefilled)
    └── AvailabilitySearchModal (opened from toolbar)
```

### Data flow

Single `useCalendarData({from, to, propertyFilter})` hook:

```ts
{
  properties: PropertyForCalendar[],   // /api/properties + thumbnail
  reservationsByProperty: Map<code, Reservation[]>,  // /api/reservations
  tasksByProperty: Map<code, Task[]>,                // /api/tasks?group_by=property_code
  pricesByCell: Map<`${code}|${date}`, {price_minor, available}>, // /api/properties/calendar
}
```

Backed by 3 parallel fetches, SWR-cached, refetches on filter change.

### Performance plan

- Virtualise date columns: render visible window + 7-day buffer each side.
- Property rows: render all 60 (acceptable — they're light DOM).
- IntersectionObserver on the grid body to detect scroll → prefetch next 30-day window.
- CSS Grid `contain: strict` on the grid body + each cell to limit reflow.
- Reservation bars positioned via CSS grid spans (no absolute positioning calcs in JS).
- Today line: single absolute element with transform set once per scroll frame.
- Target: scroll latency < 16ms with 60 props × 60 days × ~80 reservations.

### Backend extensions

- Extend `GET /api/properties?include=calendar&from=&to=&calendar_window=60d` to optionally hydrate `calendar` field with per-day price + availability. Current LATERAL JOIN already pulls 30-day window; widen to a date-range param.
- New `GET /api/tasks?dueAfter=&dueBefore=&group_by=property_code` returning `{by_property: {<code>: Task[]}}`. Aggregation done server-side to halve the payload.

## Appendix C — Task detail UI section-by-section

```
┌────────────────────────────────────────────────────────────┐
│ 👁 [Medium] [In Progress]              [⤴ open] [⋮] [×]    │   ← compact header
├────────────────────────────────────────────────────────────┤
│ 🔧 Fix toilet leak                                          │   ← title (16px, bold)
│ 📅 May 24, 2026                            🕒 Add time     │   ← due + add-time chip
├────────────────────────────────────────────────────────────┤
│ BW-C4                                                       │   ← property code (mono, 13px)
│ Coastal Road                                                │   ← address (12px, secondary)
│ + Add element                                              │   ← optional links (reservation, etc.)
├────────────────────────────────────────────────────────────┤
│ Add a description…  ← clickable, editable inline           │
├────────────────────────────────────────────────────────────┤
│ ⏱ TIME                                  0h 24m 15s  [⏵/⏸] │   ← timer red when running
├────────────────────────────────────────────────────────────┤
│ 👤 ASSIGNEES                            + Add assignee     │
│   ◉ Bryan Henri                              Remove        │   ← row per assignee, hover Remove
├────────────────────────────────────────────────────────────┤
│ ⭐ GUEST RATING                          Not Rated         │
├────────────────────────────────────────────────────────────┤
│ 📎 ATTACHMENTS                          + Add attachment   │
│   [thumb][thumb][thumb][thumb][thumb]                       │   ← thumbnail grid, click → lightbox
├────────────────────────────────────────────────────────────┤
│ 🏷 TASK TAGS                                + Add tag       │
│   [breezeway-import] [historical-import] (chips)            │
├────────────────────────────────────────────────────────────┤
│ 🔗 LINKED RESERVATIONS                  + Link reservation │
│   (rsv card if linked, else empty)                          │
├────────────────────────────────────────────────────────────┤
│ 💬 Write a comment. Type '@' to mention someone.            │   ← input always visible
│                                                             │
│ ◉ Mary Oladimeji  commented                       9h ago   │   ← comment thread, newest top
│   Reopened this task @Bryan @Franny. Guest said …          │
│ ◉ Bryan Henri commented                          16h ago   │
│   Sealed the hole. Added silicone …                         │
└────────────────────────────────────────────────────────────┘

         ┌──────────────────────┐
         │  ⏸ Stop · 0h 24m 15s │  ← floating timer button (sticky bottom right)
         └──────────────────────┘
```

CSS class prefix: `.task-d2-*` so we don't collide with the existing `.task-detail-*`. Old component stays in place as fallback until v2 is verified.

Section rendering order is fixed; each section is independently collapsible later (v0.2). Edit affordances are inline-trigger (click the value, edit, blur to save) — no modal for simple fields.

## Appendix D — API endpoint contracts

### `GET /api/guests`
```
?search=<str>&vip_tier=<tier>&limit=200&offset=0
→ { results: GuestRecord[], total: number, limit, offset, hasMore }
```

### `GET /api/guests/:id/reservations`
```
→ { reservations: Reservation[] }
  — Joined via guesty_reservations.guest_email = fad_guests.primary_email
    OR (matching first_name + last_name + LOWER trim)
```

### `GET /api/owners`
```
?archived=<true|false>&limit=200
→ { results: OwnerRecord[], total }
  — Joins fad_property_owners to compute property_count per owner
```

### `GET /api/finance/property/:code/summary?window=90d`
```
→ {
  revenue_minor, channel_fees_minor, expenses_minor,
  net_to_owner_minor, friday_margin_minor,
  reservation_count, occupancy_pct, adr_minor, revpar_minor,
  currency, window_from, window_to
}
```

### `GET /api/availability/search?from=&to=&guests=`
```
→ {
  matches: [
    { property_code, nickname, picture_url, region,
      available_nights, total_nights, nightly_avg_minor,
      total_minor, currency }
  ],
  unavailable: [{ property_code, nickname, reason }]
}
```

### `POST /api/quotes`
```
body: { property_codes: string[], from, to, guests_adults, guests_children?, expires_in_days? }
→ { quote_id, share_url, expires_at }
```

### `PATCH /api/tasks/:id/assignees`
```
body: { user_ids: string[] }
→ { task: Task }
```

## Appendix E — Files I'll create / modify

### New files
- `backend/migrations/079_guests_fad_native.sql`
- `backend/migrations/080_owners_fad_native.sql`
- `backend/migrations/081_quotes_fad_native.sql`
- `backend/src/guests/index.js`
- `backend/src/owners/index.js`
- `backend/src/quotes/index.js`
- `backend/src/availability/search.js`
- `frontend/src/app/fad/_data/guestsClient.ts`
- `frontend/src/app/fad/_data/ownersClient.ts`
- `frontend/src/app/fad/_data/quotesClient.ts`
- `frontend/src/app/fad/_data/availabilityClient.ts`
- `frontend/src/app/fad/_components/modules/CalendarModuleV2.tsx`
- `frontend/src/app/fad/_components/modules/calendar/MultiCalendarGrid.tsx`
- `frontend/src/app/fad/_components/modules/calendar/AvailabilitySearchModal.tsx`
- `frontend/src/app/fad/_components/modules/calendar/QuoteSendModal.tsx`
- `frontend/src/app/fad/_components/modules/operations/TaskDetailV2.tsx`

### Modified files
- `backend/server.js` — register guests / owners / quotes / availability routers
- `backend/src/reservations/sync.js` — extend with fad_guests upsert
- `backend/src/properties/sync.js` — extend with fad_owners seed from accountManager
- `frontend/src/app/fad/_data/propertiesClient.ts` — replace 'o-guesty-unknown' with real owner lookup
- `frontend/src/app/fad/_components/modules/properties/PropertyDetail.tsx` — Owner tab + Financial tab + Insights tab use real backend
- `frontend/src/app/fad/_components/modules/reservations/ReservationDetail.tsx` — Guests tab uses real fad_guests
- `frontend/src/app/fad/_components/modules/CalendarModule.tsx` → swap to V2 default, keep old as fallback tab
- `frontend/src/app/fad/_components/modules/OperationsModule.tsx` → swap TaskDetail to V2
- `docs/FAD_BACKLOG.md` — strike completed items, bump live version each deploy

## Appendix F — Risks I'm watching

| Risk | Mitigation |
|---|---|
| guests/owners backfill takes too long on prod | Run via `SELECT ... INTO ... LIMIT 1000` in batches if needed |
| Multi-calendar laggy with 60×60 cells | Ship with date-window=30-day default; widen on user demand |
| TaskDetail v2 breaks existing keyboard shortcuts | Keep v1 mounted in shadow for one deploy; A/B route via a feature flag URL param |
| Owners table empties existing owner display | Wire fallback — when no fad_owners row found, render the old "o-guesty-unknown" placeholder instead of crashing |
| Multi-tenant SQL site introduced without filter | After every backend route addition: `grep -E 'FROM fad_(guests|owners|quotes)' backend/src/` and visually verify each has a `tenant_id = $X` clause |
| Friday Website preview URL shape unknown | Ship URL generator with a fallback `https://preview-friday-website.vercel.app/search?codes=X,Y` — Ishant validates tomorrow, easy to adjust |

## Appendix G — Verification snippets (paste these in Chrome MCP JS console after each deploy)

### After Phase 1 (Guests):
```js
fetch('/api/guests?limit=5', {headers:{Authorization:'Bearer '+localStorage.gms_token}})
  .then(r=>r.json()).then(d=>({count: d.results?.length, sample: d.results?.[0]}))
```

### After Phase 2 (Owners):
```js
fetch('/api/owners', {headers:{Authorization:'Bearer '+localStorage.gms_token}})
  .then(r=>r.json()).then(d=>({count: d.results?.length, with_props: d.results?.filter(o=>o.property_count>0).length}))
```

### After Phase 5 (Multi-calendar):
```js
// Visual verification only — navigate to /fad?m=calendar and screenshot.
// Check: 60 properties × 60 day columns, no horizontal page scroll
// (grid should scroll internally), today line visible, prices in
// available cells.
```

### After Phase 6 (Availability):
```js
fetch('/api/availability/search?from=2026-07-01&to=2026-07-08&guests=4',
  {headers:{Authorization:'Bearer '+localStorage.gms_token}})
  .then(r=>r.json()).then(d=>({matches: d.matches?.length, sample: d.matches?.[0]}))
```

## Appendix H — Post-compaction prompt (paste verbatim after `/compact`)

```text
Resume the FAD overnight autonomous run.

Read these two documents IN ORDER before anything else:
1. /Users/judith/repos/friday-admin-dashboard/docs/handover/2026-05-24-overnight-autonomous-plan.md
   — Full 10-phase plan + 8 appendices (schemas, multi-calendar architecture,
     task UI mockup, API contracts, file list, risks, verification snippets,
     and this post-compaction prompt).
2. /Users/judith/.openclaw/workspace/tmp/claude-code-compaction-handover-20260524-evening.md
   — Session state, hard constraints, recovery actions, where data lives.

Then verify live state (4 commands in parallel):
- cd /Users/judith/repos/friday-admin-dashboard && git status
- cd /Users/judith/repos/friday-admin-dashboard && git log --oneline -15
- curl -fsS https://admin.friday.mu/version.json
- curl -fsS https://admin.friday.mu/api/version

Then check Chrome MCP "Working Browser" is still connected:
- list_connected_browsers → pick deviceId c49e054a-1059-4f2c-87bf-41fc0e71b03c
  (re-pair via switch_browser if not present)

Then find the first unfinished phase per git history vs the plan's expected
phase commits (Appendix E lists every file each phase touches — grep recent
commits against that list).

Pre-authorised by Ishant (do NOT ask):
- Multi-calendar v0.1 = full FE rebuild as primary view; old Month/Week stay
  as alternate tabs.
- Quote v1 = link to Friday Website Vercel preview.
- Insights without backend = "Phase 2 pending" placeholder, never fake numbers.
- All new tables fad_* prefixed, multi-tenant from day one.

Hard rules (immutable):
- Git author = Judith Friday <judith@friday.mu> (hook-enforced).
- Type-check + build pass before every deploy. Roll back on regression.
- Verify on prod via Chrome MCP after every deploy.
- Mobile QA (375×812) after every UI commit.
- Multi-tenant safety: grep tenant_id filter after every new backend route.
- No --no-verify, no force-push, no skipping hooks.
- Don't touch website_inbox or Friday Website code.
- Skip VPS backups (disk 87%).

Stopping conditions:
- 3 consecutive deploy failures → halt + jump to Phase 10 morning handover.
- Migration fails non-trivially → halt.
- Context > 80% → wrap up cleanly with morning handover.
- Production regression I can't diagnose in 30 min → halt.

Resume at the first unfinished phase. Don't re-do earlier phases.
Don't ask for confirmation between phases. Park anything not in the plan
into the morning handover at docs/handover/2026-05-25-morning-handover.md.

Go.
```
