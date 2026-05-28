'use strict';

const {
  assertPublicSurface,
  isPublicReadableSurface,
  validateContextPackAgainstSurface,
  validatePublicActionRequest,
  validatePublicLearningEvent,
} = require('./policy');

function surface(overrides = {}) {
  return {
    surface_id: 'website_ask_friday_fab',
    source_system: 'friday-website',
    access_class: 'public',
    status: 'active',
    allowed_knowledge_scopes: ['public_brand', 'public_residences'],
    allowed_tools: ['search_residences'],
    allowed_actions: ['request_booking', 'request_handoff'],
    ...overrides,
  };
}

describe('Ask Friday Core surface policy', () => {
  test('classifies only active public surfaces as public-readable', () => {
    expect(isPublicReadableSurface(surface())).toBe(true);
    expect(isPublicReadableSurface(surface({ access_class: 'staff', source_system: 'fad' }))).toBe(false);
    expect(isPublicReadableSurface(surface({ status: 'planned' }))).toBe(false);
  });

  test('rejects public access to staff surfaces', () => {
    expect(() => assertPublicSurface(
      surface({ surface_id: 'fad_consult', source_system: 'fad', access_class: 'staff' }),
      'fad_consult',
    )).toThrow('surfaceId is not public-readable');
  });

  test('validates public learning events against surface scopes and redaction', () => {
    expect(() => validatePublicLearningEvent({
      sourceSystem: 'friday-website',
      surfaceId: 'website_ask_friday_fab',
      privacyClass: 'medium',
      redactionStatus: 'redacted',
      knowledgeUsed: ['public_residences'],
      toolsUsed: ['search_residences'],
      userTurnSummary: 'Asked for a beachfront villa.',
      assistantActionSummary: 'Suggested public residences.',
      evidenceRefs: [],
      eventPayload: {},
    }, surface())).not.toThrow();

    expect(() => validatePublicLearningEvent({
      sourceSystem: 'friday-website',
      surfaceId: 'website_ask_friday_fab',
      privacyClass: 'medium',
      redactionStatus: 'redacted',
      knowledgeUsed: ['staff_ops'],
      toolsUsed: [],
      userTurnSummary: 'Asked about staff.',
      assistantActionSummary: 'Used private staff context.',
      evidenceRefs: [],
      eventPayload: {},
    }, surface())).toThrow('knowledgeUsed contains public-blocked values');

    expect(() => validatePublicLearningEvent({
      sourceSystem: 'friday-website',
      surfaceId: 'website_ask_friday_fab',
      privacyClass: 'high',
      redactionStatus: 'unredacted',
      knowledgeUsed: [],
      toolsUsed: [],
      userTurnSummary: 'password=secret',
      assistantActionSummary: 'Stored raw detail.',
      evidenceRefs: [],
      eventPayload: {},
    }, surface())).toThrow('privacyClass is not allowed');
  });

  test('accepts Website public Ask Friday context-pack and event boundaries', () => {
    const websiteSurface = surface({
      surface_id: 'website_ask_friday_fab',
      allowed_knowledge_scopes: [
        'public_brand',
        'public_residences',
        'public_experiences',
        'public_mauritius',
        'guest_booking_rules',
        'public_owner_overview',
      ],
      allowed_tools: [
        'route_intent',
        'search_residences',
        'check_availability',
        'search_experiences',
        'search_places',
      ],
    });

    expect(() => validateContextPackAgainstSurface({
      surfaceId: 'website_ask_friday_fab',
      knowledgeScopes: ['public_brand', 'public_residences', 'guest_booking_rules'],
      behaviorRules: [{ id: 'handoff', rule: 'Escalate when a visitor asks for a person.' }],
      toolPolicy: { allowedTools: ['route_intent', 'check_availability'] },
      memoryPolicy: { anonymous: 'session_only' },
      sourceSnapshotRefs: [{ type: 'source_matrix' }],
      packPayload: { publicFacts: [] },
    }, websiteSurface)).not.toThrow();

    expect(() => validatePublicLearningEvent({
      sourceSystem: 'friday-website',
      surfaceId: 'website_ask_friday_fab',
      privacyClass: 'low',
      redactionStatus: 'redacted',
      knowledgeUsed: ['public_residences', 'guest_booking_rules'],
      toolsUsed: ['route_intent', 'check_availability'],
      userTurnSummary: 'Visitor asked about availability for a public date window.',
      assistantActionSummary: 'Checked availability and offered a handoff.',
      evidenceRefs: [],
      eventPayload: { contextPackStatus: 'published', contextPackVersion: 7 },
    }, websiteSurface)).not.toThrow();
  });

  test('accepts owner lead and feedback evidence event contracts without private leakage', () => {
    const ownerSurface = surface({
      surface_id: 'website_owner_enquiry',
      allowed_knowledge_scopes: [
        'public_brand',
        'public_owner_overview',
        'owner_packages_public',
        'owner_qualification',
      ],
      allowed_tools: ['extract_owner_fields', 'prepare_owner_followup'],
      allowed_actions: ['request_owner_followup', 'request_handoff'],
    });
    const feedbackSurface = surface({
      surface_id: 'website_feedback_bug',
      access_class: 'public_diagnostic',
      allowed_knowledge_scopes: ['feedback_diagnostics', 'public_site_context'],
      allowed_tools: ['inspect_feedback_context'],
      allowed_actions: ['create_feedback_issue'],
    });

    expect(() => validatePublicLearningEvent({
      sourceSystem: 'friday-website',
      surfaceId: 'website_owner_enquiry',
      privacyClass: 'medium',
      redactionStatus: 'redacted',
      knowledgeUsed: ['public_owner_overview', 'owner_qualification'],
      toolsUsed: ['extract_owner_fields', 'prepare_owner_followup'],
      userTurnSummary: 'Owner shared a public-safe property summary and contact channel.',
      assistantActionSummary: 'Prepared a staff follow-up capsule without revenue guarantees.',
      evidenceRefs: [],
      eventPayload: {
        ownerLeadCapsule: {
          readiness: { status: 'ready_for_staff_followup' },
          constraints: { noRevenueGuarantee: true },
        },
      },
    }, ownerSurface)).not.toThrow();

    expect(() => validatePublicLearningEvent({
      sourceSystem: 'friday-website',
      surfaceId: 'website_feedback_bug',
      privacyClass: 'medium',
      redactionStatus: 'partially_redacted',
      knowledgeUsed: ['feedback_diagnostics', 'public_site_context'],
      toolsUsed: ['inspect_feedback_context'],
      userTurnSummary: 'Reporter described a mobile layout bug.',
      assistantActionSummary: 'Captured route, viewport, repro summary, and redacted screenshot evidence.',
      evidenceRefs: [{
        evidenceType: 'screenshot',
        storageRef: 'restricted://feedback/screenshot-1',
        privacyClass: 'medium',
        redactionStatus: 'partially_redacted',
        summary: 'Mobile submit control is hidden below the viewport.',
      }],
      eventPayload: { feedbackType: 'bug', clusterKey: 'mobile-submit-hidden' },
    }, feedbackSurface)).not.toThrow();
  });

  test('rejects owner-private scopes and restricted evidence on public contracts', () => {
    const ownerSurface = surface({
      surface_id: 'website_owner_enquiry',
      allowed_knowledge_scopes: ['public_owner_overview', 'owner_qualification'],
      allowed_tools: ['extract_owner_fields'],
    });
    const feedbackSurface = surface({
      surface_id: 'website_feedback_bug',
      access_class: 'public_diagnostic',
      allowed_knowledge_scopes: ['feedback_diagnostics'],
      allowed_tools: ['inspect_feedback_context'],
    });

    expect(() => validatePublicLearningEvent({
      sourceSystem: 'friday-website',
      surfaceId: 'website_owner_enquiry',
      privacyClass: 'medium',
      redactionStatus: 'redacted',
      knowledgeUsed: ['owner_private'],
      toolsUsed: ['extract_owner_fields'],
      userTurnSummary: 'Owner asks for another owner record.',
      assistantActionSummary: 'Attempted to use private owner context.',
      evidenceRefs: [],
      eventPayload: {},
    }, ownerSurface)).toThrow('knowledgeUsed contains public-blocked values');

    expect(() => validatePublicLearningEvent({
      sourceSystem: 'friday-website',
      surfaceId: 'website_feedback_bug',
      privacyClass: 'medium',
      redactionStatus: 'redacted',
      knowledgeUsed: ['feedback_diagnostics'],
      toolsUsed: ['inspect_feedback_context'],
      userTurnSummary: 'Reporter attached a screenshot.',
      assistantActionSummary: 'Attached restricted raw screenshot.',
      evidenceRefs: [{
        evidenceType: 'screenshot',
        storageRef: 'restricted://feedback/raw-screenshot',
        privacyClass: 'restricted',
        redactionStatus: 'unredacted',
      }],
      eventPayload: {},
    }, feedbackSurface)).toThrow('evidence_ref privacyClass is not allowed');
  });

  test('public action requests must be allowlisted and approval-routed', () => {
    expect(() => validatePublicActionRequest({
      sourceSystem: 'friday-website',
      surfaceId: 'website_ask_friday_fab',
      actionType: 'request_booking',
      approvalRequired: true,
      status: 'pending',
      payload: { residence: 'GBH-C8' },
    }, surface())).not.toThrow();

    expect(() => validatePublicActionRequest({
      sourceSystem: 'friday-website',
      surfaceId: 'website_ask_friday_fab',
      actionType: 'create_task',
      approvalRequired: true,
      status: 'pending',
      payload: { title: 'Fix AC' },
    }, surface())).toThrow('actionType contains public-blocked values');

    expect(() => validatePublicActionRequest({
      sourceSystem: 'friday-website',
      surfaceId: 'website_ask_friday_fab',
      actionType: 'request_booking',
      approvalRequired: false,
      status: 'pending',
      payload: {},
    }, surface())).toThrow('must require approval');
  });

  test('context packs cannot publish scopes outside their surface boundary', () => {
    expect(() => validateContextPackAgainstSurface({
      surfaceId: 'website_ask_friday_fab',
      knowledgeScopes: ['public_brand'],
      behaviorRules: [],
      toolPolicy: { allowedTools: ['search_residences'] },
      memoryPolicy: {},
      sourceSnapshotRefs: [],
      packPayload: { compactPrompt: 'Public context' },
    }, surface())).not.toThrow();

    expect(() => validateContextPackAgainstSurface({
      surfaceId: 'website_ask_friday_fab',
      knowledgeScopes: ['owner_private'],
      behaviorRules: [],
      toolPolicy: { allowedTools: ['search_residences'] },
      memoryPolicy: {},
      sourceSnapshotRefs: [],
      packPayload: { compactPrompt: 'Private owner context' },
    }, surface())).toThrow('knowledgeScopes contains public-blocked values');
  });
});
