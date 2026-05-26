'use strict';

const { cleanArray, cleanString, redactText } = require('./contracts');

const PUBLIC_ACCESS_CLASSES = new Set([
  'public',
  'public_api',
  'public_diagnostic',
  'public_product',
]);

const PUBLIC_SOURCE_SYSTEMS = new Set(['friday-website', 'mcp']);
const PUBLIC_PRIVACY_CLASSES = new Set(['public', 'low', 'medium']);
const PUBLIC_REDACTION_STATUSES = new Set(['redacted', 'partially_redacted', 'not_required']);

const BLOCKED_PUBLIC_SCOPE_EXACT = new Set([
  'staff_ops',
  'staff_inbox',
  'ops_tasks',
  'ops_context',
  'staff_runbooks',
  'staff_workload',
  'owner_private',
  'owner_records',
  'property_owner_context',
  'guest_sensitive',
  'guest_context',
  'finance_restricted',
  'restricted_finance',
  'finance_workflows',
  'approved_finance_policy',
  'owner_statement_rules',
  'legal_restricted',
  'restricted_legal',
  'legal_admin_policy',
  'contracts',
  'compliance_calendar',
  'license_register',
  'internal_engineering',
  'approved_architecture',
  'approved_runbooks',
  'engineering_decisions',
  'secrets',
]);

const BLOCKED_PUBLIC_ACTION_EXACT = new Set([
  'create_task',
  'send_message',
  'send_guest_message',
  'execute_booking',
  'direct_booking',
  'payment',
  'charge_card',
  'refund',
  'delete',
  'mutate_external_system',
  'create_finance_candidate',
  'create_legal_candidate',
]);

function policyError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function surfaceId(surface) {
  return cleanString(surface?.surface_id || surface?.surfaceId, 120);
}

function surfaceAccessClass(surface) {
  return cleanString(surface?.access_class || surface?.accessClass, 120).toLowerCase();
}

function surfaceSourceSystem(surface) {
  return cleanString(surface?.source_system || surface?.sourceSystem, 80).toLowerCase();
}

function surfaceStatus(surface) {
  return cleanString(surface?.status, 40).toLowerCase();
}

function surfaceAllowedKnowledgeScopes(surface) {
  return new Set(cleanArray(
    surface?.allowed_knowledge_scopes || surface?.allowedKnowledgeScopes,
    200,
    160,
  ));
}

function surfaceAllowedTools(surface) {
  return new Set(cleanArray(surface?.allowed_tools || surface?.allowedTools, 200, 160));
}

function surfaceAllowedActions(surface) {
  return new Set(cleanArray(surface?.allowed_actions || surface?.allowedActions, 200, 160));
}

function isPublicReadableSurface(surface) {
  return Boolean(surface)
    && surfaceStatus(surface) === 'active'
    && PUBLIC_ACCESS_CLASSES.has(surfaceAccessClass(surface))
    && PUBLIC_SOURCE_SYSTEMS.has(surfaceSourceSystem(surface));
}

function assertPublicSurface(surface, requestedSurfaceId) {
  if (!surface) throw policyError(`surfaceId is not registered: ${requestedSurfaceId}`, 404);
  if (!isPublicReadableSurface(surface)) {
    throw policyError(`surfaceId is not public-readable: ${requestedSurfaceId}`, 403);
  }
  return surface;
}

function blockedPublicValue(value) {
  const normalized = cleanString(value, 160).toLowerCase();
  if (!normalized) return false;
  if (BLOCKED_PUBLIC_SCOPE_EXACT.has(normalized)) return true;
  if (BLOCKED_PUBLIC_ACTION_EXACT.has(normalized)) return true;
  return normalized.includes('secret')
    || normalized.includes('password')
    || normalized.includes('private_staff')
    || normalized.includes('staff_private')
    || normalized.includes('owner_private')
    || normalized.includes('guest_sensitive')
    || normalized.includes('restricted_finance')
    || normalized.includes('restricted_legal');
}

function assertAllowedValues(values, allowed, label, options = {}) {
  const list = cleanArray(values, 200, 160);
  if (options.blockPublicValues) {
    const blocked = list.filter((value) => blockedPublicValue(value));
    if (blocked.length > 0) {
      throw policyError(`${label} contains public-blocked values: ${blocked.join(', ')}`, 403);
    }
  }
  const disallowed = list.filter((value) => allowed.size > 0 && !allowed.has(value));
  if (disallowed.length > 0) {
    throw policyError(`${label} is not allowed for this surface: ${disallowed.join(', ')}`, 403);
  }
}

function assertPublicPrivacy(privacyClass, redactionStatus, label) {
  const privacy = cleanString(privacyClass, 40).toLowerCase();
  const redaction = cleanString(redactionStatus, 40).toLowerCase();
  if (!PUBLIC_PRIVACY_CLASSES.has(privacy)) {
    throw policyError(`${label} privacyClass is not allowed on a public route: ${privacy || '<empty>'}`, 403);
  }
  if (!PUBLIC_REDACTION_STATUSES.has(redaction)) {
    throw policyError(`${label} redactionStatus must be redacted, partially_redacted, or not_required`, 403);
  }
}

function assertNoSecretLikeContent(value, label) {
  const text = JSON.stringify(value || {});
  if (redactText(text) !== text) {
    throw policyError(`${label} contains unredacted secret-like content`, 403);
  }
}

function validatePublicLearningEvent(event, surface) {
  assertPublicSurface(surface, event.surfaceId);
  if (event.sourceSystem !== surfaceSourceSystem(surface)) {
    throw policyError(`sourceSystem does not match registered surface: ${event.sourceSystem}`, 403);
  }
  assertPublicPrivacy(event.privacyClass, event.redactionStatus, 'learning_event');
  assertAllowedValues(event.knowledgeUsed, surfaceAllowedKnowledgeScopes(surface), 'knowledgeUsed', { blockPublicValues: true });
  assertAllowedValues(event.toolsUsed, surfaceAllowedTools(surface), 'toolsUsed', { blockPublicValues: true });
  assertNoSecretLikeContent({
    userTurnSummary: event.userTurnSummary,
    assistantActionSummary: event.assistantActionSummary,
    eventPayload: event.eventPayload,
  }, 'learning_event');
  for (const ref of event.evidenceRefs || []) {
    assertPublicPrivacy(ref.privacyClass, ref.redactionStatus, 'evidence_ref');
    assertNoSecretLikeContent(ref, 'evidence_ref');
  }
  return event;
}

function validatePublicActionRequest(action, surface) {
  assertPublicSurface(surface, action.surfaceId);
  if (action.sourceSystem !== surfaceSourceSystem(surface)) {
    throw policyError(`sourceSystem does not match registered surface: ${action.sourceSystem}`, 403);
  }
  assertAllowedValues([action.actionType], surfaceAllowedActions(surface), 'actionType', { blockPublicValues: true });
  if (action.approvalRequired !== true) {
    throw policyError('public action requests must require approval', 403);
  }
  if (action.status !== 'pending') {
    throw policyError('public action requests must start pending', 403);
  }
  assertNoSecretLikeContent({ payload: action.payload, reason: action.reason }, 'action_request');
  return action;
}

function validatePublicIdentityLink(body, surface) {
  assertPublicSurface(surface, body.surfaceId || body.surface_id);
  const sourceSystem = cleanString(body.sourceSystem || body.source_system, 80).toLowerCase();
  if (sourceSystem && sourceSystem !== surfaceSourceSystem(surface)) {
    throw policyError(`sourceSystem does not match registered surface: ${sourceSystem}`, 403);
  }
  const consentStatus = cleanString(body.consentStatus || body.consent_status, 80).toLowerCase();
  const durableMemoryAllowed = Boolean(body.durableMemoryAllowed || body.durable_memory_allowed);
  if (durableMemoryAllowed && consentStatus !== 'granted') {
    throw policyError('durable public memory requires granted consent', 403);
  }
  assertNoSecretLikeContent({
    subjectRef: body.subjectRef || body.subject_ref,
    consentPayload: body.consentPayload || body.consent_payload,
  }, 'identity_link');
}

function allowedToolsFromPack(toolPolicy) {
  const policy = toolPolicy || {};
  return cleanArray(policy.allowedTools || policy.allowed_tools || policy.tools, 200, 160);
}

function validateContextPackAgainstSurface(pack, surface) {
  if (!surface) throw policyError(`surfaceId is not registered: ${pack.surfaceId}`, 404);
  const publicSurface = isPublicReadableSurface(surface);
  assertAllowedValues(pack.knowledgeScopes, surfaceAllowedKnowledgeScopes(surface), 'knowledgeScopes', { blockPublicValues: publicSurface });
  assertAllowedValues(allowedToolsFromPack(pack.toolPolicy), surfaceAllowedTools(surface), 'toolPolicy.allowedTools', { blockPublicValues: publicSurface });
  if (publicSurface) {
    assertNoSecretLikeContent({
      behaviorRules: pack.behaviorRules,
      toolPolicy: pack.toolPolicy,
      memoryPolicy: pack.memoryPolicy,
      sourceSnapshotRefs: pack.sourceSnapshotRefs,
      packPayload: pack.packPayload,
    }, 'public context_pack');
  }
}

module.exports = {
  PUBLIC_ACCESS_CLASSES,
  assertPublicSurface,
  isPublicReadableSurface,
  validateContextPackAgainstSurface,
  validatePublicActionRequest,
  validatePublicIdentityLink,
  validatePublicLearningEvent,
  _test: {
    blockedPublicValue,
    policyError,
    surfaceAccessClass,
    surfaceAllowedActions,
    surfaceAllowedKnowledgeScopes,
    surfaceAllowedTools,
    surfaceSourceSystem,
    surfaceStatus,
  },
};
