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
//
// Multitenant v0 (2026-05-16): the JWT carries a tenant_id claim. When
// present, every design query scopes to that tenant; when absent
// (legacy tokens), we fall back to DEFAULT_TENANT_ID (Friday Retreats'
// canonical UUID). The middleware exposes req.tenantId so route
// handlers can pass it into queries without re-reading the JWT or
// importing the default. This lets a future second-tenant token flow
// through without further code changes.

const jwt = require('jsonwebtoken');
const { DEFAULT_TENANT_ID } = require('./adapters');

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

// Resolve the active tenant for a request. Reads identity.tenantId
// (set by decodeJwt) and falls back to DEFAULT_TENANT_ID for legacy
// tokens that predate the multitenant claim. Pure function; safe to
// call from anywhere a Request-like object is available.
function resolveTenantId(req) {
  return req.identity?.tenantId || DEFAULT_TENANT_ID;
}

function requireDesignPerm(perm) {
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

function attachIdentity(req, res, next) {
  const identity = decodeJwt(req);
  if (!identity) return res.status(401).json({ error: 'Unauthorized' });
  req.identity = identity;
  req.tenantId = identity.tenantId || DEFAULT_TENANT_ID;
  next();
}

// Soft variant: decodes JWT if present, sets req.identity / req.tenantId,
// but does NOT 401 when the header is missing or invalid. Used as a
// pre-step before `requireModule(...)` at the router-mount level — the
// module gate needs req.tenantId, but the downstream router has its own
// requireDesignPerm middleware that handles the actual auth challenge.
//
// If the token is absent or invalid we leave req.identity unset and
// req.tenantId undefined; requireModule will then 401 with "no tenant
// context", and the inner requireDesignPerm (if reached) would 401 too.
// Net behaviour: missing/invalid tokens still get a 401, just from a
// different middleware in the chain.
function attachIdentitySoft(req, res, next) {
  const identity = decodeJwt(req);
  if (identity) {
    req.identity = identity;
    req.tenantId = identity.tenantId || DEFAULT_TENANT_ID;
  }
  next();
}

module.exports = {
  ROLE_PERMS,
  ALL_DESIGN_PERMS,
  decodeJwt,
  hasPerm,
  requireDesignPerm,
  attachIdentity,
  attachIdentitySoft,
  resolveTenantId,
};
