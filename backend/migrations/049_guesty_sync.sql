-- 049_guesty_sync.sql
--
-- Local cache tables for the Guesty Reservations + Listings sync that
-- powers the Reservations + Properties modules. Tenant-scoped from day
-- one so we don't need a backwards-compatible migration when a non-FR
-- tenant connects their own Guesty account (per-tenant credentials
-- storage = follow-up; v1 uses the env-var FR credentials).
--
-- Design notes:
--   * `raw` JSONB keeps the full Guesty payload so we can add columns
--     later without re-syncing. Read-path code shapes the row +
--     `raw` together — common stuff via columns (fast index access),
--     long tail via JSONB.
--   * `guesty_id` is Guesty's `_id` — stable across sync windows.
--     Unique per tenant so the same guesty account on a different
--     tenant (theoretical) wouldn't collide.
--   * `listing_guesty_id` on reservations isn't an FK because the
--     sync order is "listings first, then reservations" and we don't
--     want a partial run to fail. The read-path JOIN is loose
--     (`USING (tenant_id, guesty_id)`).
--   * `nights` is a generated column so the all-reservations table
--     view can sort + filter on duration without computing in app.

CREATE TABLE IF NOT EXISTS guesty_listings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  guesty_id         TEXT NOT NULL,
  nickname          TEXT,
  title             TEXT,
  address_full      TEXT,
  address_city      TEXT,
  address_country   TEXT,
  cohort            TEXT,
  picture_url       TEXT,
  property_type     TEXT,
  bedrooms          INTEGER,
  bathrooms         NUMERIC(3,1),
  accommodates      INTEGER,
  base_price_minor  BIGINT,
  currency_code     TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  raw               JSONB NOT NULL,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT guesty_listings_tenant_guesty_id_unique UNIQUE (tenant_id, guesty_id)
);
CREATE INDEX IF NOT EXISTS idx_guesty_listings_tenant
  ON guesty_listings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_guesty_listings_active
  ON guesty_listings(tenant_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_guesty_listings_cohort
  ON guesty_listings(tenant_id, cohort);

CREATE TABLE IF NOT EXISTS guesty_reservations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  guesty_id            TEXT NOT NULL,
  listing_guesty_id    TEXT NOT NULL,
  confirmation_code    TEXT,
  status               TEXT,
  source               TEXT,
  channel              TEXT,
  check_in_date        DATE,
  check_out_date       DATE,
  -- Generated only when both dates are present — Postgres allows STORED
  -- generated columns over nullable inputs as long as the expression
  -- itself is safe; subtraction of nulls returns null, which is fine.
  nights               INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN check_in_date IS NOT NULL AND check_out_date IS NOT NULL
      THEN (check_out_date - check_in_date)::INTEGER
      ELSE NULL
    END
  ) STORED,
  guests_count         INTEGER,
  adults               INTEGER,
  children             INTEGER,
  infants              INTEGER,
  guest_first_name     TEXT,
  guest_last_name      TEXT,
  guest_email          TEXT,
  guest_phone          TEXT,
  total_amount_minor   BIGINT,
  currency_code        TEXT,
  raw                  JSONB NOT NULL,
  synced_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT guesty_reservations_tenant_guesty_id_unique UNIQUE (tenant_id, guesty_id)
);
CREATE INDEX IF NOT EXISTS idx_guesty_reservations_tenant
  ON guesty_reservations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_guesty_reservations_listing
  ON guesty_reservations(tenant_id, listing_guesty_id);
CREATE INDEX IF NOT EXISTS idx_guesty_reservations_dates
  ON guesty_reservations(tenant_id, check_in_date, check_out_date);
CREATE INDEX IF NOT EXISTS idx_guesty_reservations_status
  ON guesty_reservations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_guesty_reservations_check_in
  ON guesty_reservations(tenant_id, check_in_date);
