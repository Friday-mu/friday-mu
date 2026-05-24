-- 079_guests_fad_native.sql
--
-- Guests module — FAD-native overlay across Guesty's reservation-embedded
-- guest data. Lets us track preferences, language, VIP tier, internal
-- notes, and lifetime stats across stays. Backfilled from
-- guesty_reservations on first run; subsequently kept fresh by the
-- reservations sync (sync.js upserts after each reservation row).
--
-- Multi-tenant from day one. tenant_id is the FR fallback for legacy
-- inserts; every route filters on req.tenantId.

CREATE TABLE IF NOT EXISTS fad_guests (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
                           REFERENCES tenants(id) ON DELETE CASCADE,
  primary_email            TEXT,
  primary_phone            TEXT,
  display_name             TEXT NOT NULL,
  first_name               TEXT,
  last_name                TEXT,
  language_pref            TEXT CHECK (language_pref IS NULL OR language_pref IN
                           ('en', 'fr', 'es', 'de', 'it', 'pt')),
  country                  TEXT,
  vip_tier                 TEXT NOT NULL DEFAULT 'none'
                           CHECK (vip_tier IN ('none', 'silver', 'gold', 'vip')),
  notes                    TEXT,
  first_seen_at            TIMESTAMPTZ,
  last_seen_at             TIMESTAMPTZ,
  total_stays_count        INTEGER NOT NULL DEFAULT 0,
  total_revenue_minor      BIGINT NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dedup keys. Email-first, phone fallback. Records with neither stay
-- isolated (admin merges manually) rather than collide on a degenerate
-- identity key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fad_guests_tenant_email_uq
  ON fad_guests (tenant_id, LOWER(TRIM(primary_email)))
  WHERE primary_email IS NOT NULL AND TRIM(primary_email) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_fad_guests_tenant_phone_uq
  ON fad_guests (tenant_id, REGEXP_REPLACE(TRIM(primary_phone), '[^0-9+]', '', 'g'))
  WHERE primary_email IS NULL AND primary_phone IS NOT NULL AND TRIM(primary_phone) <> '';

CREATE INDEX IF NOT EXISTS idx_fad_guests_tenant
  ON fad_guests (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fad_guests_tenant_last_seen
  ON fad_guests (tenant_id, last_seen_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_fad_guests_tenant_vip
  ON fad_guests (tenant_id, vip_tier)
  WHERE vip_tier <> 'none';

DROP TRIGGER IF EXISTS trg_fad_guests_updated_at ON fad_guests;
CREATE TRIGGER trg_fad_guests_updated_at
  BEFORE UPDATE ON fad_guests
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_now();

-- Idempotent backfill: email-keyed bucket. One row per distinct email
-- across all reservations, most-recent name + lifetime aggregates.
-- NOT EXISTS guard makes a re-run safe (each email skipped if seeded).
INSERT INTO fad_guests (
  tenant_id, primary_email, display_name,
  first_name, last_name, first_seen_at, last_seen_at,
  total_stays_count, total_revenue_minor
)
SELECT
  tenant_id, email, display_name,
  first_name, last_name, first_seen_at, last_seen_at,
  stays, revenue
FROM (
  SELECT
    r.tenant_id,
    NULLIF(LOWER(TRIM(r.guest_email)), '') AS email,
    COALESCE(
      NULLIF(TRIM(CONCAT_WS(' ', r.guest_first_name, r.guest_last_name)), ''),
      r.guest_email,
      'Unnamed guest'
    ) AS display_name,
    (ARRAY_AGG(r.guest_first_name ORDER BY r.check_in_date DESC NULLS LAST))[1] AS first_name,
    (ARRAY_AGG(r.guest_last_name  ORDER BY r.check_in_date DESC NULLS LAST))[1] AS last_name,
    MIN(r.check_in_date)::timestamptz AS first_seen_at,
    MAX(r.check_in_date)::timestamptz AS last_seen_at,
    COUNT(*)::integer AS stays,
    COALESCE(SUM(r.total_amount_minor), 0)::bigint AS revenue
  FROM guesty_reservations r
  WHERE NULLIF(LOWER(TRIM(r.guest_email)), '') IS NOT NULL
  GROUP BY r.tenant_id, NULLIF(LOWER(TRIM(r.guest_email)), ''),
           COALESCE(
             NULLIF(TRIM(CONCAT_WS(' ', r.guest_first_name, r.guest_last_name)), ''),
             r.guest_email,
             'Unnamed guest'
           )
) email_src
WHERE NOT EXISTS (
  SELECT 1 FROM fad_guests g
  WHERE g.tenant_id = email_src.tenant_id
    AND LOWER(TRIM(g.primary_email)) = email_src.email
);

-- Phone-only bucket — never had an email. Same NOT EXISTS guard.
INSERT INTO fad_guests (
  tenant_id, primary_phone, display_name,
  first_name, last_name, first_seen_at, last_seen_at,
  total_stays_count, total_revenue_minor
)
SELECT
  tenant_id, phone, display_name,
  first_name, last_name, first_seen_at, last_seen_at,
  stays, revenue
FROM (
  SELECT
    r.tenant_id,
    REGEXP_REPLACE(TRIM(r.guest_phone), '[^0-9+]', '', 'g') AS phone,
    COALESCE(
      NULLIF(TRIM(CONCAT_WS(' ', r.guest_first_name, r.guest_last_name)), ''),
      r.guest_phone,
      'Unnamed guest'
    ) AS display_name,
    (ARRAY_AGG(r.guest_first_name ORDER BY r.check_in_date DESC NULLS LAST))[1] AS first_name,
    (ARRAY_AGG(r.guest_last_name  ORDER BY r.check_in_date DESC NULLS LAST))[1] AS last_name,
    MIN(r.check_in_date)::timestamptz AS first_seen_at,
    MAX(r.check_in_date)::timestamptz AS last_seen_at,
    COUNT(*)::integer AS stays,
    COALESCE(SUM(r.total_amount_minor), 0)::bigint AS revenue
  FROM guesty_reservations r
  WHERE NULLIF(LOWER(TRIM(r.guest_email)), '') IS NULL
    AND NULLIF(TRIM(r.guest_phone), '') IS NOT NULL
  GROUP BY r.tenant_id, REGEXP_REPLACE(TRIM(r.guest_phone), '[^0-9+]', '', 'g'),
           COALESCE(
             NULLIF(TRIM(CONCAT_WS(' ', r.guest_first_name, r.guest_last_name)), ''),
             r.guest_phone,
             'Unnamed guest'
           )
) phone_src
WHERE NOT EXISTS (
  SELECT 1 FROM fad_guests g
  WHERE g.tenant_id = phone_src.tenant_id
    AND g.primary_email IS NULL
    AND REGEXP_REPLACE(TRIM(g.primary_phone), '[^0-9+]', '', 'g') = phone_src.phone
);
