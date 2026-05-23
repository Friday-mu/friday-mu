-- 078_reservations_fad_native.sql
--
-- FAD-native Reservations overlay per v0.2 LOCKED scoping pack
-- (Notion 34f43ca884928188a83ad290b1a13b1b). Adds the FAD-owned fields
-- on top of the existing `guesty_reservations` cache (mig 049).
--
-- Design:
--   * `reservations` is the FAD source of truth for module-owned fields
--     (cleaning_arrangement, special_requests, internal_notes, refund
--     state, driver assignment, planned-vs-actual arrivals).
--   * Joins to `guesty_reservations` loosely via (tenant_id, guesty_id)
--     so manual creates (Path 2 in scoping §8) can exist before Guesty
--     confirms. The route does a LEFT JOIN; absent overlay rows fall
--     back to safe defaults so existing reservations keep rendering.
--   * `inquiries` is the first-class workflow before a quote converts
--     (scoping §9). Promoted to a separate table so persistence rules
--     hold even if reservation never converts (feeds Marketing funnel).
--   * `reservation_activity_log` is the FAD-native audit trail surfaced
--     on the Reservation detail Activity Log sub-tab (§3).
--   * `cleaning_arrangement` is the field that drives Operations task-
--     template selection for owner stays (§5). Operations module owns
--     the template definitions; Reservations owns the field.
--   * `special_requests` is hybrid: enum categories array + freeform
--     notes (§12). Enables cross-property inventory questions like
--     "do we have a crib for this property?"

-- ─────────────────────────────────────────────────────────────────
-- 1. Reservations overlay (FAD-native fields layered on guesty_reservations)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reservations (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                     UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
                                REFERENCES tenants(id) ON DELETE CASCADE,
  -- NULL allowed for manual-create drafts that haven't been pushed to
  -- Guesty yet (Phase 2 write-through). Once confirmed, the worker
  -- updates this with the Guesty `_id`.
  guesty_id                     TEXT,
  -- FAD-side confirmation code. For Guesty-sourced rows, mirrors the
  -- Guesty confirmation code; for manual rows, a generated FR-DIR-NNNN.
  confirmation_code             TEXT,
  -- Cross-link to FAD-native properties row (NULL if the property hasn't
  -- been onboarded as a FAD-native record yet — falls back to the
  -- guesty_reservations.listing_guesty_id text key).
  property_id                   UUID REFERENCES properties(id) ON DELETE SET NULL,
  -- Status mirrors the frontend Reservation.status enum. Surfaces in
  -- the list view + detail status chip.
  status                        TEXT CHECK (status IS NULL OR status IN
                                ('confirmed', 'checked_in', 'checked_out', 'cancelled', 'hold', 'draft')),
  -- Channel taxonomy (scoping §4)
  channel                       TEXT CHECK (channel IS NULL OR channel IN
                                ('airbnb', 'booking', 'direct', 'vrbo', 'email', 'owner')),
  -- Owner-stay-only field (scoping §5)
  cleaning_arrangement          TEXT CHECK (cleaning_arrangement IS NULL OR cleaning_arrangement IN
                                ('friday_cleans', 'owner_cleans')),
  -- Special requests hybrid (scoping §12)
  -- Categories: crib / high_chair / late_checkout / dietary / mobility / transport / other
  special_requests_categories   JSONB NOT NULL DEFAULT '[]'::jsonb,
  special_requests_notes        TEXT,
  -- Internal-notes thread (Phase 1: surfaced via linked Inbox-Team thread
  -- per scoping §10; this column holds Phase-2 in-reservation notes when
  -- that lands).
  internal_notes                TEXT,
  -- Operational urgent-strip flags (scoping §3 Overview)
  access_info_sent_at           TIMESTAMPTZ,
  driver_assignee_user_id       TEXT,
  review_requested_at           TIMESTAMPTZ,
  -- Planned-vs-actual arrival/departure
  actual_arrival                TIMESTAMPTZ,
  actual_departure              TIMESTAMPTZ,
  -- Refund tracking (Phase 1: records the Mathias-decided amount per
  -- scoping §10 actions; settlement happens in Finance)
  refund_amount_minor           BIGINT,
  refund_currency               TEXT,
  refund_reason                 TEXT,
  refund_decided_at             TIMESTAMPTZ,
  refund_decided_by_user_id     TEXT,
  -- BDC extension chain (scoping §8 path 3)
  extension_of_reservation_id   UUID REFERENCES reservations(id) ON DELETE SET NULL,
  -- Cancellation tracking
  cancelled_at                  TIMESTAMPTZ,
  cancelled_by_user_id          TEXT,
  cancel_reason                 TEXT,
  -- Provenance for manual creates
  source_kind                   TEXT NOT NULL DEFAULT 'guesty_pull'
                                CHECK (source_kind IN
                                ('guesty_pull', 'manual', 'bdc_extension', 'inquiry_conversion')),
  created_by_user_id            TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reservations_tenant_guesty_unique UNIQUE (tenant_id, guesty_id)
);

CREATE INDEX IF NOT EXISTS idx_reservations_tenant
  ON reservations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_tenant_status
  ON reservations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_reservations_property
  ON reservations(tenant_id, property_id)
  WHERE property_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reservations_guesty
  ON reservations(tenant_id, guesty_id)
  WHERE guesty_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reservations_confirmation
  ON reservations(tenant_id, confirmation_code)
  WHERE confirmation_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reservations_extension
  ON reservations(extension_of_reservation_id)
  WHERE extension_of_reservation_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────
-- 2. Inquiries (first-class pre-conversion workflow — scoping §9)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inquiries (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                       UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
                                  REFERENCES tenants(id) ON DELETE CASCADE,
  guest_name                      TEXT NOT NULL,
  guest_email                     TEXT,
  guest_phone                     TEXT,
  -- Inbound channel for the inquiry (distinct from reservation.channel)
  source                          TEXT NOT NULL DEFAULT 'website'
                                  CHECK (source IN ('email', 'whatsapp', 'website', 'phone', 'referral')),
  -- Multi-property quote candidates, ordered by Mathias's preference
  property_codes                  JSONB NOT NULL DEFAULT '[]'::jsonb,
  check_in                        TIMESTAMPTZ,
  check_out                       TIMESTAMPTZ,
  party_adults                    INTEGER NOT NULL DEFAULT 0,
  party_children                  INTEGER NOT NULL DEFAULT 0,
  party_infants                   INTEGER NOT NULL DEFAULT 0,
  status                          TEXT NOT NULL DEFAULT 'pending_quote'
                                  CHECK (status IN
                                  ('pending_quote', 'quote_sent', 'guest_reviewing',
                                   'converted', 'abandoned')),
  -- friday.mu link generated from Guesty quote builder (Phase 2 wires
  -- real generation)
  quote_link                      TEXT,
  quote_amount_minor              BIGINT,
  currency                        TEXT NOT NULL DEFAULT 'EUR',
  -- When converted, link to the created reservation
  converted_to_reservation_id     UUID REFERENCES reservations(id) ON DELETE SET NULL,
  abandon_reason                  TEXT,
  notes                           TEXT,
  created_by_user_id              TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inquiries_tenant_status
  ON inquiries(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_inquiries_tenant_created
  ON inquiries(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_converted
  ON inquiries(converted_to_reservation_id)
  WHERE converted_to_reservation_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────
-- 3. Reservation activity log (FAD-native audit trail)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reservation_activity_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
                      REFERENCES tenants(id) ON DELETE CASCADE,
  reservation_id      UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  kind                TEXT NOT NULL CHECK (kind IN
                      ('created', 'status_changed', 'planned_arrival_updated',
                       'planned_departure_updated', 'money_updated', 'note_added',
                       'access_info_sent', 'driver_assigned', 'review_requested',
                       'cancelled', 'special_request_added')),
  actor_id            TEXT,
  detail              TEXT NOT NULL,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  ts                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservation_activity_reservation_ts
  ON reservation_activity_log(tenant_id, reservation_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_reservation_activity_tenant_ts
  ON reservation_activity_log(tenant_id, ts DESC);

-- ─────────────────────────────────────────────────────────────────
-- updated_at triggers (reuse the helper defined in 077)
-- ─────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_reservations_updated_at ON reservations;
CREATE TRIGGER trg_reservations_updated_at
  BEFORE UPDATE ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_now();

DROP TRIGGER IF EXISTS trg_inquiries_updated_at ON inquiries;
CREATE TRIGGER trg_inquiries_updated_at
  BEFORE UPDATE ON inquiries
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_now();
