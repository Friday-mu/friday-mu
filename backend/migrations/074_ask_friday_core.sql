-- 074_ask_friday_core.sql
--
-- Ask Friday Core V1: runtime registry, context packs, learning
-- events, KB candidates, approval-routed actions, evals, and identity
-- consent records.
--
-- Naming rule: user-facing intelligence surface is Ask Friday.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ask_friday_surfaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  surface_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  audience TEXT NOT NULL,
  source_system TEXT NOT NULL,
  access_class TEXT NOT NULL DEFAULT 'public',
  locale_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  allowed_knowledge_scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  allowed_tools TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  allowed_actions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  memory_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  handoff_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  context_budget JSONB NOT NULL DEFAULT '{}'::jsonb,
  eval_suite_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, surface_id)
);

CREATE INDEX IF NOT EXISTS idx_ask_friday_surfaces_tenant_status
  ON ask_friday_surfaces (tenant_id, status, surface_id);

CREATE TABLE IF NOT EXISTS ask_friday_context_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  pack_id TEXT NOT NULL,
  surface_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  knowledge_scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  behavior_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  tool_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  memory_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_snapshot_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  pack_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, pack_id),
  UNIQUE (tenant_id, surface_id, version)
);

CREATE INDEX IF NOT EXISTS idx_ask_friday_context_packs_lookup
  ON ask_friday_context_packs (tenant_id, surface_id, status, version DESC);

CREATE TABLE IF NOT EXISTS ask_friday_learning_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  event_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_system TEXT NOT NULL,
  surface_id TEXT NOT NULL,
  identity_ref JSONB NOT NULL DEFAULT '{}'::jsonb,
  session_id TEXT,
  locale TEXT,
  page_url TEXT,
  intent TEXT,
  user_turn_summary TEXT,
  assistant_action_summary TEXT,
  tools_used TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  knowledge_used TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  confidence TEXT,
  outcome TEXT,
  handoff JSONB NOT NULL DEFAULT '{}'::jsonb,
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  privacy_class TEXT NOT NULL DEFAULT 'unknown',
  redaction_status TEXT NOT NULL DEFAULT 'unredacted',
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tenant_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_ask_friday_learning_events_surface_created
  ON ask_friday_learning_events (tenant_id, surface_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ask_friday_learning_events_session
  ON ask_friday_learning_events (tenant_id, session_id, created_at DESC)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ask_friday_learning_events_review
  ON ask_friday_learning_events (tenant_id, privacy_class, redaction_status, created_at DESC);

CREATE TABLE IF NOT EXISTS ask_friday_evidence_refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  evidence_id TEXT NOT NULL,
  event_id TEXT,
  evidence_type TEXT NOT NULL,
  storage_ref TEXT,
  privacy_class TEXT NOT NULL DEFAULT 'unknown',
  redaction_status TEXT NOT NULL DEFAULT 'unredacted',
  summary TEXT,
  evidence_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, evidence_id)
);

CREATE INDEX IF NOT EXISTS idx_ask_friday_evidence_refs_event
  ON ask_friday_evidence_refs (tenant_id, event_id, created_at DESC)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ask_friday_evidence_refs_retention
  ON ask_friday_evidence_refs (tenant_id, expires_at)
  WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS ask_friday_kb_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  candidate_id TEXT NOT NULL,
  candidate_type TEXT NOT NULL,
  target_layer TEXT NOT NULL,
  proposed_change JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_event_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  evidence_summary TEXT,
  risk_class TEXT NOT NULL DEFAULT 'medium',
  trust_tier TEXT NOT NULL DEFAULT 'surface_evidence',
  review_status TEXT NOT NULL DEFAULT 'pending',
  reviewer TEXT,
  review_note TEXT,
  reviewed_at TIMESTAMPTZ,
  approved_snapshot_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_ask_friday_kb_candidates_review
  ON ask_friday_kb_candidates (tenant_id, review_status, risk_class, created_at DESC);

CREATE TABLE IF NOT EXISTS ask_friday_action_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  action_id TEXT NOT NULL,
  source_system TEXT NOT NULL,
  surface_id TEXT NOT NULL,
  requested_by JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_type TEXT NOT NULL,
  risk_class TEXT NOT NULL DEFAULT 'approval',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT,
  approval_required BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  review_note TEXT,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, action_id)
);

CREATE INDEX IF NOT EXISTS idx_ask_friday_action_requests_status
  ON ask_friday_action_requests (tenant_id, status, risk_class, created_at DESC);

CREATE TABLE IF NOT EXISTS ask_friday_eval_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  eval_id TEXT NOT NULL,
  suite_id TEXT NOT NULL,
  surface_id TEXT NOT NULL,
  source_event_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  expected JSONB NOT NULL DEFAULT '{}'::jsonb,
  assertions JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, eval_id)
);

CREATE INDEX IF NOT EXISTS idx_ask_friday_eval_cases_suite
  ON ask_friday_eval_cases (tenant_id, suite_id, surface_id, status);

CREATE TABLE IF NOT EXISTS ask_friday_eval_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  run_id TEXT NOT NULL,
  suite_id TEXT NOT NULL,
  context_pack_id TEXT,
  context_pack_version INTEGER,
  status TEXT NOT NULL DEFAULT 'queued',
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, run_id)
);

CREATE INDEX IF NOT EXISTS idx_ask_friday_eval_runs_suite
  ON ask_friday_eval_runs (tenant_id, suite_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ask_friday_identity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  identity_key TEXT NOT NULL,
  identity_type TEXT NOT NULL,
  subject_ref JSONB NOT NULL DEFAULT '{}'::jsonb,
  durable_memory_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  consent_status TEXT NOT NULL DEFAULT 'unknown',
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, identity_key)
);

CREATE INDEX IF NOT EXISTS idx_ask_friday_identity_links_subject
  ON ask_friday_identity_links (tenant_id, identity_type, consent_status, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS ask_friday_consent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  identity_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  source_system TEXT NOT NULL,
  surface_id TEXT,
  consent_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ask_friday_consent_events_identity
  ON ask_friday_consent_events (tenant_id, identity_key, created_at DESC);

INSERT INTO ask_friday_surfaces (
  surface_id,
  display_name,
  audience,
  source_system,
  access_class,
  locale_policy,
  allowed_knowledge_scopes,
  allowed_tools,
  allowed_actions,
  memory_policy,
  handoff_policy,
  model_policy,
  context_budget,
  eval_suite_ids,
  status
) VALUES
  (
    'website_guest_hero',
    'Ask Friday Guest Hero',
    'traveler',
    'friday-website',
    'public',
    '{"supported":["en","fr"],"match_user_locale":true}'::jsonb,
    ARRAY['public_brand','public_residences','public_experiences','public_mauritius','guest_booking_rules']::text[],
    ARRAY['search_residences','check_availability','search_experiences','search_places']::text[],
    ARRAY['request_booking','request_handoff']::text[],
    '{"anonymous":"session_only","durable":"authenticated_or_explicit_consent"}'::jsonb,
    '{"handoff_target":"fad_website_inbox","human_takeover_stops_ai":true}'::jsonb,
    '{"primary":"website_default","fallback":"website_fallback"}'::jsonb,
    '{"baseline_tokens":25000,"compact_after_messages":32}'::jsonb,
    ARRAY['website_guest_grounding','handoff_correctness','language_match']::text[],
    'active'
  ),
  (
    'website_ask_friday_fab',
    'Ask Friday FAB',
    'public_mixed',
    'friday-website',
    'public',
    '{"supported":["en","fr"],"match_user_locale":true}'::jsonb,
    ARRAY['public_brand','public_residences','public_experiences','public_mauritius','guest_booking_rules','public_owner_overview']::text[],
    ARRAY['route_intent','search_residences','check_availability','search_experiences','search_places']::text[],
    ARRAY['request_booking','request_owner_followup','request_feedback','request_handoff']::text[],
    '{"anonymous":"session_only","durable":"authenticated_or_explicit_consent"}'::jsonb,
    '{"handoff_target":"fad_website_inbox","human_takeover_stops_ai":true}'::jsonb,
    '{"primary":"website_default","fallback":"website_fallback"}'::jsonb,
    '{"baseline_tokens":40000,"compact_after_messages":32}'::jsonb,
    ARRAY['website_fab_routing','website_guest_grounding','owner_scope','handoff_correctness']::text[],
    'active'
  ),
  (
    'website_owner_enquiry',
    'Ask Friday Owner Enquiry',
    'owner_operator',
    'friday-website',
    'public',
    '{"supported":["en","fr"],"match_user_locale":true}'::jsonb,
    ARRAY['public_brand','public_owner_overview','owner_packages_public','owner_qualification']::text[],
    ARRAY['extract_owner_fields','prepare_owner_followup']::text[],
    ARRAY['request_owner_followup','request_handoff']::text[],
    '{"anonymous":"session_only","durable":"explicit_consent_or_owner_auth"}'::jsonb,
    '{"handoff_target":"fad_website_inbox","human_takeover_stops_ai":true}'::jsonb,
    '{"primary":"website_default","fallback":"website_fallback"}'::jsonb,
    '{"baseline_tokens":35000,"compact_after_messages":32}'::jsonb,
    ARRAY['owner_scope','owner_commitment_safety','language_match']::text[],
    'active'
  ),
  (
    'website_feedback_bug',
    'Ask Friday Feedback Bug',
    'public_feedback',
    'friday-website',
    'public_diagnostic',
    '{"supported":["en"],"match_user_locale":false}'::jsonb,
    ARRAY['feedback_diagnostics','public_site_context']::text[],
    ARRAY['inspect_feedback_context']::text[],
    ARRAY['create_feedback_issue']::text[],
    '{"anonymous":"session_only","durable":"explicit_consent_or_staff_auth"}'::jsonb,
    '{"handoff_target":"fad_feedback_queue"}'::jsonb,
    '{"primary":"website_default","fallback":"website_fallback"}'::jsonb,
    '{"baseline_tokens":15000,"max_followups":3}'::jsonb,
    ARRAY['feedback_repro_quality','privacy_redaction']::text[],
    'active'
  ),
  (
    'website_feedback_feature',
    'Ask Friday Feedback Feature',
    'public_feedback',
    'friday-website',
    'public_product',
    '{"supported":["en"],"match_user_locale":false}'::jsonb,
    ARRAY['feedback_product_reasoning','public_site_context']::text[],
    ARRAY['inspect_feedback_context']::text[],
    ARRAY['create_feedback_issue','create_kb_candidate']::text[],
    '{"anonymous":"session_only","durable":"explicit_consent_or_staff_auth"}'::jsonb,
    '{"handoff_target":"fad_feedback_queue"}'::jsonb,
    '{"primary":"website_default","fallback":"website_fallback"}'::jsonb,
    '{"baseline_tokens":15000,"max_followups":4}'::jsonb,
    ARRAY['feature_reasoning_quality','privacy_redaction']::text[],
    'active'
  ),
  (
    'fad_consult',
    'Ask Friday Consult',
    'staff',
    'fad',
    'staff',
    '{"supported":["en","fr"],"match_conversation_locale":true}'::jsonb,
    ARRAY['staff_inbox','property_cards','teachings','ops_context','guest_context','approved_public_kb']::text[],
    ARRAY['load_conversation','load_reservation','load_property','load_teachings','create_draft','create_task_candidate']::text[],
    ARRAY['draft_reply','create_task','create_kb_candidate','request_approval']::text[],
    '{"staff_sessions":"durable_team_visible","summaries":"allowed"}'::jsonb,
    '{"human_approval_required_for_send":true}'::jsonb,
    '{"primary":"fad_consult_default","fallback":"fad_consult_compact"}'::jsonb,
    '{"recent_message_limit":80,"compact_retry":true}'::jsonb,
    ARRAY['fad_consult_grounding','tool_correctness','action_safety']::text[],
    'active'
  ),
  (
    'fad_ops_assistant',
    'Ask Friday Ops Assistant',
    'staff',
    'fad',
    'staff',
    '{"supported":["en","fr"],"match_conversation_locale":true}'::jsonb,
    ARRAY['ops_tasks','reservations','properties','staff_runbooks','approved_public_kb']::text[],
    ARRAY['load_task','load_schedule','load_reservation','load_property','create_task_candidate']::text[],
    ARRAY['create_task','create_task_candidate','create_kb_candidate','request_approval']::text[],
    '{"staff_sessions":"durable_team_visible","summaries":"allowed"}'::jsonb,
    '{"human_approval_required_for_high_risk_actions":true}'::jsonb,
    '{"primary":"fad_ops_default","fallback":"fad_consult_compact"}'::jsonb,
    '{"recent_task_limit":80,"recent_reservation_limit":80}'::jsonb,
    ARRAY['ops_grounding','task_safety','tool_correctness']::text[],
    'active'
  ),
  (
    'fad_finance_assistant',
    'Ask Friday Finance Assistant',
    'staff',
    'fad',
    'restricted_staff',
    '{"supported":["en"],"match_conversation_locale":false}'::jsonb,
    ARRAY['finance_workflows','approved_finance_policy','owner_statement_rules']::text[],
    ARRAY['load_finance_summary','load_owner_statement_context','create_finance_draft']::text[],
    ARRAY['create_finance_candidate','request_approval']::text[],
    '{"staff_sessions":"durable_need_to_know","summaries":"restricted"}'::jsonb,
    '{"human_approval_required_for_all_external_outputs":true}'::jsonb,
    '{"primary":"fad_finance_default"}'::jsonb,
    '{"baseline_tokens":30000,"sensitive_context":true}'::jsonb,
    ARRAY['finance_privacy','financial_commitment_safety','tool_correctness']::text[],
    'planned'
  ),
  (
    'public_mcp',
    'Ask Friday Public MCP',
    'external_agent',
    'mcp',
    'public_api',
    '{"supported":["en"],"match_user_locale":false}'::jsonb,
    ARRAY['public_brand','public_residences','public_experiences','public_owner_overview']::text[],
    ARRAY['query_public_truth','search_residences','check_availability']::text[],
    ARRAY['request_booking','request_handoff']::text[],
    '{"anonymous":"session_only","durable":"disabled_until_policy_locked"}'::jsonb,
    '{"direct_write_tools":"disabled","approval_required":true}'::jsonb,
    '{"primary":"mcp_public_default"}'::jsonb,
    '{"baseline_tokens":20000}'::jsonb,
    ARRAY['mcp_public_safety','public_truth_grounding']::text[],
    'planned'
  ),
  (
    'internal_agent_bridge',
    'Ask Friday Internal Agent Bridge',
    'internal_agent',
    'codex',
    'internal',
    '{"supported":["en"],"match_user_locale":false}'::jsonb,
    ARRAY['approved_architecture','approved_runbooks','engineering_decisions']::text[],
    ARRAY['submit_sanitized_summary','query_approved_truth']::text[],
    ARRAY['create_kb_candidate','create_eval_candidate']::text[],
    '{"raw_transcripts":"not_ingested","summaries":"review_required"}'::jsonb,
    '{"human_review_required":true}'::jsonb,
    '{"primary":"internal_default"}'::jsonb,
    '{"baseline_tokens":25000}'::jsonb,
    ARRAY['internal_privacy','decision_provenance']::text[],
    'active'
  )
ON CONFLICT (tenant_id, surface_id) DO NOTHING;
