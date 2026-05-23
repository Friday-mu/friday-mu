'use strict';

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../database/client', () => ({
  query: jest.fn(),
}));

const { query } = require('../database/client');
const { router } = require('./index');

const JWT_SECRET = 'ask-friday-core-test-secret';
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

function app() {
  const server = express();
  server.use(express.json());
  server.use('/api/ask-friday/core', router);
  return server;
}

function apiToken(scopes = []) {
  return jwt.sign({
    sub: 'friday-website',
    scopes,
    tenant_id: TENANT_ID,
  }, JWT_SECRET, {
    algorithm: 'HS256',
    issuer: 'fad',
    audience: 'fad-public-api',
    expiresIn: 900,
    jwtid: 'test-jti',
  });
}

function userToken() {
  return jwt.sign({
    user_id: USER_ID,
    role: 'admin',
    username: 'ishant',
    display_name: 'Ishant Sagoo',
    tenant_id: TENANT_ID,
  }, JWT_SECRET);
}

describe('Ask Friday Core router', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
  });

  test('stores public learning events with redaction and evidence refs', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          event_id: 'evt-1',
          created_at: new Date('2026-05-23T08:00:00.000Z'),
          received_at: new Date('2026-05-23T08:00:01.000Z'),
          source_system: 'friday-website',
          surface_id: 'website_ask_friday_fab',
          identity_ref: { identityType: 'anonymous' },
          session_id: 'sess-1',
          locale: 'en',
          page_url: 'https://friday.mu/en',
          intent: 'find_property',
          user_turn_summary: 'Asked for July. [REDACTED]',
          assistant_action_summary: 'Suggested residences.',
          tools_used: ['listings'],
          knowledge_used: ['public_residences'],
          confidence: 'medium',
          outcome: 'continued',
          handoff: { triggered: false },
          signals: {},
          privacy_class: 'medium',
          redaction_status: 'redacted',
          evidence_refs: [{ evidenceType: 'screenshot' }],
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'evidence-row' }] });

    const res = await request(app())
      .post('/api/ask-friday/core/events')
      .set('Authorization', `Bearer ${apiToken(['ask-friday:events:write'])}`)
      .send({
        eventId: 'evt-1',
        sourceSystem: 'friday-website',
        surfaceId: 'website_ask_friday_fab',
        sessionId: 'sess-1',
        locale: 'en',
        pageUrl: 'https://friday.mu/en',
        intent: 'find_property',
        userTurnSummary: 'Asked for July. api_key=secret',
        assistantActionSummary: 'Suggested residences.',
        toolsUsed: ['listings'],
        knowledgeUsed: ['public_residences'],
        confidence: 'medium',
        outcome: 'continued',
        privacyClass: 'medium',
        redactionStatus: 'redacted',
        evidenceRefs: [{ evidenceType: 'screenshot', storageRef: 'blob://screenshot-1' }],
      })
      .expect(201);

    expect(res.body.ok).toBe(true);
    expect(res.body.evidenceInserted).toBe(1);
    expect(query).toHaveBeenCalledTimes(2);
    const insertParams = query.mock.calls[0][1];
    expect(insertParams[0]).toBe(TENANT_ID);
    expect(insertParams[1]).toBe('evt-1');
    expect(insertParams[10]).toBe('Asked for July. [REDACTED]');
    expect(JSON.parse(insertParams[20])).toEqual([
      expect.objectContaining({ evidenceType: 'screenshot', eventId: 'evt-1' }),
    ]);
  });

  test('requires explicit public scope for learning event writes', async () => {
    await request(app())
      .post('/api/ask-friday/core/events')
      .set('Authorization', `Bearer ${apiToken(['listings:read'])}`)
      .send({
        sourceSystem: 'friday-website',
        surfaceId: 'website_ask_friday_fab',
      })
      .expect(403);

    expect(query).not.toHaveBeenCalled();
  });

  test('returns latest published context pack to public API clients', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        pack_id: 'website_ask_friday_fab_v3',
        surface_id: 'website_ask_friday_fab',
        version: 3,
        status: 'published',
        knowledge_scopes: ['public_brand'],
        behavior_rules: [{ id: 'ask_one_followup' }],
        tool_policy: { web_search: 'restricted' },
        memory_policy: { anonymous: 'session_only' },
        source_snapshot_refs: [{ type: 'kb', version: '2026-05-23' }],
        pack_payload: { summary: 'Approved context' },
        approved_by: 'Ishant',
        approved_at: new Date('2026-05-23T08:00:00.000Z'),
        published_at: new Date('2026-05-23T08:01:00.000Z'),
        updated_at: new Date('2026-05-23T08:01:00.000Z'),
      }],
    });

    const res = await request(app())
      .get('/api/ask-friday/core/context-packs/website_ask_friday_fab')
      .set('Authorization', `Bearer ${apiToken(['ask-friday:context:read'])}`)
      .expect(200);

    expect(res.body.contextPack).toMatchObject({
      packId: 'website_ask_friday_fab_v3',
      surfaceId: 'website_ask_friday_fab',
      status: 'published',
      approvedBy: 'Ishant',
    });
    expect(query.mock.calls[0][1]).toEqual([TENANT_ID, 'website_ask_friday_fab']);
  });

  test('creates and reviews KB candidates through staff auth only', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          candidate_id: 'cand-1',
          candidate_type: 'behavior_rule',
          target_layer: 'surface_behavior',
          proposed_change: { add: 'Ask one follow-up at a time.' },
          source_event_ids: ['evt-1'],
          evidence_summary: 'Repeated feedback issue.',
          risk_class: 'medium',
          trust_tier: 'surface_evidence',
          review_status: 'pending',
          created_at: new Date('2026-05-23T08:00:00.000Z'),
          updated_at: new Date('2026-05-23T08:00:00.000Z'),
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          candidate_id: 'cand-1',
          candidate_type: 'behavior_rule',
          target_layer: 'surface_behavior',
          proposed_change: { add: 'Ask one follow-up at a time.' },
          source_event_ids: ['evt-1'],
          evidence_summary: 'Repeated feedback issue.',
          risk_class: 'medium',
          trust_tier: 'surface_evidence',
          review_status: 'approved',
          reviewer: 'Ishant Sagoo',
          review_note: 'Approved.',
          reviewed_at: new Date('2026-05-23T08:05:00.000Z'),
          approved_snapshot_version: 'kb-2026-05-23',
          created_at: new Date('2026-05-23T08:00:00.000Z'),
          updated_at: new Date('2026-05-23T08:05:00.000Z'),
        }],
      });

    const create = await request(app())
      .post('/api/ask-friday/core/kb-candidates')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({
        candidateId: 'cand-1',
        candidateType: 'behavior_rule',
        targetLayer: 'surface_behavior',
        proposedChange: { add: 'Ask one follow-up at a time.' },
        sourceEventIds: ['evt-1'],
        evidenceSummary: 'Repeated feedback issue.',
      })
      .expect(201);

    expect(create.body.candidate.reviewStatus).toBe('pending');

    const review = await request(app())
      .patch('/api/ask-friday/core/kb-candidates/cand-1')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({
        reviewStatus: 'approved',
        reviewNote: 'Approved.',
        approvedSnapshotVersion: 'kb-2026-05-23',
      })
      .expect(200);

    expect(review.body.candidate).toMatchObject({
      candidateId: 'cand-1',
      reviewStatus: 'approved',
      reviewer: 'Ishant Sagoo',
    });
    expect(query.mock.calls[1][1][4]).toBe(TENANT_ID);
  });

  test('queues public action requests instead of executing them', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        action_id: 'act-1',
        source_system: 'friday-website',
        surface_id: 'website_ask_friday_fab',
        requested_by: { identityType: 'api_client', identityKey: 'friday-website', authenticated: true },
        action_type: 'request_booking',
        risk_class: 'approval',
        payload: { residence: 'GBH-C8' },
        reason: 'Guest asked to book.',
        approval_required: true,
        status: 'pending',
        created_at: new Date('2026-05-23T08:00:00.000Z'),
        updated_at: new Date('2026-05-23T08:00:00.000Z'),
      }],
    });

    const res = await request(app())
      .post('/api/ask-friday/core/action-requests/public')
      .set('Authorization', `Bearer ${apiToken(['ask-friday:actions:write'])}`)
      .send({
        actionId: 'act-1',
        sourceSystem: 'friday-website',
        surfaceId: 'website_ask_friday_fab',
        actionType: 'request_booking',
        payload: { residence: 'GBH-C8' },
        reason: 'Guest asked to book.',
      })
      .expect(201);

    expect(res.body.actionRequest).toMatchObject({
      actionId: 'act-1',
      status: 'pending',
      approvalRequired: true,
    });
    expect(query.mock.calls[0][1][0]).toBe(TENANT_ID);
  });

  test('records public consent-backed identity links for durable memory', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          identity_key: 'guest:stay-token-hash',
          identity_type: 'stay_guest',
          subject_ref: { stayTokenHash: 'stay-token-hash' },
          durable_memory_allowed: true,
          consent_status: 'granted',
          last_seen_at: new Date('2026-05-23T08:00:00.000Z'),
          updated_at: new Date('2026-05-23T08:00:00.000Z'),
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app())
      .post('/api/ask-friday/core/identity-links/public')
      .set('Authorization', `Bearer ${apiToken(['ask-friday:identity:write'])}`)
      .send({
        identityKey: 'guest:stay-token-hash',
        identityType: 'stay_guest',
        subjectRef: { stayTokenHash: 'stay-token-hash' },
        durableMemoryAllowed: true,
        consentStatus: 'granted',
        consentEventType: 'memory_granted',
        sourceSystem: 'friday-website',
        surfaceId: 'website_ask_friday_fab',
      })
      .expect(201);

    expect(res.body.identityLink).toMatchObject({
      identityKey: 'guest:stay-token-hash',
      identityType: 'stay_guest',
      durableMemoryAllowed: true,
      consentStatus: 'granted',
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][1][0]).toBe(TENANT_ID);
    expect(query.mock.calls[1][1][3]).toBe('friday-website');
  });

  test('publishes context packs from approved KB candidates through staff route', async () => {
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
          reviewer: 'Ishant Sagoo',
        }],
      })
      .mockResolvedValueOnce({ rows: [{ next_version: 5 }] })
      .mockResolvedValueOnce({
        rows: [{
          pack_id: 'website_ask_friday_fab_v5',
          surface_id: 'website_ask_friday_fab',
          version: 5,
          status: 'published',
          knowledge_scopes: ['public_brand'],
          behavior_rules: [{ id: 'ask_one_followup' }],
          tool_policy: { allowedTools: ['search_residences'] },
          memory_policy: { anonymous: 'session_only' },
          source_snapshot_refs: [{ type: 'kb_candidate', candidateId: 'cand-1' }],
          pack_payload: { compactPrompt: 'Approved context' },
          approved_by: 'Ishant Sagoo',
          approved_at: new Date('2026-05-23T08:00:00.000Z'),
          published_at: new Date('2026-05-23T08:00:00.000Z'),
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app())
      .post('/api/ask-friday/core/context-packs/publish')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({
        surfaceId: 'website_ask_friday_fab',
        candidateIds: ['cand-1'],
        knowledgeScopes: ['public_brand'],
        behaviorRules: [{ id: 'ask_one_followup' }],
        toolPolicy: { allowedTools: ['search_residences'] },
        memoryPolicy: { anonymous: 'session_only' },
        packPayload: { compactPrompt: 'Approved context' },
      })
      .expect(201);

    expect(res.body.contextPack).toMatchObject({
      packId: 'website_ask_friday_fab_v5',
      status: 'published',
      approvedBy: 'Ishant Sagoo',
    });
    expect(res.body.approvedCandidates).toHaveLength(1);
    expect(query).toHaveBeenCalledTimes(4);
  });

  test('records deterministic eval runs from active eval cases', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          pack_id: 'website_ask_friday_fab_v5',
          surface_id: 'website_ask_friday_fab',
          version: 5,
          status: 'published',
          knowledge_scopes: ['public_residences'],
          tool_policy: { allowedTools: ['search_residences'] },
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          eval_id: 'eval-1',
          suite_id: 'website_ask_friday_fab_regression',
          surface_id: 'website_ask_friday_fab',
          source_event_ids: ['evt-1'],
          input_payload: { promptSummary: 'Asked for a residence.', toolsUsed: ['search_residences'] },
          expected: { requiredKnowledgeScopes: ['public_residences'] },
          assertions: [{ type: 'privacy_redaction' }, { type: 'tool_policy' }, { type: 'grounding' }],
          status: 'active',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          run_id: 'run-1',
          suite_id: 'website_ask_friday_fab_regression',
          context_pack_id: 'website_ask_friday_fab_v5',
          context_pack_version: 5,
          status: 'completed',
          summary: { cases: 1, failedCases: 0, status: 'passed' },
          started_at: new Date('2026-05-23T08:00:00.000Z'),
          completed_at: new Date('2026-05-23T08:00:00.000Z'),
          created_at: new Date('2026-05-23T08:00:00.000Z'),
        }],
      });

    const res = await request(app())
      .post('/api/ask-friday/core/eval-runs')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({
        runId: 'run-1',
        suiteId: 'website_ask_friday_fab_regression',
        surfaceId: 'website_ask_friday_fab',
      })
      .expect(201);

    expect(res.body.evalRun).toMatchObject({
      runId: 'run-1',
      status: 'completed',
      contextPackId: 'website_ask_friday_fab_v5',
    });
    expect(query).toHaveBeenCalledTimes(3);
  });
});
