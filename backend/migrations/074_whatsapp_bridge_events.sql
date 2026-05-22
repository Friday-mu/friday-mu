-- 074_whatsapp_bridge_events.sql
--
-- Audit ledger for the disposable-number WhatsApp Web bridge prototype.
-- The bridge is disabled by default and must never use Friday's main
-- WhatsApp number. These rows let ops inspect provider ids, safety
-- blocks, generated replies, sends, and failures without relying on
-- process logs.

CREATE TABLE IF NOT EXISTS whatsapp_bridge_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  chat_jid            TEXT NOT NULL,
  sender_jid          TEXT,
  provider_message_id TEXT,
  conversation_id     UUID REFERENCES conversations(id) ON DELETE SET NULL,
  message_id          UUID REFERENCES messages(id) ON DELETE SET NULL,
  event_type          TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'logged'
                        CHECK (status IN ('logged', 'blocked', 'generated', 'sent', 'failed', 'skipped')),
  payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
  error               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_bridge_events_recent
  ON whatsapp_bridge_events(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_bridge_events_chat_recent
  ON whatsapp_bridge_events(tenant_id, chat_jid, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_bridge_events_provider_inbound
  ON whatsapp_bridge_events(tenant_id, provider_message_id, event_type)
  WHERE provider_message_id IS NOT NULL AND event_type = 'inbound_message';
