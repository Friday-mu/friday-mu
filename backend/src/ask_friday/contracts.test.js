'use strict';

const {
  normalizeActionRequest,
  normalizeContextPack,
  normalizeKbCandidate,
  normalizeLearningEvent,
  normalizeSurfaceRegistry,
  redactText,
} = require('./contracts');

describe('Ask Friday Core contracts', () => {
  test('redacts obvious secrets and payment-like values from text', () => {
    const redacted = redactText('api_key=abc123 sk-testsecretkey1234567890 card 4242 4242 4242 4242');
    expect(redacted).toContain('[REDACTED]');
    expect(redacted).not.toMatch(/abc123|sk-testsecret|4242 4242/);
  });

  test('normalizes compact learning events with evidence refs', () => {
    const event = normalizeLearningEvent({
      eventId: 'evt-1',
      sourceSystem: 'friday-website',
      surfaceId: 'website_ask_friday_fab',
      identityRef: {
        identityType: 'anonymous',
        identityKey: 'visitor-1',
        durableMemoryAllowed: false,
      },
      userTurnSummary: 'Asked for July. password=secret',
      assistantActionSummary: 'Suggested residences.',
      toolsUsed: ['listings', 'listings', 'availability'],
      evidenceRefs: [{
        evidenceType: 'screenshot',
        storageRef: 'blob://feedback/screenshot-1',
        summary: 'Screenshot with token=hidden',
      }],
      privacyClass: 'medium',
      redactionStatus: 'redacted',
      eventPayload: {
        nested: [{ note: 'token=hidden' }],
      },
    });

    expect(event.eventId).toBe('evt-1');
    expect(event.sourceSystem).toBe('friday-website');
    expect(event.surfaceId).toBe('website_ask_friday_fab');
    expect(event.userTurnSummary).toBe('Asked for July. [REDACTED]');
    expect(event.toolsUsed).toEqual(['listings', 'availability']);
    expect(event.evidenceRefs).toHaveLength(1);
    expect(event.evidenceRefs[0]).toMatchObject({
      eventId: 'evt-1',
      evidenceType: 'screenshot',
      storageRef: 'blob://feedback/screenshot-1',
      summary: 'Screenshot with [REDACTED]',
    });
    expect(event.eventPayload.nested[0].note).toBe('[REDACTED]');
  });

  test('requires source system and surface for learning events', () => {
    expect(() => normalizeLearningEvent({ sourceSystem: 'friday-website' })).toThrow('surfaceId is required');
    expect(() => normalizeLearningEvent({ surfaceId: 'fad_consult' })).toThrow('sourceSystem is required');
  });

  test('normalizes surface registry policy fields', () => {
    const surface = normalizeSurfaceRegistry({
      surfaceId: 'fad_ops_assistant',
      displayName: 'Ask Friday Ops Assistant',
      audience: 'staff',
      sourceSystem: 'fad',
      allowedTools: ['load_task', 'load_task', 'create_task_candidate'],
      status: 'planned',
      memoryPolicy: { staff_sessions: 'durable_team_visible' },
    });

    expect(surface).toMatchObject({
      surfaceId: 'fad_ops_assistant',
      displayName: 'Ask Friday Ops Assistant',
      sourceSystem: 'fad',
      status: 'planned',
    });
    expect(surface.allowedTools).toEqual(['load_task', 'create_task_candidate']);
  });

  test('normalizes approved context packs without raw payload spillover', () => {
    const pack = normalizeContextPack({
      surfaceId: 'website_guest_hero',
      version: 2,
      status: 'published',
      knowledgeScopes: ['public_brand', 'public_residences'],
      packPayload: { publicSummary: 'Approved guest context' },
      approvedBy: 'Ishant',
    });

    expect(pack.packId).toBe('website_guest_hero_v2');
    expect(pack.status).toBe('published');
    expect(pack.knowledgeScopes).toEqual(['public_brand', 'public_residences']);
    expect(pack.approvedBy).toBe('Ishant');
  });

  test('normalizes candidate and action request approval contracts', () => {
    const candidate = normalizeKbCandidate({
      candidateType: 'behavior_rule',
      targetLayer: 'surface_behavior',
      proposedChange: { add: 'Ask one follow-up at a time.' },
      riskClass: 'high',
      sourceEventIds: ['evt-1', 'evt-1'],
    });
    const action = normalizeActionRequest({
      sourceSystem: 'fad',
      surfaceId: 'fad_consult',
      actionType: 'create_task',
      riskClass: 'approval',
      payload: { title: 'Check AC' },
    });

    expect(candidate.sourceEventIds).toEqual(['evt-1']);
    expect(candidate.reviewStatus).toBe('pending');
    expect(action.approvalRequired).toBe(true);
    expect(action.status).toBe('pending');
  });
});
