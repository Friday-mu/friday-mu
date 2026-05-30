-- 089_reservation_folio_payments.sql
--
-- T3.10 full ReservationDetail wiring (Folio + Payments tabs).
--
-- Two new overlay tables on top of fad_reservations:
--   • fad_reservation_folio_lines — custom guest-facing or internal
--     line items staff add on top of the Guesty-derived breakdown
--     (e.g. chef service, late check-out fee, courtesy discount).
--   • fad_reservation_payments — manually-recorded payments (bank
--     transfer, cash, manual card capture). Channel payouts continue
--     to flow from the Guesty money.payments[] array; we merge both
--     sources at read time. The `source` column distinguishes origin.
--
-- Both tables tenant-scoped, FK to fad_reservations(id) with CASCADE
-- delete. Amounts in minor units (cents/centimes) to match the mig
-- 085 money breakdown convention. Currency CHECK matches the rest of
-- the schema (MUR/EUR/USD only — what Friday actually transacts in).
--
-- Accounting tab stays client-derived from these two tables + the
-- guesty_reservations money breakdown (mig 085). No persistent GL
-- entries until Finance Phase 3.

CREATE TABLE IF NOT EXISTS fad_reservation_folio_lines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
                      REFERENCES tenants(id) ON DELETE CASCADE,
  reservation_id      UUID NOT NULL REFERENCES fad_reservations(id) ON DELETE CASCADE,
  kind                TEXT NOT NULL CHECK (kind IN
                      ('accommodation', 'cleaning_fee', 'tourist_tax', 'extra',
                       'discount', 'channel_fee', 'manual_adjustment')),
  label               TEXT NOT NULL,
  -- Positive = charge, negative = discount/refund.
  amount_minor        BIGINT NOT NULL,
  currency            TEXT NOT NULL CHECK (currency IN ('MUR', 'EUR', 'USD')),
  guest_facing        BOOLEAN NOT NULL DEFAULT TRUE,
  notes               TEXT,
  added_by_user_id    TEXT,
  added_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fad_folio_lines_reservation
  ON fad_reservation_folio_lines(tenant_id, reservation_id, added_at);

CREATE TABLE IF NOT EXISTS fad_reservation_payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
                      REFERENCES tenants(id) ON DELETE CASCADE,
  reservation_id      UUID NOT NULL REFERENCES fad_reservations(id) ON DELETE CASCADE,
  ts                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  amount_minor        BIGINT NOT NULL,
  currency            TEXT NOT NULL CHECK (currency IN ('MUR', 'EUR', 'USD')),
  method              TEXT NOT NULL CHECK (method IN
                      ('channel_payout', 'bank_transfer', 'card', 'cash', 'manual_adjustment')),
  status              TEXT NOT NULL DEFAULT 'received'
                      CHECK (status IN ('pending', 'received', 'refunded')),
  reference           TEXT,
  notes               TEXT,
  -- 'manual' = staff entered; 'guesty' = mirrored from money.payments[];
  -- 'channel' = direct payout from channel (e.g. Airbnb webhook). We
  -- mostly use 'manual' for now; the others reserve future paths.
  source              TEXT NOT NULL DEFAULT 'manual'
                      CHECK (source IN ('manual', 'guesty', 'channel')),
  external_id         TEXT,
  recorded_by_user_id TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Soft-uniqueness across (tenant, source, external_id) so we can
  -- replay a Guesty sync without dupes once we wire it.
  CONSTRAINT fad_reservation_payments_source_external_unique
    UNIQUE (tenant_id, source, external_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_fad_payments_reservation
  ON fad_reservation_payments(tenant_id, reservation_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_fad_payments_tenant_ts
  ON fad_reservation_payments(tenant_id, ts DESC);

DROP TRIGGER IF EXISTS trg_fad_folio_lines_updated_at ON fad_reservation_folio_lines;
CREATE TRIGGER trg_fad_folio_lines_updated_at
  BEFORE UPDATE ON fad_reservation_folio_lines
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_now();
