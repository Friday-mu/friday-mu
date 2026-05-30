-- 112_ask_friday_plan2_context_pack_drafts.sql
--
-- Seed draft-only context packs for Plan 2 Ask Friday staff shells.
-- Reservations/Calendar and Properties are active governed Core shells;
-- Owners remains a planned shell. These rows are review artifacts only:
-- they are not public-readable, not canonical, and do not enable direct
-- Guesty/channel/property writes.
--
-- The insert is intentionally non-destructive: existing draft or published
-- packs for the same surface/version are preserved.

WITH source_refs AS (
  SELECT '[
    {
      "type":"repo_doc",
      "path":"docs/architecture/ask-friday-plan2-research-wave1-2026-05-29.md",
      "note":"Plan 2 source matrix for reservations/calendar, properties, Ops, Website public, owner enquiry, and local context."
    },
    {
      "type":"repo_doc",
      "path":"docs/architecture/ask-friday-reservations-properties-source-matrix-2026-05-28.md",
      "note":"Reservations/Calendar and Properties source ownership, Guesty/FAD/Breezeway boundaries, and first tool implications."
    },
    {
      "type":"repo_doc",
      "path":"docs/architecture/ask-friday-reservation-property-tool-contracts-2026-05-28.md",
      "note":"Read-only context tool contracts and approval-routed reservation action request contract."
    },
    {
      "type":"repo_doc",
      "path":"docs/architecture/ask-friday-property-field-classification-2026-05-29.md",
      "note":"Property public, guest-scoped, owner-scoped, staff-private, and restricted field classification draft."
    },
    {
      "type":"repo_doc",
      "path":"docs/architecture/ask-friday-owner-positioning-source-matrix-2026-05-29.md",
      "note":"Staff-private owner-positioning source matrix and assumptions needing Ishant review."
    }
  ]'::jsonb AS refs
),
drafts AS (
  SELECT
    'fad_reservations_calendar_assistant_v1_draft'::text AS pack_id,
    'fad_reservations_calendar_assistant'::text AS surface_id,
    ARRAY[
      'reservations-calendar',
      'reservations',
      'calendar',
      'availability',
      'pricing_quote_policy',
      'channel_write_policy',
      'guest_inquiry_followup'
    ]::text[] AS knowledge_scopes,
    '[
      {"id":"source_freshness","priority":"must","rule":"Load source-dated reservation, calendar, availability, pricing, and property context before advising on quotes, blocks, date changes, or occupancy-sensitive work."},
      {"id":"write_through_boundary","priority":"must","rule":"Never claim a channel-visible booking, block, date change, or OTA change is completed unless an approved Guesty/channel-manager write-through has actually succeeded."},
      {"id":"approval_routing","priority":"must","rule":"Quotes, reservation mutations, channel-visible blocks, and guest follow-up drafts must be queued as approval-routed action requests before any external effect."},
      {"id":"ops_occupancy_alignment","priority":"must","rule":"When reservation/calendar context affects Ops planning, identify in-house stays, arrivals, checkouts, and unknown cache gaps rather than treating missing data as free availability."}
    ]'::jsonb AS behavior_rules,
    '{
      "allowedTools":["load_reservation_context","load_calendar_context","load_property_context"],
      "allowedActions":["request_booking_quote","request_reservation_mutation","request_channel_visible_block","request_reservation_action","create_quote_draft","create_followup_candidate","request_handoff","request_approval"],
      "toolUse":"fresh_read_before_quote_or_mutation",
      "actionBoundary":"approval_routed_only_no_direct_external_write"
    }'::jsonb AS tool_policy,
    '{
      "staffSessions":"staff_scoped",
      "durableMemory":"approved_canonical_only",
      "evidenceTraces":"staff_private",
      "canonicalization":"human_review_required_before_context_pack_publish",
      "runtimeNote":"Reservations/Calendar shell is governed by Ask Friday Core; model output cannot update production truth directly."
    }'::jsonb AS memory_policy,
    '{
      "contextPackClass":"staff_reservations_calendar_shell_v1_draft",
      "includedContext":["Guesty/FAD reservation snapshots","Guesty/FAD calendar blocks and cache freshness","source-dated availability and pricing caveats","approval-routed quote, block, and reservation mutation boundaries"],
      "excludedContext":["direct Guesty mutation","direct OTA/channel block execution","payment collection","unstamped pricing commitments"],
      "reviewBlockersBeforePublish":["Confirm Guesty/channel-manager write-through policy for direct reservations, blocks, and date changes.","Confirm quote expiry and validity wording before staff-visible quote drafts become canonical."]
    }'::jsonb AS pack_payload
  UNION ALL
  SELECT
    'fad_properties_assistant_v1_draft',
    'fad_properties_assistant',
    ARRAY[
      'properties-assistant',
      'property_cards',
      'public_residences',
      'property_ops_notes',
      'public_private_split',
      'property_field_classification',
      'property_source_conflicts'
    ]::text[],
    '[
      {"id":"field_classification","priority":"must","rule":"Classify property facts as public, guest-scoped, owner-scoped, staff-private, or restricted before using them in any answer or context pack."},
      {"id":"source_conflict_candidate","priority":"must","rule":"When Guesty, FAD cards, Website public data, Breezeway, or staff evidence disagree, create a property KB candidate with evidence instead of rewriting canonical truth automatically."},
      {"id":"privacy_boundary","priority":"must","rule":"Never expose access codes, exact private addresses, owner terms, staff workload, maintenance notes, guest-sensitive data, or restricted finance/legal facts outside their allowed audience."}
    ]'::jsonb,
    '{
      "allowedTools":["load_property_context","load_reservation_context","load_calendar_context"],
      "allowedActions":["create_property_kb_candidate","request_property_update_approval","request_approval"],
      "toolUse":"property_context_read_before_property_truth_claim",
      "actionBoundary":"kb_candidate_or_approval_request_only"
    }'::jsonb,
    '{
      "staffSessions":"staff_scoped",
      "durableMemory":"approved_canonical_only",
      "evidenceTraces":"staff_private",
      "canonicalization":"human_review_required_before_context_pack_publish",
      "runtimeNote":"Properties shell is governed by Ask Friday Core; model output cannot update production truth directly."
    }'::jsonb,
    '{
      "contextPackClass":"staff_properties_shell_v1_draft",
      "includedContext":["property source ownership","public/private property field classification","property card and listing conflict handling","approval-gated public property updates"],
      "excludedContext":["automatic public listing rewrites","unreviewed property-card data in public packs","access secrets or guest-sensitive stay data"],
      "reviewBlockersBeforePublish":["Ishant review of public, guest-scoped, owner-scoped, staff-private, and restricted property field classes.","Confirm which source wins for common Guesty/FAD/Website/Breezeway property conflicts."]
    }'::jsonb
  UNION ALL
  SELECT
    'fad_owners_assistant_v1_draft',
    'fad_owners_assistant',
    ARRAY[
      'owner-enquiry',
      'owner_records',
      'owner_terms',
      'owner_statement_rules',
      'property_owner_context',
      'owner_qualification',
      'owner_positioning_safety'
    ]::text[],
    '[
      {"id":"planned_shell_only","priority":"must","rule":"This is a planned staff-private shell, not an active owner-facing runtime surface."},
      {"id":"no_cross_owner_memory","priority":"must","rule":"Owner context and memory must stay scoped to the authorized owner/property and must not bleed across owners."},
      {"id":"source_dated_positioning","priority":"must","rule":"Market stats, competitor claims, revenue guidance, tax/legal handling, and owner package wording must be source-dated or routed to team review."}
    ]'::jsonb,
    '{
      "allowedTools":["load_owner","load_owner_properties","load_owner_statement_context"],
      "allowedActions":["draft_owner_reply","create_owner_action_request","create_owner_kb_candidate","request_approval"],
      "toolUse":"owner_scope_required_before_private_owner_context",
      "actionBoundary":"staff_private_draft_or_candidate_only"
    }'::jsonb,
    '{
      "staffSessions":"staff_scoped",
      "durableMemory":"approved_canonical_only",
      "evidenceTraces":"staff_private",
      "canonicalization":"human_review_required_before_context_pack_publish",
      "runtimeNote":"Owners shell is governed by Ask Friday Core; model output cannot update production truth directly.",
      "crossOwnerMemory":"forbidden",
      "runtimeStatus":"planned_shell"
    }'::jsonb,
    '{
      "contextPackClass":"staff_owner_enquiry_shell_v1_draft",
      "includedContext":["owner enquiry qualification","staff-private owner positioning assumptions","owner memory isolation boundary"],
      "excludedContext":["public owner commitments","cross-owner memory","unreviewed revenue guarantees","final legal or tax advice"],
      "reviewBlockersBeforePublish":["Ishant review of owner-private rules, retention, consent, and owner-facing positioning.","Confirm owner estimate and competitor-claim wording before owner-facing runtime use."]
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
