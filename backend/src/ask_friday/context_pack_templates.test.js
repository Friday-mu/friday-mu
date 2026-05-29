'use strict';

const {
  FAD_CONSULT_ACTION_ALLOWLIST,
  FAD_CONSULT_TOOL_ALLOWLIST,
  FAD_GLOBAL_ACTION_ALLOWLIST,
  FAD_GLOBAL_TOOL_ALLOWLIST,
  OWNER_ENQUIRY_ACTION_ALLOWLIST,
  OWNER_ENQUIRY_TOOL_ALLOWLIST,
  OPS_ASSISTANT_ACTION_ALLOWLIST,
  OPS_ASSISTANT_TOOL_ALLOWLIST,
  PROPERTIES_ASSISTANT_ACTION_ALLOWLIST,
  PROPERTIES_ASSISTANT_TOOL_ALLOWLIST,
  RESERVATIONS_CALENDAR_ACTION_ALLOWLIST,
  RESERVATIONS_CALENDAR_TOOL_ALLOWLIST,
  WEBSITE_ASK_FRIDAY_FAB_TOOL_ALLOWLIST,
  WEBSITE_GUEST_HERO_TOOL_ALLOWLIST,
  WEBSITE_TOOL_ALLOWLIST,
  fadRuntimeDraftContextPacks,
  plan2StaffDraftContextPacks,
  websitePublicDraftContextPacks,
} = require('./context_pack_templates');
const { normalizeContextPack } = require('./contracts');
const { validateContextPackAgainstSurface } = require('./policy');

function websiteSurface(surfaceId) {
  const base = {
    surface_id: surfaceId,
    source_system: 'friday-website',
    access_class: 'public',
    status: 'active',
    allowed_knowledge_scopes: [
      'public_brand',
      'public_residences',
      'public_experiences',
      'public_mauritius',
      'guest_booking_rules',
      'public_owner_overview',
    ],
    allowed_tools: WEBSITE_TOOL_ALLOWLIST,
    allowed_actions: [
      'request_booking',
      'request_owner_followup',
      'request_feedback',
      'request_handoff',
    ],
  };
  if (surfaceId === 'website_guest_hero') {
    return {
      ...base,
      allowed_knowledge_scopes: base.allowed_knowledge_scopes.filter((scope) => scope !== 'public_owner_overview'),
      allowed_actions: ['request_booking', 'request_handoff'],
    };
  }
  return base;
}

function staffShellSurface(surfaceId) {
  if (surfaceId === 'fad_global_ask_friday') {
    return {
      surface_id: surfaceId,
      source_system: 'fad',
      access_class: 'staff',
      status: 'active',
      allowed_knowledge_scopes: [
        'fad_live_context',
        'staff_inbox',
        'ops_tasks',
        'reservations',
        'properties',
        'hr_staff',
        'reviews',
        'design_projects',
      ],
      allowed_tools: FAD_GLOBAL_TOOL_ALLOWLIST,
      allowed_actions: FAD_GLOBAL_ACTION_ALLOWLIST,
    };
  }
  if (surfaceId === 'fad_consult') {
    return {
      surface_id: surfaceId,
      source_system: 'fad',
      access_class: 'staff',
      status: 'active',
      allowed_knowledge_scopes: [
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
      allowed_tools: FAD_CONSULT_TOOL_ALLOWLIST,
      allowed_actions: FAD_CONSULT_ACTION_ALLOWLIST,
    };
  }
  if (surfaceId === 'fad_ops_assistant') {
    return {
      surface_id: surfaceId,
      source_system: 'fad',
      access_class: 'staff',
      status: 'active',
      allowed_knowledge_scopes: [
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
      allowed_tools: OPS_ASSISTANT_TOOL_ALLOWLIST,
      allowed_actions: OPS_ASSISTANT_ACTION_ALLOWLIST,
    };
  }
  if (surfaceId === 'fad_reservations_calendar_assistant') {
    return {
      surface_id: surfaceId,
      source_system: 'fad',
      access_class: 'staff',
      status: 'active',
      allowed_knowledge_scopes: [
        'reservations-calendar',
        'reservations',
        'calendar',
        'availability',
        'pricing_quote_policy',
        'channel_write_policy',
        'guest_inquiry_followup',
      ],
      allowed_tools: RESERVATIONS_CALENDAR_TOOL_ALLOWLIST,
      allowed_actions: RESERVATIONS_CALENDAR_ACTION_ALLOWLIST,
    };
  }
  if (surfaceId === 'fad_properties_assistant') {
    return {
      surface_id: surfaceId,
      source_system: 'fad',
      access_class: 'staff',
      status: 'active',
      allowed_knowledge_scopes: [
        'properties-assistant',
        'property_cards',
        'public_residences',
        'property_ops_notes',
        'public_private_split',
        'property_field_classification',
        'property_source_conflicts',
      ],
      allowed_tools: PROPERTIES_ASSISTANT_TOOL_ALLOWLIST,
      allowed_actions: PROPERTIES_ASSISTANT_ACTION_ALLOWLIST,
    };
  }
  return {
    surface_id: surfaceId,
    source_system: 'fad',
    access_class: 'restricted_staff',
    status: 'planned',
    allowed_knowledge_scopes: [
      'owner-enquiry',
      'owner_records',
      'owner_terms',
      'owner_statement_rules',
      'property_owner_context',
      'owner_qualification',
      'owner_positioning_safety',
    ],
    allowed_tools: OWNER_ENQUIRY_TOOL_ALLOWLIST,
    allowed_actions: OWNER_ENQUIRY_ACTION_ALLOWLIST,
  };
}

describe('Ask Friday public Website context-pack templates', () => {
  test('draft packs validate against public surface policy', () => {
    for (const draft of websitePublicDraftContextPacks()) {
      const pack = normalizeContextPack(draft);
      expect(pack.status).toBe('draft');
      expect(() => validateContextPackAgainstSurface(pack, websiteSurface(pack.surfaceId))).not.toThrow();
    }
  });

  test('draft packs are public-only and review-gated', () => {
    for (const draft of websitePublicDraftContextPacks()) {
      const text = JSON.stringify(draft).toLowerCase();
      expect(text).not.toContain('staff_private');
      expect(text).not.toContain('owner_private');
      expect(text).not.toContain('guest_sensitive');
      expect(text).not.toContain('payment data lookup');
      expect(draft.status).toBe('draft');
      expect(draft.packPayload.reviewBlockersBeforePublish.length).toBeGreaterThan(0);
      expect(draft.memoryPolicy.canonicalization).toContain('human_review_required');
    }
  });

  test('hero has narrower tools than Website FAB', () => {
    const [hero, fab] = websitePublicDraftContextPacks();

    expect(hero.toolPolicy.allowedTools).toEqual(WEBSITE_GUEST_HERO_TOOL_ALLOWLIST);
    expect(fab.toolPolicy.allowedTools).toEqual(WEBSITE_ASK_FRIDAY_FAB_TOOL_ALLOWLIST);
    expect(hero.toolPolicy.allowedTools).not.toContain('search_journal');
    expect(fab.toolPolicy.allowedTools).toContain('search_journal');
  });

  test('feedback evidence blocker is not attached to public Website packs', () => {
    for (const draft of websitePublicDraftContextPacks()) {
      const blockers = draft.packPayload.reviewBlockersBeforePublish.join(' ').toLowerCase();
      expect(blockers).not.toContain('feedback');
      expect(blockers).not.toContain('screenshot');
      expect(blockers).not.toContain('diagnostic');
    }
  });
});

describe('Ask Friday active FAD runtime context-pack templates', () => {
  test('active runtime drafts validate against their surface policies', () => {
    for (const draft of fadRuntimeDraftContextPacks()) {
      const pack = normalizeContextPack(draft);
      expect(pack.status).toBe('draft');
      expect(() => validateContextPackAgainstSurface(pack, staffShellSurface(pack.surfaceId))).not.toThrow();
    }
  });

  test('active runtime drafts cover global, Inbox Consult, and Ops surfaces', () => {
    expect(fadRuntimeDraftContextPacks().map((draft) => draft.surfaceId)).toEqual([
      'fad_global_ask_friday',
      'fad_consult',
      'fad_ops_assistant',
    ]);
  });

  test('global Ask Friday keeps TeamInbox as staff-only evidence', () => {
    const [globalDraft] = fadRuntimeDraftContextPacks();
    const text = JSON.stringify(globalDraft).toLowerCase();

    expect(globalDraft.toolPolicy.allowedTools).toEqual(FAD_GLOBAL_TOOL_ALLOWLIST);
    expect(globalDraft.toolPolicy.allowedActions).toEqual(FAD_GLOBAL_ACTION_ALLOWLIST);
    expect(text).toContain('teaminbox');
    expect(text).toContain('staff-only');
    expect(text).toContain('not_canonical_truth');
  });

  test('Inbox Consult preserves review-only and human-send boundaries', () => {
    const consultDraft = fadRuntimeDraftContextPacks().find((draft) => draft.surfaceId === 'fad_consult');
    const text = JSON.stringify(consultDraft).toLowerCase();

    expect(consultDraft.toolPolicy.allowedTools).toEqual(FAD_CONSULT_TOOL_ALLOWLIST);
    expect(consultDraft.toolPolicy.allowedActions).toEqual(FAD_CONSULT_ACTION_ALLOWLIST);
    expect(text).toContain('review_only');
    expect(text).toContain('draft_requires_intent');
    expect(text).toContain('human_send_boundary');
  });

  test('Ops Assistant carries planning safety rules', () => {
    const opsDraft = fadRuntimeDraftContextPacks().find((draft) => draft.surfaceId === 'fad_ops_assistant');
    const text = JSON.stringify(opsDraft).toLowerCase();

    expect(opsDraft.toolPolicy.allowedTools).toEqual(OPS_ASSISTANT_TOOL_ALLOWLIST);
    expect(opsDraft.toolPolicy.allowedActions).toEqual(OPS_ASSISTANT_ACTION_ALLOWLIST);
    expect(text).toContain('unassigned');
    expect(text).toContain('occupancy');
    expect(text).toContain('lunch');
    expect(text).toContain('availability');
    expect(text).toContain('pricing');
    expect(text).toContain('reversible');
  });
});

describe('Ask Friday Plan 2 staff shell context-pack templates', () => {
  test('staff shell drafts cover Reservations, Properties, and planned Owners shells', () => {
    expect(plan2StaffDraftContextPacks().map((draft) => draft.surfaceId)).toEqual([
      'fad_reservations_calendar_assistant',
      'fad_properties_assistant',
      'fad_owners_assistant',
    ]);
  });

  test('staff shell drafts validate against their surface policies', () => {
    for (const draft of plan2StaffDraftContextPacks()) {
      const pack = normalizeContextPack(draft);
      expect(pack.status).toBe('draft');
      expect(() => validateContextPackAgainstSurface(pack, staffShellSurface(pack.surfaceId))).not.toThrow();
    }
  });

  test('staff shell drafts carry explicit action allowlists', () => {
    const [reservations, properties, owners] = plan2StaffDraftContextPacks();

    expect(reservations.toolPolicy.allowedTools).toEqual(RESERVATIONS_CALENDAR_TOOL_ALLOWLIST);
    expect(reservations.toolPolicy.allowedActions).toEqual(RESERVATIONS_CALENDAR_ACTION_ALLOWLIST);
    expect(reservations.toolPolicy.allowedActions).toContain('request_channel_visible_block');

    expect(properties.toolPolicy.allowedTools).toEqual(PROPERTIES_ASSISTANT_TOOL_ALLOWLIST);
    expect(properties.toolPolicy.allowedActions).toEqual(PROPERTIES_ASSISTANT_ACTION_ALLOWLIST);
    expect(properties.toolPolicy.allowedActions).toContain('create_property_kb_candidate');

    expect(owners.surfaceId).toBe('fad_owners_assistant');
    expect(owners.memoryPolicy.runtimeStatus).toBe('planned_shell');
    expect(owners.toolPolicy.allowedActions).toEqual(OWNER_ENQUIRY_ACTION_ALLOWLIST);
  });

  test('staff shell drafts do not promise direct external writes', () => {
    for (const draft of plan2StaffDraftContextPacks()) {
      const text = JSON.stringify(draft).toLowerCase();
      expect(draft.toolPolicy.actionBoundary).not.toBe('direct_external_write');
      expect(text).toContain('human_review_required');
      expect(text).toContain('approval');
    }
  });
});
