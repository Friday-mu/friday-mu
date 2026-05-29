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
    display_name: 'Ishant Ayadassen',
    tenant_id: TENANT_ID,
  }, JWT_SECRET);
}

function surfaceRow(overrides = {}) {
  return {
    surface_id: 'website_ask_friday_fab',
    display_name: 'Ask Friday FAB',
    audience: 'public_mixed',
    source_system: 'friday-website',
    access_class: 'public',
    allowed_knowledge_scopes: ['public_brand', 'public_residences'],
    allowed_tools: ['listings', 'search_residences'],
    allowed_actions: ['request_booking', 'request_handoff'],
    status: 'active',
    ...overrides,
  };
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
        rows: [surfaceRow()],
      })
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
        evidenceRefs: [{
          evidenceType: 'screenshot',
          storageRef: 'blob://screenshot-1',
          privacyClass: 'medium',
          redactionStatus: 'redacted',
        }],
      })
      .expect(201);

    expect(res.body.ok).toBe(true);
    expect(res.body.evidenceInserted).toBe(1);
    expect(query).toHaveBeenCalledTimes(3);
    const insertParams = query.mock.calls[1][1];
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
    query
      .mockResolvedValueOnce({ rows: [surfaceRow()] })
      .mockResolvedValueOnce({
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
    expect(query.mock.calls[1][1]).toEqual([TENANT_ID, 'website_ask_friday_fab']);
  });

  test('blocks public context-pack reads for staff surfaces', async () => {
    query.mockResolvedValueOnce({
      rows: [surfaceRow({
        surface_id: 'fad_consult',
        source_system: 'fad',
        access_class: 'staff',
        allowed_knowledge_scopes: ['staff_inbox'],
      })],
    });

    await request(app())
      .get('/api/ask-friday/core/context-packs/fad_consult')
      .set('Authorization', `Bearer ${apiToken(['ask-friday:context:read'])}`)
      .expect(403);

    expect(query).toHaveBeenCalledTimes(1);
  });

  test('returns staff readiness with context-pack and eval coverage', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        ...surfaceRow({
          surface_id: 'fad_reservations_calendar_assistant',
          display_name: 'Reservations / Calendar Assistant',
          audience: 'staff',
          source_system: 'fad',
          access_class: 'staff',
          allowed_knowledge_scopes: ['reservations-calendar', 'availability'],
          allowed_tools: ['load_calendar_context'],
          allowed_actions: ['request_booking_quote'],
          eval_suite_ids: ['reservations_calendar_actions'],
        }),
        draft_pack_id: 'fad_reservations_calendar_assistant_v1_draft',
        draft_version: 1,
        draft_status: 'draft',
        draft_approved_by: null,
        draft_approved_at: null,
        draft_published_at: null,
        draft_updated_at: new Date('2026-05-29T08:00:00.000Z'),
        published_pack_id: null,
        published_version: null,
        published_status: null,
        published_approved_by: null,
        published_approved_at: null,
        published_published_at: null,
        published_updated_at: null,
        active_eval_case_count: 2,
        active_eval_suite_ids: ['reservations_calendar_actions'],
      }, {
        ...surfaceRow({
          surface_id: 'website_guest_hero',
          display_name: 'Website Guest Hero',
          audience: 'public',
          source_system: 'friday-website',
          access_class: 'public',
          allowed_knowledge_scopes: ['public_brand'],
          allowed_tools: ['search_residences'],
          allowed_actions: ['request_handoff'],
          eval_suite_ids: ['website_public_contracts'],
        }),
        draft_pack_id: null,
        draft_version: null,
        draft_status: null,
        draft_approved_by: null,
        draft_approved_at: null,
        draft_published_at: null,
        draft_updated_at: null,
        published_pack_id: null,
        published_version: null,
        published_status: null,
        published_approved_by: null,
        published_approved_at: null,
        published_published_at: null,
        published_updated_at: null,
        active_eval_case_count: 0,
        active_eval_suite_ids: [],
      }],
    });

    const res = await request(app())
      .get('/api/ask-friday/core/readiness?status=all')
      .set('Authorization', `Bearer ${userToken()}`)
      .expect(200);

    expect(res.body.summary).toMatchObject({
      total: 2,
      active: 2,
      ready: 1,
      blocked: 1,
      missingPublishedContextPacks: 1,
      missingEvalCoverage: 1,
    });
    expect(res.body.surfaces[0]).toMatchObject({
      surfaceId: 'fad_reservations_calendar_assistant',
      readinessStatus: 'ready',
      contextPackExpectation: {
        hasTemplate: true,
        requiredStatus: 'draft_or_published',
      },
      contextPacks: {
        latestDraft: {
          packId: 'fad_reservations_calendar_assistant_v1_draft',
          status: 'draft',
        },
      },
      evals: {
        activeCaseCount: 2,
        missingDeclaredSuiteIds: [],
      },
    });
    expect(res.body.surfaces[1].flags).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing_published_context_pack', severity: 'blocker' }),
      expect.objectContaining({ code: 'missing_eval_cases', severity: 'warning' }),
    ]));
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([TENANT_ID]);
  });

  test('requires staff auth for readiness reports', async () => {
    await request(app())
      .get('/api/ask-friday/core/readiness')
      .expect(401);

    expect(query).not.toHaveBeenCalled();
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
          review_lane: 'public',
          reviewer_domain: 'product',
          allowed_surface_ids: ['website_ask_friday_fab'],
          target_privacy_class: 'medium',
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
          review_lane: 'public',
          reviewer_domain: 'product',
          allowed_surface_ids: ['website_ask_friday_fab'],
          target_privacy_class: 'medium',
          reviewer: 'Ishant Ayadassen',
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
        reviewLane: 'public',
        reviewerDomain: 'product',
        allowedSurfaceIds: ['website_ask_friday_fab'],
        targetPrivacyClass: 'medium',
      })
      .expect(201);

    expect(create.body.candidate.reviewStatus).toBe('pending');
    expect(create.body.candidate).toMatchObject({
      reviewLane: 'public',
      reviewerDomain: 'product',
      allowedSurfaceIds: ['website_ask_friday_fab'],
      targetPrivacyClass: 'medium',
    });
    expect(query.mock.calls[0][1]).toEqual(expect.arrayContaining([
      'public',
      'product',
      ['website_ask_friday_fab'],
      'medium',
    ]));

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
      reviewer: 'Ishant Ayadassen',
    });
    expect(query.mock.calls[1][1][4]).toBe(TENANT_ID);
  });

  test('queues public action requests instead of executing them', async () => {
    query
      .mockResolvedValueOnce({ rows: [surfaceRow()] })
      .mockResolvedValueOnce({
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
    expect(query.mock.calls[1][1][0]).toBe(TENANT_ID);
  });

  test('queues owner follow-up and feedback public action requests under surface policy', async () => {
    query
      .mockResolvedValueOnce({
        rows: [surfaceRow({
          surface_id: 'website_owner_enquiry',
          allowed_knowledge_scopes: ['public_owner_overview', 'owner_qualification'],
          allowed_tools: ['extract_owner_fields', 'prepare_owner_followup'],
          allowed_actions: ['request_owner_followup', 'request_handoff'],
        })],
      })
      .mockResolvedValueOnce({
        rows: [{
          action_id: 'act-owner-1',
          source_system: 'friday-website',
          surface_id: 'website_owner_enquiry',
          requested_by: { identityType: 'api_client', identityKey: 'friday-website', authenticated: true },
          action_type: 'request_owner_followup',
          risk_class: 'approval',
          payload: {
            ownerLeadCapsule: {
              readiness: { status: 'ready_for_staff_followup' },
              constraints: { noRevenueGuarantee: true },
            },
          },
          reason: 'Owner asked for Friday follow-up.',
          approval_required: true,
          status: 'pending',
          created_at: new Date('2026-05-28T08:00:00.000Z'),
          updated_at: new Date('2026-05-28T08:00:00.000Z'),
        }],
      })
      .mockResolvedValueOnce({
        rows: [surfaceRow({
          surface_id: 'website_feedback_bug',
          access_class: 'public_diagnostic',
          allowed_knowledge_scopes: ['feedback_diagnostics', 'public_site_context'],
          allowed_tools: ['inspect_feedback_context'],
          allowed_actions: ['create_feedback_issue'],
        })],
      })
      .mockResolvedValueOnce({
        rows: [{
          action_id: 'act-feedback-1',
          source_system: 'friday-website',
          surface_id: 'website_feedback_bug',
          requested_by: { identityType: 'api_client', identityKey: 'friday-website', authenticated: true },
          action_type: 'create_feedback_issue',
          risk_class: 'approval',
          payload: {
            feedbackEvidenceRef: 'afev_screenshot_01',
            report: { summary: 'Mobile submit button is hidden.' },
          },
          reason: 'Bug report captured from Website feedback.',
          approval_required: true,
          status: 'pending',
          created_at: new Date('2026-05-28T08:01:00.000Z'),
          updated_at: new Date('2026-05-28T08:01:00.000Z'),
        }],
      });

    const owner = await request(app())
      .post('/api/ask-friday/core/action-requests/public')
      .set('Authorization', `Bearer ${apiToken(['ask-friday:actions:write'])}`)
      .send({
        actionId: 'act-owner-1',
        sourceSystem: 'friday-website',
        surfaceId: 'website_owner_enquiry',
        actionType: 'request_owner_followup',
        payload: {
          ownerLeadCapsule: {
            readiness: { status: 'ready_for_staff_followup' },
            constraints: { noRevenueGuarantee: true },
          },
        },
        reason: 'Owner asked for Friday follow-up.',
      })
      .expect(201);

    const feedback = await request(app())
      .post('/api/ask-friday/core/action-requests/public')
      .set('Authorization', `Bearer ${apiToken(['ask-friday:actions:write'])}`)
      .send({
        actionId: 'act-feedback-1',
        sourceSystem: 'friday-website',
        surfaceId: 'website_feedback_bug',
        actionType: 'create_feedback_issue',
        payload: {
          feedbackEvidenceRef: 'afev_screenshot_01',
          report: { summary: 'Mobile submit button is hidden.' },
        },
        reason: 'Bug report captured from Website feedback.',
      })
      .expect(201);

    expect(owner.body.actionRequest).toMatchObject({
      actionId: 'act-owner-1',
      actionType: 'request_owner_followup',
      approvalRequired: true,
      status: 'pending',
    });
    expect(feedback.body.actionRequest).toMatchObject({
      actionId: 'act-feedback-1',
      actionType: 'create_feedback_issue',
      approvalRequired: true,
      status: 'pending',
    });
    expect(query).toHaveBeenCalledTimes(4);
  });

  test('validates staff action requests against registered surface policy', async () => {
    query
      .mockResolvedValueOnce({
        rows: [surfaceRow({
          surface_id: 'fad_global_ask_friday',
          source_system: 'fad',
          access_class: 'staff',
          allowed_actions: ['create_task'],
        })],
      })
      .mockResolvedValueOnce({
        rows: [{
          action_id: 'act-staff-1',
          source_system: 'fad',
          surface_id: 'fad_global_ask_friday',
          requested_by: { identityType: 'staff', identityKey: 'Ishant Ayadassen', authenticated: true },
          action_type: 'create_task',
          risk_class: 'low',
          payload: { title: 'Check AC' },
          reason: 'Staff asked Ask Friday.',
          approval_required: false,
          status: 'pending',
          created_at: new Date('2026-05-23T08:00:00.000Z'),
          updated_at: new Date('2026-05-23T08:00:00.000Z'),
        }],
      });

    const res = await request(app())
      .post('/api/ask-friday/core/action-requests')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({
        actionId: 'act-staff-1',
        surfaceId: 'fad_global_ask_friday',
        actionType: 'create_task',
        riskClass: 'low',
        payload: { title: 'Check AC' },
        reason: 'Staff asked Ask Friday.',
        approvalRequired: false,
      })
      .expect(201);

    expect(res.body.actionRequest).toMatchObject({
      actionId: 'act-staff-1',
      surfaceId: 'fad_global_ask_friday',
      actionType: 'create_task',
      status: 'pending',
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain('INSERT INTO ask_friday_action_requests');
  });

  test('records action request lifecycle events after staff review', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          action_id: 'act-1',
          source_system: 'friday-website',
          surface_id: 'website_ask_friday_fab',
          requested_by: { identityType: 'api_client', identityKey: 'friday-website' },
          action_type: 'request_booking',
          risk_class: 'approval',
          payload: { residence: 'GBH-C8' },
          reason: 'Guest asked to book.',
          approval_required: true,
          status: 'approved',
          approved_by: 'Ishant Ayadassen',
          approved_at: new Date('2026-05-23T08:00:00.000Z'),
          review_note: 'Approved.',
          created_at: new Date('2026-05-23T07:59:00.000Z'),
          updated_at: new Date('2026-05-23T08:00:00.000Z'),
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'evidence-row' }] });

    const res = await request(app())
      .patch('/api/ask-friday/core/action-requests/act-1')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({
        status: 'approved',
        reviewNote: 'Approved.',
      })
      .expect(200);

    expect(res.body.actionRequest).toMatchObject({
      actionId: 'act-1',
      status: 'approved',
    });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1][0]).toContain('INSERT INTO ask_friday_learning_events');
    expect(query.mock.calls[2][0]).toContain('INSERT INTO ask_friday_evidence_refs');
  });

  test('blocks public action requests against staff surfaces', async () => {
    query.mockResolvedValueOnce({
      rows: [surfaceRow({
        surface_id: 'fad_consult',
        source_system: 'fad',
        access_class: 'staff',
        allowed_actions: ['create_task'],
      })],
    });

    await request(app())
      .post('/api/ask-friday/core/action-requests/public')
      .set('Authorization', `Bearer ${apiToken(['ask-friday:actions:write'])}`)
      .send({
        sourceSystem: 'fad',
        surfaceId: 'fad_consult',
        actionType: 'create_task',
        payload: { title: 'Do this' },
      })
      .expect(403);

    expect(query).toHaveBeenCalledTimes(1);
  });

  test('records public consent-backed identity links for durable memory', async () => {
    query
      .mockResolvedValueOnce({ rows: [surfaceRow()] })
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
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1][1][0]).toBe(TENANT_ID);
    expect(query.mock.calls[2][1][3]).toBe('friday-website');
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
          reviewer: 'Ishant Ayadassen',
        }],
      })
      .mockResolvedValueOnce({
        rows: [surfaceRow({
          allowed_knowledge_scopes: ['public_brand'],
          allowed_tools: ['search_residences'],
          eval_suite_ids: ['website_fab_routing'],
        })],
      })
      .mockResolvedValueOnce({
        rows: [{
          run_id: 'run-pass',
          suite_id: 'website_fab_routing',
          status: 'completed',
          summary: { status: 'passed' },
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
          approved_by: 'Ishant Ayadassen',
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
        evalRunId: 'run-pass',
      })
      .expect(201);

    expect(res.body.contextPack).toMatchObject({
      packId: 'website_ask_friday_fab_v5',
      status: 'published',
      approvedBy: 'Ishant Ayadassen',
    });
    expect(res.body.approvedCandidates).toHaveLength(1);
    expect(query).toHaveBeenCalledTimes(6);
  });

  test('publishes manually approved context pack through staff route', async () => {
    query
      .mockResolvedValueOnce({
        rows: [surfaceRow({
          surface_id: 'fad_consult',
          source_system: 'fad',
          access_class: 'staff',
          allowed_knowledge_scopes: ['staff_inbox'],
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

    const res = await request(app())
      .post('/api/ask-friday/core/context-packs/publish')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({
        surfaceId: 'fad_consult',
        manualApproval: true,
        manualApprovalRationale: 'Published from review module.',
        knowledgeScopes: ['staff_inbox'],
        packPayload: { compactPrompt: 'Manual staff pack' },
        evalGateOverride: true,
      })
      .expect(201);

    expect(res.body.contextPack).toMatchObject({
      packId: 'fad_consult_v2',
      status: 'published',
      approvedBy: 'Ishant Sagoo',
    });
    expect(res.body.approvedCandidates).toHaveLength(0);
    expect(query).toHaveBeenCalledTimes(3);
  });

  test('rejects direct published context pack writes through draft route', async () => {
    await request(app())
      .post('/api/ask-friday/core/context-packs')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({
        surfaceId: 'website_ask_friday_fab',
        status: 'published',
        knowledgeScopes: ['public_brand'],
      })
      .expect(400);

    expect(query).not.toHaveBeenCalled();
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

  test('runs retention dry-run through staff route by default', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ count: 3 }] });

    const res = await request(app())
      .post('/api/ask-friday/core/retention/run')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({})
      .expect(200);

    expect(res.body).toMatchObject({
      dryRun: true,
      tenantId: TENANT_ID,
      deleted: {
        expiredEvidenceRefs: 1,
        rejectedCandidates: 2,
        expiredCandidates: 3,
      },
    });
    expect(query).toHaveBeenCalledTimes(3);
  });
});
