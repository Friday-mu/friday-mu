'use strict';

const crypto = require('node:crypto');

const SOURCE_SYSTEMS = new Set(['friday-website', 'fad', 'mcp', 'codex', 'manual']);
const CONFIDENCE = new Set(['high', 'medium', 'low', 'unknown']);
const PRIVACY_CLASSES = new Set(['public', 'low', 'medium', 'high', 'restricted', 'unknown']);
const REDACTION_STATUSES = new Set(['redacted', 'partially_redacted', 'unredacted', 'not_required']);
const REVIEW_STATUSES = new Set(['pending', 'approved', 'rejected', 'expired', 'needs_info']);
const RISK_CLASSES = new Set(['low', 'medium', 'high', 'restricted', 'approval']);
const ACTION_STATUSES = new Set(['pending', 'approved', 'rejected', 'executed', 'expired', 'cancelled']);
const CONTEXT_PACK_STATUSES = new Set(['draft', 'published', 'retired']);
const SURFACE_STATUSES = new Set(['active', 'planned', 'paused', 'retired']);

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9_-]{16,}/g,
  /(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']?[^"',\s]+/gi,
  /\b(?:\d[ -]*?){13,19}\b/g,
];

function stableId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function cleanString(value, max = 500) {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanText(value, max = 5000) {
  if (value == null) return '';
  return String(value).trim().slice(0, max);
}

function cleanEnum(value, allowed, fallback) {
  const text = cleanString(value, 80).toLowerCase();
  return allowed.has(text) ? text : fallback;
}

function cleanArray(value, maxItems = 30, maxLength = 120) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    const text = cleanString(raw, maxLength);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

function safeJsonValue(value, maxEntries, maxString, depth = 0) {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return redactText(cleanText(value, maxString));
  if (depth >= 4) return '[TRUNCATED]';
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => safeJsonValue(item, maxEntries, maxString, depth + 1));
  }
  if (typeof value === 'object') return safeJson(value, maxEntries, maxString, depth + 1);
  return null;
}

function safeJson(value, maxEntries = 80, maxString = 4000, depth = 0) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, maxEntries)) {
    const key = cleanString(rawKey, 120);
    if (!key) continue;
    out[key] = safeJsonValue(rawValue, maxEntries, maxString, depth);
  }
  return out;
}

function redactText(value) {
  let text = String(value || '');
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, '[REDACTED]');
  }
  return text;
}

function assertRequired(value, field) {
  if (!value) {
    const err = new Error(`${field} is required`);
    err.status = 400;
    throw err;
  }
  return value;
}

function parseDate(value) {
  if (!value) return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const err = new Error('createdAt must be an ISO timestamp');
    err.status = 400;
    throw err;
  }
  return date;
}

function normalizeIdentityRef(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return safeJson({
    identityType: raw.identityType || raw.identity_type,
    identityKey: raw.identityKey || raw.identity_key,
    authenticated: Boolean(raw.authenticated),
    consentStatus: raw.consentStatus || raw.consent_status,
    durableMemoryAllowed: Boolean(raw.durableMemoryAllowed || raw.durable_memory_allowed),
  });
}

function normalizeSurfaceRegistry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    const err = new Error('surface registry body must be an object');
    err.status = 400;
    throw err;
  }
  const surfaceId = cleanString(raw.surfaceId || raw.surface_id, 120);
  assertRequired(surfaceId, 'surfaceId');
  const sourceSystem = cleanEnum(raw.sourceSystem || raw.source_system, SOURCE_SYSTEMS, '');
  assertRequired(sourceSystem, 'sourceSystem');
  return {
    surfaceId,
    displayName: cleanString(raw.displayName || raw.display_name, 180) || surfaceId,
    audience: cleanString(raw.audience, 120) || 'unknown',
    sourceSystem,
    accessClass: cleanString(raw.accessClass || raw.access_class, 120) || 'internal',
    localePolicy: safeJson(raw.localePolicy || raw.locale_policy),
    allowedKnowledgeScopes: cleanArray(raw.allowedKnowledgeScopes || raw.allowed_knowledge_scopes, 80, 160),
    allowedTools: cleanArray(raw.allowedTools || raw.allowed_tools, 80, 160),
    allowedActions: cleanArray(raw.allowedActions || raw.allowed_actions, 80, 160),
    memoryPolicy: safeJson(raw.memoryPolicy || raw.memory_policy),
    handoffPolicy: safeJson(raw.handoffPolicy || raw.handoff_policy),
    modelPolicy: safeJson(raw.modelPolicy || raw.model_policy),
    contextBudget: safeJson(raw.contextBudget || raw.context_budget),
    evalSuiteIds: cleanArray(raw.evalSuiteIds || raw.eval_suite_ids, 80, 160),
    status: cleanEnum(raw.status, SURFACE_STATUSES, 'active'),
  };
}

function normalizeEvidenceRef(raw, eventId = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const evidenceType = cleanString(raw.evidenceType || raw.evidence_type || raw.type, 120);
  if (!evidenceType) return null;
  return {
    evidenceId: cleanString(raw.evidenceId || raw.evidence_id, 160) || stableId('afev'),
    eventId: cleanString(raw.eventId || raw.event_id || eventId, 160) || null,
    evidenceType,
    storageRef: cleanText(raw.storageRef || raw.storage_ref || raw.ref, 1000) || null,
    privacyClass: cleanEnum(raw.privacyClass || raw.privacy_class, PRIVACY_CLASSES, 'unknown'),
    redactionStatus: cleanEnum(raw.redactionStatus || raw.redaction_status, REDACTION_STATUSES, 'unredacted'),
    summary: redactText(cleanText(raw.summary, 2000)) || null,
    evidencePayload: safeJson(raw.evidencePayload || raw.evidence_payload || raw.payload || raw, 80, 4000),
    expiresAt: raw.expiresAt || raw.expires_at || null,
  };
}

function normalizeLearningEvent(raw, defaults = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    const err = new Error('learning event body must be an object');
    err.status = 400;
    throw err;
  }

  const sourceSystem = cleanEnum(raw.sourceSystem || raw.source_system || defaults.sourceSystem, SOURCE_SYSTEMS, '');
  assertRequired(sourceSystem, 'sourceSystem');

  const surfaceId = cleanString(raw.surfaceId || raw.surface_id, 120);
  assertRequired(surfaceId, 'surfaceId');

  const eventId = cleanString(raw.eventId || raw.event_id, 160) || stableId('afe');
  const userTurnSummary = redactText(cleanText(raw.userTurnSummary || raw.user_turn_summary, 3000));
  const assistantActionSummary = redactText(cleanText(raw.assistantActionSummary || raw.assistant_action_summary, 3000));

  return {
    eventId,
    createdAt: parseDate(raw.createdAt || raw.created_at),
    sourceSystem,
    surfaceId,
    identityRef: normalizeIdentityRef(raw.identityRef || raw.identity_ref),
    sessionId: cleanString(raw.sessionId || raw.session_id, 180) || null,
    locale: cleanString(raw.locale, 20).toLowerCase() || null,
    pageUrl: cleanText(raw.pageUrl || raw.page_url, 2000) || null,
    intent: cleanString(raw.intent || raw.visitorIntent || raw.visitor_intent, 160) || null,
    userTurnSummary,
    assistantActionSummary,
    toolsUsed: cleanArray(raw.toolsUsed || raw.tools_used, 30, 120),
    knowledgeUsed: cleanArray(raw.knowledgeUsed || raw.knowledge_used, 40, 160),
    confidence: cleanEnum(raw.confidence, CONFIDENCE, 'unknown'),
    outcome: cleanString(raw.outcome, 120) || null,
    handoff: safeJson(raw.handoff),
    signals: safeJson(raw.signals),
    privacyClass: cleanEnum(raw.privacyClass || raw.privacy_class, PRIVACY_CLASSES, 'unknown'),
    redactionStatus: cleanEnum(raw.redactionStatus || raw.redaction_status, REDACTION_STATUSES, 'unredacted'),
    evidenceRefs: Array.isArray(raw.evidenceRefs || raw.evidence_refs)
      ? (raw.evidenceRefs || raw.evidence_refs)
        .slice(0, 30)
        .map((item) => normalizeEvidenceRef(item, eventId))
        .filter(Boolean)
      : [],
    eventPayload: safeJson(raw.eventPayload || raw.event_payload || raw),
  };
}

function normalizeContextPack(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    const err = new Error('context pack body must be an object');
    err.status = 400;
    throw err;
  }
  const surfaceId = cleanString(raw.surfaceId || raw.surface_id, 120);
  assertRequired(surfaceId, 'surfaceId');
  const version = Math.max(1, Number.parseInt(raw.version || 1, 10) || 1);
  return {
    packId: cleanString(raw.packId || raw.pack_id, 160) || `${surfaceId}_v${version}`,
    surfaceId,
    version,
    status: cleanEnum(raw.status, CONTEXT_PACK_STATUSES, 'draft'),
    knowledgeScopes: cleanArray(raw.knowledgeScopes || raw.knowledge_scopes, 80, 160),
    behaviorRules: Array.isArray(raw.behaviorRules || raw.behavior_rules)
      ? (raw.behaviorRules || raw.behavior_rules).slice(0, 100).map((item) => safeJson(item))
      : [],
    toolPolicy: safeJson(raw.toolPolicy || raw.tool_policy),
    memoryPolicy: safeJson(raw.memoryPolicy || raw.memory_policy),
    sourceSnapshotRefs: Array.isArray(raw.sourceSnapshotRefs || raw.source_snapshot_refs)
      ? (raw.sourceSnapshotRefs || raw.source_snapshot_refs).slice(0, 100).map((item) => safeJson(item))
      : [],
    packPayload: safeJson(raw.packPayload || raw.pack_payload || raw.payload, 120, 8000),
    approvedBy: cleanString(raw.approvedBy || raw.approved_by, 160) || null,
  };
}

function normalizeKbCandidate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    const err = new Error('candidate body must be an object');
    err.status = 400;
    throw err;
  }
  const candidateType = cleanString(raw.candidateType || raw.candidate_type, 80);
  const targetLayer = cleanString(raw.targetLayer || raw.target_layer, 80);
  assertRequired(candidateType, 'candidateType');
  assertRequired(targetLayer, 'targetLayer');
  return {
    candidateId: cleanString(raw.candidateId || raw.candidate_id, 160) || stableId('afc'),
    candidateType,
    targetLayer,
    proposedChange: safeJson(raw.proposedChange || raw.proposed_change, 120, 8000),
    sourceEventIds: cleanArray(raw.sourceEventIds || raw.source_event_ids, 100, 160),
    evidenceSummary: redactText(cleanText(raw.evidenceSummary || raw.evidence_summary, 5000)) || null,
    riskClass: cleanEnum(raw.riskClass || raw.risk_class, RISK_CLASSES, 'medium'),
    trustTier: cleanString(raw.trustTier || raw.trust_tier, 80) || 'surface_evidence',
    reviewStatus: cleanEnum(raw.reviewStatus || raw.review_status, REVIEW_STATUSES, 'pending'),
    reviewLane: cleanString(raw.reviewLane || raw.review_lane, 120) || 'general',
    reviewerDomain: cleanString(raw.reviewerDomain || raw.reviewer_domain, 120) || null,
    allowedSurfaceIds: cleanArray(raw.allowedSurfaceIds || raw.allowed_surface_ids, 80, 160),
    targetPrivacyClass: cleanEnum(
      raw.targetPrivacyClass || raw.target_privacy_class,
      PRIVACY_CLASSES,
      'unknown',
    ),
  };
}

function normalizeActionRequest(raw, defaults = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    const err = new Error('action request body must be an object');
    err.status = 400;
    throw err;
  }
  const sourceSystem = cleanEnum(raw.sourceSystem || raw.source_system || defaults.sourceSystem, SOURCE_SYSTEMS, '');
  const surfaceId = cleanString(raw.surfaceId || raw.surface_id, 120);
  const actionType = cleanString(raw.actionType || raw.action_type, 120);
  assertRequired(sourceSystem, 'sourceSystem');
  assertRequired(surfaceId, 'surfaceId');
  assertRequired(actionType, 'actionType');

  const riskClass = cleanEnum(raw.riskClass || raw.risk_class, RISK_CLASSES, 'approval');
  return {
    actionId: cleanString(raw.actionId || raw.action_id, 160) || stableId('afa'),
    sourceSystem,
    surfaceId,
    requestedBy: safeJson(raw.requestedBy || raw.requested_by || defaults.requestedBy),
    actionType,
    riskClass,
    payload: safeJson(raw.payload, 120, 8000),
    reason: redactText(cleanText(raw.reason, 2000)) || null,
    approvalRequired: raw.approvalRequired !== false && raw.approval_required !== false,
    status: cleanEnum(raw.status, ACTION_STATUSES, 'pending'),
  };
}

function normalizeActionStatusPatch(raw) {
  const status = cleanEnum(raw?.status, ACTION_STATUSES, '');
  assertRequired(status, 'status');
  return {
    status,
    reviewer: cleanString(raw.reviewer, 160) || null,
    reviewNote: redactText(cleanText(raw.reviewNote || raw.review_note, 4000)) || null,
  };
}

function normalizeReviewPatch(raw) {
  const status = cleanEnum(raw?.reviewStatus || raw?.review_status, REVIEW_STATUSES, '');
  assertRequired(status, 'reviewStatus');
  return {
    reviewStatus: status,
    reviewer: cleanString(raw.reviewer, 160) || null,
    reviewNote: redactText(cleanText(raw.reviewNote || raw.review_note, 4000)) || null,
    approvedSnapshotVersion: cleanString(raw.approvedSnapshotVersion || raw.approved_snapshot_version, 160) || null,
  };
}

module.exports = {
  normalizeActionRequest,
  normalizeActionStatusPatch,
  normalizeContextPack,
  normalizeEvidenceRef,
  normalizeKbCandidate,
  normalizeLearningEvent,
  normalizeReviewPatch,
  normalizeSurfaceRegistry,
  redactText,
  cleanArray,
  cleanString,
  safeJson,
  _constants: {
    SOURCE_SYSTEMS,
    CONFIDENCE,
    PRIVACY_CLASSES,
    REDACTION_STATUSES,
    REVIEW_STATUSES,
    RISK_CLASSES,
    ACTION_STATUSES,
    CONTEXT_PACK_STATUSES,
    SURFACE_STATUSES,
  },
};
