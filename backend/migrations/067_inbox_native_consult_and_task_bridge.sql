-- 067_inbox_native_consult_and_task_bridge.sql
--
-- FAD-native Ask Friday + Inbox AI task bridge.
--
-- GMS already created consult_sessions in the shared database. FAD now
-- owns the Consult route, so add the missing tenant/draft scope needed
-- for multi-tenant isolation and for one active session per
-- conversation/context/draft.
--
-- Pending actions remain the detector/review source of truth, but Ops
-- owns execution. The bridge below lets a pending_action be converted
-- idempotently into a real FAD task.

ALTER TABLE consult_sessions
  ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  ADD COLUMN IF NOT EXISTS draft_id TEXT;

CREATE INDEX IF NOT EXISTS idx_cs_tenant_conversation
  ON consult_sessions(tenant_id, conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_cs_active_scope
  ON consult_sessions(tenant_id, conversation_id, context, draft_id, last_activity_at)
  WHERE status IN ('active', 'compacted');

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS external_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_external_ref
  ON tasks(tenant_id, external_ref)
  WHERE external_ref IS NOT NULL AND status <> 'cancelled';

ALTER TABLE pending_actions
  ADD COLUMN IF NOT EXISTS fad_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pending_actions_fad_task
  ON pending_actions(tenant_id, fad_task_id)
  WHERE fad_task_id IS NOT NULL;
