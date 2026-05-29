-- 111_ask_friday_active_runtime_context_pack_drafts.sql
--
-- Seed draft-only context packs for active FAD runtime Ask Friday surfaces.
-- These rows are review artifacts, not canonical published knowledge. The
-- insert is intentionally non-destructive: existing draft or published packs
-- for the same surface/version are preserved.

WITH source_refs AS (
  SELECT '[
    {
      "type":"repo_doc",
      "path":"docs/architecture/ask-friday-knowledge-harness-catalog-2026-05-26.md",
      "note":"Shared Ask Friday Core knowledge/harness catalog for active FAD runtime surfaces."
    },
    {
      "type":"repo_doc",
      "path":"docs/architecture/ask-friday-right-panel-focus-contract-2026-05-29.md",
      "note":"Global right-panel page-focus envelope and TeamInbox context boundary."
    },
    {
      "type":"runtime_kb",
      "path":"backend/knowledge/surfaces/inbox-drafts/SKILL.md",
      "note":"Inbox draft behavior and guest-message harness rules."
    },
    {
      "type":"runtime_kb",
      "path":"backend/knowledge/surfaces/inbox-advisory/SKILL.md",
      "note":"Inbox advisory behavior for review-only and operational guidance turns."
    },
    {
      "type":"runtime_kb",
      "path":"backend/knowledge/surfaces/ops-consult/SKILL.md",
      "note":"Ops Consult runtime KB alias used by fad_ops_assistant."
    }
  ]'::jsonb AS refs
),
drafts AS (
  SELECT
    'fad_global_ask_friday_v1_draft'::text AS pack_id,
    'fad_global_ask_friday'::text AS surface_id,
    ARRAY[
      'fad_live_context',
      'staff_inbox',
      'ops_tasks',
      'reservations',
      'properties',
      'hr_staff',
      'reviews',
      'design_projects'
    ]::text[] AS knowledge_scopes,
    '[
      {"id":"page_focus_first","priority":"must","rule":"Use the page-focus envelope and focused object as routing context before broad FAD summaries."},
      {"id":"team_inbox_evidence_boundary","priority":"must","rule":"TeamInbox messages are staff-only discussion evidence. Use them to understand team intent and blockers, but confirm operational truth against Inbox, Ops, Reservations, Properties, or the owning module before commitments."},
      {"id":"action_confirmation","priority":"must","rule":"Only suggest actions that are allowed by the current surface and require staff confirmation or approval for any high-risk mutation."},
      {"id":"source_status","priority":"must","rule":"Separate live, stale, missing, and unknown source states. Never treat fixture/demo data as production truth."}
    ]'::jsonb AS behavior_rules,
    '{
      "allowedTools":["load_fad_context","load_focused_inbox_thread","call_mcp_action_gateway"],
      "allowedActions":["navigate","create_task","send_team_message","request_approval"],
      "toolUse":"load_fad_context_before_cross_module_answer",
      "actionBoundary":"staff_confirmed_or_approval_routed"
    }'::jsonb AS tool_policy,
    '{
      "canonicalization":"human_review_required",
      "durableMemory":"kb_candidates_only",
      "rawTranscriptUse":"do_not_publish",
      "staffSessions":"client_history_only_v1",
      "runtimeStatus":"active_global_surface",
      "teamInboxContext":"staff_private_evidence_not_canonical_truth"
    }'::jsonb AS memory_policy,
    '{
      "contextPackClass":"fad_global_runtime_v1_draft",
      "includedContext":["page-focus envelope","live FAD module status","staff-only TeamInbox context when authorized","module surface routing and action suggestions"],
      "excludedContext":["public Website answers","unconfirmed production mutations","private staff workload in public contexts","raw secrets or payment data"],
      "reviewBlockersBeforePublish":["Review whether global Ask Friday should publish a staff context pack or remain draft-only until the unified right-panel UI lands."]
    }'::jsonb AS pack_payload
  UNION ALL
  SELECT
    'fad_consult_v1_draft',
    'fad_consult',
    ARRAY[
      'staff_inbox',
      'property_cards',
      'teachings',
      'ops_context',
      'guest_context',
      'approved_public_kb',
      'inbox-drafts',
      'inbox-advisory',
      'pending-actions',
      'learning-analyzer',
      'inquiry-followup'
    ]::text[],
    '[
      {"id":"latest_guest_turn","priority":"must","rule":"Use the latest guest/customer message and current channel/window state before drafting or advising."},
      {"id":"review_only_respected","priority":"must","rule":"If staff asks for review, critique, explanation, or no-draft behavior, do not create or update a draft."},
      {"id":"draft_requires_intent","priority":"must","rule":"Create or revise draft cards only when staff explicitly asks to draft, rewrite, polish, translate, or prepare a reply."},
      {"id":"human_send_boundary","priority":"must","rule":"Never send a guest/owner/staff message directly from model output. Produce draft, task, teaching, or approval candidates for human review."}
    ]'::jsonb,
    '{
      "allowedTools":["load_conversation","load_reservation","load_property","load_teachings","create_draft","create_task_candidate","load_pending_actions","load_action_feedback","load_website_handoff","load_reservation_context","load_calendar_context","load_property_context"],
      "allowedActions":["draft_reply","create_task","create_kb_candidate","request_approval","create_teaching_candidate","create_task_candidate"],
      "toolUse":"conversation_reservation_property_teachings_before_guest_reply",
      "actionBoundary":"draft_or_candidate_only_human_send_required"
    }'::jsonb,
    '{
      "canonicalization":"human_review_required",
      "durableMemory":"kb_candidates_only",
      "rawTranscriptUse":"do_not_publish",
      "staffSessions":"durable_team_visible",
      "runtimeStatus":"active_inbox_consult"
    }'::jsonb,
    '{
      "contextPackClass":"fad_consult_runtime_v1_draft",
      "includedContext":["guest conversation history","reservation and property context","approved teachings and pending actions","review-only versus draft intent boundary"],
      "excludedContext":["automatic external sends","unreviewed canonical learning","private staff workload in guest-facing drafts"],
      "reviewBlockersBeforePublish":["Review with staff whether draft/update intent rules match the final Inbox Consult UX after V2 design changes."]
    }'::jsonb
  UNION ALL
  SELECT
    'fad_ops_assistant_v1_draft',
    'fad_ops_assistant',
    ARRAY[
      'ops_tasks',
      'reservations',
      'properties',
      'staff_runbooks',
      'approved_public_kb',
      'ops-consult',
      'schedule_policy',
      'task_taxonomy',
      'property_ops_metadata',
      'owner_approval_rules',
      'vendor_policy',
      'supplies_policy'
    ]::text[],
    '[
      {"id":"visible_work_assignment","priority":"must","rule":"Planning output must not leave visible open work unassigned, untimed, or unreasoned when creating a schedule/roster draft."},
      {"id":"occupancy_constraint","priority":"must","rule":"Do not schedule non-urgent work during confirmed guest occupancy unless the guest requested it, it is urgent, or staff explicitly approves an exception."},
      {"id":"lunch_coverage","priority":"must","rule":"Protect a one-hour lunch/break window for field staff, ideally 12:00-13:00, with acceptable shifts to 11:00-12:00 or 13:00-14:00 when operations require it."},
      {"id":"availability_price_unknowns","priority":"must","rule":"Use reservation/calendar/property context for occupancy, availability, and pricing signals; state unknown cache gaps instead of pretending availability or price is proven."},
      {"id":"reversible_actions_first","priority":"must","rule":"Suggest reversible drafts before mutations. Applying a schedule must stay blocked when visible work would remain unsafe, unassigned, untimed, or in occupancy conflict."}
    ]'::jsonb,
    '{
      "allowedTools":["load_task","load_schedule","load_reservation","load_property","create_task_candidate","load_roster","load_reported_issue","load_travel_time_estimate","load_property_ops_metadata","load_reservation_context","load_calendar_context","load_property_context"],
      "allowedActions":["create_task","create_task_candidate","create_kb_candidate","request_approval","draft_schedule","apply_schedule_draft","clear_schedule_times","clear_times_and_assignees","undo_last_schedule_step","request_owner_approval"],
      "toolUse":"schedule_task_roster_reservation_property_context_before_ops_plan",
      "actionBoundary":"reversible_drafts_first_approval_for_risky_changes"
    }'::jsonb,
    '{
      "canonicalization":"human_review_required",
      "durableMemory":"kb_candidates_only",
      "rawTranscriptUse":"do_not_publish",
      "staffSessions":"durable_team_visible",
      "runtimeKnowledgeAlias":"ops-consult",
      "runtimeStatus":"active_ops_consult"
    }'::jsonb,
    '{
      "contextPackClass":"fad_ops_assistant_runtime_v1_draft",
      "includedContext":["open tasks and issue queues","schedule, roster, staff, travel, and property metadata","reservation/calendar occupancy overlays","availability/pricing unknown-cache caveats","lunch, fair assignment, and reversible planning rules"],
      "excludedContext":["direct Guesty/channel writes","irreversible task mutation without staff confirmation","private staff workload in public contexts"],
      "reviewBlockersBeforePublish":["Pair with Franny/Mary on real schedule and roster output before treating the pack as canonical."]
    }'::jsonb
)
INSERT INTO ask_friday_context_packs (
  tenant_id,
  pack_id,
  surface_id,
  version,
  status,
  knowledge_scopes,
  behavior_rules,
  tool_policy,
  memory_policy,
  source_snapshot_refs,
  pack_payload,
  approved_by,
  approved_at,
  published_at,
  updated_at
)
SELECT
  s.tenant_id,
  d.pack_id,
  d.surface_id,
  1,
  'draft',
  d.knowledge_scopes,
  d.behavior_rules,
  d.tool_policy,
  d.memory_policy,
  refs.refs,
  d.pack_payload,
  NULL,
  NULL,
  NULL,
  NOW()
FROM drafts d
JOIN ask_friday_surfaces s
  ON s.surface_id = d.surface_id
CROSS JOIN source_refs refs
ON CONFLICT (tenant_id, surface_id, version) DO NOTHING;
