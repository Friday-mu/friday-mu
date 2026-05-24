-- 080_guests_name_bucket.sql
--
-- Follow-up to 079: Guesty's OAuth API redacts guest emails for OTA
-- bookings (Airbnb policy; BDC sometimes too) — on FR's prod cache,
-- 257 reservations had ZERO emails, leaving 079's email-keyed backfill
-- almost empty. Add a name-keyed bucket so the Guests module actually
-- shows guests for OTA stays.
--
-- Identity rules (extends 079):
--   email present → key by email (079, no change)
--   no email, phone present → key by normalised phone (079, no change)
--   no email, no phone, name present → key by normalised name (THIS migration)
--
-- The name key is best-effort. Two guests with the same name+initial
-- collide; admin will need a manual-merge tool eventually. Acceptable
-- for v0.1 — better than no row at all.

-- Backfill name-bucket guests. NOT EXISTS guard makes re-runs safe.
-- We intentionally don't add a unique constraint on the name key
-- because (a) collisions are real (same-named distinct guests) and
-- (b) the email/phone partial-unique indexes from 079 already prevent
-- the worst kind of duplication.
INSERT INTO fad_guests (
  tenant_id, primary_email, primary_phone, display_name,
  first_name, last_name, first_seen_at, last_seen_at,
  total_stays_count, total_revenue_minor
)
SELECT
  tenant_id, NULL, NULL, display_name,
  first_name, last_name, first_seen_at, last_seen_at,
  stays, revenue
FROM (
  SELECT
    r.tenant_id,
    LOWER(TRIM(CONCAT_WS(' ', r.guest_first_name, r.guest_last_name))) AS name_key,
    TRIM(CONCAT_WS(' ', r.guest_first_name, r.guest_last_name)) AS display_name,
    (ARRAY_AGG(r.guest_first_name ORDER BY r.check_in_date DESC NULLS LAST))[1] AS first_name,
    (ARRAY_AGG(r.guest_last_name  ORDER BY r.check_in_date DESC NULLS LAST))[1] AS last_name,
    MIN(r.check_in_date)::timestamptz AS first_seen_at,
    MAX(r.check_in_date)::timestamptz AS last_seen_at,
    COUNT(*)::integer AS stays,
    COALESCE(SUM(r.total_amount_minor), 0)::bigint AS revenue
  FROM guesty_reservations r
  WHERE NULLIF(LOWER(TRIM(r.guest_email)), '') IS NULL
    AND NULLIF(TRIM(r.guest_phone), '') IS NULL
    AND NULLIF(TRIM(CONCAT_WS(' ', r.guest_first_name, r.guest_last_name)), '') IS NOT NULL
  GROUP BY r.tenant_id,
           LOWER(TRIM(CONCAT_WS(' ', r.guest_first_name, r.guest_last_name))),
           TRIM(CONCAT_WS(' ', r.guest_first_name, r.guest_last_name))
) name_src
WHERE NOT EXISTS (
  SELECT 1 FROM fad_guests g
  WHERE g.tenant_id = name_src.tenant_id
    AND g.primary_email IS NULL
    AND g.primary_phone IS NULL
    AND LOWER(TRIM(g.display_name)) = name_src.name_key
);

-- Add a non-unique index for the runtime upsert helper's NOT EXISTS
-- lookup to be quick.
CREATE INDEX IF NOT EXISTS idx_fad_guests_tenant_name_key
  ON fad_guests (tenant_id, LOWER(TRIM(display_name)))
  WHERE primary_email IS NULL AND primary_phone IS NULL;
