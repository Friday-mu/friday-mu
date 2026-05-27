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
