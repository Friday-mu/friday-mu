'use strict';

const { query } = require('../database/client');
const { cleanString, normalizeActionRequest } = require('./contracts');

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

async function loadSurfacePolicy(tenantId, surfaceId) {
  const { rows } = await query(
    `SELECT surface_id, source_system, status, allowed_actions
       FROM ask_friday_surfaces
      WHERE tenant_id = $1
        AND surface_id = $2
      LIMIT 1`,
    [tenantId, surfaceId],
  );
  return rows[0] || null;
}

function validateActionAgainstSurface(action, surface) {
  if (!surface) {
    throw badRequest(`surfaceId is not registered: ${action.surfaceId}`);
  }
  if (surface.status !== 'active') {
    throw badRequest(`surfaceId is not active: ${action.surfaceId}`);
  }
  if (surface.source_system !== action.sourceSystem) {
    throw badRequest(`sourceSystem does not match surface registry for ${action.surfaceId}`);
  }
  const allowed = Array.isArray(surface.allowed_actions)
    ? new Set(surface.allowed_actions.map((item) => cleanString(item, 120)).filter(Boolean))
    : new Set();
  if (allowed.size > 0 && !allowed.has(action.actionType)) {
    throw badRequest(`actionType is not allowed for ${action.surfaceId}: ${action.actionType}`);
  }
}

async function recordActionRequest({ tenantId, action, defaults = {} }) {
  if (!tenantId) throw new Error('tenantId is required');
  const normalized = normalizeActionRequest(action, defaults);
  const surface = await loadSurfacePolicy(tenantId, normalized.surfaceId);
  validateActionAgainstSurface(normalized, surface);

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
     RETURNING action_id`,
    [
      tenantId,
      normalized.actionId,
      normalized.sourceSystem,
      normalized.surfaceId,
      JSON.stringify(normalized.requestedBy),
      normalized.actionType,
      normalized.riskClass,
      JSON.stringify(normalized.payload),
      normalized.reason,
      normalized.approvalRequired,
      normalized.status,
    ],
  );

  return {
    actionId: normalized.actionId,
    written: rows.length > 0,
  };
}

module.exports = {
  recordActionRequest,
  _test: {
    validateActionAgainstSurface,
  },
};
