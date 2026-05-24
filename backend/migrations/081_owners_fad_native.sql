-- 081_owners_fad_native.sql
--
-- Owners module — FAD-native owner records that surface as the entity
-- behind every property. Closes T1.12 (no more "o-guesty-unknown"
-- placeholder in the UI).
--
-- Topology:
--   fad_owners                     1 row per legal entity / family / individual
--   fad_property_owners (mig 077)  N:M edges property → owner with %
--
-- Backfill seeds one fad_owners row per distinct Guesty internal owner
-- ID across guesty_listings, and seeds the matching property edges.
-- Names are placeholders ("Guesty owner abc12345") because Guesty's
-- /owners/:id API needs a separate call per owner — operators edit in
-- real names via PATCH /api/owners/:id.

CREATE TABLE IF NOT EXISTS fad_owners (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
                              REFERENCES tenants(id) ON DELETE CASCADE,
  guesty_owner_id             TEXT,
  display_name                TEXT NOT NULL,
  legal_entity_name           TEXT,
  contact_email               TEXT,
  contact_phone               TEXT,
  address                     TEXT,
  country                     TEXT DEFAULT 'MU',
  payment_pref                TEXT CHECK (payment_pref IS NULL OR payment_pref IN
                              ('bank_transfer', 'mcb_juice', 'cheque', 'cash')),
  bank_details_encrypted      BYTEA,
  language                    TEXT DEFAULT 'en'
                              CHECK (language IS NULL OR language IN ('en', 'fr', 'es')),
  statement_day               INTEGER CHECK (statement_day IS NULL OR statement_day BETWEEN 1 AND 28),
  commission_pct_default      NUMERIC(5, 2),
  notes                       TEXT,
  archived_at                 TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Guesty owner_id is the join key from guesty_listings.raw.owners[].
-- One fad_owners row per Guesty owner per tenant. Allow NULLs (manual
-- entries from admin won't have a Guesty id).
CREATE UNIQUE INDEX IF NOT EXISTS idx_fad_owners_tenant_guesty_uq
  ON fad_owners (tenant_id, guesty_owner_id)
  WHERE guesty_owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fad_owners_tenant_active
  ON fad_owners (tenant_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fad_owners_tenant_email
  ON fad_owners (tenant_id, LOWER(contact_email))
  WHERE contact_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fad_owners_tenant_display
  ON fad_owners (tenant_id, LOWER(display_name));

DROP TRIGGER IF EXISTS trg_fad_owners_updated_at ON fad_owners;
CREATE TRIGGER trg_fad_owners_updated_at
  BEFORE UPDATE ON fad_owners
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_now();

-- Backfill: one fad_owners row per distinct Guesty owner id, plus the
-- matching fad_property_owners link rows.
INSERT INTO fad_owners (tenant_id, guesty_owner_id, display_name)
SELECT DISTINCT
  l.tenant_id,
  owner_id_text,
  'Guesty owner ' || RIGHT(owner_id_text, 8) AS display_name
FROM guesty_listings l
CROSS JOIN LATERAL jsonb_array_elements_text(
  COALESCE(l.raw->'owners', '[]'::jsonb)
) AS owner_id_text
WHERE owner_id_text IS NOT NULL AND owner_id_text <> ''
ON CONFLICT (tenant_id, guesty_owner_id) WHERE guesty_owner_id IS NOT NULL DO NOTHING;

-- Link properties to owners. fad_property_owners.owner_id is TEXT and
-- stores the Guesty owner ID directly — that's our join key. Skip if
-- the property hasn't been overlaid yet (no fad_properties row).
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
  AND o.ord = 1  -- first owner = primary for the seed
ON CONFLICT (tenant_id, property_id, owner_id) DO NOTHING;
