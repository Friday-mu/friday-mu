'use strict';

jest.mock('../database/client', () => ({
  query: jest.fn(),
}));

const { query } = require('../database/client');
const { runEvalSuite, _test } = require('./eval_runner');

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

function contextPack() {
  return {
    pack_id: 'website_ask_friday_fab_v4',
    surface_id: 'website_ask_friday_fab',
    version: 4,
    status: 'published',
    knowledge_scopes: ['public_brand', 'public_residences'],
    tool_policy: { allowedTools: ['search_residences'] },
  };
}

function evalCase(overrides = {}) {
  return {
    eval_id: overrides.eval_id || 'eval-1',
    suite_id: overrides.suite_id || 'website_ask_friday_fab_regression',
    surface_id: overrides.surface_id || 'website_ask_friday_fab',
    source_event_ids: ['evt-1'],
    input_payload: overrides.input_payload || {
      promptSummary: 'Asked for a residence.',
      toolsUsed: ['search_residences'],
    },
    expected: overrides.expected || {
      requiredKnowledgeScopes: ['public_residences'],
      shouldGroundInApprovedKnowledge: true,
    },
    assertions: overrides.assertions || [
      { type: 'privacy_redaction' },
      { type: 'tool_policy' },
      { type: 'grounding' },
      { type: 'low_confidence_honesty' },
    ],
    status: 'active',
  };
}

describe('Ask Friday eval runner', () => {
  beforeEach(() => {
    query.mockReset();
  });

  test('evaluates deterministic assertions against a context pack', () => {
    const result = _test.evaluateCase(evalCase(), contextPack());

    expect(result.status).toBe('pass');
    expect(result.passed).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(1);
  });

  test('fails on unredacted secret-like eval payloads', () => {
    const result = _test.evaluateCase(evalCase({
      input_payload: {
        promptSummary: 'Here is api_key=secret',
        toolsUsed: ['search_residences'],
      },
    }), contextPack());

    expect(result.status).toBe('fail');
    expect(result.assertions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'privacy_redaction', status: 'fail' }),
    ]));
  });

  test('runs and records an eval suite summary', async () => {
    query
      .mockResolvedValueOnce({ rows: [contextPack()] })
      .mockResolvedValueOnce({ rows: [evalCase()] })
      .mockResolvedValueOnce({
        rows: [{
          run_id: 'run-1',
          suite_id: 'website_ask_friday_fab_regression',
          context_pack_id: 'website_ask_friday_fab_v4',
          context_pack_version: 4,
          status: 'completed',
          summary: { cases: 1, failedCases: 0 },
          started_at: new Date('2026-05-23T08:00:00.000Z'),
          completed_at: new Date('2026-05-23T08:00:00.000Z'),
        }],
      });

    const result = await runEvalSuite({
      tenantId: TENANT_ID,
      runId: 'run-1',
      suiteId: 'website_ask_friday_fab_regression',
      surfaceId: 'website_ask_friday_fab',
    });

    expect(result.summary).toMatchObject({
      cases: 1,
      failedCases: 0,
      status: 'passed',
    });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[2][0]).toContain('INSERT INTO ask_friday_eval_runs');
    expect(JSON.parse(query.mock.calls[2][1][6])).toMatchObject({
      cases: 1,
      failedCases: 0,
      status: 'passed',
    });
  });
});
