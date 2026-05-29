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
  ];
}

module.exports = {
  FAD_CONSULT_ACTION_ALLOWLIST,
  FAD_CONSULT_TOOL_ALLOWLIST,
  FAD_GLOBAL_ACTION_ALLOWLIST,
  FAD_GLOBAL_TOOL_ALLOWLIST,
  FAD_RUNTIME_SOURCE_REFS,
  OWNER_ENQUIRY_ACTION_ALLOWLIST,
  OWNER_ENQUIRY_TOOL_ALLOWLIST,
  OPS_ASSISTANT_ACTION_ALLOWLIST,
  OPS_ASSISTANT_TOOL_ALLOWLIST,
  PLAN2_STAFF_SOURCE_REFS,
  PROPERTIES_ASSISTANT_ACTION_ALLOWLIST,
  PROPERTIES_ASSISTANT_TOOL_ALLOWLIST,
  RESERVATIONS_CALENDAR_ACTION_ALLOWLIST,
  RESERVATIONS_CALENDAR_TOOL_ALLOWLIST,
  WEBSITE_ASK_FRIDAY_FAB_TOOL_ALLOWLIST,
  WEBSITE_GUEST_HERO_TOOL_ALLOWLIST,
  WEBSITE_TOOL_ALLOWLIST,
  fadConsultDraft,
  fadGlobalAskFridayDraft,
  fadRuntimeDraftContextPacks,
  opsAssistantDraft,
  ownerEnquiryShellDraft,
  plan2StaffDraftContextPacks,
  propertiesAssistantDraft,
  reservationsCalendarDraft,
  websiteAskFridayFabDraft,
  websiteGuestHeroDraft,
  websitePublicDraftContextPacks,
};
