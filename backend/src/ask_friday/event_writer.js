'use strict';

const { query } = require('../database/client');
const { cleanString, normalizeLearningEvent } = require('./contracts');

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

async function loadSurfaceRegistry(tenantId, surfaceId) {
  const { rows } = await query(
    `SELECT surface_id, source_system, status, allowed_knowledge_scopes, allowed_tools
       FROM ask_friday_surfaces
      WHERE tenant_id = $1
        AND surface_id = $2
      LIMIT 1`,
    [tenantId, surfaceId],
  );
  return rows[0] || null;
}

function missingFromPolicy(values, allowedValues) {
  if (!Array.isArray(values) || values.length === 0) return [];
  if (!Array.isArray(allowedValues) || allowedValues.length === 0) return [];
  const allowed = new Set(allowedValues.map((value) => cleanString(value, 160)).filter(Boolean));
  return values.filter((value) => !allowed.has(value));
}

function validateEventAgainstSurface(event, surface) {
  if (!surface) {
    throw badRequest(`surfaceId is not registered: ${event.surfaceId}`);
  }
  if (surface.status !== 'active') {
    throw badRequest(`surfaceId is not active: ${event.surfaceId}`);
  }
  if (surface.source_system !== event.sourceSystem) {
    throw badRequest(`sourceSystem does not match surface registry for ${event.surfaceId}`);
  }
  const unapprovedKnowledge = missingFromPolicy(event.knowledgeUsed, surface.allowed_knowledge_scopes);
  if (unapprovedKnowledge.length > 0) {
    throw badRequest(`knowledgeUsed is not allowed for ${event.surfaceId}: ${unapprovedKnowledge.join(', ')}`);
  }
  const unapprovedTools = missingFromPolicy(event.toolsUsed, surface.allowed_tools);
  if (unapprovedTools.length > 0) {
    throw badRequest(`toolsUsed is not allowed for ${event.surfaceId}: ${unapprovedTools.join(', ')}`);
  }
  if (['high', 'restricted'].includes(event.privacyClass) && event.redactionStatus === 'unredacted') {
    throw badRequest('high or restricted privacy events must be redacted before Core intake');
  }
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

async function recordLearningEvent({ tenantId, event }) {
  if (!tenantId) throw new Error('tenantId is required');
  const normalized = normalizeLearningEvent(event);
  const surface = await loadSurfaceRegistry(tenantId, normalized.surfaceId);
  validateEventAgainstSurface(normalized, surface);
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
     RETURNING event_id`,
    [
      tenantId,
      normalized.eventId,
      normalized.createdAt,
      normalized.sourceSystem,
      normalized.surfaceId,
      JSON.stringify(normalized.identityRef),
      normalized.sessionId,
      normalized.locale,
      normalized.pageUrl,
      normalized.intent,
      normalized.userTurnSummary,
      normalized.assistantActionSummary,
      normalized.toolsUsed,
      normalized.knowledgeUsed,
      normalized.confidence,
      normalized.outcome,
      JSON.stringify(normalized.handoff),
      JSON.stringify(normalized.signals),
      normalized.privacyClass,
      normalized.redactionStatus,
      JSON.stringify(normalized.evidenceRefs),
      JSON.stringify(normalized.eventPayload),
    ],
  );
  const evidenceInserted = await insertEvidenceRefs(tenantId, normalized.eventId, normalized.evidenceRefs);
  return {
    eventId: normalized.eventId,
    inserted: rows.length > 0,
    evidenceInserted,
  };
}

module.exports = {
  recordLearningEvent,
  _test: {
    insertEvidenceRefs,
    validateEventAgainstSurface,
  },
};
