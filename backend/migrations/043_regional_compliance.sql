-- Migration 043 — regional_compliance JSONB on design_projects
--
-- Wave C2 multitenant cleanup. CIA Mauritius compliance fields
-- (migration 027) are MU-only but currently sit as top-level columns
-- on design_projects. As we onboard non-MU tenants, every region will
-- want its own compliance scaffolding (UAE RERA, FR Loi ALUR, etc.).
--
-- Rather than keep adding regional columns, introduce a single
-- regional_compliance JSONB that holds whatever the tenant's country
-- demands. The CIA columns stay in place (deprecated, for backward
-- compatibility); a follow-up migration drops them once we're confident
-- no reader depends on them.
--
-- JSONB shape examples (all keys optional):
--   MU tenants:
--     {
--       "cia_registration_status": "registered",
--       "cia_registration_ref": "CIA/REG/2026/00123",
--       "cia_notes": "..."
--     }
--   UAE tenants (future):
--     {
--       "rera_permit_no": "...",
--       "rera_status": "approved"
--     }
--
-- Backfill: only populate for MU tenants where the legacy CIA columns
-- have non-default values. Leaves other tenants with `{}::jsonb`.

BEGIN;

ALTER TABLE design_projects
  ADD COLUMN IF NOT EXISTS regional_compliance JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Backfill MU tenants' projects from the legacy CIA columns. Only
-- migrate rows where at least one CIA field carries non-default state
-- so we don't pollute the JSONB on every existing row.
UPDATE design_projects p
SET regional_compliance = jsonb_strip_nulls(jsonb_build_object(
  'cia_registration_status',
    CASE WHEN p.cia_registration_status IS NOT NULL AND p.cia_registration_status <> 'unknown'
         THEN p.cia_registration_status ELSE NULL END,
  'cia_registration_ref', p.cia_registration_ref,
  'cia_notes',            p.cia_notes
))
FROM tenants t
WHERE p.tenant_id = t.id
  AND t.country = 'MU'
  AND (
    (p.cia_registration_status IS NOT NULL AND p.cia_registration_status <> 'unknown')
    OR p.cia_registration_ref IS NOT NULL
    OR p.cia_notes IS NOT NULL
  )
  AND p.regional_compliance = '{}'::jsonb;  -- idempotent: only backfill empty rows

COMMIT;
