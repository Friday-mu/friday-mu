-- 059_inbox_message_column_compat.sql
--
-- Compatibility columns required by the FAD-native Inbox read/send
-- paths. Some existing shared GMS databases predate these columns;
-- without them conversation detail and Guesty webhook inserts fail.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS communication_channel TEXT,
  ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ;

UPDATE conversations c
   SET last_inbound_at = latest.last_inbound_at
  FROM (
    SELECT conversation_id, MAX(created_at) AS last_inbound_at
      FROM messages
     WHERE direction = 'inbound'
     GROUP BY conversation_id
  ) latest
 WHERE c.id = latest.conversation_id
   AND c.last_inbound_at IS NULL;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS module_type TEXT,
  ADD COLUMN IF NOT EXISTS attachments JSONB;

CREATE INDEX IF NOT EXISTS idx_messages_module_type
  ON messages(conversation_id, module_type)
  WHERE module_type IS NOT NULL;
