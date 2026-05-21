-- 061_guesty_calendar.sql
--
-- Local Guesty availability/pricing cache. This is the source used by
-- /api/public/availability and FAD internal modules; the website must
-- not call Guesty directly.
--
-- One row per tenant + Guesty listing + stay night. Dates follow the
-- hospitality convention used everywhere else in FAD: check-in is
-- included, check-out is excluded.

CREATE TABLE IF NOT EXISTS guesty_calendar (
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  listing_guesty_id TEXT NOT NULL,
  date              DATE NOT NULL,
  is_available      BOOLEAN NOT NULL DEFAULT TRUE,
  status            TEXT,
  price_minor       BIGINT,
  currency_code     TEXT,
  min_nights        INTEGER,
  max_nights        INTEGER,
  source            TEXT NOT NULL DEFAULT 'guesty_calendar',
  raw               JSONB NOT NULL DEFAULT '{}'::jsonb,
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, listing_guesty_id, date)
);

CREATE INDEX IF NOT EXISTS idx_guesty_calendar_listing_date
  ON guesty_calendar(tenant_id, listing_guesty_id, date);

CREATE INDEX IF NOT EXISTS idx_guesty_calendar_fetched
  ON guesty_calendar(tenant_id, fetched_at);
