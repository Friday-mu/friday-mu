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

function plan2StaffDraftContextPacks(options = {}) {
  return [
    reservationsCalendarDraft(options),
    propertiesAssistantDraft(options),
    ownerEnquiryShellDraft(options),
  ];
}

module.exports = {
  OWNER_ENQUIRY_ACTION_ALLOWLIST,
  OWNER_ENQUIRY_TOOL_ALLOWLIST,
  PLAN2_STAFF_SOURCE_REFS,
  PROPERTIES_ASSISTANT_ACTION_ALLOWLIST,
  PROPERTIES_ASSISTANT_TOOL_ALLOWLIST,
  RESERVATIONS_CALENDAR_ACTION_ALLOWLIST,
  RESERVATIONS_CALENDAR_TOOL_ALLOWLIST,
  WEBSITE_ASK_FRIDAY_FAB_TOOL_ALLOWLIST,
  WEBSITE_GUEST_HERO_TOOL_ALLOWLIST,
  WEBSITE_TOOL_ALLOWLIST,
  ownerEnquiryShellDraft,
  plan2StaffDraftContextPacks,
  propertiesAssistantDraft,
  reservationsCalendarDraft,
  websiteAskFridayFabDraft,
  websiteGuestHeroDraft,
  websitePublicDraftContextPacks,
};
