'use strict';

// HR permission gating. Uses the same JWT secret as GMS so tokens issued
// by /api/auth/login are recognized here without an extra round-trip.
//
// Permission matrix is in-code for v1 — Director-only. Once a real
// permissions matrix table lands (handover §15.2: "permissions matrix
// home — HR-SOT or per-module Settings?"), swap ROLE_PERMS for a DB
// lookup keyed by user_id.

const jwt = require('jsonwebtoken');

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ALL_HR_PERMS = [
  'hr_staff:read',
  'hr_staff:read_sensitive',
  'hr_staff:write',
  'hr_roster:read',
  'hr_roster:write',
  'hr_roster:approve',
  'hr_time_off:read',
  'hr_time_off:approve',
];

const ROLE_PERMS = {
  // GMS issues role='admin' for director-level accounts. Treat 'director'
  // as an alias for forward compatibility.
  admin: new Set(ALL_HR_PERMS),
  director: new Set(ALL_HR_PERMS),
  // Operations managers need the non-sensitive HR roster/staff directory for
  // task planning and assignment. Sensitive staff fields remain director-only.
  ops_manager: new Set([
    'hr_staff:read',
    'hr_roster:read',
    'hr_roster:write',
    'hr_roster:approve',
    'hr_time_off:read',
    'hr_time_off:approve',
  ]),
  operations_manager: new Set([
    'hr_staff:read',
    'hr_roster:read',
    'hr_roster:write',
    'hr_roster:approve',
    'hr_time_off:read',
    'hr_time_off:approve',
  ]),
  manager: new Set([
    'hr_staff:read',
    'hr_roster:read',
    'hr_roster:write',
    'hr_roster:approve',
    'hr_time_off:read',
  ]),
  supervisor: new Set([
    'hr_staff:read',
    'hr_roster:read',
    'hr_roster:write',
    'hr_time_off:read',
  ]),
  // Everyone else has implicit baseline perms set in the route handlers
  // themselves — e.g. any authenticated user can submit their own
  // time-off request (hr_time_off:request_own) without needing this map.
};

/**
 * Verifies the JWT and attaches { userId, userRole, username } to req.
 * Required for any route that gates on a specific permission.
 */
function decodeJwt(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice('Bearer '.length);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || '');
    return {
      userId: decoded.user_id || decoded.userId || null,
      userRole: decoded.role || null,
      username: decoded.username || null,
      displayName: decoded.display_name || decoded.displayName || null,
      tenantId: decoded.tenant_id || decoded.tenantId || null,
    };
  } catch {
    return null;
  }
}

function hasPerm(role, perm) {
  if (!role) return false;
  return ROLE_PERMS[role]?.has(perm) ?? false;
}

/**
 * Express middleware factory. Requires the JWT carry a role that holds
 * the named permission. 401 if no/invalid JWT, 403 if authenticated but
 * lacking permission.
 */
function requireHrPerm(perm) {
  return (req, res, next) => {
    const identity = decodeJwt(req);
    if (!identity) return res.status(401).json({ error: 'Unauthorized' });
    if (!hasPerm(identity.userRole, perm)) {
      return res.status(403).json({ error: `Forbidden — missing permission ${perm}` });
    }
    req.identity = identity;
    req.tenantId = identity.tenantId || DEFAULT_TENANT_ID;
    next();
  };
}

/**
 * Looser variant — attaches identity but doesn't require any HR permission.
 * Used for `submit own time-off request` flows where any authenticated
 * staff member can act.
 */
function attachIdentity(req, res, next) {
  const identity = decodeJwt(req);
  if (!identity) return res.status(401).json({ error: 'Unauthorized' });
  req.identity = identity;
  req.tenantId = identity.tenantId || DEFAULT_TENANT_ID;
  next();
}

module.exports = {
  DEFAULT_TENANT_ID,
  ROLE_PERMS,
  ALL_HR_PERMS,
  decodeJwt,
  hasPerm,
  requireHrPerm,
  attachIdentity,
};
