-- 064_fr_module_catalog_backfill.sql
--
-- Keep the backend tenant-module catalog aligned with the frontend FAD
-- sidebar. Missing catalog rows make modules disappear completely even when
-- their UI still exists.

DO $$
DECLARE
  fr_tenant_id UUID;
BEGIN
  SELECT id INTO fr_tenant_id FROM tenants WHERE slug = 'friday' LIMIT 1;
  IF fr_tenant_id IS NULL THEN
    fr_tenant_id := '00000000-0000-0000-0000-000000000001'::UUID;
  END IF;

  INSERT INTO tenant_modules (tenant_id, module_key, enabled)
  VALUES
    (fr_tenant_id, 'legal', true),
    (fr_tenant_id, 'guests', true),
    (fr_tenant_id, 'owners', true),
    (fr_tenant_id, 'marketing', true),
    (fr_tenant_id, 'leads', true),
    (fr_tenant_id, 'intelligence', true),
    (fr_tenant_id, 'syndic', true),
    (fr_tenant_id, 'agency', true),
    (fr_tenant_id, 'notifications', true)
  ON CONFLICT (tenant_id, module_key) DO UPDATE
    SET enabled = EXCLUDED.enabled,
        enabled_at = CASE WHEN EXCLUDED.enabled = true THEN COALESCE(tenant_modules.enabled_at, NOW()) ELSE tenant_modules.enabled_at END;
END $$;
