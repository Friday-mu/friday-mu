'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { query } = require('../database/client');
const { attachIdentity } = require('../design/auth');
const { attachApiClient, requireScope } = require('../auth/api_clients');
const {
  normalizeActionRequest,
  normalizeActionStatusPatch,
  normalizeContextPack,
  normalizeKbCandidate,
  normalizeLearningEvent,
  normalizeReviewPatch,
  normalizeSurfaceRegistry,
  cleanString,
  safeJson,
} = require('./contracts');
const { runAnalyzer } = require('./analyzer');
const { runEvalSuite } = require('./eval_runner');
const { runRetention } = require('./retention');
const {
  assertPublicSurface,
  validateContextPackAgainstSurface,
  validatePublicActionRequest,
  validatePublicIdentityLink,
  validatePublicLearningEvent,
  validateStaffActionRequest,
} = require('./policy');
const { publishContextPack } = require('./publisher');

const router = express.Router();

function actorName(req) {
  return req.identity?.displayName
    || req.identity?.username
    || req.identity?.userId
    || req.apiClient?.clientId
    || 'ask-friday-core';
}

function publicTenantId(req) {
  return req.apiClient?.tenantId;
}

function respondError(res, error, label = 'ask_friday_core_error') {
  const status = error?.status || 500;
  if (status >= 500) console.error(`[ask-friday/core] ${label}:`, error.message);
  return res.status(status).json({ error: label, message: error.message });
}

function parseLimit(value, fallback = 100, max = 500) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(Math.max(Math.floor(raw), 1), max);
}

function shapeSurface(row) {
  if (!row) return null;
  return {
    surfaceId: row.surface_id,
    displayName: row.display_name,
    audience: row.audience,
    sourceSystem: row.source_system,
    accessClass: row.access_class,
    localePolicy: row.locale_policy || {},
    allowedKnowledgeScopes: row.allowed_knowledge_scopes || [],
    allowedTools: row.allowed_tools || [],
    allowedActions: row.allowed_actions || [],
    memoryPolicy: row.memory_policy || {},
    handoffPolicy: row.handoff_policy || {},
    modelPolicy: row.model_policy || {},
    contextBudget: row.context_budget || {},
    evalSuiteIds: row.eval_suite_ids || [],
    status: row.status,
    updatedAt: row.updated_at,
  };
}

function shapeContextPack(row) {
  if (!row) return null;
  return {
    packId: row.pack_id,
    surfaceId: row.surface_id,
    version: row.version,
    status: row.status,
    knowledgeScopes: row.knowledge_scopes || [],
    behaviorRules: row.behavior_rules || [],
    toolPolicy: row.tool_policy || {},
    memoryPolicy: row.memory_policy || {},
    sourceSnapshotRefs: row.source_snapshot_refs || [],
    packPayload: row.pack_payload || {},
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

function shapeLearningEvent(row) {
  if (!row) return null;
  return {
    eventId: row.event_id,
    createdAt: row.created_at,
    receivedAt: row.received_at,
    sourceSystem: row.source_system,
    surfaceId: row.surface_id,
    identityRef: row.identity_ref || {},
    sessionId: row.session_id,
    locale: row.locale,
    pageUrl: row.page_url,
    intent: row.intent,
    userTurnSummary: row.user_turn_summary,
    assistantActionSummary: row.assistant_action_summary,
    toolsUsed: row.tools_used || [],
    knowledgeUsed: row.knowledge_used || [],
    confidence: row.confidence,
    outcome: row.outcome,
    handoff: row.handoff || {},
    signals: row.signals || {},
    privacyClass: row.privacy_class,
    redactionStatus: row.redaction_status,
    evidenceRefs: row.evidence_refs || [],
  };
}

function shapeKbCandidate(row) {
  if (!row) return null;
  return {
    candidateId: row.candidate_id,
    candidateType: row.candidate_type,
    targetLayer: row.target_layer,
    proposedChange: row.proposed_change || {},
    sourceEventIds: row.source_event_ids || [],
    evidenceSummary: row.evidence_summary,
    riskClass: row.risk_class,
    trustTier: row.trust_tier,
    reviewStatus: row.review_status,
    reviewLane: row.review_lane || 'general',
    reviewerDomain: row.reviewer_domain || null,
    allowedSurfaceIds: row.allowed_surface_ids || [],
    targetPrivacyClass: row.target_privacy_class || 'unknown',
    reviewer: row.reviewer,
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
    approvedSnapshotVersion: row.approved_snapshot_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function shapeActionRequest(row) {
  if (!row) return null;
  return {
    actionId: row.action_id,
    sourceSystem: row.source_system,
    surfaceId: row.surface_id,
    requestedBy: row.requested_by || {},
    actionType: row.action_type,
    riskClass: row.risk_class,
    payload: row.payload || {},
    reason: row.reason,
    approvalRequired: row.approval_required,
    status: row.status,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    reviewNote: row.review_note,
    executedAt: row.executed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function shapeEvalCase(row) {
  if (!row) return null;
  return {
    evalId: row.eval_id,
    suiteId: row.suite_id,
    surfaceId: row.surface_id,
    sourceEventIds: row.source_event_ids || [],
    inputPayload: row.input_payload || {},
    expected: row.expected || {},
    assertions: row.assertions || [],
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function shapeIdentityLink(row) {
  if (!row) return null;
  return {
    identityKey: row.identity_key,
    identityType: row.identity_type,
    subjectRef: row.subject_ref || {},
    durableMemoryAllowed: row.durable_memory_allowed,
    consentStatus: row.consent_status,
    lastSeenAt: row.last_seen_at,
    updatedAt: row.updated_at,
  };
}

async function loadSurfaceForPolicy(tenantId, surfaceId) {
  const id = cleanString(surfaceId, 120);
  if (!id) {
    const err = new Error('surfaceId is required');
    err.status = 400;
    throw err;
  }
  const { rows } = await query(
    `SELECT *
       FROM ask_friday_surfaces
      WHERE tenant_id = $1
        AND surface_id = $2
      LIMIT 1`,
    [tenantId, id],
  );
  return rows[0] || null;
}

async function insertEvidenceRefs(tenantId, eventId, refs) {
  if (!Array.isArray(refs) || refs.length === 0) return 0;
  let inserted = 0;
  for (const ref of refs) {
    const { rows } = await query(
      `INSERT INTO ask_friday_evidence_refs (
         tenant_id, evidence_id, event_id, evidence_type, storage_ref,
         privacy_class, redaction_status, summary, evidence_payload, expires_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9::jsonb,
         CASE WHEN $10::text IS NULL OR $10::text = '' THEN NULL ELSE $10::timestamptz END
       )
       ON CONFLICT (tenant_id, evidence_id) DO NOTHING
       RETURNING id`,
      [
        tenantId,
        ref.evidenceId,
        ref.eventId || eventId,
        ref.evidenceType,
        ref.storageRef,
        ref.privacyClass,
        ref.redactionStatus,
        ref.summary,
        JSON.stringify(ref.evidencePayload || {}),
        ref.expiresAt,
      ],
    );
    if (rows.length > 0) inserted += 1;
  }
  return inserted;
}

function lifecycleId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

async function writeActionLifecycleEvent({ tenantId, action, reviewer, reviewNote }) {
  if (!action) return;
  const sourceSystem = cleanString(action.source_system, 80) || 'fad';
  const publicish = ['friday-website', 'mcp'].includes(sourceSystem);
  const privacyClass = publicish ? 'medium' : 'high';
  const eventId = lifecycleId('afae');
  const evidenceId = lifecycleId('afaev');
  const summary = `Action request ${action.action_id} moved to ${action.status}.`;
  await query(
    `INSERT INTO ask_friday_learning_events (
       tenant_id, event_id, created_at, source_system, surface_id,
       identity_ref, session_id, intent, user_turn_summary,
       assistant_action_summary, tools_used, knowledge_used, confidence,
       outcome, handoff, signals, privacy_class, redaction_status,
       evidence_refs, event_payload
     ) VALUES (
       $1, $2, NOW(), $3, $4,
       $5::jsonb, NULL, $6, $7,
       $8, ARRAY[]::text[], ARRAY[]::text[], 'high',
       $9, '{}'::jsonb, $10::jsonb, $11, 'partially_redacted',
       $12::jsonb, $13::jsonb
     )`,
    [
      tenantId,
      eventId,
      sourceSystem,
      cleanString(action.surface_id, 120) || 'unknown_surface',
      JSON.stringify({
        identityType: 'staff',
        identityKey: reviewer || 'ask-friday-reviewer',
        authenticated: true,
      }),
      cleanString(action.action_type, 120) || 'action_request',
      `Review status changed to ${action.status}.`,
      summary,
      `action_${action.status}`,
      JSON.stringify({
        actionId: action.action_id,
        actionType: action.action_type,
        status: action.status,
        reviewer,
        reviewNote: reviewNote || null,
      }),
      privacyClass,
      JSON.stringify([{
        evidenceId,
        eventId,
        evidenceType: 'action_lifecycle',
        privacyClass,
        redactionStatus: 'partially_redacted',
        summary,
      }]),
      JSON.stringify({
        actionId: action.action_id,
        actionType: action.action_type,
        riskClass: action.risk_class,
        status: action.status,
      }),
    ],
  );
  await insertEvidenceRefs(tenantId, eventId, [{
    evidenceId,
    eventId,
    evidenceType: 'action_lifecycle',
    privacyClass,
    redactionStatus: 'partially_redacted',
    summary,
    evidencePayload: {
      actionId: action.action_id,
      actionType: action.action_type,
      status: action.status,
    },
  }]);
}

router.get('/surfaces', attachIdentity, async (req, res) => {
  try {
    const status = cleanString(req.query.status, 40) || 'active';
    const params = [req.tenantId];
    const filters = ['tenant_id = $1'];
    if (status !== 'all') {
      params.push(status);
      filters.push(`status = $${params.length}`);
    }
    const { rows } = await query(
      `SELECT *
         FROM ask_friday_surfaces
        WHERE ${filters.join(' AND ')}
        ORDER BY source_system, surface_id`,
      params,
    );
    res.json({ surfaces: rows.map(shapeSurface) });
  } catch (error) {
    return respondError(res, error, 'surface_list_failed');
  }
});

router.post('/surfaces', attachIdentity, async (req, res) => {
  try {
    const surface = normalizeSurfaceRegistry(req.body);
    const { rows } = await query(
      `INSERT INTO ask_friday_surfaces (
         tenant_id, surface_id, display_name, audience, source_system, access_class,
         locale_policy, allowed_knowledge_scopes, allowed_tools, allowed_actions,
         memory_policy, handoff_policy, model_policy, context_budget,
         eval_suite_ids, status, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7::jsonb, $8, $9, $10,
         $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb,
         $15, $16, NOW()
       )
       ON CONFLICT (tenant_id, surface_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         audience = EXCLUDED.audience,
         source_system = EXCLUDED.source_system,
         access_class = EXCLUDED.access_class,
         locale_policy = EXCLUDED.locale_policy,
         allowed_knowledge_scopes = EXCLUDED.allowed_knowledge_scopes,
         allowed_tools = EXCLUDED.allowed_tools,
         allowed_actions = EXCLUDED.allowed_actions,
         memory_policy = EXCLUDED.memory_policy,
         handoff_policy = EXCLUDED.handoff_policy,
         model_policy = EXCLUDED.model_policy,
         context_budget = EXCLUDED.context_budget,
         eval_suite_ids = EXCLUDED.eval_suite_ids,
         status = EXCLUDED.status,
         updated_at = NOW()
       RETURNING *`,
      [
        req.tenantId,
        surface.surfaceId,
        surface.displayName,
        surface.audience,
        surface.sourceSystem,
        surface.accessClass,
        JSON.stringify(surface.localePolicy),
        surface.allowedKnowledgeScopes,
        surface.allowedTools,
        surface.allowedActions,
        JSON.stringify(surface.memoryPolicy),
        JSON.stringify(surface.handoffPolicy),
        JSON.stringify(surface.modelPolicy),
        JSON.stringify(surface.contextBudget),
        surface.evalSuiteIds,
        surface.status,
      ],
    );
    res.status(201).json({ surface: shapeSurface(rows[0]) });
  } catch (error) {
    return respondError(res, error, 'surface_upsert_failed');
  }
});

// Staff-only list of context packs across all surfaces / statuses.
// Used by the Ask Friday review admin module. Public consumers should
// hit GET /context-packs/:surfaceId which is scope-protected and only
// returns the latest *published* pack for a given surface.
router.get('/context-packs', attachIdentity, async (req, res) => {
  try {
    const status = cleanString(req.query.status, 40);
    const surfaceId = cleanString(req.query.surfaceId || req.query.surface_id, 120);
    const limit = parseLimit(req.query.limit);
    const params = [req.tenantId];
    const filters = ['tenant_id = $1'];
    if (status && status !== 'all') {
      params.push(status);
      filters.push(`status = $${params.length}`);
    }
    if (surfaceId) {
      params.push(surfaceId);
      filters.push(`surface_id = $${params.length}`);
    }
    const { rows } = await query(
      `SELECT *
         FROM ask_friday_context_packs
        WHERE ${filters.join(' AND ')}
        ORDER BY surface_id ASC, version DESC
        LIMIT ${limit}`,
      params,
    );
    res.json({ contextPacks: rows.map(shapeContextPack) });
  } catch (error) {
    return respondError(res, error, 'context_packs_list_failed');
  }
});

router.get(
  '/context-packs/:surfaceId',
  attachApiClient,
  requireScope('ask-friday:context:read'),
  async (req, res) => {
    try {
      const tenantId = publicTenantId(req);
      const surfaceId = cleanString(req.params.surfaceId, 120);
      const surface = await loadSurfaceForPolicy(tenantId, surfaceId);
      assertPublicSurface(surface, surfaceId);
      const { rows } = await query(
        `SELECT *
           FROM ask_friday_context_packs
          WHERE tenant_id = $1
            AND surface_id = $2
            AND status = 'published'
          ORDER BY version DESC
          LIMIT 1`,
        [tenantId, surfaceId],
      );
      if (rows.length === 0) return res.status(404).json({ error: 'context_pack_not_found' });
      res.json({ contextPack: shapeContextPack(rows[0]) });
    } catch (error) {
      return respondError(res, error, 'context_pack_read_failed');
    }
  },
);

router.post('/context-packs', attachIdentity, async (req, res) => {
  try {
    const pack = normalizeContextPack(req.body);
    if (pack.status === 'published') {
      return res.status(400).json({
        error: 'context_pack_publish_required',
        message: 'Use /context-packs/publish with a passing eval run or evalGateOverride:true to publish context packs.',
      });
    }
    const surface = await loadSurfaceForPolicy(req.tenantId, pack.surfaceId);
    validateContextPackAgainstSurface(pack, surface);
    const approver = pack.approvedBy || actorName(req);
    const { rows } = await query(
      `INSERT INTO ask_friday_context_packs (
         tenant_id, pack_id, surface_id, version, status, knowledge_scopes,
         behavior_rules, tool_policy, memory_policy, source_snapshot_refs,
         pack_payload, approved_by, approved_at, published_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb,
         $11::jsonb,
         CASE WHEN $5 = 'published' THEN $12 ELSE NULL END,
         CASE WHEN $5 = 'published' THEN NOW() ELSE NULL END,
         CASE WHEN $5 = 'published' THEN NOW() ELSE NULL END,
         NOW()
       )
       ON CONFLICT (tenant_id, surface_id, version) DO UPDATE SET
         pack_id = EXCLUDED.pack_id,
         status = EXCLUDED.status,
         knowledge_scopes = EXCLUDED.knowledge_scopes,
         behavior_rules = EXCLUDED.behavior_rules,
         tool_policy = EXCLUDED.tool_policy,
         memory_policy = EXCLUDED.memory_policy,
         source_snapshot_refs = EXCLUDED.source_snapshot_refs,
         pack_payload = EXCLUDED.pack_payload,
         approved_by = EXCLUDED.approved_by,
         approved_at = EXCLUDED.approved_at,
         published_at = EXCLUDED.published_at,
         updated_at = NOW()
       RETURNING *`,
      [
        req.tenantId,
        pack.packId,
        pack.surfaceId,
        pack.version,
        pack.status,
        pack.knowledgeScopes,
        JSON.stringify(pack.behaviorRules),
        JSON.stringify(pack.toolPolicy),
        JSON.stringify(pack.memoryPolicy),
        JSON.stringify(pack.sourceSnapshotRefs),
        JSON.stringify(pack.packPayload),
        approver,
      ],
    );
    res.status(201).json({ contextPack: shapeContextPack(rows[0]) });
  } catch (error) {
    return respondError(res, error, 'context_pack_write_failed');
  }
});

router.post('/context-packs/publish', attachIdentity, async (req, res) => {
  try {
    const result = await publishContextPack({
      ...req.body,
      tenantId: req.tenantId,
      approvedBy: req.body?.approvedBy || req.body?.approved_by || actorName(req),
    });
    res.status(201).json({
      contextPack: shapeContextPack(result.contextPack),
      approvedCandidates: result.approvedCandidates.map(shapeKbCandidate),
    });
  } catch (error) {
    return respondError(res, error, 'context_pack_publish_failed');
  }
});

router.post(
  '/events',
  attachApiClient,
  requireScope('ask-friday:events:write'),
  async (req, res) => {
    try {
      const tenantId = publicTenantId(req);
      const event = normalizeLearningEvent(req.body);
      const surface = await loadSurfaceForPolicy(tenantId, event.surfaceId);
      validatePublicLearningEvent(event, surface);
      const { rows } = await query(
        `INSERT INTO ask_friday_learning_events (
           tenant_id, event_id, created_at, source_system, surface_id,
           identity_ref, session_id, locale, page_url, intent,
           user_turn_summary, assistant_action_summary, tools_used, knowledge_used,
           confidence, outcome, handoff, signals, privacy_class,
           redaction_status, evidence_refs, event_payload
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6::jsonb, $7, $8, $9, $10,
           $11, $12, $13, $14,
           $15, $16, $17::jsonb, $18::jsonb, $19,
           $20, $21::jsonb, $22::jsonb
         )
         ON CONFLICT (tenant_id, event_id) DO NOTHING
         RETURNING *`,
        [
          tenantId,
          event.eventId,
          event.createdAt,
          event.sourceSystem,
          event.surfaceId,
          JSON.stringify(event.identityRef),
          event.sessionId,
          event.locale,
          event.pageUrl,
          event.intent,
          event.userTurnSummary,
          event.assistantActionSummary,
          event.toolsUsed,
          event.knowledgeUsed,
          event.confidence,
          event.outcome,
          JSON.stringify(event.handoff),
          JSON.stringify(event.signals),
          event.privacyClass,
          event.redactionStatus,
          JSON.stringify(event.evidenceRefs),
          JSON.stringify(event.eventPayload),
        ],
      );
      const evidenceInserted = await insertEvidenceRefs(tenantId, event.eventId, event.evidenceRefs);
      if (rows.length === 0) {
        return res.status(200).json({ ok: true, duplicate: true, eventId: event.eventId, evidenceInserted });
      }
      return res.status(201).json({
        ok: true,
        event: shapeLearningEvent(rows[0]),
        evidenceInserted,
      });
    } catch (error) {
      return respondError(res, error, 'learning_event_write_failed');
    }
  },
);

router.get('/kb-candidates', attachIdentity, async (req, res) => {
  try {
    const status = cleanString(req.query.status, 40) || 'pending';
    const targetLayer = cleanString(req.query.targetLayer || req.query.target_layer, 80);
    const reviewLane = cleanString(req.query.reviewLane || req.query.review_lane, 120);
    const limit = parseLimit(req.query.limit);
    const params = [req.tenantId];
    const filters = ['tenant_id = $1'];
    if (status !== 'all') {
      params.push(status);
      filters.push(`review_status = $${params.length}`);
    }
    if (targetLayer) {
      params.push(targetLayer);
      filters.push(`target_layer = $${params.length}`);
    }
    if (reviewLane) {
      params.push(reviewLane);
      filters.push(`review_lane = $${params.length}`);
    }
    const { rows } = await query(
      `SELECT *
         FROM ask_friday_kb_candidates
        WHERE ${filters.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT ${limit}`,
      params,
    );
    res.json({ candidates: rows.map(shapeKbCandidate) });
  } catch (error) {
    return respondError(res, error, 'kb_candidates_list_failed');
  }
});

router.post('/kb-candidates', attachIdentity, async (req, res) => {
  try {
    const candidate = normalizeKbCandidate(req.body);
    const { rows } = await query(
      `INSERT INTO ask_friday_kb_candidates (
         tenant_id, candidate_id, candidate_type, target_layer, proposed_change,
         source_event_ids, evidence_summary, risk_class, trust_tier, review_status,
         review_lane, reviewer_domain, allowed_surface_ids, target_privacy_class, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5::jsonb,
         $6, $7, $8, $9, $10,
         $11, $12, $13, $14, NOW()
       )
       ON CONFLICT (tenant_id, candidate_id) DO UPDATE SET
         candidate_type = EXCLUDED.candidate_type,
         target_layer = EXCLUDED.target_layer,
         proposed_change = EXCLUDED.proposed_change,
         source_event_ids = EXCLUDED.source_event_ids,
         evidence_summary = EXCLUDED.evidence_summary,
         risk_class = EXCLUDED.risk_class,
         trust_tier = EXCLUDED.trust_tier,
         review_status = EXCLUDED.review_status,
         review_lane = EXCLUDED.review_lane,
         reviewer_domain = EXCLUDED.reviewer_domain,
         allowed_surface_ids = EXCLUDED.allowed_surface_ids,
         target_privacy_class = EXCLUDED.target_privacy_class,
         updated_at = NOW()
       RETURNING *`,
      [
        req.tenantId,
        candidate.candidateId,
        candidate.candidateType,
        candidate.targetLayer,
        JSON.stringify(candidate.proposedChange),
        candidate.sourceEventIds,
        candidate.evidenceSummary,
        candidate.riskClass,
        candidate.trustTier,
        candidate.reviewStatus,
        candidate.reviewLane,
        candidate.reviewerDomain,
        candidate.allowedSurfaceIds,
        candidate.targetPrivacyClass,
      ],
    );
    res.status(201).json({ candidate: shapeKbCandidate(rows[0]) });
  } catch (error) {
    return respondError(res, error, 'kb_candidate_write_failed');
  }
});

router.patch('/kb-candidates/:candidateId', attachIdentity, async (req, res) => {
  try {
    const patch = normalizeReviewPatch(req.body);
    const reviewer = patch.reviewer || actorName(req);
    const { rows } = await query(
      `UPDATE ask_friday_kb_candidates
          SET review_status = $1,
              reviewer = $2,
              review_note = $3,
              approved_snapshot_version = $4,
              reviewed_at = NOW(),
              updated_at = NOW()
        WHERE tenant_id = $5
          AND candidate_id = $6
        RETURNING *`,
      [
        patch.reviewStatus,
        reviewer,
        patch.reviewNote,
        patch.approvedSnapshotVersion,
        req.tenantId,
        cleanString(req.params.candidateId, 160),
      ],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'kb_candidate_not_found' });
    res.json({ candidate: shapeKbCandidate(rows[0]) });
  } catch (error) {
    return respondError(res, error, 'kb_candidate_review_failed');
  }
});

async function createActionRequest(req, res, sourceDefaults = {}) {
  try {
    const action = normalizeActionRequest(req.body, sourceDefaults);
    if (sourceDefaults.public) {
      const tenantId = req.tenantId || publicTenantId(req);
      const surface = await loadSurfaceForPolicy(tenantId, action.surfaceId);
      validatePublicActionRequest(action, surface);
    } else {
      const surface = await loadSurfaceForPolicy(req.tenantId, action.surfaceId);
      validateStaffActionRequest(action, surface);
    }
    const { rows } = await query(
      `INSERT INTO ask_friday_action_requests (
         tenant_id, action_id, source_system, surface_id, requested_by,
         action_type, risk_class, payload, reason, approval_required, status, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5::jsonb,
         $6, $7, $8::jsonb, $9, $10, $11, NOW()
       )
       ON CONFLICT (tenant_id, action_id) DO UPDATE SET
         requested_by = EXCLUDED.requested_by,
         action_type = EXCLUDED.action_type,
         risk_class = EXCLUDED.risk_class,
         payload = EXCLUDED.payload,
         reason = EXCLUDED.reason,
         approval_required = EXCLUDED.approval_required,
         status = EXCLUDED.status,
         updated_at = NOW()
       RETURNING *`,
      [
        req.tenantId || publicTenantId(req),
        action.actionId,
        action.sourceSystem,
        action.surfaceId,
        JSON.stringify(action.requestedBy),
        action.actionType,
        action.riskClass,
        JSON.stringify(action.payload),
        action.reason,
        action.approvalRequired,
        action.status,
      ],
    );
    return res.status(201).json({ actionRequest: shapeActionRequest(rows[0]) });
  } catch (error) {
    return respondError(res, error, 'action_request_write_failed');
  }
}

router.get('/action-requests', attachIdentity, async (req, res) => {
  try {
    const status = cleanString(req.query.status, 40) || 'pending';
    const limit = parseLimit(req.query.limit);
    const params = [req.tenantId];
    const filters = ['tenant_id = $1'];
    if (status !== 'all') {
      params.push(status);
      filters.push(`status = $${params.length}`);
    }
    const { rows } = await query(
      `SELECT *
         FROM ask_friday_action_requests
        WHERE ${filters.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT ${limit}`,
      params,
    );
    res.json({ actionRequests: rows.map(shapeActionRequest) });
  } catch (error) {
    return respondError(res, error, 'action_requests_list_failed');
  }
});

router.post('/action-requests', attachIdentity, (req, res) => {
  return createActionRequest(req, res, {
    sourceSystem: 'fad',
    requestedBy: {
      identityType: 'staff',
      identityKey: actorName(req),
      authenticated: true,
    },
  });
});

router.post(
  '/action-requests/public',
  attachApiClient,
  requireScope('ask-friday:actions:write'),
  (req, res) => createActionRequest(req, res, {
    public: true,
    sourceSystem: 'friday-website',
    requestedBy: {
      identityType: 'api_client',
      identityKey: req.apiClient?.clientId,
      authenticated: true,
    },
  }),
);

async function upsertIdentityLink(req, res, sourceDefaults = {}) {
  try {
    const body = req.body || {};
    const identityKey = cleanString(body.identityKey || body.identity_key, 180);
    const identityType = cleanString(body.identityType || body.identity_type, 80);
    if (!identityKey) return res.status(400).json({ error: 'identityKey is required' });
    if (!identityType) return res.status(400).json({ error: 'identityType is required' });
    const consentStatus = cleanString(body.consentStatus || body.consent_status, 80) || 'unknown';
    const durableMemoryAllowed = Boolean(body.durableMemoryAllowed || body.durable_memory_allowed);
    const subjectRef = safeJson(body.subjectRef || body.subject_ref, 80, 4000);
    const tenantId = req.tenantId || publicTenantId(req);
    if (sourceDefaults.public) {
      const surfaceId = cleanString(body.surfaceId || body.surface_id || sourceDefaults.surfaceId, 120);
      const surface = await loadSurfaceForPolicy(tenantId, surfaceId);
      validatePublicIdentityLink({ ...body, surfaceId }, surface);
    }
    const { rows } = await query(
      `INSERT INTO ask_friday_identity_links (
         tenant_id, identity_key, identity_type, subject_ref,
         durable_memory_allowed, consent_status, last_seen_at, updated_at
       ) VALUES (
         $1, $2, $3, $4::jsonb,
         $5, $6, NOW(), NOW()
       )
       ON CONFLICT (tenant_id, identity_key) DO UPDATE SET
         identity_type = EXCLUDED.identity_type,
         subject_ref = EXCLUDED.subject_ref,
         durable_memory_allowed = EXCLUDED.durable_memory_allowed,
         consent_status = EXCLUDED.consent_status,
         last_seen_at = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [tenantId, identityKey, identityType, JSON.stringify(subjectRef), durableMemoryAllowed, consentStatus],
    );

    const consentEventType = cleanString(body.consentEventType || body.consent_event_type, 80);
    if (consentEventType) {
      await query(
        `INSERT INTO ask_friday_consent_events (
           tenant_id, identity_key, event_type, source_system, surface_id, consent_payload
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          tenantId,
          identityKey,
          consentEventType,
          cleanString(body.sourceSystem || body.source_system || sourceDefaults.sourceSystem, 80) || 'manual',
          cleanString(body.surfaceId || body.surface_id || sourceDefaults.surfaceId, 120) || null,
          JSON.stringify(safeJson(body.consentPayload || body.consent_payload || body, 80, 4000)),
        ],
      );
    }

    res.status(201).json({ identityLink: shapeIdentityLink(rows[0]) });
  } catch (error) {
    return respondError(res, error, 'identity_link_write_failed');
  }
}

router.post('/identity-links', attachIdentity, (req, res) => {
  return upsertIdentityLink(req, res, { sourceSystem: 'fad' });
});

router.post(
  '/identity-links/public',
  attachApiClient,
  requireScope('ask-friday:identity:write'),
  (req, res) => upsertIdentityLink(req, res, { public: true, sourceSystem: 'friday-website' }),
);

router.post('/analyzer/run', attachIdentity, async (req, res) => {
  try {
    const result = await runAnalyzer({
      tenantId: req.tenantId,
      surfaceId: req.body?.surfaceId || req.body?.surface_id,
      sinceHours: req.body?.sinceHours || req.body?.since_hours,
      minClusterSize: req.body?.minClusterSize || req.body?.min_cluster_size,
      limit: req.body?.limit,
      dryRun: req.body?.dryRun !== false && req.body?.dry_run !== false,
    });
    res.json(result);
  } catch (error) {
    return respondError(res, error, 'analyzer_run_failed');
  }
});

router.post('/retention/run', attachIdentity, async (req, res) => {
  try {
    const result = await runRetention({
      tenantId: req.tenantId,
      dryRun: req.body?.dryRun !== false && req.body?.dry_run !== false,
      rejectedCandidateRetentionDays:
        req.body?.rejectedCandidateRetentionDays || req.body?.rejected_candidate_retention_days,
      expiredCandidateRetentionDays:
        req.body?.expiredCandidateRetentionDays || req.body?.expired_candidate_retention_days,
    });
    res.json(result);
  } catch (error) {
    return respondError(res, error, 'retention_run_failed');
  }
});

router.patch('/action-requests/:actionId', attachIdentity, async (req, res) => {
  try {
    const patch = normalizeActionStatusPatch(req.body);
    const reviewer = patch.reviewer || actorName(req);
    const approved = patch.status === 'approved';
    const executed = patch.status === 'executed';
    const { rows } = await query(
      `UPDATE ask_friday_action_requests
          SET status = $1,
              approved_by = CASE WHEN $2 THEN $3 ELSE approved_by END,
              approved_at = CASE WHEN $2 THEN NOW() ELSE approved_at END,
              review_note = $4,
              executed_at = CASE WHEN $5 THEN NOW() ELSE executed_at END,
              updated_at = NOW()
        WHERE tenant_id = $6
          AND action_id = $7
        RETURNING *`,
      [
        patch.status,
        approved,
        reviewer,
        patch.reviewNote,
        executed,
        req.tenantId,
        cleanString(req.params.actionId, 160),
      ],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'action_request_not_found' });
    await writeActionLifecycleEvent({
      tenantId: req.tenantId,
      action: rows[0],
      reviewer,
      reviewNote: patch.reviewNote,
    }).catch((error) => {
      console.warn('[ask-friday/core] action lifecycle event failed:', error.message);
    });
    res.json({ actionRequest: shapeActionRequest(rows[0]) });
  } catch (error) {
    return respondError(res, error, 'action_request_review_failed');
  }
});

router.get('/eval-cases', attachIdentity, async (req, res) => {
  try {
    const suiteId = cleanString(req.query.suiteId || req.query.suite_id, 160);
    const surfaceId = cleanString(req.query.surfaceId || req.query.surface_id, 120);
    const status = cleanString(req.query.status, 40) || 'active';
    const params = [req.tenantId];
    const filters = ['tenant_id = $1'];
    if (suiteId) {
      params.push(suiteId);
      filters.push(`suite_id = $${params.length}`);
    }
    if (surfaceId) {
      params.push(surfaceId);
      filters.push(`surface_id = $${params.length}`);
    }
    if (status !== 'all') {
      params.push(status);
      filters.push(`status = $${params.length}`);
    }
    const { rows } = await query(
      `SELECT *
         FROM ask_friday_eval_cases
        WHERE ${filters.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT ${parseLimit(req.query.limit)}`,
      params,
    );
    res.json({ evalCases: rows.map(shapeEvalCase) });
  } catch (error) {
    return respondError(res, error, 'eval_cases_list_failed');
  }
});

router.post('/eval-cases', attachIdentity, async (req, res) => {
  try {
    const evalId = cleanString(req.body?.evalId || req.body?.eval_id, 160) || `afeval_${Date.now()}`;
    const suiteId = cleanString(req.body?.suiteId || req.body?.suite_id, 160);
    const surfaceId = cleanString(req.body?.surfaceId || req.body?.surface_id, 120);
    if (!suiteId) return res.status(400).json({ error: 'suiteId is required' });
    if (!surfaceId) return res.status(400).json({ error: 'surfaceId is required' });
    const sourceEventIds = Array.isArray(req.body?.sourceEventIds || req.body?.source_event_ids)
      ? (req.body.sourceEventIds || req.body.source_event_ids).map((id) => cleanString(id, 160)).filter(Boolean).slice(0, 100)
      : [];
    const status = cleanString(req.body?.status, 40) || 'active';
    const { rows } = await query(
      `INSERT INTO ask_friday_eval_cases (
         tenant_id, eval_id, suite_id, surface_id, source_event_ids,
         input_payload, expected, assertions, status, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6::jsonb, $7::jsonb, $8::jsonb, $9, NOW()
       )
       ON CONFLICT (tenant_id, eval_id) DO UPDATE SET
         suite_id = EXCLUDED.suite_id,
         surface_id = EXCLUDED.surface_id,
         source_event_ids = EXCLUDED.source_event_ids,
         input_payload = EXCLUDED.input_payload,
         expected = EXCLUDED.expected,
         assertions = EXCLUDED.assertions,
         status = EXCLUDED.status,
         updated_at = NOW()
       RETURNING *`,
      [
        req.tenantId,
        evalId,
        suiteId,
        surfaceId,
        sourceEventIds,
        JSON.stringify(safeJson(req.body?.inputPayload || req.body?.input_payload, 120, 8000)),
        JSON.stringify(safeJson(req.body?.expected, 120, 8000)),
        JSON.stringify(Array.isArray(req.body?.assertions) ? req.body.assertions.slice(0, 100).map((item) => safeJson(item)) : []),
        status,
      ],
    );
    res.status(201).json({ evalCase: shapeEvalCase(rows[0]) });
  } catch (error) {
    return respondError(res, error, 'eval_case_write_failed');
  }
});

router.get('/eval-runs', attachIdentity, async (req, res) => {
  try {
    const suiteId = cleanString(req.query.suiteId || req.query.suite_id, 160);
    const params = [req.tenantId];
    const filters = ['tenant_id = $1'];
    if (suiteId) {
      params.push(suiteId);
      filters.push(`suite_id = $${params.length}`);
    }
    const { rows } = await query(
      `SELECT *
         FROM ask_friday_eval_runs
        WHERE ${filters.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT ${parseLimit(req.query.limit, 50, 200)}`,
      params,
    );
    res.json({
      evalRuns: rows.map((row) => ({
        runId: row.run_id,
        suiteId: row.suite_id,
        contextPackId: row.context_pack_id,
        contextPackVersion: row.context_pack_version,
        status: row.status,
        summary: row.summary || {},
        startedAt: row.started_at,
        completedAt: row.completed_at,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    return respondError(res, error, 'eval_runs_list_failed');
  }
});

router.post('/eval-runs', attachIdentity, async (req, res) => {
  try {
    const result = await runEvalSuite({
      ...req.body,
      tenantId: req.tenantId,
    });
    res.status(201).json({
      evalRun: {
        runId: result.run.run_id,
        suiteId: result.run.suite_id,
        contextPackId: result.run.context_pack_id,
        contextPackVersion: result.run.context_pack_version,
        status: result.run.status,
        summary: result.run.summary || result.summary,
        startedAt: result.run.started_at,
        completedAt: result.run.completed_at,
        createdAt: result.run.created_at,
      },
    });
  } catch (error) {
    return respondError(res, error, 'eval_run_failed');
  }
});

module.exports = {
  router,
  _test: {
    actorName,
    parseLimit,
    shapeActionRequest,
    shapeContextPack,
    shapeEvalCase,
    shapeIdentityLink,
    shapeKbCandidate,
    shapeLearningEvent,
    shapeSurface,
    loadSurfaceForPolicy,
    writeActionLifecycleEvent,
  },
};
