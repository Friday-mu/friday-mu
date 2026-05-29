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
      'Feedback evidence retention/redaction policy before feedback packs include screenshot or diagnostic context.',
    ],
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
      allowedTools: WEBSITE_TOOL_ALLOWLIST,
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
      allowedTools: WEBSITE_TOOL_ALLOWLIST,
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

module.exports = {
  WEBSITE_TOOL_ALLOWLIST,
  websiteAskFridayFabDraft,
  websiteGuestHeroDraft,
  websitePublicDraftContextPacks,
};
