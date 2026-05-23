-- 077_properties_fad_native.sql
--
-- FAD-native Properties overlay per v0.2 LOCKED scoping pack
-- (Notion 34f43ca8849281f3a130f7def80a7c5d). Adds the FAD-owned fields
-- on top of the existing `guesty_listings` cache (mig 049).
--
-- Naming: tables are `fad_*` prefixed because legacy `properties` and
-- `reservations` tables exist with pre-rebuild schemas that we don't
-- want to disturb. The Phase-3 displacement plan will reconcile when
-- we displace Guesty as system-of-record.
--
-- Design:
--   * `fad_properties` is the FAD source of truth for module-owned
--     fields (lifecycle, onboarding, tags, owner cap, FAD geo, hero
--     photo). Joins to `guesty_listings` loosely via
--     (tenant_id, guesty_id) so a manual prospect can exist before
--     Guesty knows about it. The route does a LEFT JOIN; absent
--     overlay rows fall back to safe defaults so existing listings
--     keep rendering with no manual seed.
--   * `fad_property_owners` is the N:M between properties and the
--     (yet-to-ship) Owners module. `is_primary` marks the contract
--     signing party.
--   * `fad_property_cards` replaces Breezeway FAQs + Guesty saved
--     replies as the AI-knowledge surface (Ask Friday consumes these).
--   * `fad_property_photos` is the FAD-owned canonical photo store.
--     Schema ships now; full curation UX in a follow-up wave.
--   * `fad_property_onboarding_artifacts` is the structured artifact
--     record per onboarding step. Schema ships now; full form UX in
--     a follow-up wave.
--   * `fad_property_activity_log` is the FAD-native audit trail
--     surfaced on the Property detail Activity sub-tab.
--   * Multi-tenant from day one — every table tenant-scoped via FK +
--     index. FR UUID is the default for legacy ergonomics.

CREATE TABLE IF NOT EXISTS fad_properties (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
                              REFERENCES tenants(id) ON DELETE CASCADE,
  guesty_id                   TEXT,
  code                        TEXT NOT NULL,
  name                        TEXT,
  building_name               TEXT,
  address                     TEXT,
  region                      TEXT,
  area                        TEXT,
  zone                        TEXT CHECK (zone IS NULL OR zone IN ('north', 'west', 'south')),
  tier                        TEXT CHECK (tier IS NULL OR tier IN ('small', 'medium', 'big')),
  geo_lat                     NUMERIC(10, 7),
  geo_lng                     NUMERIC(10, 7),
  listing_type                TEXT CHECK (listing_type IS NULL OR listing_type IN
                              ('villa', 'apartment', 'studio', 'townhouse', 'bungalow')),
  bedrooms                    INTEGER,
  bathrooms                   NUMERIC(3, 1),
  max_occupancy               INTEGER,
  sqm                         INTEGER,
  description                 TEXT,
  lifecycle_status            TEXT NOT NULL DEFAULT 'live'
                              CHECK (lifecycle_status IN
                              ('prospect', 'onboarding', 'live', 'paused', 'off_boarded')),
  onboarding_checklist        JSONB NOT NULL DEFAULT '{}'::jsonb,
  live_since                  DATE,
  paused_reason               TEXT,
  pause_return_by             DATE,
  parent_property_id          UUID REFERENCES fad_properties(id) ON DELETE SET NULL,
  is_combo                    BOOLEAN NOT NULL DEFAULT FALSE,
  maintenance_cap_override_minor BIGINT,
  contract_status             TEXT CHECK (contract_status IS NULL OR contract_status IN
                              ('active', 'pending', 'renewal_due', 'expired')),
  commission_pct              NUMERIC(5, 2),
  payment_day                 INTEGER CHECK (payment_day IS NULL OR (payment_day >= 1 AND payment_day <= 31)),
  contract_ends_at            DATE,
  contract_xodo_envelope_id   TEXT,
  listings                    JSONB NOT NULL DEFAULT '[]'::jsonb,
  base_rate_mur_minor         BIGINT,
  hero_photo_id               UUID,
  tags                        JSONB NOT NULL DEFAULT '[]'::jsonb,
  amenities                   JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_syndic_managed           BOOLEAN NOT NULL DEFAULT FALSE,
  syndic_id                   TEXT,
  last_activity_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fad_properties_tenant_code_unique UNIQUE (tenant_id, code),
  CONSTRAINT fad_properties_tenant_guesty_unique UNIQUE (tenant_id, guesty_id)
);

CREATE INDEX IF NOT EXISTS idx_fad_properties_tenant
  ON fad_properties(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fad_properties_tenant_lifecycle
  ON fad_properties(tenant_id, lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_fad_properties_tenant_region
  ON fad_properties(tenant_id, region);
CREATE INDEX IF NOT EXISTS idx_fad_properties_parent
  ON fad_properties(parent_property_id)
  WHERE parent_property_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fad_properties_guesty
  ON fad_properties(tenant_id, guesty_id)
  WHERE guesty_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS fad_property_owners (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
                  REFERENCES tenants(id) ON DELETE CASCADE,
  property_id     UUID NOT NULL REFERENCES fad_properties(id) ON DELETE CASCADE,
  owner_id        TEXT NOT NULL,
  ownership_pct   NUMERIC(5, 2) NOT NULL DEFAULT 100,
  is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fad_property_owners_unique UNIQUE (tenant_id, property_id, owner_id)
);

CREATE INDEX IF NOT EXISTS idx_fad_property_owners_property
  ON fad_property_owners(tenant_id, property_id);
CREATE INDEX IF NOT EXISTS idx_fad_property_owners_owner
  ON fad_property_owners(tenant_id, owner_id);

CREATE TABLE IF NOT EXISTS fad_property_cards (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
                           REFERENCES tenants(id) ON DELETE CASCADE,
  property_id              UUID REFERENCES fad_properties(id) ON DELETE CASCADE,
  category                 TEXT NOT NULL CHECK (category IN
                           ('access', 'wifi_tech', 'utilities', 'waste',
                            'pool_outdoor', 'building_syndic', 'local_context', 'quirks')),
  title                    TEXT NOT NULL,
  body                     TEXT NOT NULL DEFAULT '',
  surface                  TEXT NOT NULL DEFAULT 'internal_only'
                           CHECK (surface IN ('guest_facing', 'internal_only', 'both')),
  source                   TEXT NOT NULL DEFAULT 'manual'
                           CHECK (source IN
                           ('manual', 'ai_extracted', 'onboarding_form',
                            'breezeway_imported', 'guesty_imported')),
  ai_thread_id             TEXT,
  ai_confidence            NUMERIC(4, 3),
  last_updated_by_user_id  TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fad_property_cards_property
  ON fad_property_cards(tenant_id, property_id);
CREATE INDEX IF NOT EXISTS idx_fad_property_cards_category
  ON fad_property_cards(tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_fad_property_cards_global
  ON fad_property_cards(tenant_id, category)
  WHERE property_id IS NULL;

CREATE TABLE IF NOT EXISTS fad_property_photos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
                  REFERENCES tenants(id) ON DELETE CASCADE,
  property_id     UUID NOT NULL REFERENCES fad_properties(id) ON DELETE CASCADE,
  storage_key     TEXT NOT NULL,
  url             TEXT,
  alt_text        TEXT,
  is_hero         BOOLEAN NOT NULL DEFAULT FALSE,
  display_order   INTEGER NOT NULL DEFAULT 0,
  tags            JSONB NOT NULL DEFAULT '[]'::jsonb,
  channels        JSONB NOT NULL DEFAULT '[]'::jsonb,
  uploaded_by     TEXT,
  width           INTEGER,
  height          INTEGER,
  bytes           BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fad_property_photos_property
  ON fad_property_photos(tenant_id, property_id, display_order);
CREATE INDEX IF NOT EXISTS idx_fad_property_photos_hero
  ON fad_property_photos(tenant_id, property_id)
  WHERE is_hero = TRUE;

CREATE TABLE IF NOT EXISTS fad_property_onboarding_artifacts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
                       REFERENCES tenants(id) ON DELETE CASCADE,
  property_id          UUID NOT NULL REFERENCES fad_properties(id) ON DELETE CASCADE,
  artifact_type        TEXT NOT NULL CHECK (artifact_type IN
                       ('site_visit', 'owner_agreement', 'standards_book', 'keys',
                        'amenities_form', 'gap_analysis', 'home_build_out',
                        'preventative_maintenance', 'aesthetic_check',
                        'photoshoot', 'listing_setup')),
  status               TEXT NOT NULL DEFAULT 'not_started'
                       CHECK (status IN ('not_started', 'in_progress', 'complete', 'skipped')),
  started_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  assigned_to_user_id  TEXT,
  notes                TEXT,
  payload              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fad_property_onboarding_artifacts_unique
    UNIQUE (tenant_id, property_id, artifact_type)
);

CREATE INDEX IF NOT EXISTS idx_fad_property_onboarding_artifacts_property
  ON fad_property_onboarding_artifacts(tenant_id, property_id);
CREATE INDEX IF NOT EXISTS idx_fad_property_onboarding_artifacts_status
  ON fad_property_onboarding_artifacts(tenant_id, status);

CREATE TABLE IF NOT EXISTS fad_property_activity_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
                 REFERENCES tenants(id) ON DELETE CASCADE,
  property_id    UUID NOT NULL REFERENCES fad_properties(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN
                 ('lifecycle_changed', 'onboarding_step_complete', 'owner_changed',
                  'photo_updated', 'contract_event', 'tag_added',
                  'card_added', 'note')),
  actor_id       TEXT,
  detail         TEXT NOT NULL,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  ts             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fad_property_activity_log_property_ts
  ON fad_property_activity_log(tenant_id, property_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_fad_property_activity_log_tenant_ts
  ON fad_property_activity_log(tenant_id, ts DESC);

CREATE OR REPLACE FUNCTION set_updated_at_now()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fad_properties_updated_at ON fad_properties;
CREATE TRIGGER trg_fad_properties_updated_at
  BEFORE UPDATE ON fad_properties
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_now();

DROP TRIGGER IF EXISTS trg_fad_property_owners_updated_at ON fad_property_owners;
CREATE TRIGGER trg_fad_property_owners_updated_at
  BEFORE UPDATE ON fad_property_owners
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_now();

DROP TRIGGER IF EXISTS trg_fad_property_cards_updated_at ON fad_property_cards;
CREATE TRIGGER trg_fad_property_cards_updated_at
  BEFORE UPDATE ON fad_property_cards
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_now();

DROP TRIGGER IF EXISTS trg_fad_property_onboarding_artifacts_updated_at ON fad_property_onboarding_artifacts;
CREATE TRIGGER trg_fad_property_onboarding_artifacts_updated_at
  BEFORE UPDATE ON fad_property_onboarding_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_now();
