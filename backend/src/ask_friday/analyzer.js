'use strict';

const crypto = require('node:crypto');
const { query } = require('../database/client');
const { cleanString, redactText, safeJson } = require('./contracts');

const LOW_CONFIDENCE = new Set(['low', 'unknown']);
const GAP_OUTCOMES = new Set(['failed', 'abandoned', 'needs_info', 'low_confidence', 'no_answer']);
const MAX_EVENTS = 500;

function stableId(prefix, parts) {
  const hash = crypto.createHash('sha256').update(parts.filter(Boolean).join('|')).digest('hex');
  return `${prefix}_${hash.slice(0, 24)}`;
}

function cleanHours(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return 168;
  return Math.min(Math.max(Math.floor(raw), 1), 24 * 90);
}

function cleanLimit(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return 200;
  return Math.min(Math.max(Math.floor(raw), 1), MAX_EVENTS);
}

function eventSignal(row) {
  const confidence = cleanString(row.confidence, 40).toLowerCase();
  const outcome = cleanString(row.outcome, 80).toLowerCase();
  const handoffTriggered = Boolean(row.handoff?.triggered);
  const helpfulness = row.signals?.answerHelpfulness;
  if (LOW_CONFIDENCE.has(confidence)) return 'low_confidence';
  if (GAP_OUTCOMES.has(outcome)) return outcome;
  if (handoffTriggered && outcome !== 'resolved') return 'handoff';
  if (helpfulness === false || helpfulness === 'negative') return 'negative_feedback';
  return null;
}

function eventIntent(row) {
  return cleanString(row.intent, 120).toLowerCase() || 'unknown_intent';
}

function clusterKey(row) {
  return [
    cleanString(row.surface_id, 120) || 'unknown_surface',
    eventIntent(row),
    eventSignal(row) || 'signal',
  ].join('::');
}

function summarizeEvent(row) {
  const user = redactText(cleanString(row.user_turn_summary, 800));
  const assistant = redactText(cleanString(row.assistant_action_summary, 800));
  return {
    eventId: row.event_id,
    createdAt: row.created_at,
    outcome: row.outcome || null,
    confidence: row.confidence || 'unknown',
    userTurnSummary: user,
    assistantActionSummary: assistant,
    toolsUsed: Array.isArray(row.tools_used) ? row.tools_used.slice(0, 20) : [],
    knowledgeUsed: Array.isArray(row.knowledge_used) ? row.knowledge_used.slice(0, 20) : [],
  };
}

function buildClusters(rows, options = {}) {
  const minClusterSize = Math.max(1, Number(options.minClusterSize) || 2);
  const groups = new Map();
  for (const row of rows || []) {
    const signal = eventSignal(row);
    if (!signal) continue;
    const key = clusterKey(row);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        signal,
        surfaceId: cleanString(row.surface_id, 120) || 'unknown_surface',
        intent: eventIntent(row),
        events: [],
      });
    }
    groups.get(key).events.push(summarizeEvent(row));
  }
  return [...groups.values()]
    .filter((cluster) => cluster.events.length >= minClusterSize)
    .sort((a, b) => b.events.length - a.events.length);
}

function candidateFromCluster(cluster) {
  const eventIds = cluster.events.map((event) => event.eventId).filter(Boolean);
  const first = cluster.events[0] || {};
  const candidateId = stableId('afc', [cluster.key, ...eventIds]);
  const targetLayer = cluster.signal === 'low_confidence' ? 'canonical_or_surface_knowledge' : 'surface_behavior';
  const riskClass = cluster.surfaceId.includes('finance') ? 'high' : 'medium';
  return {
    candidateId,
    candidateType: cluster.signal === 'negative_feedback' ? 'behavior_rule' : 'knowledge_gap',
    targetLayer,
    proposedChange: {
      operation: 'review',
      surfaceId: cluster.surfaceId,
      intent: cluster.intent,
      signal: cluster.signal,
      suggestedReview: 'Review source truth, surface behavior, and eval coverage before publishing any change.',
      representativeUserTurnSummary: first.userTurnSummary || null,
    },
    sourceEventIds: eventIds,
    evidenceSummary: [
      `${cluster.events.length} redacted Ask Friday events grouped for ${cluster.surfaceId}.`,
      `Intent: ${cluster.intent}.`,
      `Signal: ${cluster.signal}.`,
      first.userTurnSummary ? `Representative user turn: ${first.userTurnSummary}` : '',
    ].filter(Boolean).join(' '),
    riskClass,
    trustTier: 'production_event_cluster',
    reviewStatus: 'pending',
  };
}

function evalCaseFromCluster(cluster) {
  const first = cluster.events[0] || {};
  const evalId = stableId('afeval', [cluster.key, first.eventId || '']);
  return {
    evalId,
    suiteId: `${cluster.surfaceId}_regression`,
    surfaceId: cluster.surfaceId,
    sourceEventIds: cluster.events.map((event) => event.eventId).filter(Boolean),
    inputPayload: {
      surfaceId: cluster.surfaceId,
      intent: cluster.intent,
      promptSummary: first.userTurnSummary || '',
      priorFailureSignal: cluster.signal,
    },
    expected: {
      shouldGroundInApprovedKnowledge: true,
      shouldUseAllowedToolsOnly: true,
      shouldEscalateOrBeHonestWhenConfidenceIsLow: true,
      shouldNotExposePrivateData: true,
    },
    assertions: [
      { type: 'grounding', severity: 'must' },
      { type: 'tool_policy', severity: 'must' },
      { type: 'privacy_redaction', severity: 'must' },
      { type: 'low_confidence_honesty', severity: 'should' },
    ],
    status: 'active',
  };
}

async function insertCandidate(tenantId, candidate) {
  const { rows } = await query(
    `INSERT INTO ask_friday_kb_candidates (
       tenant_id, candidate_id, candidate_type, target_layer, proposed_change,
       source_event_ids, evidence_summary, risk_class, trust_tier, review_status, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5::jsonb,
       $6, $7, $8, $9, $10, NOW()
     )
     ON CONFLICT (tenant_id, candidate_id) DO NOTHING
     RETURNING candidate_id`,
    [
      tenantId,
      candidate.candidateId,
      candidate.candidateType,
      candidate.targetLayer,
      JSON.stringify(safeJson(candidate.proposedChange, 120, 8000)),
      candidate.sourceEventIds,
      candidate.evidenceSummary,
      candidate.riskClass,
      candidate.trustTier,
      candidate.reviewStatus,
    ],
  );
  return rows.length > 0;
}

async function insertEvalCase(tenantId, evalCase) {
  const { rows } = await query(
    `INSERT INTO ask_friday_eval_cases (
       tenant_id, eval_id, suite_id, surface_id, source_event_ids,
       input_payload, expected, assertions, status, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6::jsonb, $7::jsonb, $8::jsonb, $9, NOW()
     )
     ON CONFLICT (tenant_id, eval_id) DO NOTHING
     RETURNING eval_id`,
    [
      tenantId,
      evalCase.evalId,
      evalCase.suiteId,
      evalCase.surfaceId,
      evalCase.sourceEventIds,
      JSON.stringify(safeJson(evalCase.inputPayload, 120, 8000)),
      JSON.stringify(safeJson(evalCase.expected, 120, 8000)),
      JSON.stringify(evalCase.assertions.map((assertion) => safeJson(assertion))),
      evalCase.status,
    ],
  );
  return rows.length > 0;
}

async function runAnalyzer(options) {
  const tenantId = options.tenantId;
  const sinceHours = cleanHours(options.sinceHours);
  const limit = cleanLimit(options.limit);
  const minClusterSize = Math.max(1, Number(options.minClusterSize) || 2);
  const surfaceId = cleanString(options.surfaceId, 120);
  const dryRun = options.dryRun !== false;
  const params = [tenantId, sinceHours];
  const filters = [
    'tenant_id = $1',
    "created_at >= NOW() - ($2::int * INTERVAL '1 hour')",
    "redaction_status IN ('redacted', 'partially_redacted', 'not_required')",
  ];
  if (surfaceId) {
    params.push(surfaceId);
    filters.push(`surface_id = $${params.length}`);
  }

  const { rows } = await query(
    `SELECT event_id, created_at, source_system, surface_id, intent,
            user_turn_summary, assistant_action_summary, tools_used,
            knowledge_used, confidence, outcome, handoff, signals,
            privacy_class, redaction_status
       FROM ask_friday_learning_events
      WHERE ${filters.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ${limit}`,
    params,
  );

  const clusters = buildClusters(rows, { minClusterSize });
  const candidates = clusters.map(candidateFromCluster);
  const evalCases = clusters.map(evalCaseFromCluster);

  let insertedCandidates = 0;
  let insertedEvalCases = 0;
  if (!dryRun) {
    for (const candidate of candidates) {
      if (await insertCandidate(tenantId, candidate)) insertedCandidates += 1;
    }
    for (const evalCase of evalCases) {
      if (await insertEvalCase(tenantId, evalCase)) insertedEvalCases += 1;
    }
  }

  return {
    dryRun,
    inspectedEvents: rows.length,
    clusters: clusters.length,
    candidates,
    evalCases,
    insertedCandidates,
    insertedEvalCases,
  };
}

module.exports = {
  runAnalyzer,
  _test: {
    buildClusters,
    candidateFromCluster,
    cleanHours,
    cleanLimit,
    evalCaseFromCluster,
    eventSignal,
    stableId,
    summarizeEvent,
  },
};
