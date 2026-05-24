-- 085_reservation_money_breakdown.sql
--
-- Industry-correct revenue analytics need room revenue separated from
-- cleaning fees and taxes (VRMA + STR standard). Until now we only had
-- total_amount_minor — useful for accounting but not for ADR/RevPAR
-- since cleaning is a pass-through and taxes aren't revenue at all.
--
-- Per Guesty money object spec:
--   subTotalPrice    — total before taxes (rent + cleaning + fees)
--   totalPrice       — gross including taxes (what we had)
--   totalTaxes       — aggregate taxes collected
--   fareCleaning     — cleaning fee component
--   hostPayout       — what the host actually receives after channel commission
--   hostServiceFee   — channel commission (Airbnb/BDC cut)
--
-- ROOM REVENUE = subTotalPrice - fareCleaning  (rent + ancillary fees,
--   excluding the cleaning pass-through). Cleaner alternative: sum
--   invoiceItems[] where normalType='AF' (ACCOMMODATION_FARE). For v0.1
--   we take the subTotal minus cleaning approach — invoiceItems parsing
--   is a v0.2 refinement.
--
-- All new columns nullable — backfill happens lazily as the API
-- poller runs and `fields=` query asks for them.

ALTER TABLE guesty_reservations
  ADD COLUMN IF NOT EXISTS room_revenue_minor      BIGINT,
  ADD COLUMN IF NOT EXISTS cleaning_fee_minor      BIGINT,
  ADD COLUMN IF NOT EXISTS taxes_minor             BIGINT,
  ADD COLUMN IF NOT EXISTS host_payout_minor       BIGINT,
  ADD COLUMN IF NOT EXISTS host_service_fee_minor  BIGINT,
  ADD COLUMN IF NOT EXISTS sub_total_minor         BIGINT;

CREATE INDEX IF NOT EXISTS idx_guesty_reservations_tenant_room_revenue
  ON guesty_reservations (tenant_id)
  WHERE room_revenue_minor IS NOT NULL;
