-- 092_portal_booking_requests.sql
--
-- Portal v2 — slice 1 (resolver, booking_request mode). Sidecar for
-- the structured payload shown in `bookingRequestSummary`. Lives
-- alongside the inbox_threads row (which carries the conversation
-- messages) so ops can mutate the summary independently of message
-- writes.
--
-- One row per booking_request (1:1 with the inbox_thread for that
-- request). Slice 2 (FAD admin UI) will mutate `status`,
-- `payment_choice`, `payment_currency`, `paid_amount_minor`,
-- `confirmation_deadline`, and the kind-switch FK
-- `converted_to_reservation_id`.
--
-- Status state machine (locked contract v2 — 4 values, no "verifying"):
--
--     pending_review  ──(ops sets terms)──▶  awaiting_payment
--                                                  │
--                       (ops confirms funds + creates reservation, FK set)
--                                                  ▼
--                                              confirmed
--          ┌─(ops declines)─▶  declined
--          │                       (terminal)
--    (any of the above)
--
-- When `converted_to_reservation_id IS NOT NULL`, the resolver
-- transparently switches the response to reservation-mode using
-- that FK (kind-switch from §3b of the asks doc).

CREATE TABLE IF NOT EXISTS fad_portal_booking_requests (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                     UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
                                REFERENCES tenants(id) ON DELETE CASCADE,
  thread_id                     UUID NOT NULL REFERENCES inbox_threads(id) ON DELETE CASCADE,
  request_id                    TEXT NOT NULL,
  -- Summary fields surfaced in PortalBookingRequestSummary.
  listing_slug                  TEXT,
  listing_title                 TEXT,
  check_in                      DATE,
  check_out                     DATE,
  nights                        INTEGER,
  party_adults                  INTEGER,
  party_children                INTEGER,
  party_infants                 INTEGER,
  quoted_total_amount_minor     BIGINT,
  quoted_total_currency         TEXT CHECK (quoted_total_currency IS NULL OR
                                quoted_total_currency IN ('EUR', 'MUR', 'USD')),
  status                        TEXT NOT NULL DEFAULT 'pending_review'
                                CHECK (status IN
                                ('pending_review', 'awaiting_payment',
                                 'confirmed', 'declined')),
  payment_choice                TEXT CHECK (payment_choice IS NULL OR
                                payment_choice IN ('deposit_50', 'full')),
  payment_currency              TEXT CHECK (payment_currency IS NULL OR
                                payment_currency IN ('EUR', 'MUR', 'USD')),
  paid_amount_minor             BIGINT,
  confirmation_deadline         TIMESTAMPTZ,
  converted_to_reservation_id   UUID REFERENCES fad_reservations(id) ON DELETE SET NULL,
  declined_at                   TIMESTAMPTZ,
  declined_reason               TEXT,
  -- Audit trail for who flipped the status last; fed by the FAD
  -- admin UI in slice 2.
  last_status_actor_id          UUID,
  last_status_change_at         TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fad_portal_booking_requests_tenant_request_unique
    UNIQUE (tenant_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_fad_portal_booking_requests_thread
  ON fad_portal_booking_requests(thread_id);
CREATE INDEX IF NOT EXISTS idx_fad_portal_booking_requests_tenant_status
  ON fad_portal_booking_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_fad_portal_booking_requests_converted
  ON fad_portal_booking_requests(converted_to_reservation_id)
  WHERE converted_to_reservation_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_fad_portal_booking_requests_updated_at
  ON fad_portal_booking_requests;
CREATE TRIGGER trg_fad_portal_booking_requests_updated_at
  BEFORE UPDATE ON fad_portal_booking_requests
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_now();
