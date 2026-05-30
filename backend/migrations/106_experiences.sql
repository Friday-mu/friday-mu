-- 106_experiences.sql — Experiences supply hub (FAD as single source, channel-routed).
--
-- One normalized, provider-agnostic catalog. FAD ingests experiences from
-- providers (Bokun live today; Viator/RateHawk later), tags each with
-- {country, channels}, and serves them to friday.mu + friday.travel via
-- GET /api/public/experiences. Routing is the `channels` array — a site only
-- ever sees what it's published to. Mirrors the residences pattern
-- (guesty_listings → /api/public/listings); see docs experiences-supply-routing.
--
-- Routing rule (set at ingestion, admin-overridable):
--   country = 'MU'  → channels = ['friday.mu','friday.travel']
--   country <> 'MU' → channels = ['friday.travel']
--
-- Guest-pure: provider / provider_id / status are INTERNAL and never enter the
-- /api/public/experiences payload.

CREATE TABLE IF NOT EXISTS experiences (
  id              TEXT PRIMARY KEY,                    -- stable FAD id, e.g. 'fad-exp-1101808'
  tenant_id       UUID NOT NULL,
  provider        TEXT NOT NULL,                       -- bokun|viator|ratehawk|friday  (INTERNAL)
  provider_id     TEXT NOT NULL,                       -- upstream id, e.g. Bokun '1101808'  (INTERNAL)
  status          TEXT NOT NULL DEFAULT 'active',      -- active|hidden  (INTERNAL soft on/off)
  country         TEXT,                                -- ISO-2: MU, ID, PT, TZ ...
  channels        TEXT[] NOT NULL DEFAULT '{}',        -- publish targets: friday.mu / friday.travel
  name            TEXT NOT NULL,
  area            TEXT,
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  category        TEXT,                                -- water|land|cultural|gastro|wellness|aerial
  duration_text   TEXT,
  price_from_eur  NUMERIC,                             -- null => "Price on request"
  instant         BOOLEAN NOT NULL DEFAULT TRUE,       -- instant-confirm vs request-to-book
  rating          NUMERIC,                             -- null when no reviews
  review_count    INTEGER NOT NULL DEFAULT 0,
  blurb           TEXT,
  description     TEXT,
  photos          JSONB NOT NULL DEFAULT '[]'::jsonb,  -- string[] of image URLs
  book_mode       TEXT NOT NULL DEFAULT 'api',         -- api|redirect
  redirect_url    TEXT,                                -- affiliate-only (e.g. Viator affiliate)
  source_payload  JSONB NOT NULL DEFAULT '{}'::jsonb,  -- redacted provenance for refresh/refinement
  synced_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT experiences_provider_check CHECK (provider IN ('bokun','viator','ratehawk','friday')),
  CONSTRAINT experiences_status_check   CHECK (status IN ('active','hidden')),
  CONSTRAINT experiences_bookmode_check CHECK (book_mode IN ('api','redirect')),
  UNIQUE (tenant_id, provider, provider_id)
);

-- GIN index for the channels @> ARRAY[channel] filter the public endpoint uses.
CREATE INDEX IF NOT EXISTS idx_experiences_channels ON experiences USING GIN (channels);
CREATE INDEX IF NOT EXISTS idx_experiences_country  ON experiences (tenant_id, country);

COMMENT ON COLUMN experiences.channels IS 'Publish targets (friday.mu / friday.travel). The routing switch — endpoint filters channels @> [channel]. Admin-overridable per experience.';
COMMENT ON COLUMN experiences.provider IS 'INTERNAL only — never surfaced to guests.';
COMMENT ON COLUMN experiences.source_payload IS 'Redacted upstream provenance for refresh + field refinement. No raw credentials.';
