'use strict';

// Design module permission gating. Mirrors src/hr/auth.js — shares the
// JWT secret with GMS so tokens verify locally. Permission matrix is
// in-code for v0.1; swap ROLE_PERMS for a DB lookup when the real
// matrix lands (handover §13.1).
//
// Director-tier (role='admin' from GMS, alias 'director') has full
// design:* access. Mathias is the commercial lead; for v0.1 he uses
// the same admin token so the in-code matrix covers him implicitly.
// Future: dedicated 'commercial' role with a subset.

const jwt = require('jsonwebtoken');

const ALL_DESIGN_PERMS = [
  'design:read',
  'design:write',
  'design:approve',          // moodboard / pack / change-order / closeout decisions
  'design:read_sensitive',   // retail/negotiated cost + internal_work fields
  'design:settings',         // Annex A edits
  'design:portal_admin',     // mint/revoke magic links
];

const ROLE_PERMS = {
  admin: new Set(ALL_DESIGN_PERMS),
  director: new Set(ALL_DESIGN_PERMS),
};

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

function requireDesignPerm(perm) {
  return (req, res, next) => {
    const identity = decodeJwt(req);
    if (!identity) return res.status(401).json({ error: 'Unauthorized' });
    if (!hasPerm(identity.userRole, perm)) {
      return res.status(403).json({ error: `Forbidden — missing permission ${perm}` });
    }
    req.identity = identity;
    next();
  };
}

function attachIdentity(req, res, next) {
  const identity = decodeJwt(req);
  if (!identity) return res.status(401).json({ error: 'Unauthorized' });
  req.identity = identity;
  next();
}

module.exports = {
  ROLE_PERMS,
  ALL_DESIGN_PERMS,
  decodeJwt,
  hasPerm,
  requireDesignPerm,
  attachIdentity,
};
