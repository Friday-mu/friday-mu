'use strict';

jest.mock('../database/client', () => ({
  query: jest.fn(),
}));

const { query } = require('../database/client');
const { publishContextPack } = require('./publisher');

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

function surfaceRow(overrides = {}) {
  return {
    surface_id: 'website_ask_friday_fab',
    source_system: 'friday-website',
    access_class: 'public',
    allowed_knowledge_scopes: ['public_brand'],
    allowed_tools: ['search_residences'],
    allowed_actions: ['request_booking'],
    status: 'active',
    ...overrides,
  };
}

describe('Ask Friday context-pack publisher', () => {
  beforeEach(() => {
    query.mockReset();
  });

  test('publishes a context pack from approved candidate alias', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          candidate_id: 'cand-1',
          candidate_type: 'behavior_rule',
          target_layer: 'surface_behavior',
          proposed_change: { add: 'Ask one follow-up.' },
          source_event_ids: ['evt-1'],
          evidence_summary: 'Approved evidence.',
          risk_class: 'medium',
          trust_tier: 'surface_evidence',
          review_status: 'approved',
          reviewer: 'Ishant Ayadassen',
        }],
      })
      .mockResolvedValueOnce({ rows: [surfaceRow({ eval_suite_ids: ['website_fab_routing'] })] })
      .mockResolvedValueOnce({
        rows: [{
          run_id: 'run-pass',
          suite_id: 'website_fab_routing',
          status: 'completed',
          summary: { status: 'passed' },
        }],
      })
      .mockResolvedValueOnce({ rows: [{ next_version: 4 }] })
      .mockResolvedValueOnce({
        rows: [{
          pack_id: 'website_ask_friday_fab_v4',
          surface_id: 'website_ask_friday_fab',
          version: 4,
          status: 'published',
          knowledge_scopes: ['public_brand'],
          behavior_rules: [{ id: 'ask_one_followup' }],
          tool_policy: { allowedTools: ['search_residences'] },
          memory_policy: { anonymous: 'session_only' },
          source_snapshot_refs: [{ type: 'kb_candidate', candidateId: 'cand-1' }],
          pack_payload: { compactPrompt: 'Approved context' },
          approved_by: 'Ishant Ayadassen',
          approved_at: new Date('2026-05-23T08:00:00.000Z'),
          published_at: new Date('2026-05-23T08:00:00.000Z'),
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await publishContextPack({
      tenantId: TENANT_ID,
      surfaceId: 'website_ask_friday_fab',
      approvedCandidateIds: ['cand-1'],
      knowledgeScopes: ['public_brand'],
      behaviorRules: [{ id: 'ask_one_followup' }],
      toolPolicy: { allowedTools: ['search_residences'] },
      memoryPolicy: { anonymous: 'session_only' },
      packPayload: { compactPrompt: 'Approved context' },
      evalRunId: 'run-pass',
      approvedBy: 'Ishant Ayadassen',
    });

    expect(result.contextPack.pack_id).toBe('website_ask_friday_fab_v4');
    expect(result.approvedCandidates).toHaveLength(1);
    expect(query).toHaveBeenCalledTimes(6);
    expect(query.mock.calls[4][0]).toContain('INSERT INTO ask_friday_context_packs');
    expect(JSON.parse(query.mock.calls[4][1][8])).toEqual([
      expect.objectContaining({ type: 'kb_candidate', candidateId: 'cand-1' }),
      expect.objectContaining({ type: 'eval_run', runId: 'run-pass' }),
    ]);
    expect(query.mock.calls[5][0]).toContain('UPDATE ask_friday_kb_candidates');
  });

  test('publishes manually approved context pack without candidates', async () => {
    query
      .mockResolvedValueOnce({
        rows: [surfaceRow({
          surface_id: 'fad_consult',
          source_system: 'fad',
          access_class: 'staff',
          allowed_knowledge_scopes: ['staff_inbox'],
          allowed_tools: [],
        })],
      })
      .mockResolvedValueOnce({ rows: [{ next_version: 2 }] })
      .mockResolvedValueOnce({
        rows: [{
          pack_id: 'fad_consult_v2',
          surface_id: 'fad_consult',
          version: 2,
          status: 'published',
          knowledge_scopes: ['staff_inbox'],
          behavior_rules: [],
          tool_policy: {},
          memory_policy: {},
          source_snapshot_refs: [{
            type: 'manual_approval',
            approvedBy: 'Ishant Sagoo',
            rationale: 'Published from review module.',
          }],
          pack_payload: { compactPrompt: 'Manual staff pack' },
          approved_by: 'Ishant Sagoo',
          approved_at: new Date('2026-05-23T08:00:00.000Z'),
          published_at: new Date('2026-05-23T08:00:00.000Z'),
        }],
      });

    const result = await publishContextPack({
      tenantId: TENANT_ID,
      surfaceId: 'fad_consult',
      manualApproval: true,
      manualApprovalRationale: 'Published from review module.',
      knowledgeScopes: ['staff_inbox'],
      packPayload: { compactPrompt: 'Manual staff pack' },
      evalGateOverride: true,
      approvedBy: 'Ishant Sagoo',
    });

    expect(result.contextPack.pack_id).toBe('fad_consult_v2');
    expect(result.approvedCandidates).toHaveLength(0);
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[2][0]).toContain('INSERT INTO ask_friday_context_packs');
    expect(JSON.parse(query.mock.calls[2][1][8])).toEqual([
      expect.objectContaining({
        type: 'eval_gate_override',
        approvedBy: 'Ishant Sagoo',
        rationale: 'Published from review module.',
      }),
      expect.objectContaining({
        type: 'manual_approval',
        approvedBy: 'Ishant Sagoo',
        rationale: 'Published from review module.',
      }),
    ]);
  });

  test('rejects unapproved or missing candidates before publishing', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await expect(publishContextPack({
      tenantId: TENANT_ID,
      surfaceId: 'website_ask_friday_fab',
      candidateIds: ['cand-missing'],
      approvedBy: 'Ishant Ayadassen',
    })).rejects.toThrow('candidateIds must all reference approved candidates');

    expect(query).toHaveBeenCalledTimes(1);
  });

  test('requires explicit manual approval when no candidate ids are provided', async () => {
    await expect(publishContextPack({
      tenantId: TENANT_ID,
      surfaceId: 'website_ask_friday_fab',
      approvedBy: 'Ishant Ayadassen',
    })).rejects.toThrow('approved candidateIds or manualApproval:true is required');

    expect(query).not.toHaveBeenCalled();
  });

  test('requires eval gate pass or explicit override before publishing', async () => {
    query
      .mockResolvedValueOnce({ rows: [surfaceRow({ eval_suite_ids: ['website_fab_routing'] })] });

    await expect(publishContextPack({
      tenantId: TENANT_ID,
      surfaceId: 'website_ask_friday_fab',
      manualApproval: true,
      approvedBy: 'Ishant Ayadassen',
    })).rejects.toThrow('eval gate requires');

    expect(query).toHaveBeenCalledTimes(1);
  });
});
