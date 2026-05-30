-- 056_team_attachments.sql
--
-- File uploads for TeamInbox. Per locked decision §8 (2026-05-17) +
-- Ishant 2026-05-18 nod on attachments-as-company-info: public nginx
-- static serve under /uploads/team/ from /var/www/fad-uploads/team/.
-- Uploaded files are accessible by URL; the trade-off is acceptable
-- because the team account terms-of-use govern misuse.
--
-- Flow:
--   1. Operator drops a file in the channel/DM compose. Frontend POSTs
--      multipart/form-data to /api/team/channels/:id/attachments (or
--      /dms/:id/attachments). Backend writes to disk + creates an
--      `team_message_attachments` row with message_id = NULL.
--   2. When the operator hits Send, frontend POSTs the message with
--      `attachmentIds: [uuid, uuid]`. Backend updates those rows to
--      set channel_message_id (or dm_message_id) — binding them to
--      the message.
--   3. Unbound attachments (uploaded but never sent, e.g. operator
--      cancelled) stay queryable via the partial index; a future
--      cleanup job can prune rows older than 24h.

CREATE TABLE IF NOT EXISTS team_message_attachments (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- The channel OR DM this upload is destined for (set at upload time
  -- so we know where the file belongs even before a message exists).
  -- Exactly one is set — enforced by the target check.
  channel_id                  UUID REFERENCES team_channels(id) ON DELETE CASCADE,
  dm_id                       UUID REFERENCES team_dms(id) ON DELETE CASCADE,

  -- The message this attachment is bound to. NULL until the send-with-
  -- attachmentIds binding runs. CASCADE so deleting a message also
  -- deletes its attachments (file on disk needs separate cleanup —
  -- handled in the backend delete handler when message deletion ships).
  channel_message_id          UUID REFERENCES team_channel_messages(id) ON DELETE CASCADE,
  dm_message_id               UUID REFERENCES team_dm_messages(id) ON DELETE CASCADE,

  uploaded_by_user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  filename                    TEXT NOT NULL,
  mime_type                   TEXT,
  size_bytes                  BIGINT NOT NULL,
  -- Relative to /var/www/fad-uploads/ — backend resolves to absolute
  -- on disk-read; URL column resolves to public-fetch path.
  storage_path                TEXT NOT NULL,
  -- Public URL operators hit. Format: /uploads/team/channel/<id>/<uuid>.<ext>
  -- (no scheme/host — relative to gms.friday.mu).
  url                         TEXT NOT NULL,
  -- Pixel dimensions for images. NULL for non-images or when we can't
  -- determine (no sharp dep in v1 — frontend handles natural size).
  width                       INTEGER,
  height                      INTEGER,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Target must be exactly one of channel or dm. Both NULL or both
  -- set is invalid.
  CONSTRAINT team_message_attachments_target_check CHECK (
    (channel_id IS NOT NULL AND dm_id IS NULL)
    OR (channel_id IS NULL AND dm_id IS NOT NULL)
  ),
  -- Message refs follow the same exclusivity rule — at most one set
  -- (both NULL = unbound; both set = invalid).
  CONSTRAINT team_message_attachments_message_check CHECK (
    NOT (channel_message_id IS NOT NULL AND dm_message_id IS NOT NULL)
  ),
  -- And the message kind must match the target kind: a channel-target
  -- attachment can only bind to a channel message, never a DM message.
  CONSTRAINT team_message_attachments_target_consistency CHECK (
    (channel_message_id IS NULL OR channel_id IS NOT NULL)
    AND (dm_message_id IS NULL OR dm_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_team_attachments_channel_message
  ON team_message_attachments(channel_message_id)
  WHERE channel_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_team_attachments_dm_message
  ON team_message_attachments(dm_message_id)
  WHERE dm_message_id IS NOT NULL;
-- Unbound uploads — pruning candidate for the cleanup job.
CREATE INDEX IF NOT EXISTS idx_team_attachments_unbound
  ON team_message_attachments(uploaded_by_user_id, created_at)
  WHERE channel_message_id IS NULL AND dm_message_id IS NULL;
