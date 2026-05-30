-- 078_reservations_fad_native.sql
--
-- FAD-native Reservations overlay per v0.2 LOCKED scoping pack
-- (Notion 34f43ca884928188a83ad290b1a13b1b). Adds the FAD-owned fields
-- on top of the existing `guesty_reservations` cache (mig 049).
--
-- Naming: tables are `fad_*` prefixed — see 077 for the naming rationale
-- (legacy `reservations` table exists from pre-rebuild work; this
-- overlay lives in the new namespace).

CREATE TABLE IF NOT EXISTS fad_reservations (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                     UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
                                REFERENCES tenants(id) ON DELETE CASCADE,
  guesty_id                     TEXT,
  confirmation_code             TEXT,
  property_id                   UUID REFERENCES fad_properties(id) ON DELETE SET NULL,
  status                        TEXT CHECK (status IS NULL OR status IN
                                ('confirmed', 'checked_in', 'checked_out', 'cancelled', 'hold', 'draft')),
  channel                       TEXT CHECK (channel IS NULL OR channel IN
                                ('airbnb', 'booking', 'direct', 'vrbo', 'email', 'owner')),
  cleaning_arrangement          TEXT CHECK (cleaning_arrangement IS NULL OR cleaning_arrangement IN
                                ('friday_cleans', 'owner_cleans')),
  special_requests_categories   JSONB NOT NULL DEFAULT '[]'::jsonb,
  special_requests_notes        TEXT,
  internal_notes                TEXT,
  access_info_sent_at           TIMESTAMPTZ,
  driver_assignee_user_id       TEXT,
  review_requested_at           TIMESTAMPTZ,
  actual_arrival                TIMESTAMPTZ,
  actual_departure              TIMESTAMPTZ,
  refund_amount_minor           BIGINT,
  refund_currency               TEXT,
  refund_reason                 TEXT,
  refund_decided_at             TIMESTAMPTZ,
  refund_decided_by_user_id     TEXT,
  extension_of_reservation_id   UUID REFERENCES fad_reservations(id) ON DELETE SET NULL,
  cancelled_at                  TIMESTAMPTZ,
  cancelled_by_user_id          TEXT,
  cancel_reason                 TEXT,
  source_kind                   TEXT NOT NULL DEFAULT 'guesty_pull'
                                CHECK (source_kind IN
                                ('guesty_pull', 'manual', 'bdc_extension', 'inquiry_conversion')),
  created_by_user_id            TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fad_reservations_tenant_guesty_unique UNIQUE (tenant_id, guesty_id)
);

CREATE INDEX IF NOT EXISTS idx_fad_reservations_tenant
  ON fad_reservations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fad_reservations_tenant_status
  ON fad_reservations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_fad_reservations_property
  ON fad_reservations(tenant_id, property_id)
  WHERE property_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fad_reservations_guesty
  ON fad_reservations(tenant_id, guesty_id)
  WHERE guesty_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fad_reservations_confirmation
  ON fad_reservations(tenant_id, confirmation_code)
  WHERE confirmation_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fad_reservations_extension
  ON fad_reservations(extension_of_reservation_id)
  WHERE extension_of_reservation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS fad_inquiries (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                       UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
                                  REFERENCES tenants(id) ON DELETE CASCADE,
  guest_name                      TEXT NOT NULL,
  guest_email                     TEXT,
  guest_phone                     TEXT,
  source                          TEXT NOT NULL DEFAULT 'website'
                                  CHECK (source IN ('email', 'whatsapp', 'website', 'phone', 'referral')),
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
  quote_link                      TEXT,
  quote_amount_minor              BIGINT,
  currency                        TEXT NOT NULL DEFAULT 'EUR',
  converted_to_reservation_id     UUID REFERENCES fad_reservations(id) ON DELETE SET NULL,
  abandon_reason                  TEXT,
  notes                           TEXT,
  created_by_user_id              TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fad_inquiries_tenant_status
  ON fad_inquiries(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_fad_inquiries_tenant_created
  ON fad_inquiries(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fad_inquiries_converted
  ON fad_inquiries(converted_to_reservation_id)
  WHERE converted_to_reservation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS fad_reservation_activity_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
                      REFERENCES tenants(id) ON DELETE CASCADE,
  reservation_id      UUID NOT NULL REFERENCES fad_reservations(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_fad_reservation_activity_reservation_ts
  ON fad_reservation_activity_log(tenant_id, reservation_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_fad_reservation_activity_tenant_ts
  ON fad_reservation_activity_log(tenant_id, ts DESC);

DROP TRIGGER IF EXISTS trg_fad_reservations_updated_at ON fad_reservations;
CREATE TRIGGER trg_fad_reservations_updated_at
  BEFORE UPDATE ON fad_reservations
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_now();

DROP TRIGGER IF EXISTS trg_fad_inquiries_updated_at ON fad_inquiries;
CREATE TRIGGER trg_fad_inquiries_updated_at
  BEFORE UPDATE ON fad_inquiries
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_now();
