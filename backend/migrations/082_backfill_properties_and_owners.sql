-- 082_backfill_properties_and_owners.sql
--
-- Follow-up to 081: fad_property_owners backfill in 081 joined against
-- fad_properties, but fad_properties is lazily materialised — most
-- listings had no overlay row, leaving fad_property_owners empty too.
--
-- Two-step backfill:
--   1. Materialise fad_properties for every guesty_listings row that
--      doesn't already have one (mirrors the JS auto-materialise in
--      properties/index.js: resolvePropertyId).
--   2. Re-run the fad_property_owners seed from 081 against the now-
--      populated property set.

-- Step 1: Materialise fad_properties from guesty_listings (idempotent).
INSERT INTO fad_properties (
  tenant_id, guesty_id, code, name, address, region, listing_type,
  bedrooms, bathrooms, max_occupancy, lifecycle_status
)
SELECT
  gl.tenant_id,
  gl.guesty_id,
  COALESCE(NULLIF(TRIM(gl.nickname), ''), RIGHT(gl.guesty_id, 8)) AS code,
  COALESCE(gl.title, gl.nickname, 'Listing ' || RIGHT(gl.guesty_id, 6)) AS name,
  gl.address_full AS address,
  gl.cohort AS region,
  CASE
    WHEN LOWER(COALESCE(gl.property_type, '')) LIKE '%villa%' THEN 'villa'
    WHEN LOWER(COALESCE(gl.property_type, '')) LIKE '%apart%' THEN 'apartment'
    WHEN LOWER(COALESCE(gl.property_type, '')) LIKE '%studio%' THEN 'studio'
    WHEN LOWER(COALESCE(gl.property_type, '')) LIKE '%town%' THEN 'townhouse'
    WHEN LOWER(COALESCE(gl.property_type, '')) LIKE '%bungalow%' THEN 'bungalow'
    ELSE NULL
  END AS listing_type,
  gl.bedrooms,
  gl.bathrooms,
  gl.accommodates AS max_occupancy,
  CASE WHEN gl.is_active THEN 'live' ELSE 'paused' END AS lifecycle_status
FROM guesty_listings gl
WHERE NOT EXISTS (
  SELECT 1 FROM fad_properties p
   WHERE p.tenant_id = gl.tenant_id AND p.guesty_id = gl.guesty_id
)
ON CONFLICT (tenant_id, guesty_id) DO NOTHING;

-- Step 2: Re-run the fad_property_owners seed from 081 (now that
-- fad_properties has the overlays).
INSERT INTO fad_property_owners (tenant_id, property_id, owner_id, ownership_pct, is_primary)
SELECT DISTINCT
  l.tenant_id,
  p.id AS property_id,
  owner_id_text AS owner_id,
  100 AS ownership_pct,
  TRUE AS is_primary
FROM guesty_listings l
JOIN fad_properties p ON p.tenant_id = l.tenant_id AND p.guesty_id = l.guesty_id
CROSS JOIN LATERAL jsonb_array_elements_text(
  COALESCE(l.raw->'owners', '[]'::jsonb)
) WITH ORDINALITY AS o(owner_id_text, ord)
WHERE owner_id_text IS NOT NULL AND owner_id_text <> ''
  AND o.ord = 1
ON CONFLICT (tenant_id, property_id, owner_id) DO NOTHING;
