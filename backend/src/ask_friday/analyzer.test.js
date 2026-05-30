'use strict';

jest.mock('../database/client', () => ({
  query: jest.fn(),
}));

const { query } = require('../database/client');
const { runAnalyzer, _test } = require('./analyzer');

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

function event(overrides = {}) {
  return {
    event_id: overrides.event_id || 'evt-1',
    created_at: overrides.created_at || new Date('2026-05-23T08:00:00.000Z'),
    source_system: 'friday-website',
    surface_id: overrides.surface_id || 'website_ask_friday_fab',
    intent: overrides.intent || 'find_property',
    user_turn_summary: overrides.user_turn_summary || 'Asked for a residence. token=hidden',
    assistant_action_summary: overrides.assistant_action_summary || 'Could not answer confidently.',
    tools_used: overrides.tools_used || ['search_residences'],
    knowledge_used: overrides.knowledge_used || ['public_residences'],
    confidence: overrides.confidence || 'low',
    outcome: overrides.outcome || 'low_confidence',
    handoff: overrides.handoff || {},
    signals: overrides.signals || {},
    privacy_class: 'medium',
    redaction_status: 'redacted',
  };
}

describe('Ask Friday learning analyzer', () => {
  beforeEach(() => {
    query.mockReset();
  });

  test('clusters repeated redacted learning events into review candidates', () => {
    const clusters = _test.buildClusters([
      event({ event_id: 'evt-1' }),
      event({ event_id: 'evt-2', user_turn_summary: 'Asked again for similar stay.' }),
      event({ event_id: 'evt-3', confidence: 'high', outcome: 'resolved' }),
    ], { minClusterSize: 2 });

    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({
      surfaceId: 'website_ask_friday_fab',
      intent: 'find_property',
      signal: 'low_confidence',
    });

    const candidate = _test.candidateFromCluster(clusters[0]);
    const evalCase = _test.evalCaseFromCluster(clusters[0]);

    expect(candidate).toMatchObject({
      candidateType: 'knowledge_gap',
      targetLayer: 'canonical_or_surface_knowledge',
      trustTier: 'production_event_cluster',
      reviewStatus: 'pending',
      reviewLane: 'public',
      reviewerDomain: 'product',
      allowedSurfaceIds: ['website_ask_friday_fab'],
      targetPrivacyClass: 'medium',
    });
    expect(candidate.evidenceSummary).not.toMatch(/token=hidden/);
    expect(evalCase.suiteId).toBe('website_ask_friday_fab_regression');
    expect(evalCase.expected.shouldNotExposePrivateData).toBe(true);
  });

  test('dry-run analyzer does not write candidates or eval cases', async () => {
    query.mockResolvedValueOnce({
      rows: [
        event({ event_id: 'evt-1' }),
        event({ event_id: 'evt-2' }),
      ],
    });

    const result = await runAnalyzer({
      tenantId: TENANT_ID,
      surfaceId: 'website_ask_friday_fab',
      sinceHours: 72,
      minClusterSize: 2,
      dryRun: true,
    });

    expect(result).toMatchObject({
      dryRun: true,
      inspectedEvents: 2,
      clusters: 1,
      insertedCandidates: 0,
      insertedEvalCases: 0,
    });
    expect(result.candidates).toHaveLength(1);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([TENANT_ID, 72, 'website_ask_friday_fab']);
  });

  test('non-dry-run analyzer inserts candidates and eval cases without publishing truth', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          event({ event_id: 'evt-1' }),
          event({ event_id: 'evt-2' }),
        ],
      })
      .mockResolvedValueOnce({ rows: [{ candidate_id: 'candidate' }] })
      .mockResolvedValueOnce({ rows: [{ eval_id: 'eval' }] });

    const result = await runAnalyzer({
      tenantId: TENANT_ID,
      minClusterSize: 2,
      dryRun: false,
    });

    expect(result).toMatchObject({
      dryRun: false,
      insertedCandidates: 1,
      insertedEvalCases: 1,
    });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1][0]).toContain('INSERT INTO ask_friday_kb_candidates');
    expect(query.mock.calls[2][0]).toContain('INSERT INTO ask_friday_eval_cases');
    expect(query.mock.calls[1][0]).not.toContain('ask_friday_context_packs');
    expect(query.mock.calls[1][1]).toEqual(expect.arrayContaining([
      'public',
      'product',
      ['website_ask_friday_fab'],
      'medium',
    ]));
  });
});
