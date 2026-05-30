'use strict';

const WEBSITE_PUBLIC_SOURCE_REFS = [
  {
    type: 'repo_doc',
    path: 'docs/architecture/ask-friday-public-owner-feedback-contracts-2026-05-28.md',
    note: 'Website consumes published public context packs and keeps local fallback behavior.',
  },
  {
    type: 'repo_doc',
    path: 'docs/architecture/ask-friday-website-owner-feedback-source-matrix-2026-05-28.md',
    note: 'Public Website surfaces are source-mapped; public property fields still require review before rich packs.',
  },
  {
    type: 'surface_registry',
    path: 'backend/migrations/074_ask_friday_core.sql',
    note: 'Initial Website public surface registry.',
  },
  {
    type: 'surface_registry',
    path: 'backend/migrations/104_ask_friday_website_public_core_scopes.sql',
    note: 'Website public Core scopes and real Website tool names.',
  },
];

const WEBSITE_TOOL_ALLOWLIST = [
  'route_intent',
  'search_residences',
  'search_experiences',
  'check_availability',
  'get_residence',
  'get_experience',
  'search_journal',
  'search_places',
  'send_enquiry',
  'open_experience_modal',
];

const WEBSITE_GUEST_HERO_TOOL_ALLOWLIST = WEBSITE_TOOL_ALLOWLIST.filter(
  (toolName) => toolName !== 'search_journal',
);

const WEBSITE_ASK_FRIDAY_FAB_TOOL_ALLOWLIST = WEBSITE_TOOL_ALLOWLIST;

const PLAN2_STAFF_SOURCE_REFS = [
  {
    type: 'repo_doc',
    path: 'docs/architecture/ask-friday-plan2-research-wave1-2026-05-29.md',
    note: 'Plan 2 source matrix for reservations/calendar, properties, Ops, Website public, owner enquiry, and local context.',
  },
  {
    type: 'repo_doc',
    path: 'docs/architecture/ask-friday-reservations-properties-source-matrix-2026-05-28.md',
    note: 'Reservations/Calendar and Properties source ownership, Guesty/FAD/Breezeway boundaries, and first tool implications.',
  },
  {
    type: 'repo_doc',
    path: 'docs/architecture/ask-friday-reservation-property-tool-contracts-2026-05-28.md',
    note: 'Read-only context tool contracts and approval-routed reservation action request contract.',
  },
  {
    type: 'repo_doc',
    path: 'docs/architecture/ask-friday-property-field-classification-2026-05-29.md',
    note: 'Property public, guest-scoped, owner-scoped, staff-private, and restricted field classification draft.',
  },
  {
    type: 'repo_doc',
    path: 'docs/architecture/ask-friday-owner-positioning-source-matrix-2026-05-29.md',
    note: 'Staff-private owner-positioning source matrix and assumptions needing Ishant review.',
  },
];

const FAD_RUNTIME_SOURCE_REFS = [
  {
    type: 'repo_doc',
    path: 'docs/architecture/ask-friday-knowledge-harness-catalog-2026-05-26.md',
    note: 'Shared Ask Friday Core knowledge/harness catalog for active FAD runtime surfaces.',
  },
  {
    type: 'repo_doc',
    path: 'docs/architecture/ask-friday-right-panel-focus-contract-2026-05-29.md',
    note: 'Global right-panel page-focus envelope and TeamInbox context boundary.',
  },
  {
    type: 'runtime_kb',
    path: 'backend/knowledge/surfaces/inbox-drafts/SKILL.md',
    note: 'Inbox draft behavior and guest-message harness rules.',
  },
  {
    type: 'runtime_kb',
    path: 'backend/knowledge/surfaces/inbox-advisory/SKILL.md',
    note: 'Inbox advisory behavior for review-only and operational guidance turns.',
  },
  {
    type: 'runtime_kb',
    path: 'backend/knowledge/surfaces/ops-consult/SKILL.md',
    note: 'Ops Consult runtime KB alias used by fad_ops_assistant.',
  },
];

const FAD_GLOBAL_TOOL_ALLOWLIST = [
  'load_fad_context',
  'load_focused_inbox_thread',
  'call_mcp_action_gateway',
];

const FAD_GLOBAL_ACTION_ALLOWLIST = [
  'navigate',
  'create_task',
  'send_team_message',
  'request_approval',
];

const FAD_CONSULT_TOOL_ALLOWLIST = [
  'load_conversation',
  'load_reservation',
  'load_property',
  'load_teachings',
  'create_draft',
  'create_task_candidate',
  'load_pending_actions',
  'load_action_feedback',
  'load_website_handoff',
  'load_reservation_context',
  'load_calendar_context',
  'load_property_context',
];

const FAD_CONSULT_ACTION_ALLOWLIST = [
  'draft_reply',
  'create_task',
  'create_kb_candidate',
  'request_approval',
  'create_teaching_candidate',
  'create_task_candidate',
];

const OPS_ASSISTANT_TOOL_ALLOWLIST = [
  'load_task',
  'load_schedule',
  'load_reservation',
  'load_property',
  'create_task_candidate',
  'load_roster',
  'load_reported_issue',
  'load_travel_time_estimate',
  'load_property_ops_metadata',
  'load_reservation_context',
  'load_calendar_context',
  'load_property_context',
];

const OPS_ASSISTANT_ACTION_ALLOWLIST = [
  'create_task',
  'create_task_candidate',
  'create_kb_candidate',
  'request_approval',
  'draft_schedule',
  'apply_schedule_draft',
  'clear_schedule_times',
  'clear_times_and_assignees',
  'undo_last_schedule_step',
  'request_owner_approval',
];

const RESERVATIONS_CALENDAR_TOOL_ALLOWLIST = [
  'load_reservation_context',
  'load_calendar_context',
  'load_property_context',
];

const RESERVATIONS_CALENDAR_ACTION_ALLOWLIST = [
  'request_booking_quote',
  'request_reservation_mutation',
  'request_channel_visible_block',
  'request_reservation_action',
  'create_quote_draft',
  'create_followup_candidate',
  'request_handoff',
  'request_approval',
];

const PROPERTIES_ASSISTANT_TOOL_ALLOWLIST = [
  'load_property_context',
  'load_reservation_context',
  'load_calendar_context',
];

const PROPERTIES_ASSISTANT_ACTION_ALLOWLIST = [
  'create_property_kb_candidate',
  'request_property_update_approval',
  'request_approval',
];

const OWNER_ENQUIRY_TOOL_ALLOWLIST = [
  'load_owner',
  'load_owner_properties',
  'load_owner_statement_context',
];

const OWNER_ENQUIRY_ACTION_ALLOWLIST = [
  'draft_owner_reply',
  'create_owner_action_request',
  'create_owner_kb_candidate',
  'request_approval',
];

const FINANCE_ASSISTANT_TOOL_ALLOWLIST = [
  'load_finance_summary',
  'load_owner_statement_context',
  'create_finance_draft',
];

const FINANCE_ASSISTANT_ACTION_ALLOWLIST = [
  'create_finance_candidate',
  'request_approval',
];

const LEGAL_ADMIN_TOOL_ALLOWLIST = [
  'load_contract_context',
  'load_compliance_item',
  'draft_document_request',
];

const LEGAL_ADMIN_ACTION_ALLOWLIST = [
  'create_legal_candidate',
  'request_approval',
];

const HR_TRAINING_TOOL_ALLOWLIST = [
  'load_sop',
  'load_training_progress',
  'draft_training_task',
];

const HR_TRAINING_ACTION_ALLOWLIST = [
  'create_training_task_candidate',
  'create_sop_candidate',
  'request_approval',
];

const ANALYTICS_INTELLIGENCE_TOOL_ALLOWLIST = [
  'query_aggregate_metrics',
  'query_eval_runs',
  'query_learning_candidates',
];

const ANALYTICS_INTELLIGENCE_ACTION_ALLOWLIST = [
  'create_report_candidate',
  'create_eval_candidate',
  'request_approval',
];

const GUEST_PORTAL_TOOL_ALLOWLIST = [
  'load_stay_context',
  'load_property_guide',
  'request_team_help',
];

const GUEST_PORTAL_ACTION_ALLOWLIST = [
  'request_handoff',
  'create_guest_support_request',
];

const PUBLIC_MCP_TOOL_ALLOWLIST = [
  'check_availability',
  'get_residence_lowest_rate',
  'list_experiences',
  'query_public_truth',
  'search_residences',
];

const PUBLIC_MCP_ACTION_ALLOWLIST = [
  'request_booking',
  'request_handoff',
  'send_general_enquiry',
  'submit_owner_enquiry',
];

const INTERNAL_AGENT_BRIDGE_TOOL_ALLOWLIST = [
  'submit_sanitized_summary',
  'query_approved_truth',
];

const INTERNAL_AGENT_BRIDGE_ACTION_ALLOWLIST = [
  'create_kb_candidate',
  'create_eval_candidate',
];

function commonWebsiteBehaviorRules(surfaceLabel) {
  return [
    {
      id: 'public_scope_only',
      priority: 'must',
      rule: `${surfaceLabel} may use public Friday website context, public residence/experience data, and approved public Mauritius guidance only.`,
    },
    {
      id: 'live_lookup_for_dynamic_facts',
      priority: 'must',
      rule: 'Use live tools for availability, rates, residence details, experience details, and place/search results. Do not invent prices, dates, capacity, amenities, policies, or booking status.',
    },
    {
      id: 'handoff_for_commitments',
      priority: 'must',
      rule: 'For booking commitments, special requests, exceptions, complaints, owner leads, or anything requiring staff action, create an enquiry or handoff request rather than promising completion.',
    },
    {
      id: 'source_or_handoff_for_policy_claims',
      priority: 'must',
      rule: 'Do not make OTA, channel, legal, tax, payment, cancellation, or platform-policy commitments unless grounded in approved source-dated context or a live tool result; hand off if uncertain.',
    },
    {
      id: 'takeover_respect',
      priority: 'must',
      rule: 'If a human takeover or aiMayReply:false state is active, Website AI must stop replying and route follow-ups through the approved FAD handoff path.',
    },
    {
      id: 'privacy_boundary',
      priority: 'must',
      rule: 'Never expose staff workload, owner-private data, guest-sensitive data, payment data, secrets, internal notes, or restricted operational details on public Website surfaces.',
    },
    {
      id: 'brand_tone',
      priority: 'should',
      rule: 'Be concise, warm, practical, and specific. Prefer useful next steps over broad marketing copy.',
    },
  ];
}

function commonWebsiteMemoryPolicy() {
  return {
    anonymous: 'session_only',
    durable: 'authenticated_or_explicit_consent',
    crossSurface: 'allowed_only_for_authenticated_or_consented_identity',
    publicLearning: 'emit_redacted_events_only',
    canonicalization: 'human_review_required_before_public_context_pack_publish',
  };
}

function commonWebsitePayload(surfaceId) {
  return {
    surfaceId,
    contextPackClass: 'public_website_v1_draft',
    statusNote: 'Draft-only review artifact. Do not publish until public property fields and owner/public wording are accepted.',
    includedContext: [
      'public Friday brand and service boundaries',
      'public residence and experience discovery behavior',
      'public Mauritius/local guidance through live or source-dated tools',
      'handoff and enquiry rules',
      'privacy and takeover boundaries',
    ],
    excludedContext: [
      'owner-private data',
      'staff workload or private operations notes',
      'guest-sensitive data',
      'payment data',
      'raw feedback screenshots or diagnostics',
      'unreviewed property-card content',
    ],
    freshnessRules: [
      'Availability, rates, property detail, experience detail, and enquiry actions must be live-tool grounded.',
      'Static public context should be reviewed when Website/FAD public APIs or Friday public positioning changes.',
      'Legal, tax, payment, cancellation, owner, and platform-policy details need source dates or staff handoff.',
    ],
    reviewBlockersBeforePublish: [
      'Ishant review of exact public property fields allowed in Website context packs.',
      'Ishant review of public owner/package wording before owner-facing packs are published.',
    ],
  };
}

function commonStaffShellMemoryPolicy(surfaceLabel) {
  return {
    staffSessions: 'staff_scoped',
    durableMemory: 'approved_canonical_only',
    evidenceTraces: 'staff_private',
    canonicalization: 'human_review_required_before_context_pack_publish',
    runtimeNote: `${surfaceLabel} shell is governed by Ask Friday Core; model output cannot update production truth directly.`,
  };
}

function fadGlobalAskFridayDraft({ version = 1 } = {}) {
  return {
    packId: `fad_global_ask_friday_v${version}_draft`,
    surfaceId: 'fad_global_ask_friday',
    version,
    status: 'draft',
    knowledgeScopes: [
      'fad_live_context',
      'staff_inbox',
      'ops_tasks',
      'reservations',
      'properties',
      'hr_staff',
      'reviews',
      'design_projects',
    ],
    behaviorRules: [
      {
        id: 'page_focus_first',
        priority: 'must',
        rule: 'Use the page-focus envelope and focused object as routing context before broad FAD summaries.',
      },
      {
        id: 'team_inbox_evidence_boundary',
        priority: 'must',
        rule: 'TeamInbox messages are staff-only discussion evidence. Use them to understand team intent and blockers, but confirm operational truth against Inbox, Ops, Reservations, Properties, or the owning module before commitments.',
      },
      {
        id: 'action_confirmation',
        priority: 'must',
        rule: 'Only suggest actions that are allowed by the current surface and require staff confirmation or approval for any high-risk mutation.',
      },
      {
        id: 'source_status',
        priority: 'must',
        rule: 'Separate live, stale, missing, and unknown source states. Never treat fixture/demo data as production truth.',
      },
    ],
    toolPolicy: {
      allowedTools: FAD_GLOBAL_TOOL_ALLOWLIST,
      allowedActions: FAD_GLOBAL_ACTION_ALLOWLIST,
      toolUse: 'load_fad_context_before_cross_module_answer',
      actionBoundary: 'staff_confirmed_or_approval_routed',
    },
    memoryPolicy: {
      ...commonStaffShellMemoryPolicy('Global FAD Ask Friday'),
      staffSessions: 'client_history_only_v1',
      runtimeStatus: 'active_global_surface',
      teamInboxContext: 'staff_private_evidence_not_canonical_truth',
    },
    sourceSnapshotRefs: FAD_RUNTIME_SOURCE_REFS,
    packPayload: {
      contextPackClass: 'fad_global_runtime_v1_draft',
      includedContext: [
        'page-focus envelope',
        'live FAD module status',
        'staff-only TeamInbox context when authorized',
        'module surface routing and action suggestions',
      ],
      excludedContext: [
        'public Website answers',
        'unconfirmed production mutations',
        'private staff workload in public contexts',
        'raw secrets or payment data',
      ],
      reviewBlockersBeforePublish: [
        'Review whether global Ask Friday should publish a staff context pack or remain draft-only until the unified right-panel UI lands.',
      ],
    },
  };
}

function fadConsultDraft({ version = 1 } = {}) {
  return {
    packId: `fad_consult_v${version}_draft`,
    surfaceId: 'fad_consult',
    version,
    status: 'draft',
    knowledgeScopes: [
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
      'inquiry-followup',
    ],
    behaviorRules: [
      {
        id: 'latest_guest_turn',
        priority: 'must',
        rule: 'Use the latest guest/customer message and current channel/window state before drafting or advising.',
      },
      {
        id: 'review_only_respected',
        priority: 'must',
        rule: 'If staff asks for review, critique, explanation, or no-draft behavior, do not create or update a draft.',
      },
      {
        id: 'draft_requires_intent',
        priority: 'must',
        rule: 'Create or revise draft cards only when staff explicitly asks to draft, rewrite, polish, translate, or prepare a reply.',
      },
      {
        id: 'human_send_boundary',
        priority: 'must',
        rule: 'Never send a guest/owner/staff message directly from model output. Produce draft, task, teaching, or approval candidates for human review.',
      },
    ],
    toolPolicy: {
      allowedTools: FAD_CONSULT_TOOL_ALLOWLIST,
      allowedActions: FAD_CONSULT_ACTION_ALLOWLIST,
      toolUse: 'conversation_reservation_property_teachings_before_guest_reply',
      actionBoundary: 'draft_or_candidate_only_human_send_required',
    },
    memoryPolicy: {
      ...commonStaffShellMemoryPolicy('Inbox Friday Consult'),
      staffSessions: 'durable_team_visible',
      runtimeStatus: 'active_inbox_consult',
    },
    sourceSnapshotRefs: FAD_RUNTIME_SOURCE_REFS,
    packPayload: {
      contextPackClass: 'fad_consult_runtime_v1_draft',
      includedContext: [
        'guest conversation history',
        'reservation and property context',
        'approved teachings and pending actions',
        'review-only versus draft intent boundary',
      ],
      excludedContext: [
        'automatic external sends',
        'unreviewed canonical learning',
        'private staff workload in guest-facing drafts',
      ],
      reviewBlockersBeforePublish: [
        'Review with staff whether draft/update intent rules match the final Inbox Consult UX after V2 design changes.',
      ],
    },
  };
}

function opsAssistantDraft({ version = 1 } = {}) {
  return {
    packId: `fad_ops_assistant_v${version}_draft`,
    surfaceId: 'fad_ops_assistant',
    version,
    status: 'draft',
    knowledgeScopes: [
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
      'supplies_policy',
    ],
    behaviorRules: [
      {
        id: 'visible_work_assignment',
        priority: 'must',
        rule: 'Planning output must not leave visible open work unassigned, untimed, or unreasoned when creating a schedule/roster draft.',
      },
      {
        id: 'occupancy_constraint',
        priority: 'must',
        rule: 'Do not schedule non-urgent work during confirmed guest occupancy unless the guest requested it, it is urgent, or staff explicitly approves an exception.',
      },
      {
        id: 'lunch_coverage',
        priority: 'must',
        rule: 'Protect a one-hour lunch/break window for field staff, ideally 12:00-13:00, with acceptable shifts to 11:00-12:00 or 13:00-14:00 when operations require it.',
      },
      {
        id: 'availability_price_unknowns',
        priority: 'must',
        rule: 'Use reservation/calendar/property context for occupancy, availability, and pricing signals; state unknown cache gaps instead of pretending availability or price is proven.',
      },
      {
        id: 'reversible_actions_first',
        priority: 'must',
        rule: 'Suggest reversible drafts before mutations. Applying a schedule must stay blocked when visible work would remain unsafe, unassigned, untimed, or in occupancy conflict.',
      },
    ],
    toolPolicy: {
      allowedTools: OPS_ASSISTANT_TOOL_ALLOWLIST,
      allowedActions: OPS_ASSISTANT_ACTION_ALLOWLIST,
      toolUse: 'schedule_task_roster_reservation_property_context_before_ops_plan',
      actionBoundary: 'reversible_drafts_first_approval_for_risky_changes',
    },
    memoryPolicy: {
      ...commonStaffShellMemoryPolicy('Ops Assistant'),
      staffSessions: 'durable_team_visible',
      runtimeKnowledgeAlias: 'ops-consult',
      runtimeStatus: 'active_ops_consult',
    },
    sourceSnapshotRefs: FAD_RUNTIME_SOURCE_REFS,
    packPayload: {
      contextPackClass: 'fad_ops_assistant_runtime_v1_draft',
      includedContext: [
        'open tasks and issue queues',
        'schedule, roster, staff, travel, and property metadata',
        'reservation/calendar occupancy overlays',
        'availability/pricing unknown-cache caveats',
        'lunch, fair assignment, and reversible planning rules',
      ],
      excludedContext: [
        'direct Guesty/channel writes',
        'irreversible task mutation without staff confirmation',
        'private staff workload in public contexts',
      ],
      reviewBlockersBeforePublish: [
        'Pair with Franny/Mary on real schedule and roster output before treating the pack as canonical.',
      ],
    },
  };
}

function reservationsCalendarDraft({ version = 1 } = {}) {
  return {
    packId: `fad_reservations_calendar_assistant_v${version}_draft`,
    surfaceId: 'fad_reservations_calendar_assistant',
    version,
    status: 'draft',
    knowledgeScopes: [
      'reservations-calendar',
      'reservations',
      'calendar',
      'availability',
      'pricing_quote_policy',
      'channel_write_policy',
      'guest_inquiry_followup',
    ],
    behaviorRules: [
      {
        id: 'source_freshness',
        priority: 'must',
        rule: 'Load source-dated reservation, calendar, availability, pricing, and property context before advising on quotes, blocks, date changes, or occupancy-sensitive work.',
      },
      {
        id: 'write_through_boundary',
        priority: 'must',
        rule: 'Never claim a channel-visible booking, block, date change, or OTA change is completed unless an approved Guesty/channel-manager write-through has actually succeeded.',
      },
      {
        id: 'approval_routing',
        priority: 'must',
        rule: 'Quotes, reservation mutations, channel-visible blocks, and guest follow-up drafts must be queued as approval-routed action requests before any external effect.',
      },
      {
        id: 'ops_occupancy_alignment',
        priority: 'must',
        rule: 'When reservation/calendar context affects Ops planning, identify in-house stays, arrivals, checkouts, and unknown cache gaps rather than treating missing data as free availability.',
      },
    ],
    toolPolicy: {
      allowedTools: RESERVATIONS_CALENDAR_TOOL_ALLOWLIST,
      allowedActions: RESERVATIONS_CALENDAR_ACTION_ALLOWLIST,
      toolUse: 'fresh_read_before_quote_or_mutation',
      actionBoundary: 'approval_routed_only_no_direct_external_write',
    },
    memoryPolicy: commonStaffShellMemoryPolicy('Reservations/Calendar'),
    sourceSnapshotRefs: PLAN2_STAFF_SOURCE_REFS,
    packPayload: {
      contextPackClass: 'staff_reservations_calendar_shell_v1_draft',
      includedContext: [
        'Guesty/FAD reservation snapshots',
        'Guesty/FAD calendar blocks and cache freshness',
        'source-dated availability and pricing caveats',
        'approval-routed quote, block, and reservation mutation boundaries',
      ],
      excludedContext: [
        'direct Guesty mutation',
        'direct OTA/channel block execution',
        'payment collection',
        'unstamped pricing commitments',
      ],
      reviewBlockersBeforePublish: [
        'Confirm Guesty/channel-manager write-through policy for direct reservations, blocks, and date changes.',
        'Confirm quote expiry and validity wording before staff-visible quote drafts become canonical.',
      ],
    },
  };
}

function propertiesAssistantDraft({ version = 1 } = {}) {
  return {
    packId: `fad_properties_assistant_v${version}_draft`,
    surfaceId: 'fad_properties_assistant',
    version,
    status: 'draft',
    knowledgeScopes: [
      'properties-assistant',
      'property_cards',
      'public_residences',
      'property_ops_notes',
      'public_private_split',
      'property_field_classification',
      'property_source_conflicts',
    ],
    behaviorRules: [
      {
        id: 'field_classification',
        priority: 'must',
        rule: 'Classify property facts as public, guest-scoped, owner-scoped, staff-private, or restricted before using them in any answer or context pack.',
      },
      {
        id: 'source_conflict_candidate',
        priority: 'must',
        rule: 'When Guesty, FAD cards, Website public data, Breezeway, or staff evidence disagree, create a property KB candidate with evidence instead of rewriting canonical truth automatically.',
      },
      {
        id: 'privacy_boundary',
        priority: 'must',
        rule: 'Never expose access codes, exact private addresses, owner terms, staff workload, maintenance notes, guest-sensitive data, or restricted finance/legal facts outside their allowed audience.',
      },
    ],
    toolPolicy: {
      allowedTools: PROPERTIES_ASSISTANT_TOOL_ALLOWLIST,
      allowedActions: PROPERTIES_ASSISTANT_ACTION_ALLOWLIST,
      toolUse: 'property_context_read_before_property_truth_claim',
      actionBoundary: 'kb_candidate_or_approval_request_only',
    },
    memoryPolicy: commonStaffShellMemoryPolicy('Properties'),
    sourceSnapshotRefs: PLAN2_STAFF_SOURCE_REFS,
    packPayload: {
      contextPackClass: 'staff_properties_shell_v1_draft',
      includedContext: [
        'property source ownership',
        'public/private property field classification',
        'property card and listing conflict handling',
        'approval-gated public property updates',
      ],
      excludedContext: [
        'automatic public listing rewrites',
        'unreviewed property-card data in public packs',
        'access secrets or guest-sensitive stay data',
      ],
      reviewBlockersBeforePublish: [
        'Ishant review of public, guest-scoped, owner-scoped, staff-private, and restricted property field classes.',
        'Confirm which source wins for common Guesty/FAD/Website/Breezeway property conflicts.',
      ],
    },
  };
}

function ownerEnquiryShellDraft({ version = 1 } = {}) {
  return {
    packId: `fad_owners_assistant_v${version}_draft`,
    surfaceId: 'fad_owners_assistant',
    version,
    status: 'draft',
    knowledgeScopes: [
      'owner-enquiry',
      'owner_records',
      'owner_terms',
      'owner_statement_rules',
      'property_owner_context',
      'owner_qualification',
      'owner_positioning_safety',
    ],
    behaviorRules: [
      {
        id: 'planned_shell_only',
        priority: 'must',
        rule: 'This is a planned staff-private shell, not an active owner-facing runtime surface.',
      },
      {
        id: 'no_cross_owner_memory',
        priority: 'must',
        rule: 'Owner context and memory must stay scoped to the authorized owner/property and must not bleed across owners.',
      },
      {
        id: 'source_dated_positioning',
        priority: 'must',
        rule: 'Market stats, competitor claims, revenue guidance, tax/legal handling, and owner package wording must be source-dated or routed to team review.',
      },
    ],
    toolPolicy: {
      allowedTools: OWNER_ENQUIRY_TOOL_ALLOWLIST,
      allowedActions: OWNER_ENQUIRY_ACTION_ALLOWLIST,
      toolUse: 'owner_scope_required_before_private_owner_context',
      actionBoundary: 'staff_private_draft_or_candidate_only',
    },
    memoryPolicy: {
      ...commonStaffShellMemoryPolicy('Owners'),
      crossOwnerMemory: 'forbidden',
      runtimeStatus: 'planned_shell',
    },
    sourceSnapshotRefs: PLAN2_STAFF_SOURCE_REFS,
    packPayload: {
      contextPackClass: 'staff_owner_enquiry_shell_v1_draft',
      includedContext: [
        'owner enquiry qualification',
        'staff-private owner positioning assumptions',
        'owner memory isolation boundary',
      ],
      excludedContext: [
        'public owner commitments',
        'cross-owner memory',
        'unreviewed revenue guarantees',
        'final legal or tax advice',
      ],
      reviewBlockersBeforePublish: [
        'Ishant review of owner-private rules, retention, consent, and owner-facing positioning.',
        'Confirm owner estimate and competitor-claim wording before owner-facing runtime use.',
      ],
    },
  };
}

function financeAssistantShellDraft({ version = 1 } = {}) {
  return {
    packId: `fad_finance_assistant_v${version}_draft`,
    surfaceId: 'fad_finance_assistant',
    version,
    status: 'draft',
    knowledgeScopes: ['finance_workflows', 'approved_finance_policy', 'owner_statement_rules'],
    behaviorRules: [
      {
        id: 'restricted_by_default',
        priority: 'must',
        rule: 'Treat finance data, owner statements, payments, payouts, expenses, tax, VAT, and tourist-fee handling as restricted unless the current role and surface explicitly allow access.',
      },
      {
        id: 'human_review_for_external_outputs',
        priority: 'must',
        rule: 'Owner-facing, guest-facing, public, filing, payment, payout, and accounting/tax outputs require human finance review before any external use.',
      },
      {
        id: 'source_dated_official_caveats',
        priority: 'must',
        rule: 'Use source-dated MRA or approved Friday finance workpaper context for VAT, tourist fee, exchange, tax, and filing claims; route interpretation to finance review.',
      },
    ],
    toolPolicy: {
      allowedTools: FINANCE_ASSISTANT_TOOL_ALLOWLIST,
      allowedActions: FINANCE_ASSISTANT_ACTION_ALLOWLIST,
      toolUse: 'restricted_finance_source_read_before_finance_claim',
      actionBoundary: 'finance_candidate_or_approval_request_only',
    },
    memoryPolicy: {
      ...commonStaffShellMemoryPolicy('Finance'),
      staffSessions: 'durable_need_to_know',
      ownerStatementIsolation: 'required',
      runtimeStatus: 'planned_shell',
    },
    sourceSnapshotRefs: PLAN2_STAFF_SOURCE_REFS,
    packPayload: {
      contextPackClass: 'restricted_finance_shell_v1_draft',
      includedContext: [
        'finance source ownership',
        'owner-statement privacy boundary',
        'tourist-fee, VAT, and tax caveat policy',
        'finance candidate and approval routing',
      ],
      excludedContext: [
        'direct payment, payout, or accounting mutation',
        'cross-owner finance examples',
        'final tax or accounting advice',
        'unreviewed external finance wording',
      ],
      reviewBlockersBeforePublish: [
        'Confirm finance table/source ownership, QuickBooks/general-ledger status, and owner statement isolation.',
        'Approve tourist-fee/VAT/cleaning-fee wording before any owner, guest, or public use.',
      ],
    },
  };
}

function legalAdminShellDraft({ version = 1 } = {}) {
  return {
    packId: `fad_legal_admin_assistant_v${version}_draft`,
    surfaceId: 'fad_legal_admin_assistant',
    version,
    status: 'draft',
    knowledgeScopes: [
      'legal_admin_policy',
      'contracts',
      'compliance_calendar',
      'license_register',
      'document_templates',
    ],
    behaviorRules: [
      {
        id: 'no_final_legal_advice',
        priority: 'must',
        rule: 'Produce source packets, review questions, and non-binding candidates only; do not provide final legal advice or binding contract/compliance commitments.',
      },
      {
        id: 'official_sources_are_source_dated',
        priority: 'must',
        rule: 'Use source-dated official Mauritius sources or approved internal templates and separate source facts from interpretation.',
      },
      {
        id: 'review_before_external_use',
        priority: 'must',
        rule: 'Contract, license, compliance, data-protection, owner, guest, or regulatory outputs require legal/admin human review before external use.',
      },
    ],
    toolPolicy: {
      allowedTools: LEGAL_ADMIN_TOOL_ALLOWLIST,
      allowedActions: LEGAL_ADMIN_ACTION_ALLOWLIST,
      toolUse: 'source_packet_before_legal_or_admin_candidate',
      actionBoundary: 'candidate_or_approval_request_only',
    },
    memoryPolicy: {
      ...commonStaffShellMemoryPolicy('Legal/Admin'),
      staffSessions: 'durable_need_to_know',
      runtimeStatus: 'planned_shell',
    },
    sourceSnapshotRefs: PLAN2_STAFF_SOURCE_REFS,
    packPayload: {
      contextPackClass: 'restricted_legal_admin_shell_v1_draft',
      includedContext: [
        'contract/template source policy',
        'compliance and license source packets',
        'legal-review boundary',
        'data-protection and HR/legal overlap caveats',
      ],
      excludedContext: [
        'final legal advice',
        'direct filing/license/contract mutation',
        'binding owner or guest commitments',
        'unreviewed legal interpretation',
      ],
      reviewBlockersBeforePublish: [
        'Confirm legal/admin reviewer roles, template source ownership, and document-signature source of truth.',
      ],
    },
  };
}

function hrTrainingShellDraft({ version = 1 } = {}) {
  return {
    packId: `fad_hr_training_assistant_v${version}_draft`,
    surfaceId: 'fad_hr_training_assistant',
    version,
    status: 'draft',
    knowledgeScopes: ['training', 'sops', 'role_guides', 'quality_rules'],
    behaviorRules: [
      {
        id: 'sop_guidance_not_hr_decision',
        priority: 'must',
        rule: 'Answer SOP and training questions from approved sources; do not make hiring, firing, discipline, payroll, leave, compensation, or performance decisions.',
      },
      {
        id: 'hr_private_boundary',
        priority: 'must',
        rule: 'Keep staff performance, discipline, leave reasons, payroll, complaints, medical data, and private HR notes in restricted HR lanes.',
      },
      {
        id: 'ops_minimum_staff_data',
        priority: 'must',
        rule: 'Ops planning may use availability and skill fit, but not private HR rationale or performance notes.',
      },
    ],
    toolPolicy: {
      allowedTools: HR_TRAINING_TOOL_ALLOWLIST,
      allowedActions: HR_TRAINING_ACTION_ALLOWLIST,
      toolUse: 'approved_sop_or_training_source_before_guidance',
      actionBoundary: 'training_or_sop_candidate_only',
    },
    memoryPolicy: {
      ...commonStaffShellMemoryPolicy('HR/Training'),
      privateHrNotes: 'restricted',
      reviewerLaneRequired: 'restricted_hr',
      runtimeStatus: 'planned_shell',
    },
    sourceSnapshotRefs: PLAN2_STAFF_SOURCE_REFS,
    packPayload: {
      contextPackClass: 'staff_hr_training_shell_v1_draft',
      includedContext: [
        'SOP and role-guide source policy',
        'training progress privacy boundary',
        'restricted HR reviewer lane requirement',
        'Ops/HR scheduling data minimization',
      ],
      excludedContext: [
        'private HR notes',
        'staff performance rankings',
        'payroll or discipline conclusions',
        'employment-law advice as final policy',
      ],
      reviewBlockersBeforePublish: [
        'Create restricted HR review lane and confirm allowed staff/training data per role.',
      ],
    },
  };
}

function analyticsIntelligenceShellDraft({ version = 1 } = {}) {
  return {
    packId: `fad_analytics_intelligence_v${version}_draft`,
    surfaceId: 'fad_analytics_intelligence',
    version,
    status: 'draft',
    knowledgeScopes: ['aggregate_metrics', 'eval_results', 'learning_event_trends', 'module_metrics'],
    behaviorRules: [
      {
        id: 'metric_contract_required',
        priority: 'must',
        rule: 'Every metric needs owner, definition, source, freshness, privacy class, allowed audience, sample size, and definition version before decision support.',
      },
      {
        id: 'trend_confidence',
        priority: 'must',
        rule: 'Separate observed facts, inferred trends, hypotheses, and recommended actions; include sample size, time window, missing-source caveats, and confidence.',
      },
      {
        id: 'no_staff_performance_without_policy',
        priority: 'must',
        rule: 'Do not rank individual staff performance or expose private workload without an approved HR/privacy policy.',
      },
    ],
    toolPolicy: {
      allowedTools: ANALYTICS_INTELLIGENCE_TOOL_ALLOWLIST,
      allowedActions: ANALYTICS_INTELLIGENCE_ACTION_ALLOWLIST,
      toolUse: 'aggregate_metric_sources_before_trend_claim',
      actionBoundary: 'report_or_eval_candidate_only',
    },
    memoryPolicy: {
      ...commonStaffShellMemoryPolicy('Analytics/Intelligence'),
      rawPiiDefault: 'excluded',
      runtimeStatus: 'planned_shell',
    },
    sourceSnapshotRefs: PLAN2_STAFF_SOURCE_REFS,
    packPayload: {
      contextPackClass: 'staff_analytics_intelligence_shell_v1_draft',
      includedContext: [
        'metric source ownership',
        'aggregation privacy policy',
        'trend confidence rules',
        'eval and learning event reporting boundaries',
      ],
      excludedContext: [
        'private staff performance claims without policy',
        'guest or owner PII in broad reports',
        'trend claims from stale or insufficient samples',
      ],
      reviewBlockersBeforePublish: [
        'Confirm minimum cohort thresholds and which analytics snapshots can become approved context packs.',
      ],
    },
  };
}

function guestPortalShellDraft({ version = 1 } = {}) {
  return {
    packId: `guest_portal_ask_friday_v${version}_draft`,
    surfaceId: 'guest_portal_ask_friday',
    version,
    status: 'draft',
    knowledgeScopes: [
      'guest_portal_public',
      'stay_specific',
      'property_guide',
      'approved_mauritius',
      'guest_support_rules',
    ],
    behaviorRules: [
      {
        id: 'stay_scope_required',
        priority: 'must',
        rule: 'Use stay-specific or access-related context only for a valid stay token or authenticated guest identity scoped to the current stay.',
      },
      {
        id: 'handoff_respected',
        priority: 'must',
        rule: 'If human takeover or aiMayReply:false is active, stop AI replies and route through FAD Inbox/handoff.',
      },
      {
        id: 'request_only_actions',
        priority: 'must',
        rule: 'Guest Portal actions are support/handoff requests only; no direct booking, payment, refund, cancellation, access, or date mutation.',
      },
    ],
    toolPolicy: {
      allowedTools: GUEST_PORTAL_TOOL_ALLOWLIST,
      allowedActions: GUEST_PORTAL_ACTION_ALLOWLIST,
      toolUse: 'stay_context_and_property_guide_before_stay_specific_answer',
      actionBoundary: 'guest_support_request_or_handoff_only',
    },
    memoryPolicy: {
      ...commonStaffShellMemoryPolicy('Guest Portal Ask Friday'),
      stayTokenScoped: true,
      durableMemory: 'consent_or_terms_required',
      runtimeStatus: 'planned_shell',
    },
    sourceSnapshotRefs: PLAN2_STAFF_SOURCE_REFS,
    packPayload: {
      contextPackClass: 'guest_portal_shell_v1_draft',
      includedContext: [
        'stay-token/authenticated guest scope',
        'property guidebook and stay phase',
        'guest support and FAD Inbox handoff policy',
      ],
      excludedContext: [
        'other guest data',
        'staff workload or private notes',
        'owner/private finance/legal facts',
        'direct booking/payment/refund/cancellation/access mutation',
      ],
      reviewBlockersBeforePublish: [
        'Confirm Guest Portal consent/memory policy and access-code visibility windows.',
      ],
    },
  };
}

function publicMcpShellDraft({ version = 1 } = {}) {
  return {
    packId: `public_mcp_v${version}_draft`,
    surfaceId: 'public_mcp',
    version,
    status: 'draft',
    knowledgeScopes: ['public_brand', 'public_residences', 'public_experiences', 'public_owner_overview'],
    behaviorRules: [
      {
        id: 'published_public_packs_only',
        priority: 'must',
        rule: 'External agents may read published public context packs and approved public tools only; draft, staff, guest-sensitive, owner-private, finance, legal, and internal context is blocked.',
      },
      {
        id: 'scope_and_registry_policy',
        priority: 'must',
        rule: 'Validate OAuth scope, surface registry, allowed tools/actions, privacy class, and redaction status on every request.',
      },
      {
        id: 'approval_routed_requests_only',
        priority: 'must',
        rule: 'Public MCP may create approval-routed requests only; no direct booking, payment, refund, cancellation, ops, property, owner, or external-send writes.',
      },
    ],
    toolPolicy: {
      allowedTools: PUBLIC_MCP_TOOL_ALLOWLIST,
      allowedActions: PUBLIC_MCP_ACTION_ALLOWLIST,
      toolUse: 'published_public_context_pack_plus_live_public_tools',
      actionBoundary: 'approval_routed_public_requests_only',
    },
    memoryPolicy: {
      ...commonStaffShellMemoryPolicy('Public MCP'),
      anonymous: 'session_only',
      durableMemory: 'disabled_until_policy_locked',
      runtimeStatus: 'planned_shell',
    },
    sourceSnapshotRefs: PLAN2_STAFF_SOURCE_REFS,
    packPayload: {
      contextPackClass: 'public_mcp_shell_v1_draft',
      includedContext: [
        'published public Ask Friday context packs',
        'public residence and experience discovery tools',
        'approval-routed request actions',
      ],
      excludedContext: [
        'staff/private/guest-sensitive/owner-private context',
        'finance/legal/internal engineering context',
        'direct irreversible write tools',
      ],
      reviewBlockersBeforePublish: [
        'Confirm exact MCP tool names, OAuth scopes, and approval lanes before implementation.',
      ],
    },
  };
}

function internalAgentBridgeShellDraft({ version = 1 } = {}) {
  return {
    packId: `internal_agent_bridge_v${version}_draft`,
    surfaceId: 'internal_agent_bridge',
    version,
    status: 'draft',
    knowledgeScopes: ['approved_architecture', 'approved_runbooks', 'engineering_decisions'],
    behaviorRules: [
      {
        id: 'sanitized_summaries_only',
        priority: 'must',
        rule: 'Accept sanitized summaries, evidence refs, test/deploy evidence, and candidates only; reject raw transcripts, secrets, credentials, and private customer/staff/owner/payment data.',
      },
      {
        id: 'provenance_required',
        priority: 'must',
        rule: 'Require source agent, repo, branch/PR/session, affected surfaces, privacy class, evidence summary, tests, deploy status, and review lane.',
      },
      {
        id: 'candidate_not_canonical',
        priority: 'must',
        rule: 'Internal agent submissions create candidates or eval ideas only; canonical KB and context packs still require human review and publish gates.',
      },
    ],
    toolPolicy: {
      allowedTools: INTERNAL_AGENT_BRIDGE_TOOL_ALLOWLIST,
      allowedActions: INTERNAL_AGENT_BRIDGE_ACTION_ALLOWLIST,
      toolUse: 'sanitized_summary_and_approved_truth_queries_only',
      actionBoundary: 'candidate_creation_only_no_canonical_write',
    },
    memoryPolicy: {
      ...commonStaffShellMemoryPolicy('Internal Agent Bridge'),
      rawTranscripts: 'not_ingested',
      runtimeStatus: 'planned_shell',
    },
    sourceSnapshotRefs: PLAN2_STAFF_SOURCE_REFS,
    packPayload: {
      contextPackClass: 'internal_agent_bridge_shell_v1_draft',
      includedContext: [
        'sanitized summary contract',
        'provenance and review policy',
        'candidate/eval creation boundary',
      ],
      excludedContext: [
        'raw transcripts',
        'secrets or credentials',
        'direct canonical memory writes',
        'unverified agent claims as truth',
      ],
      reviewBlockersBeforePublish: [
        'Confirm trusted-agent allowlist, trust tiers, and retention/redaction for agent handovers.',
      ],
    },
  };
}

function websiteGuestHeroDraft({ version = 1 } = {}) {
  return {
    packId: `website_guest_hero_v${version}_draft`,
    surfaceId: 'website_guest_hero',
    version,
    status: 'draft',
    knowledgeScopes: [
      'public_brand',
      'public_residences',
      'public_experiences',
      'public_mauritius',
      'guest_booking_rules',
    ],
    behaviorRules: commonWebsiteBehaviorRules('Website guest hero Ask Friday'),
    toolPolicy: {
      allowedTools: WEBSITE_GUEST_HERO_TOOL_ALLOWLIST,
      toolUse: 'live_lookup_required_for_dynamic_public_facts',
      disallowedToolClaims: [
        'direct booking execution',
        'payment capture',
        'owner/staff/private data lookup',
      ],
    },
    memoryPolicy: commonWebsiteMemoryPolicy(),
    sourceSnapshotRefs: WEBSITE_PUBLIC_SOURCE_REFS,
    packPayload: {
      ...commonWebsitePayload('website_guest_hero'),
      primaryJobs: [
        'route traveler intent',
        'search residences',
        'search experiences',
        'check availability',
        'answer public local questions with source or live-tool caveats',
        'send enquiry or hand off when staff action is needed',
      ],
    },
  };
}

function websiteAskFridayFabDraft({ version = 1 } = {}) {
  return {
    packId: `website_ask_friday_fab_v${version}_draft`,
    surfaceId: 'website_ask_friday_fab',
    version,
    status: 'draft',
    knowledgeScopes: [
      'public_brand',
      'public_residences',
      'public_experiences',
      'public_mauritius',
      'guest_booking_rules',
      'public_owner_overview',
    ],
    behaviorRules: commonWebsiteBehaviorRules('Website Ask Friday FAB'),
    toolPolicy: {
      allowedTools: WEBSITE_ASK_FRIDAY_FAB_TOOL_ALLOWLIST,
      routeIntentRequired: true,
      toolUse: 'route_then_live_lookup_for_public_dynamic_facts',
      disallowedToolClaims: [
        'direct booking execution',
        'payment capture',
        'owner/staff/private data lookup',
      ],
    },
    memoryPolicy: commonWebsiteMemoryPolicy(),
    sourceSnapshotRefs: WEBSITE_PUBLIC_SOURCE_REFS,
    packPayload: {
      ...commonWebsitePayload('website_ask_friday_fab'),
      primaryJobs: [
        'route mixed public intent',
        'answer traveler discovery questions',
        'answer public owner-intent questions only at high level',
        'create enquiry or handoff requests for staff action',
        'preserve Website takeover and FAD handoff contracts',
      ],
      ownerIntentBoundary: 'High-level public overview only. Do not provide owner-specific financial, legal, tax, contract, performance, or pricing commitments.',
    },
  };
}

function websitePublicDraftContextPacks(options = {}) {
  return [
    websiteGuestHeroDraft(options),
    websiteAskFridayFabDraft(options),
  ];
}

function fadRuntimeDraftContextPacks(options = {}) {
  return [
    fadGlobalAskFridayDraft(options),
    fadConsultDraft(options),
    opsAssistantDraft(options),
  ];
}

function plan2StaffDraftContextPacks(options = {}) {
  return [
    reservationsCalendarDraft(options),
    propertiesAssistantDraft(options),
    ownerEnquiryShellDraft(options),
    financeAssistantShellDraft(options),
    legalAdminShellDraft(options),
    hrTrainingShellDraft(options),
    analyticsIntelligenceShellDraft(options),
    guestPortalShellDraft(options),
    publicMcpShellDraft(options),
    internalAgentBridgeShellDraft(options),
  ];
}

module.exports = {
  ANALYTICS_INTELLIGENCE_ACTION_ALLOWLIST,
  ANALYTICS_INTELLIGENCE_TOOL_ALLOWLIST,
  FAD_CONSULT_ACTION_ALLOWLIST,
  FAD_CONSULT_TOOL_ALLOWLIST,
  FINANCE_ASSISTANT_ACTION_ALLOWLIST,
  FINANCE_ASSISTANT_TOOL_ALLOWLIST,
  FAD_GLOBAL_ACTION_ALLOWLIST,
  FAD_GLOBAL_TOOL_ALLOWLIST,
  FAD_RUNTIME_SOURCE_REFS,
  GUEST_PORTAL_ACTION_ALLOWLIST,
  GUEST_PORTAL_TOOL_ALLOWLIST,
  HR_TRAINING_ACTION_ALLOWLIST,
  HR_TRAINING_TOOL_ALLOWLIST,
  INTERNAL_AGENT_BRIDGE_ACTION_ALLOWLIST,
  INTERNAL_AGENT_BRIDGE_TOOL_ALLOWLIST,
  LEGAL_ADMIN_ACTION_ALLOWLIST,
  LEGAL_ADMIN_TOOL_ALLOWLIST,
  OWNER_ENQUIRY_ACTION_ALLOWLIST,
  OWNER_ENQUIRY_TOOL_ALLOWLIST,
  OPS_ASSISTANT_ACTION_ALLOWLIST,
  OPS_ASSISTANT_TOOL_ALLOWLIST,
  PLAN2_STAFF_SOURCE_REFS,
  PROPERTIES_ASSISTANT_ACTION_ALLOWLIST,
  PROPERTIES_ASSISTANT_TOOL_ALLOWLIST,
  PUBLIC_MCP_ACTION_ALLOWLIST,
  PUBLIC_MCP_TOOL_ALLOWLIST,
  RESERVATIONS_CALENDAR_ACTION_ALLOWLIST,
  RESERVATIONS_CALENDAR_TOOL_ALLOWLIST,
  WEBSITE_ASK_FRIDAY_FAB_TOOL_ALLOWLIST,
  WEBSITE_GUEST_HERO_TOOL_ALLOWLIST,
  WEBSITE_TOOL_ALLOWLIST,
  analyticsIntelligenceShellDraft,
  fadConsultDraft,
  financeAssistantShellDraft,
  fadGlobalAskFridayDraft,
  fadRuntimeDraftContextPacks,
  guestPortalShellDraft,
  hrTrainingShellDraft,
  internalAgentBridgeShellDraft,
  legalAdminShellDraft,
  opsAssistantDraft,
  ownerEnquiryShellDraft,
  plan2StaffDraftContextPacks,
  propertiesAssistantDraft,
  publicMcpShellDraft,
  reservationsCalendarDraft,
  websiteAskFridayFabDraft,
  websiteGuestHeroDraft,
  websitePublicDraftContextPacks,
};
