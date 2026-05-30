-- 062_team_design_channel.sql
--
-- Adds a public #design channel to TeamInbox and indexes design-project
-- metadata links stored on team_channel_messages.meta.

DO $$
DECLARE
  fr_tenant_id UUID;
BEGIN
  SELECT id INTO fr_tenant_id FROM tenants WHERE slug = 'friday' LIMIT 1;
  IF fr_tenant_id IS NULL THEN
    fr_tenant_id := '00000000-0000-0000-0000-000000000001'::UUID;
  END IF;

  INSERT INTO team_channels (tenant_id, channel_key, name, purpose, visibility, preserve_upload_quality)
  VALUES (
    fr_tenant_id,
    'design',
    'Design',
    'Interior design projects, selections, owner approvals, procurement, and execution coordination',
    'public',
    FALSE
  )
  ON CONFLICT (tenant_id, channel_key) DO UPDATE
    SET name = EXCLUDED.name,
        purpose = EXCLUDED.purpose,
        visibility = EXCLUDED.visibility,
        updated_at = NOW();

  INSERT INTO team_channel_members (channel_id, user_id, role)
  SELECT c.id, u.id, 'member'
  FROM team_channels c
  CROSS JOIN users u
  WHERE c.tenant_id = fr_tenant_id
    AND c.channel_key = 'design'
    AND u.tenant_id = fr_tenant_id
    AND u.is_active = TRUE
  ON CONFLICT (channel_id, user_id) DO NOTHING;
END $$;

CREATE INDEX IF NOT EXISTS idx_team_channel_messages_design_project
  ON team_channel_messages ((meta->'designProject'->>'id'))
  WHERE meta ? 'designProject';
