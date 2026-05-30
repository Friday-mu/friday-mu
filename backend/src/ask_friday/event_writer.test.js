'use strict';

jest.mock('../database/client', () => ({
  query: jest.fn(),
}));

const { query } = require('../database/client');
const { recordLearningEvent } = require('./event_writer');

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

function surfaceRow(overrides = {}) {
  return {
    surface_id: 'fad_consult',
    source_system: 'fad',
    status: 'active',
    allowed_knowledge_scopes: ['staff_inbox', 'property_cards', 'teachings', 'ops_context', 'guest_context'],
    allowed_tools: ['load_conversation', 'load_reservation'],
    ...overrides,
  };
}

describe('Ask Friday Core event writer', () => {
  beforeEach(() => {
    query.mockReset();
  });

  test('writes normalized redacted staff learning events', async () => {
    query
      .mockResolvedValueOnce({ rows: [surfaceRow()] })
      .mockResolvedValueOnce({ rows: [{ event_id: 'evt-1' }] });

    const result = await recordLearningEvent({
      tenantId: TENANT_ID,
      event: {
        eventId: 'evt-1',
        sourceSystem: 'fad',
        surfaceId: 'fad_consult',
        sessionId: 'session-1',
        intent: 'revision',
        userTurnSummary: 'Revise this draft. token=secret',
        assistantActionSummary: 'Produced a safer draft.',
        confidence: 'medium',
        outcome: 'drafted',
        privacyClass: 'high',
        redactionStatus: 'partially_redacted',
        knowledgeUsed: ['staff_inbox', 'teachings'],
        eventPayload: { note: 'password=hidden' },
      },
    });

    expect(result).toEqual({ eventId: 'evt-1', inserted: true, evidenceInserted: 0 });
    expect(query).toHaveBeenCalledTimes(2);
    const params = query.mock.calls[1][1];
    expect(params[0]).toBe(TENANT_ID);
    expect(params[10]).toBe('Revise this draft. [REDACTED]');
    expect(JSON.parse(params[21])).toMatchObject({ note: '[REDACTED]' });
  });

  test('reports duplicate events without throwing', async () => {
    query
      .mockResolvedValueOnce({
        rows: [surfaceRow({
          surface_id: 'fad_ops_assistant',
          allowed_knowledge_scopes: ['ops_tasks'],
          allowed_tools: [],
        })],
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(recordLearningEvent({
      tenantId: TENANT_ID,
      event: {
        eventId: 'evt-1',
        sourceSystem: 'fad',
        surfaceId: 'fad_ops_assistant',
        privacyClass: 'high',
        redactionStatus: 'partially_redacted',
      },
    })).resolves.toEqual({ eventId: 'evt-1', inserted: false, evidenceInserted: 0 });
  });

  test('writes evidence refs for staff learning events', async () => {
    query
      .mockResolvedValueOnce({ rows: [surfaceRow()] })
      .mockResolvedValueOnce({ rows: [{ event_id: 'evt-2' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'evidence-row' }] });

    const result = await recordLearningEvent({
      tenantId: TENANT_ID,
      event: {
        eventId: 'evt-2',
        sourceSystem: 'fad',
        surfaceId: 'fad_consult',
        privacyClass: 'high',
        redactionStatus: 'partially_redacted',
        evidenceRefs: [{
          evidenceId: 'evref-1',
          evidenceType: 'tool_trace',
          storageRef: 's3://redacted/ref',
          privacyClass: 'high',
          redactionStatus: 'partially_redacted',
          summary: 'Redacted tool trace.',
        }],
      },
    });

    expect(result).toEqual({ eventId: 'evt-2', inserted: true, evidenceInserted: 1 });
    expect(query).toHaveBeenCalledTimes(3);
    const evidenceParams = query.mock.calls[2][1];
    expect(evidenceParams.slice(0, 4)).toEqual([TENANT_ID, 'evref-1', 'evt-2', 'tool_trace']);
    expect(evidenceParams[5]).toBe('high');
    expect(evidenceParams[6]).toBe('partially_redacted');
  });

  test('rejects events for unregistered or inactive surfaces', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await expect(recordLearningEvent({
      tenantId: TENANT_ID,
      event: {
        sourceSystem: 'fad',
        surfaceId: 'missing_surface',
        privacyClass: 'high',
        redactionStatus: 'partially_redacted',
      },
    })).rejects.toThrow('surfaceId is not registered');

    expect(query).toHaveBeenCalledTimes(1);
  });

  test('rejects staff events that exceed surface policy', async () => {
    query.mockResolvedValueOnce({ rows: [surfaceRow()] });

    await expect(recordLearningEvent({
      tenantId: TENANT_ID,
      event: {
        sourceSystem: 'fad',
        surfaceId: 'fad_consult',
        privacyClass: 'high',
        redactionStatus: 'partially_redacted',
        knowledgeUsed: ['finance_restricted'],
      },
    })).rejects.toThrow('knowledgeUsed is not allowed');

    expect(query).toHaveBeenCalledTimes(1);
  });
});
