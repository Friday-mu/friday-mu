-- 096_ask_friday_surface_registry_v02.sql
--
-- Ask Friday surface registry v0.2: align active FAD Consult/Ops
-- runtime surface keys with Core policy, and seed the next planned module
-- profiles as governed registry rows.

UPDATE ask_friday_surfaces
   SET allowed_knowledge_scopes = ARRAY(
         SELECT DISTINCT scope
           FROM unnest(allowed_knowledge_scopes || ARRAY[
             'inbox-drafts',
             'inbox-advisory',
             'pending-actions',
             'learning-analyzer',
             'inquiry-followup'
           ]::text[]) AS s(scope)
          ORDER BY scope
       ),
       allowed_tools = ARRAY(
         SELECT DISTINCT tool
           FROM unnest(allowed_tools || ARRAY[
             'load_pending_actions',
             'load_action_feedback',
             'load_website_handoff'
           ]::text[]) AS t(tool)
          ORDER BY tool
       ),
       allowed_actions = ARRAY(
         SELECT DISTINCT action
           FROM unnest(allowed_actions || ARRAY[
             'create_teaching_candidate',
             'create_task_candidate',
             'draft_reply'
           ]::text[]) AS a(action)
          ORDER BY action
       ),
       context_budget = context_budget || '{"recent_message_limit":80,"history_limit":120,"compact_retry":true}'::jsonb,
       updated_at = NOW()
 WHERE surface_id = 'fad_consult';

UPDATE ask_friday_surfaces
   SET allowed_knowledge_scopes = ARRAY(
         SELECT DISTINCT scope
           FROM unnest(allowed_knowledge_scopes || ARRAY[
             'ops-consult',
             'schedule_policy',
             'task_taxonomy',
             'property_ops_metadata',
             'owner_approval_rules',
             'vendor_policy',
             'supplies_policy'
           ]::text[]) AS s(scope)
          ORDER BY scope
       ),
       allowed_tools = ARRAY(
         SELECT DISTINCT tool
           FROM unnest(allowed_tools || ARRAY[
             'load_roster',
             'load_reported_issue',
             'load_travel_time_estimate',
             'load_property_ops_metadata'
           ]::text[]) AS t(tool)
          ORDER BY tool
       ),
       allowed_actions = ARRAY(
         SELECT DISTINCT action
           FROM unnest(allowed_actions || ARRAY[
             'draft_schedule',
             'apply_schedule_draft',
             'clear_schedule_times',
             'clear_times_and_assignees',
             'undo_last_schedule_step',
             'create_task_draft',
             'request_owner_approval'
           ]::text[]) AS a(action)
          ORDER BY action
       ),
       memory_policy = memory_policy || '{"runtimeKnowledgeAlias":"ops-consult"}'::jsonb,
       context_budget = context_budget || '{"visible_task_limit":220,"unscheduled_task_limit":120,"roster_staff_limit":80}'::jsonb,
       updated_at = NOW()
 WHERE surface_id = 'fad_ops_assistant';

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
    'fad_global_ask_friday',
    'Ask Friday Staff Command Surface',
    'staff',
    'fad',
    'staff',
    '{"supported":["en"],"match_conversation_locale":false}'::jsonb,
    ARRAY[
      'fad_live_context',
      'staff_inbox',
      'ops_tasks',
      'reservations',
      'properties',
      'hr_staff',
      'reviews',
      'design_projects'
    ]::text[],
    ARRAY[
      'load_fad_context',
      'load_focused_inbox_thread',
      'call_mcp_action_gateway'
    ]::text[],
    ARRAY[
      'navigate',
      'create_task',
      'send_team_message',
      'request_approval'
    ]::text[],
    '{"staff_sessions":"client_history_only_v1","server_session":"planned","summaries":"planned"}'::jsonb,
    '{"staff_click_required_for_actions":true,"approval_required_for_high_risk_actions":true}'::jsonb,
    '{"primary":"fad_ask_default","fallback":"fad_ask_auto"}'::jsonb,
    '{"history_turn_limit":8,"max_question_chars":1200}'::jsonb,
    ARRAY['fad_global_grounding','action_safety','data_truth','source_status_caveats']::text[],
    'active'
  ),
  (
    'fad_reservations_calendar_assistant',
    'Ask Friday Reservations And Calendar Assistant',
    'staff',
    'fad',
    'staff',
    '{"supported":["en","fr"],"match_conversation_locale":true}'::jsonb,
    ARRAY['reservations','calendar','availability','pricing_quote_policy','guest_inquiry_followup']::text[],
    ARRAY['load_reservation','load_calendar','check_availability','draft_quote']::text[],
    ARRAY['create_quote_draft','create_followup_candidate','request_handoff','request_approval']::text[],
    '{"staff_sessions":"staff_scoped","summaries":"allowed"}'::jsonb,
    '{"human_approval_required_for_external_send":true}'::jsonb,
    '{"primary":"fad_reservations_default","fallback":"fad_consult_compact"}'::jsonb,
    '{"recent_reservation_limit":120,"recent_calendar_days":60}'::jsonb,
    ARRAY['reservation_grounding','availability_safety','quote_grounding','handoff_correctness']::text[],
    'planned'
  ),
  (
    'fad_properties_assistant',
    'Ask Friday Properties Assistant',
    'staff',
    'fad',
    'staff',
    '{"supported":["en","fr"],"match_conversation_locale":true}'::jsonb,
    ARRAY['property_cards','public_residences','property_ops_notes','owner_rules','public_private_split']::text[],
    ARRAY['load_property','load_reservations_for_property','load_tasks_for_property']::text[],
    ARRAY['create_property_kb_candidate','request_property_update_approval']::text[],
    '{"property_scoped":"true","public_private_split":"required"}'::jsonb,
    '{"human_approval_required_for_public_property_updates":true}'::jsonb,
    '{"primary":"fad_properties_default","fallback":"fad_consult_compact"}'::jsonb,
    '{"property_context_limit":1,"recent_task_limit":80}'::jsonb,
    ARRAY['property_grounding','public_private_split','freshness_check']::text[],
    'planned'
  ),
  (
    'fad_legal_admin_assistant',
    'Ask Friday Legal And Admin Assistant',
    'restricted_staff',
    'fad',
    'restricted_staff',
    '{"supported":["en"],"match_conversation_locale":false}'::jsonb,
    ARRAY['legal_admin_policy','contracts','compliance_calendar','license_register','document_templates']::text[],
    ARRAY['load_contract_context','load_compliance_item','draft_document_request']::text[],
    ARRAY['create_legal_candidate','request_approval']::text[],
    '{"staff_sessions":"durable_need_to_know","summaries":"restricted"}'::jsonb,
    '{"human_approval_required_for_all_external_outputs":true}'::jsonb,
    '{"primary":"fad_legal_default"}'::jsonb,
    '{"baseline_tokens":30000,"sensitive_context":true}'::jsonb,
    ARRAY['legal_grounding','source_citation','external_commitment_safety']::text[],
    'planned'
  ),
  (
    'fad_hr_training_assistant',
    'Ask Friday HR And Training Assistant',
    'staff_manager',
    'fad',
    'staff',
    '{"supported":["en","fr"],"match_conversation_locale":true}'::jsonb,
    ARRAY['training','sops','role_guides','quality_rules']::text[],
    ARRAY['load_sop','load_training_progress','draft_training_task']::text[],
    ARRAY['create_training_task_candidate','create_sop_candidate','request_approval']::text[],
    '{"staff_sessions":"staff_scoped","private_hr_notes":"restricted"}'::jsonb,
    '{"human_approval_required_for_hr_sensitive_outputs":true}'::jsonb,
    '{"primary":"fad_training_default","fallback":"fad_consult_compact"}'::jsonb,
    '{"baseline_tokens":25000}'::jsonb,
    ARRAY['role_appropriate_guidance','hr_privacy','sop_grounding']::text[],
    'planned'
  ),
  (
    'fad_owners_assistant',
    'Ask Friday Owners Assistant',
    'restricted_staff',
    'fad',
    'restricted_staff',
    '{"supported":["en","fr"],"match_conversation_locale":true}'::jsonb,
    ARRAY['owner_records','owner_terms','owner_statement_rules','property_owner_context']::text[],
    ARRAY['load_owner','load_owner_properties','load_owner_statement_context']::text[],
    ARRAY['draft_owner_reply','create_owner_action_request','create_owner_kb_candidate','request_approval']::text[],
    '{"owner_scoped":"true","cross_owner_memory":"forbidden"}'::jsonb,
    '{"human_approval_required_for_external_owner_outputs":true}'::jsonb,
    '{"primary":"fad_owners_default","fallback":"fad_consult_compact"}'::jsonb,
    '{"baseline_tokens":30000,"sensitive_context":true}'::jsonb,
    ARRAY['owner_isolation','finance_privacy','owner_commitment_safety']::text[],
    'planned'
  ),
  (
    'fad_analytics_intelligence',
    'Ask Friday Analytics And Intelligence',
    'staff_manager',
    'fad',
    'staff',
    '{"supported":["en"],"match_conversation_locale":false}'::jsonb,
    ARRAY['aggregate_metrics','eval_results','learning_event_trends','module_metrics']::text[],
    ARRAY['query_aggregate_metrics','query_eval_runs','query_learning_candidates']::text[],
    ARRAY['create_report_candidate','create_eval_candidate','request_approval']::text[],
    '{"aggregate_preferred":"true","raw_pii_default":"excluded"}'::jsonb,
    '{"human_approval_required_for_public_or_owner_outputs":true}'::jsonb,
    '{"primary":"fad_analytics_default","fallback":"fad_consult_compact"}'::jsonb,
    '{"baseline_tokens":35000}'::jsonb,
    ARRAY['aggregation_correctness','privacy_redaction','source_date_caveats']::text[],
    'planned'
  ),
  (
    'guest_portal_ask_friday',
    'Ask Friday Guest Portal',
    'authenticated_guest',
    'friday-website',
    'authenticated_guest',
    '{"supported":["en","fr"],"match_user_locale":true}'::jsonb,
    ARRAY['guest_portal_public','stay_specific','property_guide','approved_mauritius','guest_support_rules']::text[],
    ARRAY['load_stay_context','load_property_guide','request_team_help']::text[],
    ARRAY['request_handoff','create_guest_support_request']::text[],
    '{"stay_token_scoped":"true","durable":"consent_or_terms_required"}'::jsonb,
    '{"handoff_target":"fad_website_inbox","human_takeover_stops_ai":true}'::jsonb,
    '{"primary":"guest_portal_default","fallback":"website_fallback"}'::jsonb,
    '{"baseline_tokens":30000,"compact_after_messages":32}'::jsonb,
    ARRAY['stay_context_isolation','handoff_correctness','guest_privacy']::text[],
    'planned'
  )
ON CONFLICT (tenant_id, surface_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  audience = EXCLUDED.audience,
  source_system = EXCLUDED.source_system,
  access_class = EXCLUDED.access_class,
  locale_policy = EXCLUDED.locale_policy,
  allowed_knowledge_scopes = EXCLUDED.allowed_knowledge_scopes,
  allowed_tools = EXCLUDED.allowed_tools,
  allowed_actions = EXCLUDED.allowed_actions,
  memory_policy = EXCLUDED.memory_policy,
  handoff_policy = EXCLUDED.handoff_policy,
  model_policy = EXCLUDED.model_policy,
  context_budget = EXCLUDED.context_budget,
  eval_suite_ids = EXCLUDED.eval_suite_ids,
  status = EXCLUDED.status,
  updated_at = NOW();

UPDATE ask_friday_surfaces
   SET allowed_tools = ARRAY(
         SELECT DISTINCT tool
           FROM unnest(allowed_tools || ARRAY[
             'get_residence_lowest_rate',
             'list_experiences'
           ]::text[]) AS t(tool)
          ORDER BY tool
       ),
       allowed_actions = ARRAY(
         SELECT DISTINCT action
           FROM unnest(allowed_actions || ARRAY[
             'send_general_enquiry',
             'submit_owner_enquiry'
           ]::text[]) AS a(action)
          ORDER BY action
       ),
       updated_at = NOW()
 WHERE surface_id = 'public_mcp';
