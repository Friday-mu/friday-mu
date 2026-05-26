'use strict';

const { query } = require('../database/client');
const { normalizeLearningEvent } = require('./contracts');

async function recordLearningEvent({ tenantId, event }) {
  if (!tenantId) throw new Error('tenantId is required');
  const normalized = normalizeLearningEvent(event);
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
  return {
    eventId: normalized.eventId,
    inserted: rows.length > 0,
  };
}

module.exports = {
  recordLearningEvent,
};
